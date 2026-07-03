// Real OCR via Tesseract.js.
//
// We run the uploaded receipt image through Tesseract in the browser, get the
// recognised text, and parse out line items (name + price). It's best-effort:
// receipts vary wildly, so everything is editable afterwards in the bill modal.

import { createWorker, PSM } from 'tesseract.js';
import { round2 } from './format.js';

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

// Trailing amount with paise: "250.00", "₹250.00", "Rs 1,250.50", "$12.99".
const PRICE_STRICT =
  /^(.*?)[\s.:_·—-]*(?:₹|rs\.?|inr|\$)?\s*(\d{1,3}(?:[,\d]{0,7})[.,]\d{2})\s*$/i;

// Fallback: a whole-rupee amount, but only when it's clearly a price — i.e.
// preceded by a currency symbol — so we don't grab quantities or table numbers.
const PRICE_LOOSE = /^(.*?)[\s.:_·—-]*(?:₹|rs\.?|inr|\$)\s*(\d{1,6})\s*$/i;

// Any trailing amount (used only to decide a line is "not a merchant name").
const PRICE_ANY = /(?:₹|rs\.?|inr|\$)?\s*\d[\d,]*(?:[.,]\d{2})?\s*$/i;

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
    const m = line.match(PRICE_STRICT) || line.match(PRICE_LOOSE);
    if (!m) continue;
    const name = m[1].replace(/[.:_·—-]+$/, '').replace(/\s{2,}/g, ' ').trim();
    const price = toNumber(m[2]);
    if (!name || name.replace(/[^a-z]/gi, '').length < 2) continue;
    if (!isFinite(price) || price <= 0 || price > 100000) continue;
    items.push({ id: makeId(), name: titleCase(name), price, assignedTo: [] });
  }
  return items;
}

// ---- Forwarded order screenshots (Blinkit / Instamart / Amazon) ----
//
// These are digital order summaries, so parsing is tuned per provider: known
// display names, provider-specific noise to skip, and the "order total" line to
// reconcile against. Any gap between the summed items and the detected total
// (delivery, handling, taxes) is captured as a single "Taxes & delivery" line
// so the split still adds up to what was actually charged.

const PROVIDER_NAME = { blinkit: 'Blinkit', instamart: 'Instamart', amazon: 'Amazon' };

const PROVIDER_SKIP = {
  blinkit:
    /\b(handling|delivery|feeding india|donation|tip|mrp|you saved|savings?|cart|item total|bill total|grand total|to pay|gst|charges?)\b/i,
  instamart:
    /\b(handling|delivery|tip|gst|item total|grand total|to pay|savings?|mrp|cart|small cart|charges?|taxes?)\b/i,
  amazon:
    /\b(delivery|shipping|order total|grand total|sold by|qty|quantity|gst|cess|you saved|savings?|subtotal|mrp|deal|promotion|coupon|packaging)\b/i,
};

const PROVIDER_TOTAL = {
  blinkit: /\b(?:grand total|bill total|to pay|total\s*bill)\b\D*([\d,]+(?:\.\d{2})?)/i,
  instamart: /\b(?:grand total|to pay|total)\b\D*([\d,]+(?:\.\d{2})?)/i,
  amazon: /\b(?:order total|grand total)\b\D*([\d,]+(?:\.\d{2})?)/i,
};

// Strip a leading quantity like "2 x ", "2x", "3 X" or "Qty 2" from an item name.
function stripQty(name) {
  return name
    .replace(/^\s*(?:qty\.?\s*)?\d{1,2}\s*[xX×*]\s*/, '')
    .replace(/\s*[xX×*]\s*\d{1,2}\s*$/, '')
    .trim();
}

function detectOrderTotal(text, provider) {
  const re = PROVIDER_TOTAL[provider];
  if (!re) return null;
  const m = text.match(re);
  if (!m) return null;
  const val = toNumber(m[1]);
  return isFinite(val) && val > 0 ? round2(val) : null;
}

export function parseOrder(text, provider) {
  const skip = PROVIDER_SKIP[provider];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  for (const line of lines) {
    if (SKIP_RE.test(line) || (skip && skip.test(line))) continue;
    const m = line.match(PRICE_STRICT) || line.match(PRICE_LOOSE);
    if (!m) continue;
    const name = stripQty(m[1].replace(/[.:_·—-]+$/, '').replace(/\s{2,}/g, ' ').trim());
    const price = toNumber(m[2]);
    if (!name || name.replace(/[^a-z]/gi, '').length < 2) continue;
    if (!isFinite(price) || price <= 0 || price > 100000) continue;
    items.push({ id: makeId(), name: titleCase(name), price, assignedTo: [] });
  }

  // Reconcile to the order total so delivery/handling/taxes aren't lost.
  const orderTotal = detectOrderTotal(text, provider);
  const sum = round2(items.reduce((s, it) => s + it.price, 0));
  if (orderTotal) {
    if (items.length === 0) {
      items.push({
        id: makeId(),
        name: `${PROVIDER_NAME[provider] || 'Order'} order`,
        price: orderTotal,
        assignedTo: [],
      });
    } else if (orderTotal - sum > 1) {
      items.push({
        id: makeId(),
        name: 'Taxes & delivery',
        price: round2(orderTotal - sum),
        assignedTo: [],
      });
    }
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
    if (letters >= 3 && !PRICE_ANY.test(line) && !/\d{3,}/.test(line)) {
      return titleCase(line.slice(0, 40));
    }
  }
  return 'Receipt';
}

// Decode the file, downscale large phone photos, and grayscale it onto a canvas.
// This is the key to reading real JPEGs reliably: Tesseract chokes on huge,
// full-colour images, so we hand it clean, right-sized pixels instead of the
// raw File. Falls back to the original file if canvas isn't available.
async function fileToImageSource(file, maxDim = 1800) {
  if (typeof document === 'undefined') return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
    const scale = Math.min(1, maxDim / longest);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    // Grayscale — reduces colour noise so the text stands out for OCR.
    const data = ctx.getImageData(0, 0, w, h);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      const g = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
      p[i] = p[i + 1] = p[i + 2] = g;
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  } catch {
    return file; // decoding failed — let Tesseract try the raw file
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Runs OCR on a File/Blob. Pass a `provider` (blinkit/instamart/amazon) to use
// the tailored order parser; otherwise the generic receipt parser is used.
// onProgress(0..1) fires during recognition.
export async function runOcr(file, { onProgress, provider } = {}) {
  const source = await fileToImageSource(file);
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.(m.progress);
      }
    },
  });
  try {
    // A receipt/order is a single column/block of text — beats the default mode.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    const { data } = await worker.recognize(source);
    if (provider) {
      return {
        merchant: PROVIDER_NAME[provider] || guessMerchant(data.text),
        items: parseOrder(data.text, provider),
        raw: data.text,
      };
    }
    return {
      merchant: guessMerchant(data.text),
      items: parseReceipt(data.text),
      raw: data.text,
    };
  } finally {
    await worker.terminate();
  }
}
