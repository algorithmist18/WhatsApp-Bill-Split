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

// Real OCR of app order screenshots is messy: the ₹ glyph is misread as a
// letter/symbol/digit ("₹377" -> "X377", "₹499" -> "3499", "₹0" -> "%0"), and
// the item name, quantity and price land on separate lines. So we classify each
// line and pull the price from its numbers rather than trusting a ₹ symbol.
//
// Key rule: on a price cell the LAST number is the actual charged price — a
// struck-through MRP always comes before it ("3499 X377" -> 377).

// A quantity / unit line: "15 g x 1", "400 ml x 1", "1 pc x 1" and their
// space-mangled OCR forms "15gx1", "l1pcx1". Either ends with a small "x N"
// multiplier, or is a short number+unit token.
const QTY_LINE =
  /(?:x\s*\d{1,2}\s*$)|(?:(?:^|\s)[a-z]?\d{1,4}\s*(?:ml|gms?|gm|g|kgs?|kg|mg|ltr|l|pcs?|pc|nos?|units?|packs?|sachets?|combo)\b)/i;

// Keywords that mark the order's grand total (not item/sub totals).
const TOTAL_LINE = /\b(grand total|bill total|order total|total amount|amount payable|to pay|net payable|total)\b/i;
const NOT_TOTAL = /\b(item|sub|mrp|saved|saving)\b/i;

function stripQty(name) {
  return name
    .replace(/^\s*(?:qty\.?\s*)?\d{1,2}\s*[xX×*]\s*/, '')
    .replace(/\s*[xX×*]\s*\d{1,2}\s*$/, '')
    .trim();
}

function cleanName(raw) {
  return stripQty(raw.replace(/[.:_·—\-]+$/, '').replace(/\s{2,}/g, ' ').trim());
}

function validName(name) {
  return name && name.replace(/[^a-z]/gi, '').length >= 2;
}

function validPrice(price) {
  return isFinite(price) && price >= 0 && price <= 100000;
}

function alphaCount(s) {
  return (s.match(/[a-z]/gi) || []).length;
}

// Numbers in a string, e.g. "3499 X377" -> [3499, 377]; "1,250.50" -> [1250.50].
function numbersIn(s) {
  return (s.match(/\d[\d,]*(?:[.,]\d{2})?/g) || []).map(toNumber).filter((n) => isFinite(n));
}

function looksLikeQty(line) {
  return QTY_LINE.test(line) && alphaCount(line) <= 6;
}

// Peel a trailing price off a name line, e.g. "Dove … Hair Mask + X0" or
// "Adidas … Gel 3499 X377". The trailing tokens must look like a garbled price
// (a stray currency-ish char before a number, or two numbers) so we don't grab
// a number that's genuinely part of the name.
function peelTrailingPrice(line) {
  const m = line.match(/((?:\s+[^\w\s]{0,2}\s*[a-z]?\s*\d[\d,]*(?:[.,]\d{2})?){1,3})\s*$/i);
  if (!m) return null;
  const region = m[1];
  const nums = numbersIn(region);
  if (nums.length === 0) return null;
  const garbled = /[^\d\s.,]/.test(region); // a non-number char sits in the region
  if (!garbled && nums.length < 2) return null;
  return { name: line.slice(0, line.length - m[0].length).trim(), price: nums[nums.length - 1] };
}

// Find the order's grand total. The amount is often on the line after the
// label, so scan same-line then the next two lines; keep the largest.
function detectOrderTotal(lines) {
  let best = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (!TOTAL_LINE.test(lines[i]) || NOT_TOTAL.test(lines[i])) continue;
    let amt = null;
    for (let j = 0; j <= 2 && i + j < lines.length; j += 1) {
      const nums = numbersIn(lines[i + j]);
      if (nums.length && (j === 0 || alphaCount(lines[i + j]) <= 2)) {
        amt = nums[nums.length - 1];
        break;
      }
    }
    if (amt !== null && amt > 0 && amt <= 100000 && (best === null || amt > best)) best = round2(amt);
  }
  return best;
}

// Parse a forwarded order screenshot into line items.
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
    items.push({ id: makeId(), name: titleCase(name), price: round2(price), assignedTo: [] });
  };

  for (const line of lines) {
    // A fee / total label line — drop any pending name and swallow the amount
    // that follows it (inline or on the next line).
    if (SKIP_RE.test(line) || (skip && skip.test(line))) {
      pendingName = null;
      skipNextPrice = true;
      continue;
    }

    // A quantity/unit line — keep the pending name, skip it.
    if (looksLikeQty(line)) continue;

    const alpha = alphaCount(line);
    const nums = numbersIn(line);

    // A price cell (few/no letters, has numbers) — belongs to the pending item.
    if (alpha <= 2 && nums.length >= 1) {
      const price = nums[nums.length - 1];
      if (skipNextPrice) {
        skipNextPrice = false;
        pendingName = null;
      } else if (pendingName && validPrice(price)) {
        push(pendingName, price);
        pendingName = null;
      }
      continue;
    }

    // An item name (possibly with the price appended on the same line).
    if (alpha >= 3) {
      const peeled = peelTrailingPrice(line);
      if (peeled && validName(peeled.name) && validPrice(peeled.price)) {
        push(cleanName(peeled.name), peeled.price);
        pendingName = null;
        skipNextPrice = false;
        continue;
      }
      const nm = cleanName(line);
      if (validName(nm)) {
        pendingName = nm; // a fresh item name — last one wins
        skipNextPrice = false;
      }
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

// Tesseract's worker, wasm core and language data are self-hosted under
// /tesseract (see public/tesseract) so OCR never depends on a CDN at runtime —
// that dependency is what made scanning hang. Passing a corePath ending in
// ".js" tells tesseract.js to use exactly that build and skip CDN feature
// detection.
function tesseractPaths() {
  const base = import.meta.env.BASE_URL || '/';
  const dir = `${base.replace(/\/$/, '')}/tesseract/`;
  return {
    workerPath: `${dir}worker.min.js`,
    corePath: `${dir}tesseract-core-simd-lstm.wasm.js`,
    langPath: dir,
  };
}

// Runs OCR on a File/Blob. Pass a `provider` (blinkit/instamart/amazon) to use
// the tailored order parser; otherwise the generic receipt parser is used.
// onProgress(0..1) fires during recognition.
export async function runOcr(file, { onProgress, provider } = {}) {
  const source = await fileToImageSource(file);
  const worker = await createWorker('eng', 1, {
    ...tesseractPaths(),
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
