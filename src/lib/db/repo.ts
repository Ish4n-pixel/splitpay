import { getDb } from './index';
import { FeeMode, ChargeKind, ChargeBasis } from '../split/engine';
import { nanoid } from 'nanoid';

export interface DbSession {
  id: string;
  code: string;
  host_key_hash: string;
  title: string;
  host_upi_vpa: string;
  host_upi_name: string;
  fee_mode: FeeMode;
  status: 'setup' | 'claiming' | 'settling' | 'closed';
  receipt_total_paise: number;
  created_at: number;
}

export interface DbParticipant {
  id: string;
  session_id: string;
  name: string;
  token_hash: string;
  is_host: number;
  pay_status: 'unpaid' | 'pending_verify' | 'paid_upi' | 'paid_cash';
  paid_amount_paise: number;
  covered_by: string | null;
  joined_at: number;
}

export interface DbItem {
  id: string;
  session_id: string;
  name: string;
  quantity: number;
  unit_price_paise: number;
  total_paise: number;
  sort_order: number;
}

export interface DbClaim {
  item_id: string;
  participant_id: string;
  weight: number;
}

export interface DbCharge {
  id: string;
  session_id: string;
  kind: ChargeKind;
  label: string;
  basis: ChargeBasis;
  value: number;
  sort_order: number;
}

export const repo = {
  createSession(session: DbSession): void {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO sessions (
        id, code, host_key_hash, title, host_upi_vpa, host_upi_name, fee_mode, status, receipt_total_paise, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.code,
      session.host_key_hash,
      session.title,
      session.host_upi_vpa,
      session.host_upi_name,
      session.fee_mode,
      session.status,
      session.receipt_total_paise,
      session.created_at
    );
  },

  getSessionByCode(code: string): DbSession | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM sessions WHERE code = ?').get(code.toUpperCase());
    return (row as DbSession) || null;
  },

  getSessionById(id: string): DbSession | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    return (row as DbSession) || null;
  },

  updateSessionSettings(id: string, updates: Partial<DbSession>): void {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.host_upi_vpa !== undefined) {
      fields.push('host_upi_vpa = ?');
      values.push(updates.host_upi_vpa);
    }
    if (updates.host_upi_name !== undefined) {
      fields.push('host_upi_name = ?');
      values.push(updates.host_upi_name);
    }
    if (updates.fee_mode !== undefined) {
      fields.push('fee_mode = ?');
      values.push(updates.fee_mode);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.receipt_total_paise !== undefined) {
      fields.push('receipt_total_paise = ?');
      values.push(updates.receipt_total_paise);
    }

    if (fields.length === 0) return;

    values.push(id);
    db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  },

  addParticipant(p: DbParticipant): void {
    const db = getDb();
    db.prepare(`
      INSERT INTO participants (id, session_id, name, token_hash, is_host, pay_status, paid_amount_paise, covered_by, joined_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(p.id, p.session_id, p.name, p.token_hash, p.is_host, p.pay_status, p.paid_amount_paise || 0, p.covered_by, p.joined_at);
  },

  getParticipants(sessionId: string): DbParticipant[] {
    const db = getDb();
    return db.prepare('SELECT * FROM participants WHERE session_id = ? ORDER BY joined_at ASC').all(sessionId) as DbParticipant[];
  },

  getParticipantById(id: string): DbParticipant | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM participants WHERE id = ?').get(id);
    return (row as DbParticipant) || null;
  },

  updateParticipantPayStatus(id: string, status: DbParticipant['pay_status'], paidAmountPaise?: number): void {
    const db = getDb();
    if (paidAmountPaise !== undefined) {
      db.prepare('UPDATE participants SET pay_status = ?, paid_amount_paise = ? WHERE id = ?').run(status, paidAmountPaise, id);
    } else {
      db.prepare('UPDATE participants SET pay_status = ? WHERE id = ?').run(status, id);
    }
  },

  updateParticipantCover(id: string, coveredBy: string | null): void {
    const db = getDb();
    db.prepare('UPDATE participants SET covered_by = ? WHERE id = ?').run(coveredBy, id);
  },

  replaceBill(
    sessionId: string,
    items: { id: string; name: string; quantity: number; unitPricePaise: number; totalPaise: number }[],
    charges: { id: string; kind: ChargeKind; label: string; basis: ChargeBasis; value: number }[],
    receiptTotalPaise: number
  ): void {
    const db = getDb();
    const tx = db.transaction(() => {
      // 1. Reconcile Items: preserve existing items in this session to protect claims
      const currentItems = db.prepare('SELECT id FROM items WHERE session_id = ?').all(sessionId) as { id: string }[];
      const currentItemIds = new Set(currentItems.map((i) => i.id));
      const foreignItemCheck = db.prepare('SELECT session_id FROM items WHERE id = ?');

      const incomingKeptItemIds = new Set<string>();

      const insertItem = db.prepare(`
        INSERT INTO items (id, session_id, name, quantity, unit_price_paise, total_paise, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const updateItem = db.prepare(`
        UPDATE items SET name = ?, quantity = ?, unit_price_paise = ?, total_paise = ?, sort_order = ?
        WHERE id = ? AND session_id = ?
      `);

      items.forEach((item, index) => {
        if (item.id && currentItemIds.has(item.id)) {
          // Update in place — claims are preserved!
          updateItem.run(item.name, item.quantity, item.unitPricePaise, item.totalPaise, index, item.id, sessionId);
          incomingKeptItemIds.add(item.id);
        } else {
          // If id is empty or belongs to another session, assign a new collision-free ID
          let finalId = item.id;
          const foreign = finalId ? (foreignItemCheck.get(finalId) as { session_id: string } | undefined) : undefined;
          if (!finalId || (foreign && foreign.session_id !== sessionId)) {
            finalId = `item_${nanoid()}`;
          }
          insertItem.run(finalId, sessionId, item.name, item.quantity, item.unitPricePaise, item.totalPaise, index);
          incomingKeptItemIds.add(finalId);
        }
      });

      // Remove deleted items from this session only
      for (const curr of currentItems) {
        if (!incomingKeptItemIds.has(curr.id)) {
          db.prepare('DELETE FROM items WHERE id = ? AND session_id = ?').run(curr.id, sessionId);
        }
      }

      // 2. Reconcile Charges
      const currentCharges = db.prepare('SELECT id FROM charges WHERE session_id = ?').all(sessionId) as { id: string }[];
      const currentChargeIds = new Set(currentCharges.map((c) => c.id));
      const foreignChargeCheck = db.prepare('SELECT session_id FROM charges WHERE id = ?');

      const incomingKeptChargeIds = new Set<string>();

      const insertCharge = db.prepare(`
        INSERT INTO charges (id, session_id, kind, label, basis, value, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const updateCharge = db.prepare(`
        UPDATE charges SET kind = ?, label = ?, basis = ?, value = ?, sort_order = ?
        WHERE id = ? AND session_id = ?
      `);

      charges.forEach((ch, index) => {
        if (ch.id && currentChargeIds.has(ch.id)) {
          updateCharge.run(ch.kind, ch.label, ch.basis, ch.value, index, ch.id, sessionId);
          incomingKeptChargeIds.add(ch.id);
        } else {
          let finalId = ch.id;
          const foreign = finalId ? (foreignChargeCheck.get(finalId) as { session_id: string } | undefined) : undefined;
          if (!finalId || (foreign && foreign.session_id !== sessionId)) {
            finalId = `ch_${nanoid()}`;
          }
          insertCharge.run(finalId, sessionId, ch.kind, ch.label, ch.basis, ch.value, index);
          incomingKeptChargeIds.add(finalId);
        }
      });

      for (const curr of currentCharges) {
        if (!incomingKeptChargeIds.has(curr.id)) {
          db.prepare('DELETE FROM charges WHERE id = ? AND session_id = ?').run(curr.id, sessionId);
        }
      }

      // Update session status to claiming and receipt total
      db.prepare(`
        UPDATE sessions SET receipt_total_paise = ?, status = 'claiming' WHERE id = ?
      `).run(receiptTotalPaise, sessionId);
    });

    tx();
  },

  setClaimPortion(itemId: string, participantId: string, weight: number): void {
    const db = getDb();
    const rounded = Math.round(weight);
    if (rounded <= 0) {
      db.prepare('DELETE FROM claims WHERE item_id = ? AND participant_id = ?').run(itemId, participantId);
    } else {
      db.prepare(`
        INSERT INTO claims (item_id, participant_id, weight)
        VALUES (?, ?, ?)
        ON CONFLICT(item_id, participant_id) DO UPDATE SET weight = excluded.weight
      `).run(itemId, participantId, rounded);
    }
  },

  adjustClaimPortion(itemId: string, participantId: string, delta: number): number {
    const db = getDb();
    const existing = db.prepare('SELECT weight FROM claims WHERE item_id = ? AND participant_id = ?').get(itemId, participantId) as { weight: number } | undefined;
    const currentWeight = existing ? existing.weight : 0;
    const newWeight = Math.max(0, currentWeight + Math.round(delta));
    this.setClaimPortion(itemId, participantId, newWeight);
    return newWeight;
  },

  toggleClaim(itemId: string, participantId: string, portion?: number): boolean {
    const db = getDb();
    if (portion !== undefined) {
      this.setClaimPortion(itemId, participantId, portion);
      return portion > 0;
    }
    const existing = db.prepare('SELECT * FROM claims WHERE item_id = ? AND participant_id = ?').get(itemId, participantId);
    if (existing) {
      db.prepare('DELETE FROM claims WHERE item_id = ? AND participant_id = ?').run(itemId, participantId);
      return false; // unclaimed
    } else {
      db.prepare('INSERT INTO claims (item_id, participant_id, weight) VALUES (?, ?, 1)').run(itemId, participantId);
      return true; // claimed
    }
  },

  getItemById(itemId: string): DbItem | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
    return (row as DbItem) || null;
  },

  getClaimsForItem(itemId: string): DbClaim[] {
    const db = getDb();
    return db.prepare('SELECT * FROM claims WHERE item_id = ?').all(itemId) as DbClaim[];
  },

  getChargeById(chargeId: string): DbCharge | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM charges WHERE id = ?').get(chargeId);
    return (row as DbCharge) || null;
  },

  getItemsWithClaims(sessionId: string): (DbItem & { claims: DbClaim[] })[] {
    const db = getDb();
    const items = db.prepare('SELECT * FROM items WHERE session_id = ? ORDER BY sort_order ASC').all(sessionId) as DbItem[];
    const claims = db.prepare(`
      SELECT c.* FROM claims c
      JOIN items i ON c.item_id = i.id
      WHERE i.session_id = ?
    `).all(sessionId) as DbClaim[];

    const claimsByItem = new Map<string, DbClaim[]>();
    for (const c of claims) {
      if (!claimsByItem.has(c.item_id)) {
        claimsByItem.set(c.item_id, []);
      }
      claimsByItem.get(c.item_id)!.push(c);
    }

    return items.map((item) => ({
      ...item,
      claims: claimsByItem.get(item.id) || [],
    }));
  },

  getCharges(sessionId: string): DbCharge[] {
    const db = getDb();
    return db.prepare('SELECT * FROM charges WHERE session_id = ? ORDER BY sort_order ASC').all(sessionId) as DbCharge[];
  },

  upsertItem(sessionId: string, item: { id: string; name: string; quantity: number; unitPricePaise: number; totalPaise: number }): void {
    const db = getDb();
    const existing = item.id ? this.getItemById(item.id) : null;
    let finalId = item.id;
    if (existing && existing.session_id !== sessionId) {
      finalId = `item_${nanoid()}`;
    }

    db.prepare(`
      INSERT INTO items (id, session_id, name, quantity, unit_price_paise, total_paise, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM items WHERE session_id = ?))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        quantity = excluded.quantity,
        unit_price_paise = excluded.unit_price_paise,
        total_paise = excluded.total_paise
    `).run(finalId, sessionId, item.name, item.quantity, item.unitPricePaise, item.totalPaise, sessionId);
  },

  deleteItem(sessionId: string, itemId: string): void {
    const db = getDb();
    db.prepare('DELETE FROM items WHERE id = ? AND session_id = ?').run(itemId, sessionId);
  },

  upsertCharge(sessionId: string, charge: { id: string; kind: ChargeKind; label: string; basis: ChargeBasis; value: number }): void {
    const db = getDb();
    const existing = charge.id ? this.getChargeById(charge.id) : null;
    let finalId = charge.id;
    if (existing && existing.session_id !== sessionId) {
      finalId = `ch_${nanoid()}`;
    }

    db.prepare(`
      INSERT INTO charges (id, session_id, kind, label, basis, value, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM charges WHERE session_id = ?))
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        label = excluded.label,
        basis = excluded.basis,
        value = excluded.value
    `).run(finalId, sessionId, charge.kind, charge.label, charge.basis, charge.value, sessionId);
  },

  deleteCharge(sessionId: string, chargeId: string): void {
    const db = getDb();
    db.prepare('DELETE FROM charges WHERE id = ? AND session_id = ?').run(chargeId, sessionId);
  },
};
