// Build a UPI deep link. On a phone this opens the user's UPI app
// (GPay / PhonePe / Paytm ...) pre-filled with the payee and amount.
// Spec: https://developers.google.com/pay/india/api/web/create-payment-method
export function buildUpiLink({ vpa, name, amount, note }) {
  const params = new URLSearchParams({
    pa: vpa, // payee address (VPA)
    pn: name, // payee name
    am: Number(amount).toFixed(2), // amount
    cu: 'INR', // currency
    tn: note || 'Bill split', // transaction note
  });
  return `upi://pay?${params.toString()}`;
}

// A loose check so we can warn when a member has no/typo'd UPI id.
export function looksLikeVpa(vpa) {
  return /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test((vpa || '').trim());
}
