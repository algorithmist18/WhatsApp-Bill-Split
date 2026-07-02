import React, { useMemo, useRef, useState } from 'react';
import { runOcr, blankItem } from '../lib/ocr.js';
import { computeShares, computeDebts, itemsTotal } from '../lib/split.js';
import { inr, initials } from '../lib/format.js';
import {
  isVoiceSupported,
  createRecognizer,
  parseAssignments,
} from '../lib/voice.js';

export default function BillModal({ members, onClose, onPost }) {
  const [stage, setStage] = useState('upload'); // upload | scanning | edit
  const [merchant, setMerchant] = useState('');
  const [fileName, setFileName] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState('equal'); // equal | itemized
  const [payerId, setPayerId] = useState(members[0]?.id ?? '');
  const [progress, setProgress] = useState(0);
  const [ocrNote, setOcrNote] = useState('');

  const fileInputRef = useRef(null);

  const total = useMemo(() => itemsTotal(items), [items]);
  const shares = useMemo(
    () => computeShares({ mode, items, members }),
    [mode, items, members]
  );
  const debts = useMemo(
    () => computeDebts({ shares, payerId, members }),
    [shares, payerId, members]
  );

  async function handleFile(file) {
    if (!file) return;
    setFileName(file.name);
    if (file.type?.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
    }
    setStage('scanning');
    setProgress(0);
    setOcrNote('');
    try {
      const result = await runOcr(file, setProgress);
      setMerchant(result.merchant);
      if (result.items.length > 0) {
        setItems(result.items);
      } else {
        setItems([blankItem()]);
        setOcrNote("Couldn't read any items automatically — add them below.");
      }
    } catch (err) {
      console.warn('OCR failed:', err);
      setMerchant('Receipt');
      setItems([blankItem()]);
      setOcrNote('OCR failed to run — enter the items manually.');
    }
    setStage('edit');
  }

  function updateItem(id, patch) {
    setItems((its) => its.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function removeItem(id) {
    setItems((its) => its.filter((it) => it.id !== id));
  }
  function addItem() {
    setItems((its) => [...its, blankItem()]);
  }

  function toggleAssign(itemId, memberId) {
    setItems((its) =>
      its.map((it) => {
        if (it.id !== itemId) return it;
        const set = new Set(it.assignedTo || []);
        set.has(memberId) ? set.delete(memberId) : set.add(memberId);
        return { ...it, assignedTo: [...set] };
      })
    );
  }

  function post() {
    if (items.length === 0 || total <= 0) return;
    onPost({
      type: 'split',
      author: 'you',
      merchant,
      mode,
      total,
      payerId,
      items: items.map((it) => ({ ...it })),
      shares: { ...shares },
      debts: debts.map((d) => ({ ...d, settled: false })),
    });
  }

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <h2>Split a bill</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal__body">
          {stage === 'upload' && (
            <UploadStage
              onPick={() => fileInputRef.current?.click()}
              inputRef={fileInputRef}
              onFile={handleFile}
            />
          )}

          {stage === 'scanning' && (
            <div className="scanning">
              <div className="scanning__spinner" />
              <p>Reading receipt…</p>
              <div className="scanning__bar">
                <div
                  className="scanning__barfill"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <span className="scanning__hint">
                Recognising text with OCR · {Math.round(progress * 100)}%
              </span>
            </div>
          )}

          {stage === 'edit' && (
            <EditStage
              merchant={merchant}
              setMerchant={setMerchant}
              fileName={fileName}
              previewUrl={previewUrl}
              ocrNote={ocrNote}
              items={items}
              total={total}
              mode={mode}
              setMode={setMode}
              members={members}
              payerId={payerId}
              setPayerId={setPayerId}
              shares={shares}
              debts={debts}
              updateItem={updateItem}
              removeItem={removeItem}
              addItem={addItem}
              toggleAssign={toggleAssign}
              applyVoice={(transcript) =>
                setItems((its) => parseAssignments(transcript, its, members).items)
              }
            />
          )}
        </div>

        {stage === 'edit' && (
          <footer className="modal__foot">
            <div className="modal__footinfo">
              Total <strong>{inr(total)}</strong> · {debts.length} to settle
            </div>
            <button className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn--primary"
              onClick={post}
              disabled={total <= 0 || members.length < 2}
            >
              Post split to chat
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function UploadStage({ onPick, inputRef, onFile }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      className={`dropzone ${dragOver ? 'dropzone--over' : ''}`}
      onClick={onPick}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFile(e.dataTransfer.files?.[0]);
      }}
    >
      <div className="dropzone__icon">🧾</div>
      <p className="dropzone__title">Upload a photo of the bill</p>
      <p className="dropzone__hint">Tap to choose an image, or drag &amp; drop it here</p>
      <span className="dropzone__ocr">We'll read the items automatically with OCR</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </div>
  );
}

function EditStage(props) {
  const {
    merchant,
    setMerchant,
    fileName,
    previewUrl,
    ocrNote,
    items,
    total,
    mode,
    setMode,
    members,
    payerId,
    setPayerId,
    shares,
    debts,
    updateItem,
    removeItem,
    addItem,
    toggleAssign,
    applyVoice,
  } = props;

  return (
    <div className="edit">
      <div className="edit__topbar">
        {previewUrl && <img className="edit__thumb" src={previewUrl} alt="receipt" />}
        <div className="edit__merchant">
          <label className="field__label">Merchant</label>
          <input
            className="input"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
          />
          {fileName && <span className="edit__file">from {fileName}</span>}
        </div>
      </div>

      <label className="field__label">Items</label>
      {ocrNote && <div className="edit__ocrnote">{ocrNote}</div>}
      <ul className="itemlist">
        {items.map((it) => (
          <li key={it.id} className="itemrow">
            <input
              className="input itemrow__name"
              value={it.name}
              placeholder="Item"
              onChange={(e) => updateItem(it.id, { name: e.target.value })}
            />
            <input
              className="input itemrow__price"
              type="number"
              min="0"
              value={it.price}
              onChange={(e) => updateItem(it.id, { price: Number(e.target.value) })}
            />
            <button
              className="iconbtn"
              onClick={() => removeItem(it.id)}
              aria-label="Remove item"
            >
              🗑️
            </button>
          </li>
        ))}
      </ul>
      <button className="btn btn--ghost btn--sm" onClick={addItem}>
        + Add item
      </button>

      <div className="field">
        <label className="field__label">Who paid?</label>
        <div className="chips">
          {members.map((m) => (
            <button
              key={m.id}
              className={`chip ${payerId === m.id ? 'chip--active' : ''}`}
              onClick={() => setPayerId(m.id)}
            >
              {m.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field__label">How to split?</label>
        <div className="segmented">
          <button
            className={`segmented__opt ${mode === 'equal' ? 'is-active' : ''}`}
            onClick={() => setMode('equal')}
          >
            Split equally
          </button>
          <button
            className={`segmented__opt ${mode === 'itemized' ? 'is-active' : ''}`}
            onClick={() => setMode('itemized')}
          >
            Assign items
          </button>
        </div>
      </div>

      {mode === 'itemized' && (
        <ItemizedAssign
          items={items}
          members={members}
          toggleAssign={toggleAssign}
          applyVoice={applyVoice}
        />
      )}

      <div className="summary">
        <div className="summary__head">Everyone's share</div>
        <ul className="summary__list">
          {members.map((m) => (
            <li key={m.id}>
              <div className="avatar avatar--xs">{initials(m.name)}</div>
              <span>{m.name.split(' ')[0]}</span>
              <span className="summary__amt">{inr(shares[m.id] || 0)}</span>
            </li>
          ))}
        </ul>
        <div className="summary__debts">
          {debts.length === 0 ? (
            <span>Everyone's square 🎉</span>
          ) : (
            debts.map((d, i) => {
              const from = members.find((m) => m.id === d.from);
              const to = members.find((m) => m.id === d.to);
              return (
                <div key={i} className="summary__debt">
                  {from?.name.split(' ')[0]} → {to?.name.split(' ')[0]}
                  <strong>{inr(d.amount)}</strong>
                </div>
              );
            })
          )}
        </div>
        <div className="summary__total">
          Bill total <strong>{inr(total)}</strong>
        </div>
      </div>
    </div>
  );
}

function ItemizedAssign({ items, members, toggleAssign, applyVoice }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceLog, setVoiceLog] = useState([]);
  const recRef = useRef(null);
  const supported = isVoiceSupported();

  function startVoice() {
    if (!supported || listening) return;
    setTranscript('');
    setVoiceLog([]);
    const rec = createRecognizer({
      onResult: ({ finalText, interimText }) => {
        setTranscript(finalText || interimText);
        if (finalText) {
          const { log } = parseAndPreview(finalText);
          setVoiceLog(log);
          applyVoice(finalText);
        }
      },
      onError: () => setListening(false),
      onEnd: () => setListening(false),
    });
    if (!rec) return;
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  function parseAndPreview(text) {
    return parseAssignments(text, items, members);
  }

  function stopVoice() {
    recRef.current?.stop();
    setListening(false);
  }

  return (
    <div className="assign">
      <div className="assign__voice">
        <button
          className={`mic ${listening ? 'mic--on' : ''}`}
          onClick={listening ? stopVoice : startVoice}
          disabled={!supported}
          title={supported ? 'Assign items by voice' : 'Voice not supported in this browser'}
        >
          🎤 {listening ? 'Listening…' : 'Assign by voice'}
        </button>
        <span className="assign__hint">
          Try: “Pizza for Rahul, drinks split by everyone, biryani for Priya and Sameer”
        </span>
      </div>
      {(transcript || voiceLog.length > 0) && (
        <div className="assign__transcript">
          {transcript && <em>“{transcript}”</em>}
          {voiceLog.length > 0 && (
            <ul>
              {voiceLog.map((l, i) => (
                <li key={i}>✓ {l}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="assign__grid">
        {items.map((it) => (
          <div key={it.id} className="assign__row">
            <div className="assign__item">
              <span>{it.name || 'Item'}</span>
              <span className="assign__price">{inr(it.price)}</span>
            </div>
            <div className="chips chips--sm">
              {members.map((m) => {
                const on = (it.assignedTo || []).includes(m.id);
                return (
                  <button
                    key={m.id}
                    className={`chip chip--sm ${on ? 'chip--active' : ''}`}
                    onClick={() => toggleAssign(it.id, m.id)}
                  >
                    {m.name.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="assign__note">
        Unassigned items are shared by the whole group.
      </p>
    </div>
  );
}
