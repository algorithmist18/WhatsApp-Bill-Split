import React, { useMemo } from 'react';
import { computeBalances, minimalTransactions } from '../lib/balances.js';
import { inr, initials } from '../lib/format.js';

// Group-wide settle-up view: net balances across every bill, plus the
// minimal set of payments that squares everyone up.
export default function SettleUpModal({
  members,
  messages,
  settlements,
  onPay,
  onSettle,
  onClose,
}) {
  const membersById = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m])),
    [members]
  );

  const net = useMemo(
    () => computeBalances(messages, settlements, members),
    [messages, settlements, members]
  );
  const transactions = useMemo(() => minimalTransactions(net), [net]);

  const nothingToSettle = transactions.length === 0;

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <h2>Settle up</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal__body">
          <div className="field__label">Group balances</div>
          <ul className="balancelist">
            {members.map((m) => {
              const amt = net[m.id] || 0;
              const cls = amt > 0.009 ? 'up' : amt < -0.009 ? 'down' : 'even';
              const label =
                cls === 'up' ? 'gets back' : cls === 'down' ? 'owes' : 'settled';
              return (
                <li key={m.id} className="balancelist__row">
                  <div className="avatar avatar--xs">{initials(m.name)}</div>
                  <span className="balancelist__name">{m.name.split(' ')[0]}</span>
                  <span className={`balancelist__amt balancelist__amt--${cls}`}>
                    {cls === 'even' ? label : `${label} ${inr(Math.abs(amt))}`}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="field__label" style={{ marginTop: 18 }}>
            Suggested payments
          </div>
          {nothingToSettle ? (
            <div className="settle__done">Everyone's squared up 🎉</div>
          ) : (
            <ul className="settlelist">
              {transactions.map((t, i) => {
                const from = membersById[t.from];
                const to = membersById[t.to];
                return (
                  <li key={i} className="settlelist__row">
                    <div className="settlelist__text">
                      <strong>{from?.name.split(' ')[0]}</strong> →{' '}
                      <strong>{to?.name.split(' ')[0]}</strong>
                      <span className="settlelist__amt">{inr(t.amount)}</span>
                    </div>
                    <div className="settlelist__actions">
                      <button
                        className="btn btn--pay"
                        onClick={() =>
                          onPay({
                            payee: to,
                            payer: from,
                            amount: t.amount,
                            note: 'Group settle-up',
                            onPaid: () =>
                              onSettle({ from: t.from, to: t.to, amount: t.amount }),
                          })
                        }
                      >
                        Pay via UPI
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() =>
                          onSettle({ from: t.from, to: t.to, amount: t.amount })
                        }
                      >
                        Mark paid
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="settle__note">
            Balances combine every bill posted in the group. Paying a suggested
            amount records a settlement and recalculates the rest.
          </p>
        </div>

        <footer className="modal__foot">
          <button className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
