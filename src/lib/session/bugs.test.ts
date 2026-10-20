import { describe, it, expect, beforeEach } from 'vitest';
import { sessionService } from './service';
import { repo } from '../db/repo';

describe('Bug fixes and regression suite', () => {
  it('Bug 1 & 4: Two sessions with same item IDs do not collide, and editing a bill preserves existing claims', () => {
    // Session 1
    const s1 = sessionService.createSession({
      title: 'Table 1',
      hostName: 'Host 1',
      hostUpiVpa: 'host1@upi',
    });

    // Session 2
    const s2 = sessionService.createSession({
      title: 'Table 2',
      hostName: 'Host 2',
      hostUpiVpa: 'host2@upi',
    });

    // Both tables load items with identical client IDs: 'demo_1' and 'demo_2'
    const s1Snap = sessionService.replaceBill(
      s1.session.code,
      s1.hostKey,
      [
        { id: 'demo_1', name: 'Paneer Butter Masala', quantity: 1, unitPricePaise: 40000, totalPaise: 40000 },
        { id: 'demo_2', name: 'Garlic Naan', quantity: 2, unitPricePaise: 10000, totalPaise: 20000 },
      ],
      [],
      60000
    );

    // Guest joins Table 1 and claims demo_1
    const g1 = sessionService.joinSession(s1.session.code, 'Guest 1');
    const item1Id = s1Snap.items[0].id;
    sessionService.toggleClaim(s1.session.id, item1Id, g1.participantId, g1.token);

    // Check Table 1 has claim
    const s1Before = repo.getItemsWithClaims(s1.session.id);
    expect(s1Before[0].claims.length).toBe(1);

    // Now Table 2 loads bill with same IDs 'demo_1' and 'demo_2'
    sessionService.replaceBill(
      s2.session.code,
      s2.hostKey,
      [
        { id: 'demo_1', name: 'T2 Burger', quantity: 1, unitPricePaise: 25000, totalPaise: 25000 },
        { id: 'demo_2', name: 'T2 Fries', quantity: 1, unitPricePaise: 15000, totalPaise: 15000 },
      ],
      [],
      40000
    );

    // Verify Table 1 still has its original dishes and claims intact!
    const s1After = repo.getItemsWithClaims(s1.session.id);
    expect(s1After[0].name).toBe('Paneer Butter Masala');
    expect(s1After[0].claims.length).toBe(1);
    expect(s1After[0].claims[0].participant_id).toBe(g1.participantId);

    // Verify Table 2 has its own dishes
    const s2After = repo.getItemsWithClaims(s2.session.id);
    expect(s2After[0].name).toBe('T2 Burger');

    // Bug 4: Now Table 1 host edits bill (e.g. changes Garlic Naan price or adds a 3rd item)
    // The claim on Paneer Butter Masala must NOT be lost!
    sessionService.replaceBill(
      s1.session.code,
      s1.hostKey,
      [
        { id: item1Id, name: 'Paneer Butter Masala', quantity: 1, unitPricePaise: 45000, totalPaise: 45000 },
        { id: s1Snap.items[1].id, name: 'Garlic Naan', quantity: 3, unitPricePaise: 10000, totalPaise: 30000 },
      ],
      [],
      75000
    );

    const s1Replaced = repo.getItemsWithClaims(s1.session.id);
    expect(s1Replaced[0].claims.length).toBe(1);
    expect(s1Replaced[0].claims[0].participant_id).toBe(g1.participantId);
    expect(s1Replaced[0].unit_price_paise).toBe(45000);
  });

  it('Bug 2: Guest actions require valid token authentication', () => {
    const s = sessionService.createSession({
      title: 'Auth Table',
      hostName: 'Host',
      hostUpiVpa: 'host@upi',
    });

    const bill = sessionService.replaceBill(
      s.session.code,
      s.hostKey,
      [{ id: 'item_1', name: 'Pizza', quantity: 1, unitPricePaise: 50000, totalPaise: 50000 }],
      [],
      50000
    );
    const itemId = bill.items[0].id;

    const g = sessionService.joinSession(s.session.code, 'Alice');

    // Attempting to claim with invalid or missing token should throw
    expect(() => {
      sessionService.toggleClaim(s.session.id, itemId, g.participantId, 'wrong_token');
    }).toThrow(/unauthorized/i);

    // Attempting to mark paid with invalid token should throw
    expect(() => {
      sessionService.markPaid(g.participantId, 'wrong_token');
    }).toThrow(/unauthorized/i);

    // Valid token succeeds
    expect(() => {
      sessionService.toggleClaim(s.session.id, itemId, g.participantId, g.token);
    }).not.toThrow();

    expect(() => {
      sessionService.markPaid(g.participantId, g.token);
    }).not.toThrow();
  });

  it('Bug 3: Deleting an item or charge is scoped to session', () => {
    const s1 = sessionService.createSession({ title: 'T1', hostName: 'H1', hostUpiVpa: 'h1@upi' });
    const s2 = sessionService.createSession({ title: 'T2', hostName: 'H2', hostUpiVpa: 'h2@upi' });

    const b1 = sessionService.replaceBill(
      s1.session.code,
      s1.hostKey,
      [{ id: 'i1', name: 'T1 Pizza', quantity: 1, unitPricePaise: 50000, totalPaise: 50000 }],
      [],
      50000
    );
    const t1ItemId = b1.items[0].id;

    // H2 attempts to delete T1's item using H2's hostKey
    expect(() => {
      sessionService.deleteItem(s2.session.code, s2.hostKey, t1ItemId);
    }).toThrow(/not found in this session/i);

    // T1 item still exists
    expect(repo.getItemsWithClaims(s1.session.id).length).toBe(1);
  });

  it('Bug 5: Transitive covering (chains) and circular covers are strictly rejected', () => {
    const s = sessionService.createSession({ title: 'Cover Table', hostName: 'Host', hostUpiVpa: 'h@upi' });
    const gA = sessionService.joinSession(s.session.code, 'Alice');
    const gB = sessionService.joinSession(s.session.code, 'Bob');
    const gC = sessionService.joinSession(s.session.code, 'Charlie');

    // Alice covers Bob
    sessionService.setProxyCover(s.session.code, s.hostKey, gB.participantId, gA.participantId);

    // Bob cannot cover Charlie (because Bob is already covered by Alice)
    expect(() => {
      sessionService.setProxyCover(s.session.code, s.hostKey, gC.participantId, gB.participantId);
    }).toThrow(/already covered/i);

    // Charlie cannot cover Alice (because Alice is covering Bob, or if Charlie covers Alice then Alice cannot be covered)
    expect(() => {
      sessionService.setProxyCover(s.session.code, s.hostKey, gA.participantId, gC.participantId);
    }).toThrow(/already covering/i);
  });

  it('Bug 6: Payment tracking records paid amount and detects underpaid when bill increases', () => {
    const s = sessionService.createSession({ title: 'Pay Table', hostName: 'Host', hostUpiVpa: 'h@upi' });
    const g = sessionService.joinSession(s.session.code, 'Diner');

    // Bill: ₹400
    const b = sessionService.replaceBill(
      s.session.code,
      s.hostKey,
      [{ id: 'item_1', name: 'Pasta', quantity: 1, unitPricePaise: 40000, totalPaise: 40000 }],
      [],
      40000
    );
    sessionService.toggleClaim(s.session.id, b.items[0].id, g.participantId, g.token);

    // Diner pays ₹400 via UPI and host verifies
    sessionService.markPaid(g.participantId, g.token);
    const snapVerified = sessionService.verifyPayment(s.session.code, s.hostKey, g.participantId);

    expect(snapVerified.progress.settledPercent).toBe(100);
    expect(snapVerified.progress.totalSettledPaise).toBe(40000);

    // Host adds ₹100 tip afterwards!
    const snapAfterTip = sessionService.addCharge(s.session.code, s.hostKey, {
      id: 'tip_1',
      kind: 'tip',
      label: 'Tip',
      basis: 'fixed',
      value: 10000,
    });

    // Grand total is now ₹500. Diner owes ₹500, but only paid ₹400.
    // Progress bar must show ₹400 settled, not falsely reporting 100%!
    expect(snapAfterTip.progress.totalSettledPaise).toBe(40000);
    expect(snapAfterTip.progress.isFullySettled).toBe(false);
    expect(snapAfterTip.progress.settledPercent).toBe(80); // 400/500 = 80%

    const dinerRecord = snapAfterTip.participants.find((p) => p.id === g.participantId)!;
    expect(dinerRecord.paidAmountPaise).toBe(40000);
    expect(dinerRecord.payStatus).toBe('partially_paid');
  });
});
