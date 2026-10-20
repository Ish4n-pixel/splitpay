/**
 * Largest-Remainder (Hamilton-Hare) allocation algorithm.
 * 
 * Distributes an integer `totalPaise` proportionally according to `weights`,
 * guaranteeing that the sum of the returned parts EXACTLY equals `totalPaise`.
 * 
 * Any remaining paise after integer truncation are distributed to the recipients
 * with the highest fractional remainder. Ties are broken by original array index
 * for deterministic results.
 */
export function allocate(totalPaise: number, weights: number[]): number[] {
  if (weights.length === 0) return [];

  const sumWeights = weights.reduce((acc, w) => acc + (w > 0 ? w : 0), 0);

  // If total is 0 or all weights are 0, return 0s
  if (totalPaise === 0 || sumWeights === 0) {
    return weights.map(() => 0);
  }

  const sign = totalPaise < 0 ? -1 : 1;
  const absTotal = Math.abs(totalPaise);

  // Calculate raw fractional shares
  const rawShares = weights.map((w) => {
    if (w <= 0) return 0;
    return (absTotal * w) / sumWeights;
  });

  // Take integer floors
  const floored = rawShares.map(Math.floor);
  const flooredSum = floored.reduce((acc, v) => acc + v, 0);

  // Calculate remainder paise to distribute
  let remainder = absTotal - flooredSum;

  // Rank by fractional parts descending, with stable index tie-breaking
  const remainders = rawShares.map((raw, index) => ({
    index,
    fraction: raw - floored[index],
  }));

  remainders.sort((a, b) => {
    const diff = b.fraction - a.fraction;
    if (Math.abs(diff) > 1e-9) return diff;
    return a.index - b.index; // stable tie-breaker
  });

  // Distribute 1 unit of remainder to the top candidates
  for (let i = 0; i < remainder; i++) {
    floored[remainders[i].index]++;
  }

  // Restore sign for negative totals (e.g. discounts)
  return floored.map((v) => v * sign);
}
