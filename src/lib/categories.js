// Expense categories. `provider` selects a tailored parser for forwarded order
// screenshots; the icon shows on the card.
//
// Only Restaurant is currently offered when adding an expense (see CATEGORIES).
// The rest are kept in ALL_CATEGORIES so bills posted earlier under those
// categories still render correctly.
const ALL_CATEGORIES = [
  { id: 'restaurant', label: 'Restaurant', icon: '🍽️', ocr: true, titleLabel: 'Merchant' },
  { id: 'blinkit', label: 'Blinkit', icon: '🛒', ocr: true, provider: 'blinkit', titleLabel: 'Order' },
  { id: 'instamart', label: 'Instamart', icon: '🏪', ocr: true, provider: 'instamart', titleLabel: 'Order' },
  { id: 'amazon', label: 'Amazon', icon: '📦', ocr: true, provider: 'amazon', titleLabel: 'Order' },
  { id: 'taxi', label: 'Taxi ride', icon: '🚕', titleLabel: 'Trip' },
  { id: 'rent', label: 'Rent', icon: '🏠', titleLabel: 'Property' },
  { id: 'ecommerce', label: 'E-commerce', icon: '🛍️', titleLabel: 'Order' },
  { id: 'other', label: 'Other', icon: '🧾', titleLabel: 'Description' },
];

// The categories a user can pick from when adding an expense.
export const CATEGORIES = ALL_CATEGORIES.filter((c) => c.id === 'restaurant');

const BY_ID = Object.fromEntries(ALL_CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id) {
  return BY_ID[id] || BY_ID.restaurant;
}
