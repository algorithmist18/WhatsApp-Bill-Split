// Real OCR via Tesseract.js.
//
// We run the uploaded receipt image through Tesseract in the browser, get the
// recognised text, and parse out line items (name + price). It's best-effort:
// receipts vary wildly, so everything is editable afterwards in the bill modal.

import { createWorker } from 'tesseract.js';

let seq = 0;
function makeId() {
  seq += 1;
  return `it_${Date.now().toString(36)}_${seq}`;
}

export function blankItem() {
  return { id: makeId(), name: '', price: 0, assignedTo: [] };
}

// Lines that are clearly not orderable items (subtotals, taxes, payment info).
const SKIP_RE =
  /\b(sub[\s-]?total|total|tax|gst|cgst|sgst|igst|vat|service|charge[sd]?|discount|cash|card|upi|change|balance|tender|amount\s*due|payable|round|tip|thank|invoice|bill\s*no|table|token|qty|rate)\b/i;

// Trailing amount like "250.00", "₹250.00", "Rs 1,250.50", "$12.99".
const PRICE_RE =
  /^(.*?)[\s.:_·—-]*(?:₹|rs\.?|inr|\$)?\s*(\d{1,3}(?:[,\d]{0,7})(?:[.,]\d{2}))\s*$/i;

function titleCase(s) {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function toNumber(raw) {
  // Normalise "1,250.50" / "1.250,50" -> 1250.50
  let s = raw.replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/,/g, ''); // assume comma = thousands
  } else if (s.includes(',')) {
    s = s.replace(',', '.'); // lone comma = decimal
  }
  return parseFloat(s);
}

export function parseReceipt(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  for (const line of lines) {
    if (SKIP_RE.test(line)) continue;
    const m = line.match(PRICE_RE);
    if (!m) continue;
    const name = m[1].replace(/[.:_·—-]+$/, '').replace(/\s{2,}/g, ' ').trim();
    const price = toNumber(m[2]);
    if (!name || name.replace(/[^a-z]/gi, '').length < 2) continue;
    if (!isFinite(price) || price <= 0) continue;
    items.push({ id: makeId(), name: titleCase(name), price, assignedTo: [] });
  }
  return items;
}

export function guessMerchant(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const letters = (line.match(/[a-zA-Z]/g) || []).length;
    if (letters >= 3 && !PRICE_RE.test(line) && !/\d{3,}/.test(line)) {
      return titleCase(line.slice(0, 40));
    }
  }
  return 'Receipt';
}

// Runs OCR on a File/Blob. onProgress(0..1) fires during recognition.
export async function runOcr(file, onProgress) {
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.(m.progress);
      }
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return {
      merchant: guessMerchant(data.text),
      items: parseReceipt(data.text),
      raw: data.text,
    };
  } finally {
    await worker.terminate();
  }
}
