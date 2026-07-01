// Mock OCR.
//
// A real build would run the uploaded image through an OCR engine
// (Tesseract.js, Google Vision, ...) and parse the receipt text. For this
// prototype we simulate that: we "recognise" the receipt by returning a
// plausible itemised bill after a short delay, so the rest of the flow
// (editing, splitting, settling) is real and demonstrable.

const TEMPLATES = [
  {
    merchant: 'Spice Garden',
    items: [
      ['Paneer Tikka', 320],
      ['Butter Naan (x4)', 200],
      ['Dal Makhani', 280],
      ['Veg Biryani', 260],
      ['Gulab Jamun', 120],
    ],
  },
  {
    merchant: 'Cafe Mocha',
    items: [
      ['Cappuccino', 180],
      ['Cold Coffee', 220],
      ['Margherita Pizza', 420],
      ['Garlic Bread', 190],
      ['Chocolate Brownie', 160],
    ],
  },
  {
    merchant: 'Beach Shack',
    items: [
      ['Goan Fish Curry', 360],
      ['Prawns Masala', 480],
      ['Steamed Rice', 120],
      ['Kingfisher Beer', 260],
      ['Fresh Lime Soda', 90],
    ],
  },
];

let seq = 0;
function makeId() {
  seq += 1;
  return `it_${Date.now().toString(36)}_${seq}`;
}

export function mockOcr(file) {
  return new Promise((resolve) => {
    const template = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
    const items = template.items.map(([name, price]) => ({
      id: makeId(),
      name,
      price,
      assignedTo: [],
    }));
    // Pretend the recognition takes a moment.
    setTimeout(() => {
      resolve({
        merchant: template.merchant,
        fileName: file?.name || 'receipt.jpg',
        items,
      });
    }, 1400);
  });
}

export function blankItem() {
  return { id: makeId(), name: '', price: 0, assignedTo: [] };
}
