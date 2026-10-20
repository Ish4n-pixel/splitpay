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
 * Parses raw text extracted from restaurant receipts (via OCR or clipboard)
 * into structured line items, taxes, service charges, discounts, and total.
 */
export function parseReceipt(rawText: string): ParsedReceipt {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const items: ParsedItem[] = [];
  const charges: ParsedCharge[] = [];
  let printedTotalPaise = 0;

  // Patterns for header / footer metadata to ignore as items
  const ignorePatterns = [
    /tax\s*invoice/i,
    /bill\s*no/i,
    /table\s*no/i,
    /date\s*[:\-]/i,
    /time\s*[:\-]/i,
    /gstin/i,
    /fssai/i,
    /ph(?:one)?\s*[:\-]/i,
    /thank\s*you/i,
    /welcome/i,
    /cashier/i,
    /order\s*#/i,
    /pos\s*terminal/i,
    /visit\s*again/i,
  ];

  // Regex to match lines ending in an amount (e.g. "Item Name 240.00", "2 x Pizza 500", "Salad  120")
  // Handles commas in thousands: 1,200.00
  const lineRegex = /^(?:(\d+)\s*[xX*]?\s+)?(.+?)\s+([+-]?\s*(?:₹|rs\.?|inr)?\s*\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)$/i;

  let idCounter = 1;

  for (const line of lines) {
    // Check if line should be ignored
    if (ignorePatterns.some((pattern) => pattern.test(line))) {
      continue;
    }

    const match = line.match(lineRegex);
    if (!match) continue;

    const rawQty = match[1];
    let itemName = match[2].trim();
    const rawAmount = match[3];

    // Clean up item name (remove leading/trailing symbols)
    itemName = itemName.replace(/^[-*•\s]+|[-*•\s]+$/g, '').trim();
    if (!itemName || itemName.length < 2) continue;

    const amountPaise = toPaise(rawAmount);
    if (amountPaise === 0) continue;

    const lowerName = itemName.toLowerCase();

    // Check for Grand Total / Net Total
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

    // Check for Subtotal
    if (/(?:sub\s*total|subtotal|food\s*total)/i.test(lowerName)) {
      // Subtotal line, don't treat as an individual dish
      continue;
    }

    // Check for Taxes (CGST, SGST, IGST, VAT, GST)
    if (/(?:cgst|sgst|igst|gst|vat|service\s*tax)/i.test(lowerName)) {
      // Check if percentage is mentioned (e.g. "CGST @ 2.5%" or "GST 5%")
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

    // Check for Service Charge
    if (/(?:service\s*charge|svc\s*chg|service\s*fee)/i.test(lowerName)) {
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

    // Check for Discounts
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

    // Check for Tip
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

    // Otherwise, it is a line-item dish
    const quantity = rawQty ? parseInt(rawQty, 10) : 1;
    const totalPaise = Math.abs(amountPaise);
    const unitPricePaise = Math.round(totalPaise / (quantity > 0 ? quantity : 1));

    items.push({
      id: `item_${idCounter++}`,
      name: itemName,
      quantity: quantity > 0 ? quantity : 1,
      totalPaise,
      unitPricePaise,
    });
  }

  // If printed total wasn't explicitly found, estimate it from items + charges
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
