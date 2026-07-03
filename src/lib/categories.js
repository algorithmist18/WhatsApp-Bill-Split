// Expense categories. Some use the receipt / order-screenshot OCR flow
// (ocr: true); the rest jump to a quick amount/items form. `provider` selects a
// tailored parser for forwarded order screenshots. The icon shows on the card.
export const CATEGORIES = [
  { id: 'restaurant', label: 'Restaurant', icon: '🍽️', ocr: true, titleLabel: 'Merchant' },
  { id: 'blinkit', label: 'Blinkit', icon: '🛒', ocr: true, provider: 'blinkit', titleLabel: 'Order' },
  { id: 'instamart', label: 'Instamart', icon: '🏪', ocr: true, provider: 'instamart', titleLabel: 'Order' },
  { id: 'amazon', label: 'Amazon', icon: '📦', ocr: true, provider: 'amazon', titleLabel: 'Order' },
  { id: 'taxi', label: 'Taxi ride', icon: '🚕', titleLabel: 'Trip' },
  { id: 'rent', label: 'Rent', icon: '🏠', titleLabel: 'Property' },
  { id: 'ecommerce', label: 'E-commerce', icon: '🛍️', titleLabel: 'Order' },
  { id: 'other', label: 'Other', icon: '🧾', titleLabel: 'Description' },
];

const BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id) {
  return BY_ID[id] || BY_ID.other;
}
