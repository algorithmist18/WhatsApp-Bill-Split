import React, { useState } from 'react';
import { inr } from '../lib/format.js';
import { getCategory } from '../lib/categories.js';

function timeOf(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function modeLabel(mode) {
  if (mode === 'itemized') return 'Split by items';
  if (mode === 'percentage') return 'Split by %';
  return 'Split equally';
}

// The "You" member — the phone owner. Only they can actually pay a debt.
function selfMemberId(membersById) {
  return Object.values(membersById).find(
    (m) => m?.name?.trim().toLowerCase() === 'you'
  )?.id;
}

// A rich "bill split" card posted into the chat.
function SplitCard({
  message,
  membersById,
  selfId,
  onPay,
  onSettled,
  onEdit,
  onDispute,
  onResolveDispute,
  onRemind,
}) {
  const [showItems, setShowItems] = useState(false);
  const payer = membersById[message.payerId];
  const cat = getCategory(message.category);
  const openDisputes = (message.disputes || []).filter((d) => d.status === 'open');

  return (
    <div className={`splitcard ${openDisputes.length ? 'splitcard--disputed' : ''}`}>
      <div className="splitcard__head">
        <span className="splitcard__icon">{cat.icon}</span>
        <div>
          <div className="splitcard__merchant">
            {message.merchant || 'Bill'}
            {openDisputes.length > 0 && <span className="splitcard__flag">⚠️ Disputed</span>}
          </div>
          <div className="splitcard__sub">
            {cat.label} · {modeLabel(message.mode)}
            {message.edited ? ' · edited' : ''}
          </div>
        </div>
        <div className="splitcard__total">{inr(message.total)}</div>
      </div>

      {openDisputes.length > 0 && (
        <div className="splitcard__disputes">
          {openDisputes.map((d) => (
            <div key={d.id} className="dispute__banner">
              <div className="dispute__bannertext">
                <strong>{membersById[d.by]?.name.split(' ')[0] || 'Someone'}</strong>{' '}
                disputes this: “{d.reason}”
              </div>
              {onResolveDispute && (
                <button
                  className="dispute__resolve"
                  onClick={() => onResolveDispute(message.id, d.id)}
                >
                  Resolve
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="splitcard__paidby">
        <span>
          Paid by <strong>{payer ? payer.name : 'someone'}</strong>
        </span>
        <span className="splitcard__actions">
          {onDispute && (
            <button className="splitcard__dispute" onClick={() => onDispute(message)}>
              ⚠️ Dispute
            </button>
          )}
          {onEdit && (
            <button className="splitcard__edit" onClick={() => onEdit(message)}>
              ✏️ Edit
            </button>
          )}
        </span>
      </div>

      <button className="splitcard__toggle" onClick={() => setShowItems((v) => !v)}>
        {showItems ? 'Hide items' : `View ${message.items.length} items`}
      </button>
      {showItems && (
        <ul className="splitcard__items">
          {message.items.map((it) => (
            <li key={it.id}>
              <span>{it.name}</span>
              <span>{inr(it.price)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="splitcard__debtshead">Who owes whom</div>
      {message.debts.length === 0 && (
        <div className="splitcard__allsettled">Nothing to settle 🎉</div>
      )}
      <ul className="splitcard__debts">
        {message.debts.map((debt, i) => {
          const from = membersById[debt.from];
          const to = membersById[debt.to];
          return (
            <li key={`${debt.from}-${i}`} className={debt.settled ? 'is-settled' : ''}>
              <div className="debt__text">
                <strong>{from ? from.name.split(' ')[0] : '?'}</strong> owes{' '}
                <strong>{to ? to.name.split(' ')[0] : '?'}</strong>
                <span className="debt__amount">{inr(debt.amount)}</span>
              </div>
              {debt.settled ? (
                <span className="debt__done">✓ Paid</span>
              ) : !selfId || debt.from === selfId ? (
                // Only I can pay a debt I owe.
                <div className="debt__actions">
                  <button
                    className="btn btn--pay"
                    onClick={() =>
                      onPay({
                        payee: to,
                        payer: from,
                        amount: debt.amount,
                        note: `${message.merchant || 'Bill'} split`,
                        onPaid: () => onSettled(message.id, i),
                      })
                    }
                  >
                    Pay via UPI
                  </button>
                </div>
              ) : (
                // Someone else owes — nudge them with a soft mention instead.
                <div className="debt__actions">
                  <button
                    className="btn btn--remind"
                    onClick={() =>
                      onRemind?.({
                        from: debt.from,
                        to: debt.to,
                        amount: debt.amount,
                        note: message.merchant || 'the bill',
                      })
                    }
                  >
                    🔔 Remind
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function MessageBubble({
  message,
  membersById,
  onPay,
  onSettled,
  onEdit,
  onDispute,
  onResolveDispute,
  onRemind,
}) {
  if (message.type === 'mention') {
    const who = membersById[message.toId];
    return (
      <div className="bubblerow bubblerow--in">
        <div className="bubble bubble--in bubble--mention">
          <span className="bubble__text">
            🔔 <span className="mention__tag">@{who ? who.name.split(' ')[0] : 'someone'}</span>{' '}
            {message.text}
          </span>
          <span className="bubble__time">{timeOf(message.ts)}</span>
        </div>
      </div>
    );
  }

  if (message.type === 'text') {
    const isSystem = message.author === 'system';
    const isMine = message.author === 'you';
    const row = isSystem ? 'bubblerow--system' : isMine ? 'bubblerow--out' : 'bubblerow--in';
    const bub = isSystem ? 'bubble--system' : isMine ? 'bubble--out' : 'bubble--in';
    return (
      <div className={`bubblerow ${row}`}>
        <div className={`bubble ${bub}`}>
          <span className="bubble__text">{message.text}</span>
          <span className="bubble__time">{timeOf(message.ts)}</span>
        </div>
      </div>
    );
  }

  if (message.type === 'bot') {
    return (
      <div className="bubblerow bubblerow--in">
        <div className="bubble bubble--in bubble--bot">
          <div className="botcard__head">
            <span className="botcard__avatar">🤖</span>
            <span className="botcard__title">{message.title}</span>
          </div>
          <div className="botcard__body">
            {message.lines.map((line, i) =>
              line === '' ? (
                <div key={i} className="botcard__gap" />
              ) : (
                <div key={i} className="botcard__line">
                  {line}
                </div>
              )
            )}
          </div>
          <span className="bubble__time">{timeOf(message.ts)}</span>
        </div>
      </div>
    );
  }

  if (message.type === 'split') {
    return (
      <div className="bubblerow bubblerow--out">
        <div className="bubble bubble--out bubble--card">
          <SplitCard
            message={message}
            membersById={membersById}
            selfId={selfMemberId(membersById)}
            onPay={onPay}
            onSettled={onSettled}
            onEdit={onEdit}
            onDispute={onDispute}
            onResolveDispute={onResolveDispute}
            onRemind={onRemind}
          />
          <span className="bubble__time">{timeOf(message.ts)}</span>
        </div>
      </div>
    );
  }

  return null;
}
