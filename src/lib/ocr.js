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

// One money token, optionally currency-prefixed: "₹377", "1,250.50", "0".
const AMOUNT = /(?:₹|rs\.?|inr|\$)?\s*(\d[\d,]*(?:[.,]\d{2})?)/gi;

// A trailing run of 1–3 money tokens at the end of a line. Captures both a
// price cell on its own ("₹499 ₹377") and a "Name … ₹499 ₹377" line, so we can
// split the name from the price region.
const TRAIL_PRICE =
  /((?:(?:₹|rs\.?|inr|\$)\s*)?\d[\d,]*(?:[.,]\d{2})?(?:\s+(?:(?:₹|rs\.?|inr|\$)\s*)?\d[\d,]*(?:[.,]\d{2})?){0,2})\s*$/i;

// A quantity / unit line that sits between an item name and its price in app
// screenshots, e.g. "500 ml", "1 unit", "2 x", "250 g", "1 pc x 1".
const QTY_LINE =
  /^\s*(?:qty\.?\s*)?\d+\s*(?:x|×|unit|units|pcs?|pieces?|nos?|ml|l|ltr|litre|g|gm|gms|kg|pack|packs?|combo|sachet)\b/i;

// Keywords that mark the order's grand total (not item/sub totals).
const TOTAL_LINE = /\b(grand total|bill total|order total|total amount|amount payable|to pay|net payable|total)\b/i;
const NOT_TOTAL = /\b(item|sub|mrp|saved|saving)\b/i;

// Strip a leading quantity like "2 x ", "2x", "3 X" or "Qty 2" from an item name.
function stripQty(name) {
  return name
    .replace(/^\s*(?:qty\.?\s*)?\d{1,2}\s*[xX×*]\s*/, '')
    .replace(/\s*[xX×*]\s*\d{1,2}\s*$/, '')
    .trim();
}

function cleanName(raw) {
  return stripQty(raw.replace(/[.:_·—-]+$/, '').replace(/\s{2,}/g, ' ').trim());
}

function validName(name) {
  return name && name.replace(/[^a-z]/gi, '').length >= 2;
}

function validPrice(price) {
  return isFinite(price) && price > 0 && price <= 100000;
}

// Collect the money tokens in a string with whether each had a currency symbol
// or decimals (a strong signal it's really a price, not a stray number).
function amountsIn(str) {
  const out = [];
  let m;
  AMOUNT.lastIndex = 0;
  while ((m = AMOUNT.exec(str))) {
    out.push({ value: toNumber(m[1]), currency: /₹|rs|inr|\$/i.test(m[0]), dec: /[.,]\d{2}$/.test(m[1]) });
  }
  return out;
}

// Split a line into { name, price, strong } using its trailing price region.
// price is the LAST amount (the actual charged price when a struck-through MRP
// precedes it). `strong` is true when the region clearly reads as money.
function analyzePrice(line) {
  const m = line.match(TRAIL_PRICE);
  if (!m) return null;
  const region = m[1];
  const name = line.slice(0, line.length - m[0].length).trim();
  const amts = amountsIn(region);
  if (amts.length === 0) return null;
  const price = amts[amts.length - 1].value;
  const strong = amts.length >= 2 || amts.some((a) => a.currency || a.dec);
  return { name, price, strong };
}

// Find the order's grand total. App screenshots often put the amount on the
// line after the "Grand total" label, so we scan same-line then the next two
// lines, and keep the largest total-ish amount we see.
function detectOrderTotal(lines) {
  let best = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (!TOTAL_LINE.test(lines[i]) || NOT_TOTAL.test(lines[i])) continue;
    let amt = null;
    for (let j = 0; j <= 2 && i + j < lines.length; j += 1) {
      const info = analyzePrice(lines[i + j]);
      if (info && (j === 0 || !validName(info.name))) {
        amt = info.price;
        break;
      }
    }
    if (amt !== null && validPrice(amt) && (best === null || amt > best)) best = round2(amt);
  }
  return best;
}

// Parse a forwarded order screenshot. Handles "Name … ₹MRP ₹price" on one line
// and the common app layout where the name, quantity and price cell land on
// separate OCR lines (taking the actual price, not the struck-through MRP).
export function parseOrder(text, provider) {
  const skip = PROVIDER_SKIP[provider];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  let pendingName = null; // an item name still waiting for its price
  let skipNextPrice = false; // a fee/total line just passed — ignore its amount

  const push = (name, price) => {
    items.push({ id: makeId(), name: titleCase(name), price, assignedTo: [] });
  };

  for (const line of lines) {
    const isSkip = SKIP_RE.test(line) || (skip && skip.test(line));
    const info = analyzePrice(line);

    // A fee / total label line — drop any pending name and swallow the amount
    // that follows it (whether inline or on the next line).
    if (isSkip) {
      pendingName = null;
      skipNextPrice = true;
      continue;
    }

    if (info) {
      const hasName = validName(info.name);
      if (hasName && info.strong) {
        // "Name … ₹MRP ₹price" on one line.
        push(cleanName(info.name), info.price);
        pendingName = null;
        skipNextPrice = false;
        continue;
      }
      if (!hasName) {
        // A standalone price cell — belongs to the pending item.
        if (skipNextPrice) {
          skipNextPrice = false;
          pendingName = null;
        } else if (pendingName && info.price >= 0 && info.price <= 100000) {
          push(pendingName, round2(info.price));
          pendingName = null;
        }
        continue;
      }
      // hasName but weak trailing number (a bare quantity in the name) — fall
      // through and treat the whole line as a name.
    }

    // A quantity/unit line — keep the pending name, skip.
    if (QTY_LINE.test(line)) continue;

    // Otherwise it's an item name. A fresh name means a new item, so a stale
    // "skip the next price" no longer applies.
    const nm = cleanName(line);
    if (validName(nm)) {
      pendingName = nm;
      skipNextPrice = false;
    }
  }

  // Reconcile to the order total so delivery/handling/taxes aren't lost.
  const orderTotal = detectOrderTotal(lines);
  const sum = round2(items.reduce((s, it) => s + it.price, 0));
  if (orderTotal) {
    if (items.length === 0) {
      push(`${PROVIDER_NAME[provider] || 'Order'} order`, orderTotal);
    } else if (orderTotal - sum > 1) {
      push('Taxes & delivery', round2(orderTotal - sum));
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
