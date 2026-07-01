// Money helpers. The prototype keeps everything in INR.

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ₹1,234.50 — but drop the decimals when the amount is a whole rupee.
export function inr(amount) {
  const value = round2(amount);
  const hasPaise = Math.abs(value % 1) > 0.001;
  return (
    '₹' +
    value.toLocaleString('en-IN', {
      minimumFractionDigits: hasPaise ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}

export function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
