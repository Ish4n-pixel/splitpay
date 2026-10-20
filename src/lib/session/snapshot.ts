import { repo, DbSession, DbParticipant } from '../db/repo';
import { computeSplit, SplitResult, FeeMode, ChargeKind, ChargeBasis } from '../split/engine';

export interface ClientParticipant {
  id: string;
  name: string;
  isHost: boolean;
  payStatus: 'unpaid' | 'pending_verify' | 'paid_upi' | 'paid_cash' | 'partially_paid';
  paidAmountPaise: number;
  coveredBy: string | null;
  joinedAt: number;
}

export interface ClientItemClaim {
  participantId: string;
  weight: number;
}

export interface ClientItem {
  id: string;
  name: string;
  quantity: number;
  unitPricePaise: number;
  totalPaise: number;
  claimedBy: string[]; // participant IDs
  claims: ClientItemClaim[];
  claimedQuantity: number;
  remainingQuantity: number;
}

export interface ClientCharge {
  id: string;
  kind: ChargeKind;
  label: string;
  basis: ChargeBasis;
  value: number;
  totalPaise: number;
}

export interface SessionSnapshot {
  session: {
    id: string;
    code: string;
    title: string;
    hostUpiVpa: string;
    hostUpiName: string;
    feeMode: FeeMode;
    status: 'setup' | 'claiming' | 'settling' | 'closed';
    receiptTotalPaise: number;
    createdAt: number;
  };
  participants: ClientParticipant[];
  items: ClientItem[];
  charges: ClientCharge[];
  split: SplitResult;
  progress: {
    totalSettledPaise: number;
    totalPendingPaise: number;
    totalUnpaidPaise: number;
    settledPercent: number;
    isFullySettled: boolean;
    allClaimed: boolean;
  };
}

export function buildSessionSnapshot(sessionOrId: DbSession | string): SessionSnapshot | null {
  const session = typeof sessionOrId === 'string' ? repo.getSessionById(sessionOrId) : sessionOrId;
  if (!session) return null;

  const dbParticipants = repo.getParticipants(session.id);
  const dbItems = repo.getItemsWithClaims(session.id);
  const dbCharges = repo.getCharges(session.id);

  // Prepare input for split engine
  const splitInput = {
    participants: dbParticipants.map((p) => ({
      id: p.id,
      name: p.name,
      coveredBy: p.covered_by,
    })),
    items: dbItems.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      totalPaise: item.total_paise,
      claims: item.claims.map((c) => ({
        participantId: c.participant_id,
        weight: c.weight,
      })),
    })),
    charges: dbCharges.map((ch) => ({
      id: ch.id,
      kind: ch.kind,
      label: ch.label,
      basis: ch.basis,
      value: ch.value,
    })),
    feeMode: session.fee_mode,
  };

  const split = computeSplit(splitInput);

  // Compute settlement progress
  let totalSettledPaise = 0;
  let totalPendingPaise = 0;
  let totalUnpaidPaise = 0;

  for (const share of split.shares) {
    const p = dbParticipants.find((dp) => dp.id === share.participantId);
    if (!p) continue;

    // If this diner is covered by someone else, their balance is 0 and transferred to the host/coverer
    if (share.amountDue === 0) continue;

    // Once host claims items for themselves, their share is committed/settled directly by the host
    if (p.is_host === 1 && share.amountDue > 0) {
      totalSettledPaise += share.amountDue;
      continue;
    }

    const paid = p.paid_amount_paise || 0;

    if (p.pay_status === 'paid_upi' || p.pay_status === 'paid_cash') {
      const settled = Math.min(paid > 0 ? paid : share.amountDue, share.amountDue);
      totalSettledPaise += settled;
      if (share.amountDue > settled) {
        totalUnpaidPaise += (share.amountDue - settled);
      }
    } else if (p.pay_status === 'pending_verify') {
      const settled = Math.min(paid, share.amountDue);
      totalSettledPaise += settled;
      totalPendingPaise += (share.amountDue - settled);
    } else {
      totalUnpaidPaise += share.amountDue;
    }
  }

  const grandTotal = split.grandTotal;
  const settledPercent = grandTotal > 0 ? Math.min(100, Math.round((totalSettledPaise / grandTotal) * 100)) : 0;
  const isFullySettled = grandTotal > 0 && totalSettledPaise >= grandTotal;
  const allClaimed = split.unclaimedItems.length === 0;

  return {
    session: {
      id: session.id,
      code: session.code,
      title: session.title,
      hostUpiVpa: session.host_upi_vpa,
      hostUpiName: session.host_upi_name,
      feeMode: session.fee_mode,
      status: session.status,
      receiptTotalPaise: session.receipt_total_paise,
      createdAt: session.created_at,
    },
    participants: dbParticipants.map((p) => {
      const share = split.shares.find((s) => s.participantId === p.id);
      const amountDue = share?.amountDue || 0;
      const isHost = p.is_host === 1;
      const paid = isHost ? amountDue : (p.paid_amount_paise || 0);
      let effectiveStatus: ClientParticipant['payStatus'] = p.pay_status;
      if (isHost) {
        effectiveStatus = amountDue > 0 ? 'paid_cash' : 'unpaid';
      } else if ((p.pay_status === 'paid_upi' || p.pay_status === 'paid_cash') && paid > 0 && amountDue > paid) {
        effectiveStatus = 'partially_paid';
      }

      return {
        id: p.id,
        name: p.name,
        isHost,
        payStatus: effectiveStatus,
        paidAmountPaise: paid,
        coveredBy: p.covered_by,
        joinedAt: p.joined_at,
      };
    }),
    items: dbItems.map((item) => {
      const claims = item.claims.map((c) => ({
        participantId: c.participant_id,
        weight: c.weight || 1,
      }));
      const totalClaimedQty = claims.reduce((acc, c) => acc + c.weight, 0);
      const remainingQty = Math.max(0, item.quantity - totalClaimedQty);

      return {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPricePaise: item.unit_price_paise,
        totalPaise: item.total_paise,
        claimedBy: claims.map((c) => c.participantId),
        claims,
        claimedQuantity: totalClaimedQty,
        remainingQuantity: remainingQty,
      };
    }),
    charges: split.charges.map((ch) => ({
      id: ch.id,
      kind: ch.kind,
      label: ch.label,
      basis: ch.basis,
      value: ch.value,
      totalPaise: ch.totalPaise,
    })),
    split,
    progress: {
      totalSettledPaise,
      totalPendingPaise,
      totalUnpaidPaise,
      settledPercent,
      isFullySettled,
      allClaimed,
    },
  };
}
