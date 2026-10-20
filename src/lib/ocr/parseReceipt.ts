import { toPaise } from '../money';
import { ChargeKind, ChargeBasis } from '../split/engine';

export interface ParsedItem {
  id: string;
  name: string;
  quantity: number;
  totalPaise: number;
  unitPricePaise: number;
  rawPrice?: string;
}

export interface ParsedCharge {
  id: string;
  kind: ChargeKind;
  label: string;
  basis: ChargeBasis;
  value: number; // paise or percent
  amountPaise: number;
  rawValue?: string;
}

export interface ParsedReceipt {
  items: ParsedItem[];
  charges: ParsedCharge[];
  printedTotalPaise: number;
  rawText: string;
}

/**
 * Robust restaurant bill parser.
 * Extracts ONLY essential details:
 * 1. Food and drink line items (Name, Quantity, Price)
 * 2. Applicable taxes, service charges, discounts, and tips
 * 3. Grand total
 * Strictly filters out noise (FSSAI, GSTIN, addresses, dates, table numbers, cashier names, etc.).
 */
export function parseReceipt(rawText: string): ParsedReceipt {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const items: ParsedItem[] = [];
  const charges: ParsedCharge[] = [];
  let printedTotalPaise = 0;

  // Header / footer / metadata patterns to strictly ignore
  const ignorePatterns = [
    /tax\s*invoice/i,
    /retail\s*invoice/i,
    /cash\s*memo/i,
    /bill\s*no/i,
    /table\s*no/i,
    /kot\s*no/i,
    /token\s*no/i,
    /order\s*#/i,
    /date\s*[:\-]/i,
    /time\s*[:\-]/i,
    /gstin/i,
    /fssai/i,
    /cin\s*[:\-]/i,
    /steward/i,
    /waiter/i,
    /captain/i,
    /cashier/i,
    /server\s*[:\-]/i,
    /pax\s*[:\-]/i,
    /ph(?:one)?\s*[:\-]/i,
    /tel\s*[:\-]/i,
    /mob(?:ile)?\s*[:\-]/i,
    /thank\s*you/i,
    /welcome/i,
    /visit\s*again/i,
    /feedback/i,
    /pos\s*terminal/i,
    /wifi\s*(?:pass|pwd)?/i,
    /powered\s*by/i,
    /hsn\s*code/i,
    /sac\s*code/i,
    /^s\.?\s*no/i,
    /item\s+(?:name|desc)/i,
    /qty\s+rate/i,
    /particulars/i,
  ];

  let idCounter = 1;

  for (let idx = 0; idx < lines.length; idx++) {
    let line = lines[idx];

    // Check if line should be ignored
    if (ignorePatterns.some((pattern) => pattern.test(line))) {
      continue;
    }

    // Strip leading serial numbers like "1. ", "01. ", "1) ", "1- "
    line = line.replace(/^\d{1,2}[.)\-]\s*/, '').trim();

    // Pattern 1: Multi-column row: "Dish Name [Qty] [Rate] [Total Amount]"
    // e.g. "Paneer Tikka 2 240.00 480.00"
    const colMatch = line.match(/^(.+?)\s+(\d{1,3})\s+(?:[+-]?\s*(?:₹|rs\.?|inr)?\s*\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)\s+([+-]?\s*(?:₹|rs\.?|inr)?\s*\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)$/i);

    // Pattern 2: Standard single-amount line: "[Qty x] Dish Name Amount"
    // e.g. "2 x Garlic Naan 180.00" or "Paneer Butter Masala 420.00"
    const standardMatch = line.match(/^(?:(\d+)\s*[xX*]?\s+)?(.+?)\s+([+-]?\s*(?:₹|rs\.?|inr)?\s*\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)$/i);

    let rawQty: string | undefined = undefined;
    let itemName = '';
    let rawAmount = '';

    if (colMatch) {
      itemName = colMatch[1].trim();
      rawQty = colMatch[2];
      rawAmount = colMatch[3];
    } else if (standardMatch) {
      rawQty = standardMatch[1];
      itemName = standardMatch[2].trim();
      rawAmount = standardMatch[3];
    } else {
      // Pattern 3: Multi-line item
      // Line N: "Butter Chicken Masala"
      // Line N+1: "1 x 450.00" or "450.00"
      if (idx + 1 < lines.length) {
        const nextLine = lines[idx + 1].trim();
        const nextMatch = nextLine.match(/^(?:(\d+)\s*[xX*]?\s+)?([+-]?\s*(?:₹|rs\.?|inr)?\s*\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)$/i);
        if (nextMatch && !/\d{2,}/.test(line)) {
          rawQty = nextMatch[1];
          itemName = line;
          rawAmount = nextMatch[2];
          idx++; // consume the paired amount line
        }
      }
    }

    if (!itemName || !rawAmount) continue;

    // Clean up item name (remove leading/trailing symbols and artifacts)
    itemName = itemName.replace(/^[-*•:\s]+|[-*•:\s]+$/g, '').trim();
    if (!itemName || itemName.length < 2) continue;

    const amountPaise = toPaise(rawAmount);
    if (amountPaise === 0) continue;

    const lowerName = itemName.toLowerCase();

    // 1. Check for Grand Total / Net Total
    if (
      /(?:grand\s*total|net\s*amount|total\s*amount|amount\s*due|bill\s*total|^total$)/i.test(
        lowerName
      )
    ) {
      if (amountPaise > 0) {
        printedTotalPaise = amountPaise;
      }
      continue;
    }

    // 2. Check for Subtotal
    if (/(?:sub\s*total|subtotal|food\s*total|gross\s*total)/i.test(lowerName)) {
      continue;
    }

    // 3. Check for Taxes (CGST, SGST, IGST, VAT, GST)
    if (/(?:cgst|sgst|igst|gst|vat|service\s*tax)/i.test(lowerName)) {
      const pctMatch = lowerName.match(/(\d+(?:\.\d+)?)\s*%/);
      const pctValue = pctMatch ? parseFloat(pctMatch[1]) : 0;

      charges.push({
        id: `charge_${idCounter++}`,
        kind: 'tax',
        label: itemName,
        basis: pctValue > 0 ? 'percent' : 'fixed',
        value: pctValue > 0 ? pctValue : Math.abs(amountPaise),
        amountPaise: Math.abs(amountPaise),
      });
      continue;
    }

    // 4. Check for Service Charge / Packaging Fee
    if (/(?:service\s*charge|svc\s*chg|service\s*fee|packaging)/i.test(lowerName)) {
      const pctMatch = lowerName.match(/(\d+(?:\.\d+)?)\s*%/);
      const pctValue = pctMatch ? parseFloat(pctMatch[1]) : 0;

      charges.push({
        id: `charge_${idCounter++}`,
        kind: 'service',
        label: itemName,
        basis: pctValue > 0 ? 'percent' : 'fixed',
        value: pctValue > 0 ? pctValue : Math.abs(amountPaise),
        amountPaise: Math.abs(amountPaise),
      });
      continue;
    }

    // 5. Check for Discounts / Round off
    if (/(?:discount|promo|off|zomato|swiggy|voucher)/i.test(lowerName)) {
      charges.push({
        id: `charge_${idCounter++}`,
        kind: 'discount',
        label: itemName,
        basis: 'fixed',
        value: Math.abs(amountPaise),
        amountPaise: -Math.abs(amountPaise),
      });
      continue;
    }

    if (/round\s*off/i.test(lowerName)) {
      // Round off can be positive or negative
      charges.push({
        id: `charge_${idCounter++}`,
        kind: 'discount',
        label: 'Round Off',
        basis: 'fixed',
        value: Math.abs(amountPaise),
        amountPaise: amountPaise,
      });
      continue;
    }

    // 6. Check for Tip
    if (/^tip$/i.test(lowerName) || /gratuity/i.test(lowerName)) {
      charges.push({
        id: `charge_${idCounter++}`,
        kind: 'tip',
        label: itemName,
        basis: 'fixed',
        value: Math.abs(amountPaise),
        amountPaise: Math.abs(amountPaise),
      });
      continue;
    }

    // 7. Legitimate Line-Item Dish
    const quantity = rawQty ? Math.max(1, parseInt(rawQty, 10)) : 1;
    const totalPaise = Math.abs(amountPaise);
    const unitPricePaise = Math.round(totalPaise / quantity);

    items.push({
      id: `item_${idCounter++}`,
      name: itemName,
      quantity,
      totalPaise,
      unitPricePaise,
      rawPrice: (unitPricePaise / 100).toFixed(2),
    });
  }

  // Calculate printed total if not found explicitly
  if (printedTotalPaise === 0 && items.length > 0) {
    const sumItems = items.reduce((acc, i) => acc + i.totalPaise, 0);
    const sumCharges = charges.reduce((acc, c) => acc + c.amountPaise, 0);
    printedTotalPaise = sumItems + sumCharges;
  }

  return {
    items,
    charges,
    printedTotalPaise,
    rawText,
  };
}
