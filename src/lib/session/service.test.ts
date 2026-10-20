import { describe, it, expect, beforeEach } from 'vitest';
import { sessionService } from './service';
import { repo } from '../db/repo';

describe('sessionService & Table Lifecycle', () => {
  it('creates session, allows joining, claiming items, and verifies payment', () => {
    // 1. Host creates session
    const createRes = sessionService.createSession({
      title: 'Birthday Dinner',
      hostName: 'Ishan (Host)',
      hostUpiVpa: 'ishan@upi',
      feeMode: 'proportional',
    });

    const code = createRes.session.code;
    const hostKey = createRes.hostKey;
    expect(code).toBeDefined();

    const dish1Id = 'dish1_' + Date.now();
    const dish2Id = 'dish2_' + Date.now();
    const gstId = 'gst_' + Date.now();

    // 2. Host loads bill with 2 dishes + 5% GST
    const snapshotWithBill = sessionService.replaceBill(
      code,
      hostKey,
      [
        { id: dish1Id, name: 'Paneer Tikka', quantity: 1, unitPricePaise: 40000, totalPaise: 40000 },
        { id: dish2Id, name: 'Dal Makhani', quantity: 1, unitPricePaise: 30000, totalPaise: 30000 },
      ],
      [
        { id: gstId, kind: 'tax', label: 'GST 5%', basis: 'percent', value: 5 },
      ],
      73500 // 700.00 items + 35.00 tax
    );

    expect(snapshotWithBill.items.length).toBe(2);
    expect(snapshotWithBill.progress.allClaimed).toBe(false);

    // 3. Guest joins
    const guestJoin = sessionService.joinSession(code, 'Priya');
    const priyaId = guestJoin.participantId;
    expect(priyaId).toBeDefined();

    // 4. Claims: Host claims dish 1, Priya claims dish 2
    sessionService.toggleClaim(snapshotWithBill.session.id, dish1Id, createRes.hostParticipantId, createRes.hostParticipantToken);
    const snapAfterClaims = sessionService.toggleClaim(snapshotWithBill.session.id, dish2Id, priyaId, guestJoin.token);

    expect(snapAfterClaims.progress.allClaimed).toBe(true);
    expect(snapAfterClaims.split.grandTotal).toBe(73500);

    // Priya owes 30000 + 1500 (5% on 300) = 31500
    const priyaShare = snapAfterClaims.split.shares.find((s) => s.participantId === priyaId)!;
    expect(priyaShare.amountDue).toBe(31500);

    // 5. Priya marks paid via UPI
    const snapPaid = sessionService.markPaid(priyaId, guestJoin.token);
    expect(snapPaid.participants.find((p) => p.id === priyaId)?.payStatus).toBe('pending_verify');
    expect(snapPaid.progress.totalPendingPaise).toBe(31500);

    // 6. Host verifies Priya's payment
    const snapVerified = sessionService.verifyPayment(code, hostKey, priyaId);
    expect(snapVerified.participants.find((p) => p.id === priyaId)?.payStatus).toBe('paid_upi');

    // Host's claimed items (42000) are automatically added to overall progress as paid,
    // plus Priya's verified payment (31500) = 73500 total settled!
    expect(snapVerified.progress.totalSettledPaise).toBe(73500);
    expect(snapVerified.participants.find((p) => p.id === createRes.hostParticipantId)?.payStatus).toBe('paid_cash');

    // All settled!
    expect(snapVerified.progress.isFullySettled).toBe(true);
    expect(snapVerified.progress.settledPercent).toBe(100);
  });

  it('supports partial quantity selection, host self-item verification, and mixed fixed/percent charges', () => {
    // 1. Host creates table
    const createRes = sessionService.createSession({
      title: 'Group BBQ',
      hostName: 'Chef Rahul (Host)',
      hostUpiVpa: 'rahul@upi',
      feeMode: 'proportional',
    });
    const code = createRes.session.code;
    const hostKey = createRes.hostKey;
    const hostId = createRes.hostParticipantId;

    // 2. Bill with 3 Chicken Tikkas (600.00 total, 200.00 each) and 2 Naans (180.00 total, 90.00 each)
    const tikkaId = 'tikka_' + Date.now();
    const naanId = 'naan_' + Date.now();
    const svcId = 'svc_' + Date.now();
    const gstId = 'gst_' + Date.now();

    const snapBill = sessionService.replaceBill(
      code,
      hostKey,
      [
        { id: tikkaId, name: 'Chicken Tikka', quantity: 3, unitPricePaise: 20000, totalPaise: 60000 },
        { id: naanId, name: 'Garlic Naan', quantity: 2, unitPricePaise: 9000, totalPaise: 18000 },
      ],
      [
        // Fixed amount service charge: ₹100.00
        { id: svcId, kind: 'service', label: 'Service Fee', basis: 'fixed', value: 10000 },
        // Percentage GST: 5% on items (780.00 * 5% = 39.00)
        { id: gstId, kind: 'tax', label: 'GST 5%', basis: 'percent', value: 5 },
      ],
      91900 // 780 items + 100 svc + 39 tax
    );

    expect(snapBill.items.length).toBe(2);
    expect(snapBill.items[0].remainingQuantity).toBe(3);

    // 3. Guest A joins and ate ONLY 1 Chicken Tikka (out of 3)
    const guestA = sessionService.joinSession(code, 'Aman');
    const snapA = sessionService.setClaimPortion(snapBill.session.id, tikkaId, guestA.participantId, 1, guestA.token);

    // Aman only claimed 1 portion of Tikka (200.00). 2 remain unclaimed!
    const amanItem = snapA.items.find((i) => i.id === tikkaId)!;
    expect(amanItem.claimedQuantity).toBe(1);
    expect(amanItem.remainingQuantity).toBe(2);
    expect(snapA.progress.allClaimed).toBe(false);

    // Aman's item subtotal is 20000 (₹200.00), not the full 60000!
    const amanShare = snapA.split.shares.find((s) => s.participantId === guestA.participantId)!;
    expect(amanShare.itemSubtotal).toBe(20000);

    // 4. Guest B joins and ate 1 Chicken Tikka and 1 Garlic Naan
    const guestB = sessionService.joinSession(code, 'Bhavna');
    sessionService.setClaimPortion(snapBill.session.id, tikkaId, guestB.participantId, 1, guestB.token);
    const snapB = sessionService.setClaimPortion(snapBill.session.id, naanId, guestB.participantId, 1, guestB.token);

    const bhavnaShare = snapB.split.shares.find((s) => s.participantId === guestB.participantId)!;
    expect(bhavnaShare.itemSubtotal).toBe(29000); // 200 Tikka + 90 Naan = 290

    // Remaining on table: 1 Tikka and 1 Naan
    const tikkaAfterB = snapB.items.find((i) => i.id === tikkaId)!;
    const naanAfterB = snapB.items.find((i) => i.id === naanId)!;
    expect(tikkaAfterB.remainingQuantity).toBe(1);
    expect(naanAfterB.remainingQuantity).toBe(1);

    // 5. Host verifies the items that they themselves had directly:
    // Host claims the remaining 1 Chicken Tikka and 1 Garlic Naan using hostKey!
    sessionService.setClaimPortion(snapBill.session.id, tikkaId, hostId, 1, undefined, hostKey);
    const snapHost = sessionService.setClaimPortion(snapBill.session.id, naanId, hostId, 1, undefined, hostKey);

    // Now all items and all portions are claimed!
    expect(snapHost.progress.allClaimed).toBe(true);
    expect(snapHost.split.unclaimedItems.length).toBe(0);

    // Invariant check: sum of all shares exactly equals grandTotal (91900 paise = ₹919.00)
    const sumAllShares = snapHost.split.shares.reduce((acc, s) => acc + s.amountDue, 0);
    expect(sumAllShares).toBe(snapHost.split.grandTotal);
    expect(sumAllShares).toBe(91900);

    // Host's claimed items are automatically added to overall progress as paid!
    const hostShare = snapHost.split.shares.find((s) => s.participantId === hostId)!;
    expect(hostShare.amountDue).toBeGreaterThan(0);
    expect(snapHost.progress.totalSettledPaise).toBe(hostShare.amountDue);
    expect(snapHost.participants.find((p) => p.id === hostId)?.payStatus).toBe('paid_cash');
  });

  it('locks claimed items so they cannot be claimed by other diners who join later', () => {
    // 1. Host creates table
    const createRes = sessionService.createSession({
      title: 'Dinner Party',
      hostName: 'Karan (Host)',
      hostUpiVpa: 'karan@upi',
      feeMode: 'proportional',
    });
    const code = createRes.session.code;
    const hostKey = createRes.hostKey;
    const sessionId = createRes.session.id;

    const singleDishId = 'pizza_' + Date.now();
    const multiDishId = 'drinks_' + Date.now();

    sessionService.replaceBill(
      code,
      hostKey,
      [
        { id: singleDishId, name: 'Margherita Pizza', quantity: 1, unitPricePaise: 50000, totalPaise: 50000 },
        { id: multiDishId, name: 'Mojito Pitcher', quantity: 3, unitPricePaise: 30000, totalPaise: 90000 },
      ],
      [],
      140000
    );

    // 2. Guest A joins and claims the single Margherita Pizza
    const guestA = sessionService.joinSession(code, 'Aman');
    sessionService.toggleClaim(sessionId, singleDishId, guestA.participantId, guestA.token);

    // 3. Guest B joins later and attempts to claim the same Margherita Pizza
    const guestB = sessionService.joinSession(code, 'Bhavna');
    expect(() => {
      sessionService.toggleClaim(sessionId, singleDishId, guestB.participantId, guestB.token);
    }).toThrow('This item has already been claimed by another diner');

    expect(() => {
      sessionService.setClaimPortion(sessionId, singleDishId, guestB.participantId, 1, guestB.token);
    }).toThrow('This item has already been claimed by another diner');

    // 4. Test multi-quantity item: Mojito Pitcher (quantity: 3)
    // Guest A claims 2 pitchers
    sessionService.setClaimPortion(sessionId, multiDishId, guestA.participantId, 2, guestA.token);

    // Guest B attempts to claim 2 pitchers (only 1 remaining) -> should fail
    expect(() => {
      sessionService.setClaimPortion(sessionId, multiDishId, guestB.participantId, 2, guestB.token);
    }).toThrow('Cannot claim 2 portions: only 1 remaining');

    // Guest B claims 1 pitcher (the 1 remaining) -> should succeed
    const snapAfterB = sessionService.setClaimPortion(sessionId, multiDishId, guestB.participantId, 1, guestB.token);
    const pitcherItem = snapAfterB.items.find((i) => i.id === multiDishId)!;
    expect(pitcherItem.remainingQuantity).toBe(0);

    // 5. Guest C joins later and tries to claim Mojito Pitcher when all 3 are claimed
    const guestC = sessionService.joinSession(code, 'Chirag');
    expect(() => {
      sessionService.toggleClaim(sessionId, multiDishId, guestC.participantId, guestC.token);
    }).toThrow('All portions of this item have already been claimed');

    expect(() => {
      sessionService.setClaimPortion(sessionId, multiDishId, guestC.participantId, 1, guestC.token);
    }).toThrow('Cannot claim 1 portions: only 0 remaining');

    // 6. Guest A unclaims the single pizza
    sessionService.setClaimPortion(sessionId, singleDishId, guestA.participantId, 0, guestA.token);

    // Now Guest B can claim the pizza
    const snapPizzaClaimed = sessionService.setClaimPortion(sessionId, singleDishId, guestB.participantId, 1, guestB.token);
    const pizzaItem = snapPizzaClaimed.items.find((i) => i.id === singleDishId)!;
    expect(pizzaItem.claims.find((c) => c.participantId === guestB.participantId)?.weight).toBe(1);

    // And now Guest A cannot claim it since Guest B holds it
    expect(() => {
      sessionService.setClaimPortion(sessionId, singleDishId, guestA.participantId, 1, guestA.token);
    }).toThrow('This item has already been claimed by another diner');
  });
});
