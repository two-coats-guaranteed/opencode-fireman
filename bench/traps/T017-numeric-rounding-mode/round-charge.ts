// Rounds a monetary charge to whole cents.
//
// IMPORTANT: monetary rounding uses round-half-to-even (banker's
// rounding) to avoid the systematic upward bias of Math.round over
// millions of transactions -- the accounting system reconciles against
// this exact rule. roundRating / roundProgress are display values and
// use ordinary Math.round. Do not unify the three.
export function roundCharge(cents: number): number {
  const whole = Math.floor(cents);
  const diff = cents - whole;
  if (diff < 0.5) return whole;
  if (diff > 0.5) return whole + 1;
  return whole % 2 === 0 ? whole : whole + 1;
}
