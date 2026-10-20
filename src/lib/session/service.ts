import { nanoid } from 'nanoid';
import { repo, DbSession, DbParticipant } from '../db/repo';
import { generateSessionCode, generateToken, hashToken, verifyToken } from '../auth';
import { buildSessionSnapshot, SessionSnapshot } from './snapshot';
import { FeeMode, ChargeKind, ChargeBasis } from '../split/engine';

export interface CreateSessionParams {
  title: string;
  hostName: string;
  hostUpiVpa: string;
  hostUpiName?: string;
  feeMode?: FeeMode;
}

export interface CreateSessionResult {
  session: DbSession;
  hostKey: string;
  hostParticipantToken: string;
  hostParticipantId: string;
}

export const sessionService = {
  createSession(params: CreateSessionParams): CreateSessionResult {
    const sessionId = nanoid();
    let code = generateSessionCode();

    // Ensure code uniqueness
    while (repo.getSessionByCode(code)) {
      code = generateSessionCode();
    }

    const hostKey = generateToken();
    const hostKeyHash = hashToken(hostKey);

    const session: DbSession = {
      id: sessionId,
      code,
      host_key_hash: hostKeyHash,
      title: params.title.trim() || 'Dinner Table',
      host_upi_vpa: params.hostUpiVpa.trim(),
      host_upi_name: params.hostUpiName?.trim() || params.hostName.trim(),
      fee_mode: params.feeMode || 'proportional',
      status: 'setup',
      receipt_total_paise: 0,
      created_at: Date.now(),
    };

    repo.createSession(session);

    // Create the host as participant #1
    const hostParticipantId = nanoid();
    const hostParticipantToken = generateToken();
    const hostTokenHash = hashToken(hostParticipantToken);

    repo.addParticipant({
      id: hostParticipantId,
      session_id: sessionId,
      name: params.hostName.trim() || 'Host',
      token_hash: hostTokenHash,
      is_host: 1,
      pay_status: 'unpaid',
      paid_amount_paise: 0,
      covered_by: null,
      joined_at: Date.now(),
    });

    return {
      session,
      hostKey,
      hostParticipantToken,
      hostParticipantId,
    };
  },

  joinSession(code: string, name: string): { participantId: string; token: string; snapshot: SessionSnapshot } {
    const session = repo.getSessionByCode(code);
    if (!session) {
      throw new Error(`Session with code ${code} not found`);
    }

    const participantId = nanoid();
    const token = generateToken();
    const tokenHash = hashToken(token);

    repo.addParticipant({
      id: participantId,
      session_id: session.id,
      name: name.trim() || 'Guest Diner',
      token_hash: tokenHash,
      is_host: 0,
      pay_status: 'unpaid',
      paid_amount_paise: 0,
      covered_by: null,
      joined_at: Date.now(),
    });

    const snapshot = buildSessionSnapshot(session)!;
    return { participantId, token, snapshot };
  },

  verifyHost(code: string, hostKey: string): DbSession {
    const session = repo.getSessionByCode(code);
    if (!session) throw new Error('Session not found');
    if (!verifyToken(hostKey, session.host_key_hash)) {
      throw new Error('Unauthorized: Invalid host key');
    }
    return session;
  },

  setClaimPortion(
    sessionId: string,
    itemId: string,
    participantId: string,
    portion: number,
    callerToken?: string,
    hostKey?: string
  ): SessionSnapshot {
    const session = repo.getSessionById(sessionId);
    if (!session) throw new Error('Session not found');

    const item = repo.getItemById(itemId);
    if (!item || item.session_id !== sessionId) {
      throw new Error('Item not found in this session');
    }

    const participant = repo.getParticipantById(participantId);
    if (!participant || participant.session_id !== sessionId) {
      throw new Error('Participant not found in this session');
    }

    const isSelf = callerToken && verifyToken(callerToken, participant.token_hash);
    const isHost = hostKey && verifyToken(hostKey, session.host_key_hash);

    if (!isSelf && !isHost) {
      throw new Error('Unauthorized: Valid participant token or host key required to claim dishes');
    }

    const roundedPortion = Math.max(0, Math.round(portion));

    if (roundedPortion > 0) {
      const existingClaims = repo.getClaimsForItem(itemId);
      const otherClaims = existingClaims.filter((c) => c.participant_id !== participantId && c.weight > 0);
      const otherClaimedQty = otherClaims.reduce((acc, c) => acc + c.weight, 0);
      const availableQty = Math.max(0, item.quantity - otherClaimedQty);

      if (item.quantity === 1 && otherClaimedQty > 0) {
        throw new Error('This item has already been claimed by another diner');
      }

      if (item.quantity > 1 && roundedPortion > availableQty) {
        throw new Error(`Cannot claim ${roundedPortion} portions: only ${availableQty} remaining`);
      }
    }

    repo.setClaimPortion(itemId, participantId, roundedPortion);
    return buildSessionSnapshot(sessionId)!;
  },

  toggleClaim(sessionId: string, itemId: string, participantId: string, callerToken?: string, hostKey?: string, portion?: number): SessionSnapshot {
    const session = repo.getSessionById(sessionId);
    if (!session) throw new Error('Session not found');

    const item = repo.getItemById(itemId);
    if (!item || item.session_id !== sessionId) {
      throw new Error('Item not found in this session');
    }

    const participant = repo.getParticipantById(participantId);
    if (!participant || participant.session_id !== sessionId) {
      throw new Error('Participant not found in this session');
    }

    // Verify caller is either this participant or the host
    const isSelf = callerToken && verifyToken(callerToken, participant.token_hash);
    const isHost = hostKey && verifyToken(hostKey, session.host_key_hash);

    if (!isSelf && !isHost) {
      throw new Error('Unauthorized: Valid participant token or host key required to claim dishes');
    }

    if (portion !== undefined) {
      return this.setClaimPortion(sessionId, itemId, participantId, portion, callerToken, hostKey);
    }

    // Toggle: check existing claim
    const existingClaims = repo.getClaimsForItem(itemId);
    const myClaim = existingClaims.find((c) => c.participant_id === participantId);

    if (myClaim && myClaim.weight > 0) {
      // Diner unclaims their portion
      repo.setClaimPortion(itemId, participantId, 0);
    } else {
      // Diner wants to claim 1 portion
      const otherClaims = existingClaims.filter((c) => c.participant_id !== participantId && c.weight > 0);
      const otherClaimedQty = otherClaims.reduce((acc, c) => acc + c.weight, 0);
      const availableQty = Math.max(0, item.quantity - otherClaimedQty);

      if (availableQty <= 0) {
        throw new Error(
          item.quantity === 1
            ? 'This item has already been claimed by another diner'
            : 'All portions of this item have already been claimed'
        );
      }

      repo.setClaimPortion(itemId, participantId, 1);
    }

    return buildSessionSnapshot(sessionId)!;
  },

  markPaid(participantId: string, callerToken?: string): SessionSnapshot {
    const p = repo.getParticipantById(participantId);
    if (!p) throw new Error('Participant not found');

    if (!callerToken || !verifyToken(callerToken, p.token_hash)) {
      throw new Error('Unauthorized: Valid participant token required');
    }

    repo.updateParticipantPayStatus(participantId, 'pending_verify');
    return buildSessionSnapshot(p.session_id)!;
  },

  verifyPayment(code: string, hostKey: string, participantId: string): SessionSnapshot {
    const session = this.verifyHost(code, hostKey);
    const p = repo.getParticipantById(participantId);
    if (!p || p.session_id !== session.id) throw new Error('Participant not found');

    // Calculate current amountDue for this participant to record exact settled amount
    const currentSnap = buildSessionSnapshot(session.id)!;
    const share = currentSnap.split.shares.find((s) => s.participantId === participantId);
    const amountDue = share ? share.amountDue : 0;

    repo.updateParticipantPayStatus(participantId, 'paid_upi', amountDue);
    return buildSessionSnapshot(session.id)!;
  },

  rejectPayment(code: string, hostKey: string, participantId: string): SessionSnapshot {
    const session = this.verifyHost(code, hostKey);
    const p = repo.getParticipantById(participantId);
    if (!p || p.session_id !== session.id) throw new Error('Participant not found');
    repo.updateParticipantPayStatus(participantId, 'unpaid', 0);
    return buildSessionSnapshot(session.id)!;
  },

  toggleCashPayment(code: string, hostKey: string, participantId: string, isPaid: boolean): SessionSnapshot {
    const session = this.verifyHost(code, hostKey);
    const p = repo.getParticipantById(participantId);
    if (!p || p.session_id !== session.id) throw new Error('Participant not found');

    if (isPaid) {
      const currentSnap = buildSessionSnapshot(session.id)!;
      const share = currentSnap.split.shares.find((s) => s.participantId === participantId);
      const amountDue = share ? share.amountDue : 0;
      repo.updateParticipantPayStatus(participantId, 'paid_cash', amountDue);
    } else {
      repo.updateParticipantPayStatus(participantId, 'unpaid', 0);
    }
    return buildSessionSnapshot(session.id)!;
  },

  setProxyCover(code: string, hostKey: string, targetParticipantId: string, coveredByParticipantId: string | null): SessionSnapshot {
    const session = this.verifyHost(code, hostKey);
    const target = repo.getParticipantById(targetParticipantId);
    if (!target || target.session_id !== session.id) throw new Error('Target participant not found');

    if (coveredByParticipantId) {
      if (coveredByParticipantId === targetParticipantId) {
        throw new Error('A participant cannot cover themselves');
      }
      const coverer = repo.getParticipantById(coveredByParticipantId);
      if (!coverer || coverer.session_id !== session.id) throw new Error('Coverer not found in this session');

      // Rule 1: A participant who is already covered cannot cover others
      if (coverer.covered_by) {
        throw new Error('Participant is already covered by another diner and cannot cover others');
      }

      // Rule 2: A participant who is already covering others cannot be covered
      const allParts = repo.getParticipants(session.id);
      const isTargetCoveringOthers = allParts.some((p) => p.covered_by === targetParticipantId);
      if (isTargetCoveringOthers) {
        throw new Error('Participant is already covering other diners and cannot be covered');
      }

      // Rule 3: Circular cover prevention
      if (coverer.covered_by === targetParticipantId) {
        throw new Error('Circular cover relationship not allowed');
      }
    }

    repo.updateParticipantCover(targetParticipantId, coveredByParticipantId);
    return buildSessionSnapshot(session.id)!;
  },

  updateFeeMode(code: string, hostKey: string, feeMode: FeeMode): SessionSnapshot {
    const session = this.verifyHost(code, hostKey);
    repo.updateSessionSettings(session.id, { fee_mode: feeMode });
    return buildSessionSnapshot(session.id)!;
  },

  replaceBill(
    code: string,
    hostKey: string,
    items: { id: string; name: string; quantity: number; unitPricePaise: number; totalPaise: number }[],
    charges: { id: string; kind: ChargeKind; label: string; basis: ChargeBasis; value: number }[],
    receiptTotalPaise: number
  ): SessionSnapshot {
    const session = this.verifyHost(code, hostKey);
    repo.replaceBill(session.id, items, charges, receiptTotalPaise);
    return buildSessionSnapshot(session.id)!;
  },

  upsertItem(
    code: string,
    hostKey: string,
    item: { id: string; name: string; quantity: number; unitPricePaise: number; totalPaise: number }
  ): SessionSnapshot {
    const session = this.verifyHost(code, hostKey);
    repo.upsertItem(session.id, item);
    return buildSessionSnapshot(session.id)!;
  },

  deleteItem(code: string, hostKey: string, itemId: string): SessionSnapshot {
    const session = this.verifyHost(code, hostKey);
    const item = repo.getItemById(itemId);
    if (!item || item.session_id !== session.id) {
      throw new Error('Item not found in this session');
    }
    repo.deleteItem(session.id, itemId);
    return buildSessionSnapshot(session.id)!;
  },

  addCharge(
    code: string,
    hostKey: string,
    charge: { id: string; kind: ChargeKind; label: string; basis: ChargeBasis; value: number }
  ): SessionSnapshot {
    const session = this.verifyHost(code, hostKey);
    repo.upsertCharge(session.id, charge);
    return buildSessionSnapshot(session.id)!;
  },

  deleteCharge(code: string, hostKey: string, chargeId: string): SessionSnapshot {
    const session = this.verifyHost(code, hostKey);
    const ch = repo.getChargeById(chargeId);
    if (!ch || ch.session_id !== session.id) {
      throw new Error('Charge not found in this session');
    }
    repo.deleteCharge(session.id, chargeId);
    return buildSessionSnapshot(session.id)!;
  },

  updateSessionStatus(code: string, hostKey: string, status: DbSession['status']): SessionSnapshot {
    const session = this.verifyHost(code, hostKey);
    repo.updateSessionSettings(session.id, { status });
    return buildSessionSnapshot(session.id)!;
  },
};
