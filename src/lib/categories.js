// Expense categories. "Restaurant" uses the receipt-OCR flow; the rest skip
// straight to a quick amount/items form. The icon is shown on the split card.
export const CATEGORIES = [
  { id: 'restaurant', label: 'Restaurant', icon: '🍽️', ocr: true, titleLabel: 'Merchant' },
  { id: 'taxi', label: 'Taxi ride', icon: '🚕', titleLabel: 'Trip' },
  { id: 'rent', label: 'Rent', icon: '🏠', titleLabel: 'Property' },
  { id: 'blinkit', label: 'Blinkit', icon: '🛒', titleLabel: 'Order' },
  { id: 'ecommerce', label: 'E-commerce', icon: '📦', titleLabel: 'Order' },
  { id: 'other', label: 'Other', icon: '🧾', titleLabel: 'Description' },
];

const BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id) {
  return BY_ID[id] || BY_ID.other;
}
