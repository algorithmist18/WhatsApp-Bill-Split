# SplitChat — WhatsApp Bill Split 🧾

A WhatsApp-style **prototype** that lets a group add people, upload a bill, split
it automatically, see clearly **who owes whom how much**, and settle up over
**UPI** — all in the browser.

> This is a front-end prototype. No real messages are sent and no real money
> moves; the OCR and UPI steps are wired to be realistic and demonstrable.

## What it does

1. **Group + members** — one WhatsApp-style group; add/edit/remove people, each
   with a name and a UPI id (`name@bank`). Tap the group header to manage them.
2. **Add an expense** — hit 📎 / **Split a bill** and pick a category:
   🍽️ Restaurant, 🚕 Taxi ride, 🏠 Rent, 🛒 Blinkit, 📦 E-commerce, or ➕ Other.
   **Restaurant** uses **real OCR** (Tesseract.js) to read the receipt; the other
   categories jump to a quick amount/items form. The category icon shows on the
   posted card, and any bill can be **edited** later from the card.
3. **Split it** — three ways:
   - **Equally** across the whole group,
   - **Assign items** — tap chips per item, or use **🎤 voice**: say something
     like *“Pizza for Rahul, drinks split by everyone, biryani for Priya and
     Sameer”* and the items get assigned automatically, or
   - **By %** — give each person a custom percentage (sliders + inputs, with a
     live check that they total 100%).
4. **Who owes whom** — the split is posted into the chat as a card showing each
   person's share and exactly what they owe the payer.
5. **Pay via UPI** — each debt has a **Pay via UPI** button that generates a real
   `upi://pay?…` deep link plus a scannable **QR code**. On a phone the link
   opens GPay / PhonePe / Paytm pre-filled; you can then **Mark as paid**.
6. **Settle up** — the **⚖️ Settle up** button (chat header) shows each person's
   **net balance across every bill**, the **minimal set of payments** that squares
   the whole group up (each with its own UPI link), and a **transaction log** of
   who paid whom/what and when.
7. **Ask SplitBot** — the message box is live. Type things like *“who owes what”*,
   *“how much does Rahul owe”*, or *“show the log”* and a bot replies with the
   cumulative balances or history, computed from the current group state.

State is saved in `localStorage`, so your group, splits, and settlements survive
a refresh.

## Tech

- **React 18** + **Vite**
- **Tesseract.js** for in-browser receipt OCR
- `qrcode` for UPI QR generation
- Web Speech API (`SpeechRecognition`) for voice assignment
- Minimum-cash-flow algorithm for group settle-up
- No backend — everything runs client-side

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

Build a static bundle:

```bash
npm run build
npm run preview
```

## Notes & limitations

- **OCR is real but best-effort** — Tesseract.js reads the receipt text in the
  browser and a heuristic parser pulls out `name … price` lines (skipping
  totals/tax/payment rows). Receipts vary a lot, so always review/edit the items;
  the first recognition also downloads the English language data (~a few MB).
- **Voice** needs a browser that supports the Web Speech API (Chrome/Edge). The
  chip UI is always available as a fallback.
- **UPI** links are standards-compliant but only do something on a device with a
  UPI app installed; on desktop they're shown as a QR + link.
- One payer per bill: everyone else owes the payer their share. The **Settle up**
  view then nets every bill together across the whole group.

## Project layout

```
src/
  App.jsx                 app state, group, messages, modals
  components/
    Sidebar.jsx           chat list
    ChatWindow.jsx        chat header, messages, composer
    MessageBubble.jsx     text bubbles + the bill-split card
    MembersModal.jsx      add/edit group members
    BillModal.jsx         category → OCR/manual → edit → split (equal/voice)
    UpiModal.jsx          UPI deep link + QR
    SettleUpModal.jsx     group balances + minimal payments + activity log
  lib/
    ocr.js                Tesseract.js OCR + receipt parsing
    categories.js         expense categories (restaurant/taxi/rent/…)
    split.js              per-bill share + debt calculation
    balances.js           group balances + minimum-cash-flow settle-up
    activity.js           combined bill + settlement timeline
    assistant.js          "SplitBot" chat query answers
    voice.js              speech recognition + phrase parsing
    upi.js                upi:// link builder
    format.js             INR formatting helpers
```
