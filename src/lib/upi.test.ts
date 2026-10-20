import { describe, it, expect } from 'vitest';
import { buildUpiUri } from './upi';

describe('buildUpiUri', () => {
  it('generates a valid UPI deep-link URI with amount and note', () => {
    const uri = buildUpiUri({
      vpa: 'host@okhdfcbank',
      name: 'Ishan Gupta',
      amountPaise: 45050, // ₹450.50
      note: 'SplitPay Table #4',
    });

    expect(uri).toContain('upi://pay?');
    expect(uri).toContain('pa=host%40okhdfcbank');
    expect(uri).toContain('pn=Ishan+Gupta');
    expect(uri).toContain('am=450.50');
    expect(uri).toContain('cu=INR');
    expect(uri).toContain('tn=SplitPay+Table+%234');
  });

  it('returns empty string if VPA is invalid or missing', () => {
    expect(buildUpiUri({ vpa: '', amountPaise: 100 })).toBe('');
    expect(buildUpiUri({ vpa: 'invalid-no-at-sign', amountPaise: 100 })).toBe('');
  });
});
