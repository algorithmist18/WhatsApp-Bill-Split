import React, { useState } from 'react';
import { getCategory } from '../lib/categories.js';

const QUICK_REASONS = [
  "I didn't order this",
  'Amount looks wrong',
  'I already paid this',
  'Wrong split',
];

// Raise a dispute on a posted bill: who's disputing and why.
export default function DisputeModal({ message, members, onSubmit, onClose }) {
  const [by, setBy] = useState(members[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const cat = getCategory(message.category);

  function submit() {
    const r = reason.trim();
    if (!by || !r) return;
    onSubmit({ by, reason: r });
  }

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <h2>Raise a dispute</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal__body">
          <div className="dispute__bill">
            <span className="dispute__billicon">{cat.icon}</span>
            <div>
              <div className="dispute__billname">{message.merchant || 'Bill'}</div>
              <div className="dispute__billsub">{cat.label}</div>
            </div>
          </div>

          <div className="field">
            <label className="field__label">Who's raising this?</label>
            <div className="chips">
              {members.map((m) => (
                <button
                  key={m.id}
                  className={`chip ${by === m.id ? 'chip--active' : ''}`}
                  onClick={() => setBy(m.id)}
                >
                  {m.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field__label">What's the issue?</label>
            <div className="chips chips--sm" style={{ marginBottom: 8 }}>
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  className={`chip chip--sm ${reason === r ? 'chip--active' : ''}`}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              className="input dispute__reason"
              rows={3}
              placeholder="Describe the problem…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <footer className="modal__foot">
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--danger" onClick={submit} disabled={!reason.trim()}>
            Raise dispute
          </button>
        </footer>
      </div>
    </div>
  );
}
