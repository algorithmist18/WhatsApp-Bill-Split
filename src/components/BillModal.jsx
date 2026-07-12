import React, { useMemo, useRef, useState } from 'react';
import { runOcr, blankItem } from '../lib/ocr.js';
import { readImageWithAI } from '../lib/aiVision.js';
import {
  computeShares,
  computeDebts,
  itemsTotal,
  equalPercents,
  percentTotal,
} from '../lib/split.js';
import { inr, initials } from '../lib/format.js';
import { CATEGORIES, getCategory } from '../lib/categories.js';
import {
  isVoiceSupported,
  createRecognizer,
  parseAssignments,
} from '../lib/voice.js';

export default function BillModal({ members, onClose, onPost, initial = null, ai = {} }) {
  const isEditing = !!initial;
  const useAI = !!(ai.enabled && ai.key);
  // New bills start at category selection; editing jumps straight to the edit
  // stage prefilled with the bill's items, split mode and payer.
  const [stage, setStage] = useState(isEditing ? 'edit' : 'category');
  const [category, setCategory] = useState(initial?.category ?? 'restaurant');
  const [merchant, setMerchant] = useState(initial?.merchant ?? '');
  const [fileName, setFileName] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [items, setItems] = useState(() =>
    initial ? initial.items.map((it) => ({ ...it, assignedTo: [...(it.assignedTo || [])] })) : []
  );
  const [mode, setMode] = useState(initial?.mode ?? 'equal'); // equal | itemized | percentage
  const [payerId, setPayerId] = useState(initial?.payerId ?? members[0]?.id ?? '');
  const [percents, setPercents] = useState(
    () => initial?.percents ?? equalPercents(members)
  );
  const [progress, setProgress] = useState(0);
  const [ocrNote, setOcrNote] = useState('');
  const [aiMode, setAiMode] = useState(false);

  const cat = getCategory(category);

  // Pick a category: restaurants go through OCR, everything else jumps to a
  // quick manual amount/items form.
  function chooseCategory(c) {
    setCategory(c.id);
    if (c.ocr) {
      setStage('upload');
    } else {
      setMerchant('');
      setItems([blankItem()]);
      setStage('edit');
    }
  }

  const fileInputRef = useRef(null);

  const total = useMemo(() => itemsTotal(items), [items]);
  const shares = useMemo(
    () => computeShares({ mode, items, members, percents }),
    [mode, items, members, percents]
  );
  const debts = useMemo(
    () => computeDebts({ shares, payerId, members }),
    [shares, payerId, members]
  );
  const pctTotal = useMemo(() => percentTotal(percents, members), [percents, members]);
  const pctValid = mode !== 'percentage' || Math.abs(pctTotal - 100) < 0.5;

  function setPercent(id, value) {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    setPercents((p) => ({ ...p, [id]: v }));
  }

  async function handleFile(file) {
    if (!file) return;
    setFileName(file.name);
    if (file.type?.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
    }
    setStage('scanning');
    setProgress(0);
    setOcrNote('');
    setAiMode(useAI);

    // Preferred path: Claude vision (accurate on messy app screenshots).
    if (useAI) {
      try {
        const result = await readImageWithAI(file, {
          apiKey: ai.key,
          provider: cat.provider,
          category,
        });
        setMerchant(result.merchant || cat.label);
        if (result.items.length > 0) {
          setItems(result.items);
        } else {
          setItems([blankItem()]);
          setOcrNote('AI read the image but found no items — add them below.');
        }
        setStage('edit');
        return;
      } catch (err) {
        console.warn('AI read failed, falling back to OCR:', err);
        setOcrNote(`AI read failed (${err?.message || 'error'}). Falling back to OCR…`);
        setAiMode(false);
      }
    }

    // Fallback: on-device OCR.
    try {
      const result = await runOcr(file, { onProgress: setProgress, provider: cat.provider });
      setMerchant(result.merchant);
      if (result.items.length > 0) {
        setItems(result.items);
      } else {
        setItems([blankItem()]);
        setOcrNote("Couldn't read any items automatically — add them below.");
      }
    } catch (err) {
      console.warn('OCR failed:', err);
      setMerchant(cat.label);
      setItems([blankItem()]);
      setOcrNote('Reading failed — enter the items manually.');
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
    if (items.length === 0 || total <= 0 || !pctValid) return;
    onPost(
      {
        type: 'split',
        author: 'you',
        category,
        merchant: merchant.trim() || cat.label,
        mode,
        total,
        payerId,
        percents: mode === 'percentage' ? { ...percents } : undefined,
        items: items.map((it) => ({ ...it })),
        shares: { ...shares },
        debts: debts.map((d) => ({ ...d, settled: false })),
      },
      initial?.id
    );
  }

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <h2>{isEditing ? 'Edit bill' : 'Split a bill'}</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal__body">
          {stage === 'category' && (
            <div className="catpick">
              <p className="catpick__label">What kind of expense is this?</p>
              <div className="catpick__grid">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    className="catpick__opt"
                    onClick={() => chooseCategory(c)}
                  >
                    <span className="catpick__icon">{c.icon}</span>
                    <span className="catpick__name">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {stage === 'upload' && (
            <UploadStage
              category={cat}
              useAI={useAI}
              onPick={() => fileInputRef.current?.click()}
              inputRef={fileInputRef}
              onFile={handleFile}
            />
          )}

          {stage === 'scanning' && (
            <div className="scanning">
              <div className="scanning__spinner" />
              {aiMode ? (
                <>
                  <p>Reading with AI ✨</p>
                  <span className="scanning__hint">Claude is reading your image…</span>
                </>
              ) : (
                <>
                  <p>{cat.provider ? 'Reading your order…' : 'Reading receipt…'}</p>
                  <div className="scanning__bar">
                    <div
                      className="scanning__barfill"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                  <span className="scanning__hint">
                    Recognising text with OCR · {Math.round(progress * 100)}%
                  </span>
                </>
              )}
            </div>
          )}

          {stage === 'edit' && (
            <EditStage
              category={cat}
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
              percents={percents}
              setPercent={setPercent}
              setPercents={setPercents}
              pctTotal={pctTotal}
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
              disabled={total <= 0 || members.length < 2 || !pctValid}
            >
              {isEditing ? 'Update split' : 'Post split to chat'}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function UploadStage({ category, useAI, onPick, inputRef, onFile }) {
  const [dragOver, setDragOver] = useState(false);
  const isOrder = !!category?.provider;
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
      <div className="dropzone__icon">{isOrder ? category.icon : '🧾'}</div>
      <p className="dropzone__title">
        {isOrder
          ? `Forward your ${category.label} order screenshot`
          : 'Upload a photo of the bill'}
      </p>
      <p className="dropzone__hint">Tap to choose an image, or drag &amp; drop it here</p>
      <span className="dropzone__ocr">
        {useAI
          ? '✨ AI reading is on — Claude will read this image'
          : isOrder
            ? `We'll read your ${category.label} order with OCR`
            : "We'll read the items automatically with OCR"}
      </span>
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
    category,
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
    percents,
    setPercent,
    setPercents,
    pctTotal,
    applyVoice,
  } = props;

  const isSingle = items.length === 1;

  return (
    <div className="edit">
      <div className="edit__topbar">
        {previewUrl ? (
          <img className="edit__thumb" src={previewUrl} alt="receipt" />
        ) : (
          <div className="edit__catbadge">{category?.icon || '🧾'}</div>
        )}
        <div className="edit__merchant">
          <label className="field__label">{category?.titleLabel || 'Merchant'}</label>
          <input
            className="input"
            value={merchant}
            placeholder={category?.label}
            onChange={(e) => setMerchant(e.target.value)}
          />
          {fileName && <span className="edit__file">from {fileName}</span>}
        </div>
      </div>

      <label className="field__label">{isSingle ? 'Amount' : 'Items'}</label>
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
            Equally
          </button>
          <button
            className={`segmented__opt ${mode === 'itemized' ? 'is-active' : ''}`}
            onClick={() => setMode('itemized')}
          >
            Assign items
          </button>
          <button
            className={`segmented__opt ${mode === 'percentage' ? 'is-active' : ''}`}
            onClick={() => setMode('percentage')}
          >
            By %
          </button>
        </div>
      </div>

      {mode === 'percentage' && (
        <PercentAssign
          members={members}
          percents={percents}
          setPercent={setPercent}
          setPercents={setPercents}
          pctTotal={pctTotal}
          total={total}
          shares={shares}
        />
      )}

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

function PercentAssign({ members, percents, setPercent, setPercents, pctTotal, total, shares }) {
  const remaining = Math.round((100 - pctTotal) * 100) / 100;
  const off = Math.abs(remaining) >= 0.5;
  return (
    <div className="assign">
      <div className="assign__voice">
        <span className="assign__hint">Set each person's percentage of the bill.</span>
        <button className="btn btn--ghost btn--sm" onClick={() => setPercents(equalPercents(members))}>
          Reset to equal
        </button>
      </div>

      <div className="pctlist">
        {members.map((m) => (
          <div key={m.id} className="pctrow">
            <div className="avatar avatar--xs">{initials(m.name)}</div>
            <span className="pctrow__name">{m.name.split(' ')[0]}</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={percents[m.id] || 0}
              onChange={(e) => setPercent(m.id, e.target.value)}
              className="pctrow__slider"
            />
            <div className="pctrow__num">
              <input
                type="number"
                min="0"
                max="100"
                value={percents[m.id] ?? 0}
                onChange={(e) => setPercent(m.id, e.target.value)}
                className="input"
              />
              <span>%</span>
            </div>
            <span className="pctrow__amt">{inr(shares[m.id] || 0)}</span>
          </div>
        ))}
      </div>

      <div className={`pcttotal ${off ? 'pcttotal--off' : 'pcttotal--ok'}`}>
        {off ? (
          <span>
            {pctTotal}% assigned — {remaining > 0 ? `${remaining}% left` : `${-remaining}% over`}.
            Must total 100%.
          </span>
        ) : (
          <span>✓ 100% assigned</span>
        )}
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
