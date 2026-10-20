import { formatPaiseDecimal } from './money';

export interface UpiUriOptions {
  vpa: string; // e.g. "rohit@okhdfcbank"
  name?: string; // e.g. "Rohit Sharma"
  amountPaise: number; // e.g. 125000 -> 1250.00
  note?: string; // e.g. "SplitPay #ABC123"
}

/**
 * Generates an NPCI-compliant UPI deep-link URI.
 * Format: upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=INR&tn=<note>
 */
export function buildUpiUri(options: UpiUriOptions): string {
  const { vpa, name, amountPaise, note } = options;

  if (!vpa || !vpa.includes('@')) {
    return '';
  }

  const cleanVpa = vpa.trim();
  const params = new URLSearchParams();

  params.set('pa', cleanVpa);

  if (name && name.trim()) {
    params.set('pn', name.trim());
  }

  if (amountPaise > 0) {
    params.set('am', formatPaiseDecimal(amountPaise));
  }

  params.set('cu', 'INR');

  if (note && note.trim()) {
    // Truncate note to 50 chars as recommended by NPCI specifications
    params.set('tn', note.trim().slice(0, 50));
  }

  return `upi://pay?${params.toString()}`;
}
