import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { buildUpiLink, looksLikeVpa } from '../lib/upi.js';
import { inr } from '../lib/format.js';

// Shows the UPI deep link + a scannable QR so the payer can settle the debt.
// The link is a genuine upi://pay URL — on a phone it opens the UPI app.
export default function UpiModal({ request, onClose }) {
  const { payee, payer, amount, note, onPaid } = request;
  const [qr, setQr] = useState('');

  const hasVpa = looksLikeVpa(payee?.upi);
  const link = hasVpa
    ? buildUpiLink({ vpa: payee.upi, name: payee.name, amount, note })
    : '';

  useEffect(() => {
    let alive = true;
    if (link) {
      QRCode.toDataURL(link, { width: 240, margin: 1 }).then((url) => {
        if (alive) setQr(url);
      });
    }
    return () => {
      alive = false;
    };
  }, [link]);

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal modal--upi" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <h2>Pay via UPI</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal__body upi">
          <div className="upi__amount">{inr(amount)}</div>
          <div className="upi__line">
            <strong>{payer?.name.split(' ')[0]}</strong> pays{' '}
            <strong>{payee?.name.split(' ')[0]}</strong>
          </div>

          {hasVpa ? (
            <>
              <div className="upi__to">{payee.upi}</div>
              {qr ? (
                <img className="upi__qr" src={qr} alt="UPI QR code" />
              ) : (
                <div className="upi__qr upi__qr--loading" />
              )}
              <a className="btn btn--primary btn--block" href={link}>
                Open UPI app
              </a>
              <p className="upi__note">
                Scan the QR from any UPI app, or tap the button on your phone.
              </p>
            </>
          ) : (
            <div className="upi__novpa">
              <p>
                <strong>{payee?.name}</strong> doesn't have a valid UPI id yet.
              </p>
              <p>Add one in group members to generate a payment link.</p>
            </div>
          )}

          <button
            className="btn btn--ghost btn--block"
            onClick={() => {
              onPaid?.();
              onClose();
            }}
          >
            Mark as paid
          </button>
        </div>
      </div>
    </div>
  );
}
