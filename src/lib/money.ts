/**
 * Money utilities for SplitPay.
 * All internal math is strictly performed in integer paise (1 Rupee = 100 paise)
 * to prevent floating-point rounding errors.
 */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats integer paise into standard Indian currency representation.
 * e.g. 125050 -> "₹1,250.50"
 */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return inrFormatter.format(rupees);
}

/**
 * Formats integer paise into a clean decimal string without currency symbol.
 * e.g. 125050 -> "1250.50"
 */
export function formatPaiseDecimal(paise: number): string {
  return (paise / 100).toFixed(2);
}

/**
 * Converts a rupee string (or number) into integer paise.
 * Handles commas, extra spaces, and negative values.
 * e.g. "1,250.50" -> 125050, "50" -> 5000, 12.5 -> 1250
 */
export function toPaise(val: string | number): number {
  if (typeof val === 'number') {
    if (isNaN(val)) return 0;
    return Math.round(val * 100);
  }

  if (!val || typeof val !== 'string') return 0;
  // Clean string: remove currency signs, commas, extra whitespace
  const clean = val.replace(/[₹$,\s]/g, '').trim();
  const num = parseFloat(clean);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Converts paise back to rupee float (for external displays or UPI query strings)
 */
export function toRupees(paise: number): number {
  return paise / 100;
}
