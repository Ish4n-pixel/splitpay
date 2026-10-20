import { describe, it, expect } from 'vitest';
import { allocate } from './allocate';

describe('allocate (Largest-Remainder method)', () => {
  it('splits ₹100.00 (10000 paise) equally across 3 diners down to exact paise', () => {
    const parts = allocate(10000, [1, 1, 1]);
    expect(parts).toEqual([3334, 3333, 3333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('allocates proportionally according to unequal weights', () => {
    // ₹100.00 split 2:1
    const parts = allocate(10000, [2, 1]);
    expect(parts).toEqual([6667, 3333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('handles negative totals (discounts) preserving exact sum', () => {
    // -₹15.50 (-1550 paise) split 3 ways
    const parts = allocate(-1550, [1, 1, 1]);
    expect(parts).toEqual([-517, -517, -516]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-1550);
  });

  it('handles zero total and zero weights gracefully', () => {
    expect(allocate(0, [1, 2, 3])).toEqual([0, 0, 0]);
    expect(allocate(1000, [0, 0])).toEqual([0, 0]);
    expect(allocate(500, [])).toEqual([]);
  });

  it('preserves exact sum invariant on 1000 random trials', () => {
    for (let i = 0; i < 1000; i++) {
      const total = Math.floor(Math.random() * 500000) - 50000; // -₹500 to +₹4500
      const count = Math.floor(Math.random() * 8) + 1; // 1 to 8 diners
      const weights = Array.from({ length: count }, () => Math.floor(Math.random() * 10000) + 1);

      const res = allocate(total, weights);
      const sum = res.reduce((a, b) => a + b, 0);
      expect(sum).toBe(total);
    }
  });
});
