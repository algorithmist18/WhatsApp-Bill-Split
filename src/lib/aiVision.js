import Anthropic from '@anthropic-ai/sdk';
import { round2 } from './format.js';

// Read a receipt / order screenshot with Claude's vision model instead of OCR.
// This runs the user's own Anthropic API key directly from the browser
// (dangerouslyAllowBrowser), which is acceptable for a personal prototype but
// must never be shipped with a shared/production key — see SettingsModal.

let seq = 0;
const makeId = () => `it_${Date.now().toString(36)}_${(seq += 1)}`;

// Structured-output schema so the model returns clean, parseable items.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    merchant: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          price: { type: 'number' },
        },
        required: ['name', 'price'],
      },
    },
  },
  required: ['merchant', 'items'],
};

function prompt(kind) {
  return `This image is a ${kind}. Extract every purchased line item with the price that was actually charged.

Rules:
- Use the FINAL charged price, not any struck-through / crossed-out MRP shown next to it.
- Free items (₹0) should be included with price 0.
- Include delivery, handling, packaging and taxes as their own line items if the image shows them.
- "merchant" is the shop/app/restaurant name (e.g. Blinkit, Instamart, Amazon, or the restaurant).
- Ignore quantity/unit lines, dates, addresses, headers and buttons.
- Prices are numbers only (no currency symbol). Return JSON matching the schema.`;
}

// Decode + downscale the image to a JPEG data URL, then return raw base64.
async function fileToBase64(file, maxDim = 2000) {
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
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    return { data: dataUrl.split(',')[1], mediaType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readImageWithAI(file, { apiKey, provider, category }) {
  const { data, mediaType } = await fileToBase64(file);
  const kind = provider
    ? `${provider} order summary from a delivery app`
    : category === 'restaurant'
      ? 'restaurant bill / receipt'
      : 'receipt or order summary';

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: prompt(kind) },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const parsed = JSON.parse(textBlock?.text || '{}');
  const items = (parsed.items || [])
    .map((it) => ({
      id: makeId(),
      name: String(it.name || '').trim().slice(0, 80),
      price: round2(Number(it.price) || 0),
      assignedTo: [],
    }))
    .filter((it) => it.name && it.price >= 0 && it.price <= 1000000);

  return { merchant: String(parsed.merchant || '').slice(0, 60), items };
}
