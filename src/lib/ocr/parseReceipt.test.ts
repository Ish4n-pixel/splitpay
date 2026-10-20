import { describe, it, expect } from 'vitest';
import { parseReceipt } from './parseReceipt';

describe('parseReceipt', () => {
  it('parses typical Indian restaurant itemized receipt accurately', () => {
    const rawReceipt = `
      Punjab Grill Restaurant
      TAX INVOICE - TABLE 12
      DATE: 09/10/2026 21:45
      GSTIN: 07AAAAA0000A1Z5

      Paneer Butter Masala 420.00
      2 Garlic Naan 180.00
      Dal Makhani 350.00
      1 x Jeera Rice 220.00
      Sweet Fresh Lime Soda 120.00

      Sub Total 1290.00
      Service Charge 10% 129.00
      CGST 2.5% 35.48
      SGST 2.5% 35.48
      Discount -100.00

      GRAND TOTAL 1389.96
      Thank you for dining with us!
    `;

    const parsed = parseReceipt(rawReceipt);

    // Verify items
    expect(parsed.items.length).toBe(5);
    expect(parsed.items[0]).toMatchObject({
      name: 'Paneer Butter Masala',
      quantity: 1,
      totalPaise: 42000,
    });
    expect(parsed.items[1]).toMatchObject({
      name: 'Garlic Naan',
      quantity: 2,
      totalPaise: 18000,
      unitPricePaise: 9000,
    });
    expect(parsed.items[3]).toMatchObject({
      name: 'Jeera Rice',
      quantity: 1,
      totalPaise: 22000,
    });

    // Verify charges
    expect(parsed.charges.length).toBe(4);
    const serviceCharge = parsed.charges.find((c) => c.kind === 'service');
    expect(serviceCharge).toBeDefined();
    expect(serviceCharge?.amountPaise).toBe(12900);

    const discount = parsed.charges.find((c) => c.kind === 'discount');
    expect(discount).toBeDefined();
    expect(discount?.amountPaise).toBe(-10000);

    // Verify printed total
    expect(parsed.printedTotalPaise).toBe(138996);
  });

  it('parses columnar Indian restaurant receipts with Serial No, Qty, Rate, and Amount', () => {
    const columnarReceipt = `
      THE ROYAL SPICE RESTAURANT
      Connaught Place, New Delhi
      GSTIN: 07AAAAA1234A1Z5  FSSAI: 12345678901234
      Table: T-4  Order: #892  Date: 20/10/2026
      -----------------------------------------------
      S.No  Item Name          Qty   Rate    Amount
      1.    Paneer Tikka         2  240.00   480.00
      2.    Butter Chicken       1  450.00   450.00
      3.    Garlic Naan          3   60.00   180.00
      -----------------------------------------------
      Sub Total: 1110.00
      CGST 2.5%: 27.75
      SGST 2.5%: 27.75
      Round Off: 0.50
      Grand Total: 1166.00
      Thank you! Visit Again
    `;

    const parsed = parseReceipt(columnarReceipt);

    expect(parsed.items.length).toBe(3);
    expect(parsed.items[0]).toMatchObject({
      name: 'Paneer Tikka',
      quantity: 2,
      totalPaise: 48000,
      unitPricePaise: 24000,
    });
    expect(parsed.items[1]).toMatchObject({
      name: 'Butter Chicken',
      quantity: 1,
      totalPaise: 45000,
      unitPricePaise: 45000,
    });
    expect(parsed.items[2]).toMatchObject({
      name: 'Garlic Naan',
      quantity: 3,
      totalPaise: 18000,
      unitPricePaise: 6000,
    });

    expect(parsed.printedTotalPaise).toBe(116600);
  });
});
