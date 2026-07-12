import React, { useEffect, useRef, useState } from 'react';
import { initials } from '../lib/format.js';
import MessageBubble from './MessageBubble.jsx';

export default function ChatWindow({
  group,
  messages,
  membersById,
  onOpenMembers,
  onOpenSettle,
  onAddBill,
  onEditBill,
  onSendText,
  onPay,
  onSettled,
  onDispute,
  onResolveDispute,
  onRemind,
}) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function handleSend(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSendText?.(text);
    setDraft('');
  }

  return (
    <main className="chat">
      <header className="chat__header">
        <div className="chat__headmain" onClick={onOpenMembers}>
          <div className="avatar avatar--group">{initials(group.name)}</div>
          <div className="chat__headtext">
            <span className="chat__title">{group.name}</span>
            <span className="chat__subtitle">
              {group.members.map((m) => m.name.split(' ')[0]).join(', ')}
            </span>
          </div>
        </div>
        <button className="chat__settle" onClick={onOpenSettle}>
          ⚖️ Settle up
        </button>
      </header>

      <div className="chat__scroll" ref={scrollRef}>
        <div className="chat__daydivider">
          <span>Today</span>
        </div>
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            membersById={membersById}
            onPay={onPay}
            onSettled={onSettled}
            onEdit={onEditBill}
            onDispute={onDispute}
            onResolveDispute={onResolveDispute}
            onRemind={onRemind}
          />
        ))}
      </div>

      <footer className="composer">
        <button
          className="composer__attach"
          title="Add a bill"
          onClick={onAddBill}
          aria-label="Add a bill"
        >
          📎
        </button>
        <form className="composer__form" onSubmit={handleSend}>
          <input
            className="composer__input"
            placeholder="Ask “who owes what” or “show the log”…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </form>
        <button className="composer__bill" onClick={onAddBill}>
          🧾 Split a bill
        </button>
      </footer>
    </main>
  );
}
