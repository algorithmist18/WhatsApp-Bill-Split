import React, { useState } from 'react';
import { initials } from '../lib/format.js';
import { looksLikeVpa } from '../lib/upi.js';

let tmpSeq = 0;
const newId = () => `m_${Date.now().toString(36)}_${(tmpSeq += 1)}`;

// Add / edit / remove the people in the group.
export default function MembersModal({ members, onSave, onClose }) {
  const [rows, setRows] = useState(members.map((m) => ({ ...m })));
  const [name, setName] = useState('');
  const [upi, setUpi] = useState('');

  function addMember() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setRows((r) => [...r, { id: newId(), name: trimmed, upi: upi.trim() }]);
    setName('');
    setUpi('');
  }

  function updateRow(id, patch) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id) {
    setRows((r) => r.filter((row) => row.id !== id));
  }

  function save() {
    const cleaned = rows
      .map((r) => ({ ...r, name: r.name.trim(), upi: r.upi.trim() }))
      .filter((r) => r.name);
    if (cleaned.length === 0) return;
    onSave(cleaned);
    onClose();
  }

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <h2>Group members</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal__body">
          <ul className="memberlist">
            {rows.map((m) => {
              const badVpa = m.upi && !looksLikeVpa(m.upi);
              return (
                <li key={m.id} className="memberlist__row">
                  <div className="avatar avatar--sm">{initials(m.name || '?')}</div>
                  <div className="memberlist__fields">
                    <input
                      className="input"
                      value={m.name}
                      placeholder="Name"
                      onChange={(e) => updateRow(m.id, { name: e.target.value })}
                    />
                    <input
                      className={`input ${badVpa ? 'input--warn' : ''}`}
                      value={m.upi}
                      placeholder="name@bank (UPI id)"
                      onChange={(e) => updateRow(m.id, { upi: e.target.value })}
                    />
                  </div>
                  <button
                    className="iconbtn"
                    onClick={() => removeRow(m.id)}
                    aria-label={`Remove ${m.name}`}
                  >
                    🗑️
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="addmember">
            <input
              className="input"
              placeholder="Add name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMember()}
            />
            <input
              className="input"
              placeholder="UPI id (optional)"
              value={upi}
              onChange={(e) => setUpi(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMember()}
            />
            <button className="btn" onClick={addMember}>
              + Add
            </button>
          </div>
        </div>

        <footer className="modal__foot">
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
