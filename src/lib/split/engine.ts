import { allocate } from './allocate';

export type ChargeKind = 'tax' | 'service' | 'tip' | 'discount' | 'other';
export type ChargeBasis = 'fixed' | 'percent';
export type FeeMode = 'proportional' | 'equal';

export interface ParticipantInput {
  id: string;
  name: string;
  coveredBy?: string | null;
}

export interface ItemClaim {
  participantId: string;
  weight?: number; // defaults to 1
}

export interface ItemInput {
  id: string;
  name: string;
  quantity?: number;
  totalPaise: number;
  claims: ItemClaim[];
}

export interface ChargeInput {
  id: string;
  kind: ChargeKind;
  label: string;
  basis: ChargeBasis;
  value: number; // For 'fixed': integer paise. For 'percent': percentage number e.g. 5 for 5%, 2.5 for 2.5%
}

export interface SplitInput {
  participants: ParticipantInput[];
  items: ItemInput[];
  charges: ChargeInput[];
  feeMode: FeeMode;
}

export interface ItemShare {
  itemId: string;
  itemName: string;
  paise: number;
  isShared: boolean;
  sharerCount: number;
  claimedQuantity?: number;
  itemQuantity?: number;
}

export interface ChargeShare {
  chargeId: string;
  label: string;
  kind: ChargeKind;
  paise: number; // Negative for discounts
}

export interface ParticipantShare {
  participantId: string;
  participantName: string;
  items: ItemShare[];
  itemSubtotal: number;
  charges: ChargeShare[];
  chargesSubtotal: number;
  ownTotal: number; // itemSubtotal + chargesSubtotal
  coveredAmount: number; // Sum of totals transferred from people this participant covers
  coveredParticipantIds: string[]; // List of participant IDs covered by this person
  coveredBy: string | null; // ID of the person covering this diner (if any)
  amountDue: number; // The final settlement amount to pay (0 if covered by another)
}

export interface ResolvedCharge {
  id: string;
  label: string;
  kind: ChargeKind;
  basis: ChargeBasis;
  value: number;
  totalPaise: number; // Computed absolute value in paise (negative if discount)
}

export interface UnclaimedItem {
  id: string;
  name: string;
  totalPaise: number;
  unclaimedQuantity?: number;
}

export interface SplitResult {
  shares: ParticipantShare[];
  itemsSubtotal: number;
  charges: ResolvedCharge[];
  chargesTotal: number;
  grandTotal: number; // itemsSubtotal + chargesTotal
  unclaimedItems: UnclaimedItem[];
  allSettled: boolean;
}

/**
 * Computes the itemized split for a dining session.
 */
export function computeSplit(input: SplitInput): SplitResult {
  const { participants, items, charges, feeMode } = input;

  const participantMap = new Map<string, ParticipantShare>();
  for (const p of participants) {
    participantMap.set(p.id, {
      participantId: p.id,
      participantName: p.name,
      items: [],
      itemSubtotal: 0,
      charges: [],
      chargesSubtotal: 0,
      ownTotal: 0,
      coveredAmount: 0,
      coveredParticipantIds: [],
      coveredBy: p.coveredBy || null,
      amountDue: 0,
    });
  }

  // 1. Process items and distribute among claimants
  const unclaimedItems: UnclaimedItem[] = [];
  let itemsSubtotal = 0;

  for (const item of items) {
    itemsSubtotal += item.totalPaise;

    // Filter valid claims for registered participants
    const validClaims = (item.claims || []).filter((c) =>
      participantMap.has(c.participantId)
    );

    const qty = Math.max(1, item.quantity || 1);

    if (validClaims.length === 0) {
      unclaimedItems.push({
        id: item.id,
        name: item.name,
        totalPaise: item.totalPaise,
        unclaimedQuantity: qty,
      });
      continue;
    }

    const weights = validClaims.map((c) => (c.weight && c.weight > 0 ? c.weight : 1));
    const sumWeights = weights.reduce((a, b) => a + b, 0);

    if (sumWeights < qty) {
      // Partially claimed item! e.g. 1 out of 3 Chicken Tikkas claimed
      const unclaimedWeight = qty - sumWeights;
      const allWeights = [...weights, unclaimedWeight];
      const parts = allocate(item.totalPaise, allWeights);

      validClaims.forEach((claim, idx) => {
        const sharePaise = parts[idx];
        const pShare = participantMap.get(claim.participantId)!;

        pShare.items.push({
          itemId: item.id,
          itemName: item.name,
          paise: sharePaise,
          isShared: sumWeights > (claim.weight || 1),
          sharerCount: validClaims.length,
          claimedQuantity: claim.weight || 1,
          itemQuantity: qty,
        });
        pShare.itemSubtotal += sharePaise;
      });

      const unclaimedPaise = parts[weights.length];
      if (unclaimedPaise > 0) {
        unclaimedItems.push({
          id: item.id,
          name: item.name,
          totalPaise: unclaimedPaise,
          unclaimedQuantity: unclaimedWeight,
        });
      }
    } else {
      // Fully claimed or shared item (sumWeights >= qty)
      const parts = allocate(item.totalPaise, weights);

      validClaims.forEach((claim, idx) => {
        const sharePaise = parts[idx];
        const pShare = participantMap.get(claim.participantId)!;

        pShare.items.push({
          itemId: item.id,
          itemName: item.name,
          paise: sharePaise,
          isShared: validClaims.length > 1 || sumWeights > 1,
          sharerCount: validClaims.length,
          claimedQuantity: claim.weight || 1,
          itemQuantity: qty,
        });
        pShare.itemSubtotal += sharePaise;
      });
    }
  }

  // 2. Resolve charges (taxes, service charges, tips, discounts)
  const resolvedCharges: ResolvedCharge[] = [];
  let chargesTotal = 0;

  for (const ch of charges) {
    let chargePaise = 0;
    if (ch.basis === 'percent') {
      // Percentage applied on total claimed item subtotal or full itemsSubtotal
      chargePaise = Math.round((itemsSubtotal * ch.value) / 100);
    } else {
      chargePaise = Math.round(ch.value);
    }

    // Discounts are negative
    if (ch.kind === 'discount') {
      chargePaise = -Math.abs(chargePaise);
    }

    resolvedCharges.push({
      id: ch.id,
      label: ch.label,
      kind: ch.kind,
      basis: ch.basis,
      value: ch.value,
      totalPaise: chargePaise,
    });

    chargesTotal += chargePaise;
  }

  // 3. Distribute charges among participants
  const participantList = Array.from(participantMap.values());
  const numParticipants = participantList.length;

  if (numParticipants > 0) {
    for (const rCharge of resolvedCharges) {
      let weights: number[];

      if (feeMode === 'proportional') {
        const totalClaimed = participantList.reduce((acc, p) => acc + p.itemSubtotal, 0);
        if (totalClaimed > 0) {
          weights = participantList.map((p) => p.itemSubtotal);
        } else {
          // If nobody has claimed anything yet, fall back to equal weight
          weights = participantList.map(() => 1);
        }
      } else {
        // Equal mode: divided flat among all participants
        weights = participantList.map(() => 1);
      }

      const allocatedCharge = allocate(rCharge.totalPaise, weights);

      participantList.forEach((pShare, idx) => {
        const cPaise = allocatedCharge[idx];
        pShare.charges.push({
          chargeId: rCharge.id,
          label: rCharge.label,
          kind: rCharge.kind,
          paise: cPaise,
        });
        pShare.chargesSubtotal += cPaise;
      });
    }
  }

  // 4. Calculate ownTotal for each participant
  for (const pShare of participantList) {
    pShare.ownTotal = pShare.itemSubtotal + pShare.chargesSubtotal;
    pShare.amountDue = pShare.ownTotal;
  }

  // 5. Resolve proxy / cover payments
  // If B is covered by A: B's ownTotal is transferred to A, B's amountDue is 0.
  // We validate against cycles and self-covers.
  for (const p of participants) {
    const coveredByTarget = p.coveredBy;
    if (
      coveredByTarget &&
      coveredByTarget !== p.id &&
      participantMap.has(coveredByTarget)
    ) {
      const targetShare = participantMap.get(coveredByTarget)!;
      const coveredShare = participantMap.get(p.id)!;

      // Transfer the balance
      targetShare.coveredAmount += coveredShare.ownTotal;
      targetShare.coveredParticipantIds.push(p.id);

      coveredShare.amountDue = 0;
    }
  }

  // Update target amountDue
  for (const pShare of participantList) {
    if (!pShare.coveredBy) {
      pShare.amountDue = pShare.ownTotal + pShare.coveredAmount;
    }
  }

  const grandTotal = itemsSubtotal + chargesTotal;

  // 6. Invariant check:
  // If all items are claimed, sum(amountDue) must equal grandTotal EXACTLY!
  if (unclaimedItems.length === 0 && numParticipants > 0) {
    const sumAmountDue = participantList.reduce((acc, p) => acc + p.amountDue, 0);
    if (sumAmountDue !== grandTotal) {
      throw new Error(`Split invariant violation: sum(amountDue) [${sumAmountDue}] !== grandTotal [${grandTotal}]`);
    }
  }

  return {
    shares: participantList,
    itemsSubtotal,
    charges: resolvedCharges,
    chargesTotal,
    grandTotal,
    unclaimedItems,
    allSettled: false,
  };
}
