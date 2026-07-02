import React, { useState } from 'react';
import { inr } from '../lib/format.js';

function timeOf(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// A rich "bill split" card posted into the chat.
function SplitCard({ message, membersById, onPay, onSettled, onEdit }) {
  const [showItems, setShowItems] = useState(false);
  const payer = membersById[message.payerId];

  return (
    <div className="splitcard">
      <div className="splitcard__head">
        <span className="splitcard__icon">🧾</span>
        <div>
          <div className="splitcard__merchant">{message.merchant || 'Bill'}</div>
          <div className="splitcard__sub">
            {message.mode === 'equal' ? 'Split equally' : 'Split by items'}
            {message.edited ? ' · edited' : ''}
          </div>
        </div>
        <div className="splitcard__total">{inr(message.total)}</div>
      </div>

      <div className="splitcard__paidby">
        <span>
          Paid by <strong>{payer ? payer.name : 'someone'}</strong>
        </span>
        {onEdit && (
          <button className="splitcard__edit" onClick={() => onEdit(message)}>
            ✏️ Edit
          </button>
        )}
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
              ) : (
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
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function MessageBubble({ message, membersById, onPay, onSettled, onEdit }) {
  if (message.type === 'text') {
    const isSystem = message.author === 'system';
    return (
      <div className={`bubblerow ${isSystem ? 'bubblerow--system' : 'bubblerow--in'}`}>
        <div className={`bubble ${isSystem ? 'bubble--system' : 'bubble--in'}`}>
          <span className="bubble__text">{message.text}</span>
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
            onPay={onPay}
            onSettled={onSettled}
            onEdit={onEdit}
          />
          <span className="bubble__time">{timeOf(message.ts)}</span>
        </div>
      </div>
    );
  }

  return null;
}
