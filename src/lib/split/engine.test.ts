import { describe, it, expect } from 'vitest';
import { computeSplit, SplitInput } from './engine';

describe('computeSplit (SplitPay Engine)', () => {
  it('solves the "Unequal Eater" dilemma: proportional vs equal fee distribution', () => {
    // Alice ordered Salad (₹200 = 20000 paise)
    // Bob ordered Wagyu Steak (₹1000 = 100000 paise)
    // Bill has 10% Service Charge (₹120 = 12000 paise) and 5% GST (₹60 = 6000 paise)
    const baseInput: SplitInput = {
      participants: [
        { id: 'alice', name: 'Alice' },
        { id: 'bob', name: 'Bob' },
      ],
      items: [
        { id: 'item1', name: 'Caesar Salad', totalPaise: 20000, claims: [{ participantId: 'alice' }] },
        { id: 'item2', name: 'Wagyu Steak', totalPaise: 100000, claims: [{ participantId: 'bob' }] },
      ],
      charges: [
        { id: 'ch1', kind: 'service', label: 'Service Charge 10%', basis: 'percent', value: 10 },
        { id: 'ch2', kind: 'tax', label: 'GST 5%', basis: 'percent', value: 5 },
      ],
      feeMode: 'proportional',
    };

    const propResult = computeSplit(baseInput);

    // Items total = ₹1200.00
    expect(propResult.itemsSubtotal).toBe(120000);
    // Service 10% = ₹120.00 (12000 paise), GST 5% = ₹60.00 (6000 paise)
    expect(propResult.chargesTotal).toBe(18000);
    expect(propResult.grandTotal).toBe(138000);

    const aliceProp = propResult.shares.find((s) => s.participantId === 'alice')!;
    const bobProp = propResult.shares.find((s) => s.participantId === 'bob')!;

    // In proportional mode:
    // Alice's ratio = 200 / 1200 = 1/6
    // Fees for Alice = 18000 * 1/6 = 3000 paise (₹30.00)
    // Alice total = ₹200 + ₹30 = ₹230.00 (23000 paise)
    expect(aliceProp.amountDue).toBe(23000);

    // Bob's ratio = 1000 / 1200 = 5/6
    // Fees for Bob = 18000 * 5/6 = 15000 paise (₹150.00)
    // Bob total = ₹1000 + ₹150 = ₹1150.00 (115000 paise)
    expect(bobProp.amountDue).toBe(115000);

    // Sum invariant:
    expect(aliceProp.amountDue + bobProp.amountDue).toBe(propResult.grandTotal);

    // Now test with EQUAL fee distribution:
    const equalInput: SplitInput = { ...baseInput, feeMode: 'equal' };
    const equalResult = computeSplit(equalInput);

    const aliceEqual = equalResult.shares.find((s) => s.participantId === 'alice')!;
    const bobEqual = equalResult.shares.find((s) => s.participantId === 'bob')!;

    // In equal mode, fees (₹180) are split 50/50: ₹90 each
    // Alice pays ₹200 + ₹90 = ₹290.00 (29000 paise)
    // Bob pays ₹1000 + ₹90 = ₹1090.00 (109000 paise)
    expect(aliceEqual.amountDue).toBe(29000);
    expect(bobEqual.amountDue).toBe(109000);
    expect(aliceEqual.amountDue + bobEqual.amountDue).toBe(equalResult.grandTotal);
  });

  it('correctly splits shared items only among participants who claimed them', () => {
    // 4 Diners: A, B, C, D
    // Pizza (₹800) shared by A & B
    // Bottle of Wine (₹1200) shared by B, C, & D
    // Dessert (₹300) eaten only by D
    const input: SplitInput = {
      participants: [
        { id: 'A', name: 'Alice' },
        { id: 'B', name: 'Bob' },
        { id: 'C', name: 'Charlie' },
        { id: 'D', name: 'Diana' },
      ],
      items: [
        {
          id: 'p1',
          name: 'Pizza',
          totalPaise: 80000,
          claims: [{ participantId: 'A' }, { participantId: 'B' }],
        },
        {
          id: 'w1',
          name: 'Wine',
          totalPaise: 120000,
          claims: [{ participantId: 'B' }, { participantId: 'C' }, { participantId: 'D' }],
        },
        {
          id: 'd1',
          name: 'Dessert',
          totalPaise: 30000,
          claims: [{ participantId: 'D' }],
        },
      ],
      charges: [],
      feeMode: 'proportional',
    };

    const res = computeSplit(input);
    const getShare = (id: string) => res.shares.find((s) => s.participantId === id)!;

    // A: half pizza = 400.00
    expect(getShare('A').itemSubtotal).toBe(40000);
    // B: half pizza (400) + 1/3 wine (400) = 800.00
    expect(getShare('B').itemSubtotal).toBe(80000);
    // C: 1/3 wine = 400.00
    expect(getShare('C').itemSubtotal).toBe(40000);
    // D: 1/3 wine (400) + dessert (300) = 700.00
    expect(getShare('D').itemSubtotal).toBe(70000);

    // Total = 400 + 800 + 400 + 700 = 2300.00
    expect(res.grandTotal).toBe(230000);
  });

  it('handles discounts and fixed tip fees simultaneously', () => {
    const input: SplitInput = {
      participants: [
        { id: 'p1', name: 'P1' },
        { id: 'p2', name: 'P2' },
      ],
      items: [
        { id: 'i1', name: 'Main', totalPaise: 100000, claims: [{ participantId: 'p1' }, { participantId: 'p2' }] },
      ],
      charges: [
        { id: 'disc', kind: 'discount', label: 'Zomato Gold 20%', basis: 'percent', value: 20 },
        { id: 'tip', kind: 'tip', label: 'Tip', basis: 'fixed', value: 10000 }, // ₹100
      ],
      feeMode: 'equal',
    };

    const res = computeSplit(input);
    // Items = 100000. Discount = -20000. Tip = +10000. Grand = 90000 (₹900.00)
    expect(res.grandTotal).toBe(90000);
    expect(res.shares[0].amountDue).toBe(45000);
    expect(res.shares[1].amountDue).toBe(45000);
  });

  it('correctly handles proxy payments (A covers B)', () => {
    const input: SplitInput = {
      participants: [
        { id: 'p1', name: 'Host Alice' },
        { id: 'p2', name: 'Guest Bob', coveredBy: 'p1' }, // Alice covers Bob
        { id: 'p3', name: 'Guest Charlie' },
      ],
      items: [
        { id: 'i1', name: 'Alice Item', totalPaise: 30000, claims: [{ participantId: 'p1' }] },
        { id: 'i2', name: 'Bob Item', totalPaise: 40000, claims: [{ participantId: 'p2' }] },
        { id: 'i3', name: 'Charlie Item', totalPaise: 50000, claims: [{ participantId: 'p3' }] },
      ],
      charges: [],
      feeMode: 'proportional',
    };

    const res = computeSplit(input);
    const alice = res.shares.find((s) => s.participantId === 'p1')!;
    const bob = res.shares.find((s) => s.participantId === 'p2')!;
    const charlie = res.shares.find((s) => s.participantId === 'p3')!;

    // Bob's amountDue is 0 because covered by Alice
    expect(bob.amountDue).toBe(0);
    expect(bob.ownTotal).toBe(40000);
    expect(bob.coveredBy).toBe('p1');

    // Alice owes her own (30000) + Bob's (40000) = 70000
    expect(alice.ownTotal).toBe(30000);
    expect(alice.coveredAmount).toBe(40000);
    expect(alice.amountDue).toBe(70000);
    expect(alice.coveredParticipantIds).toEqual(['p2']);

    // Charlie owes his own (50000)
    expect(charlie.amountDue).toBe(50000);

    // Sum invariant still holds
    expect(alice.amountDue + bob.amountDue + charlie.amountDue).toBe(res.grandTotal);
  });

  it('flags unclaimed items and excludes them from diner balances', () => {
    const input: SplitInput = {
      participants: [{ id: 'p1', name: 'Alice' }],
      items: [
        { id: 'i1', name: 'Claimed Salad', totalPaise: 25000, claims: [{ participantId: 'p1' }] },
        { id: 'i2', name: 'Orphan Bread Basket', totalPaise: 15000, claims: [] },
      ],
      charges: [],
      feeMode: 'proportional',
    };

    const res = computeSplit(input);
    expect(res.unclaimedItems.length).toBe(1);
    expect(res.unclaimedItems[0].name).toBe('Orphan Bread Basket');
    expect(res.shares[0].amountDue).toBe(25000);
  });

  it('supports partial quantity item claiming (e.g. 1 out of 3 Chicken Tikkas) so diner pays only for what they ate', () => {
    // 3 Chicken Tikkas @ ₹200 = ₹600 (60000 paise)
    // Person A had 1 Chicken Tikka (weight: 1)
    // Person B had 2 Chicken Tikkas (weight: 2)
    const input: SplitInput = {
      participants: [
        { id: 'pA', name: 'Person A' },
        { id: 'pB', name: 'Person B' },
      ],
      items: [
        {
          id: 'tikka',
          name: 'Chicken Tikka',
          quantity: 3,
          totalPaise: 60000,
          claims: [{ participantId: 'pA', weight: 1 }], // Person A claims only 1 out of 3!
        },
      ],
      charges: [],
      feeMode: 'proportional',
    };

    // When only Person A claims 1 portion:
    const partialRes = computeSplit(input);
    const pAShare = partialRes.shares.find((s) => s.participantId === 'pA')!;

    // Person A owes exactly ₹200 (20000 paise) for 1 portion, NOT all ₹600!
    expect(pAShare.amountDue).toBe(20000);
    expect(pAShare.items[0].claimedQuantity).toBe(1);
    expect(pAShare.items[0].itemQuantity).toBe(3);

    // The remaining 2 portions are recorded as unclaimed!
    expect(partialRes.unclaimedItems.length).toBe(1);
    expect(partialRes.unclaimedItems[0].name).toBe('Chicken Tikka');
    expect(partialRes.unclaimedItems[0].totalPaise).toBe(40000); // 2 * 20000
    expect(partialRes.unclaimedItems[0].unclaimedQuantity).toBe(2);

    // Now Person B claims the other 2 portions:
    const fullInput: SplitInput = {
      ...input,
      items: [
        {
          id: 'tikka',
          name: 'Chicken Tikka',
          quantity: 3,
          totalPaise: 60000,
          claims: [
            { participantId: 'pA', weight: 1 },
            { participantId: 'pB', weight: 2 },
          ],
        },
      ],
    };

    const fullRes = computeSplit(fullInput);
    const fullA = fullRes.shares.find((s) => s.participantId === 'pA')!;
    const fullB = fullRes.shares.find((s) => s.participantId === 'pB')!;

    expect(fullA.amountDue).toBe(20000); // Person A owes ₹200
    expect(fullB.amountDue).toBe(40000); // Person B owes ₹400
    expect(fullRes.unclaimedItems.length).toBe(0); // All 3 claimed!
    expect(fullA.amountDue + fullB.amountDue).toBe(60000); // Zero-penny exact invariant
  });
});
