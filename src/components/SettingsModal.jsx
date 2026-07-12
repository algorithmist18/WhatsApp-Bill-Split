import React, { useState } from 'react';

// Lets the user turn on AI reading and paste their own Anthropic API key.
// The key is stored in this browser only and used to call Claude directly.
export default function SettingsModal({ settings, onSave, onClose }) {
  const [aiEnabled, setAiEnabled] = useState(settings.aiEnabled ?? true);
  const [key, setKey] = useState(settings.anthropicKey ?? '');
  const [show, setShow] = useState(false);

  function save() {
    onSave({ aiEnabled, anthropicKey: key.trim() });
    onClose();
  }

  const keyLooksValid = !key.trim() || key.trim().startsWith('sk-ant-');

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <h2>Reading settings</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal__body">
          <label className="settings__toggle">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
            />
            <span>
              <strong>Read bills with AI ✨</strong>
              <span className="settings__hint">
                Uses Claude vision to read receipts &amp; order screenshots — far more
                accurate than OCR. Falls back to on-device OCR when off or no key is set.
              </span>
            </span>
          </label>

          <div className="field">
            <label className="field__label">Anthropic API key</label>
            <div className="settings__keyrow">
              <input
                className={`input ${keyLooksValid ? '' : 'input--warn'}`}
                type={show ? 'text' : 'password'}
                placeholder="sk-ant-..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
              />
              <button className="btn btn--ghost btn--sm" onClick={() => setShow((v) => !v)}>
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
            {!keyLooksValid && (
              <div className="settings__warn">Keys usually start with “sk-ant-”.</div>
            )}
          </div>

          <div className="settings__notice">
            🔒 Your key is stored only in this browser (localStorage) and is sent
            straight to Anthropic from your device to read the image. Use your own key
            on your own device — don’t use this on a shared or public machine, and don’t
            ship the app with a key baked in. Get a key at{' '}
            <span className="settings__mono">console.anthropic.com</span>.
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
