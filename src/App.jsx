import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import ChatWindow from './components/ChatWindow.jsx';
import MembersModal from './components/MembersModal.jsx';
import BillModal from './components/BillModal.jsx';
import UpiModal from './components/UpiModal.jsx';
import SettleUpModal from './components/SettleUpModal.jsx';

const STORAGE_KEY = 'splitchat.state.v2';

function defaultState() {
  return {
    group: {
      name: 'Goa Trip 🏖️',
      members: [
        { id: 'm1', name: 'You', upi: 'you@okhdfcbank' },
        { id: 'm2', name: 'Rahul', upi: 'rahul@okaxis' },
        { id: 'm3', name: 'Priya', upi: 'priya@okicici' },
        { id: 'm4', name: 'Sameer', upi: 'sameer@oksbi' },
      ],
    },
    messages: [
      {
        id: 'sys1',
        type: 'text',
        author: 'system',
        text: '👋 Welcome to SplitChat! Add a bill with the 📎 button to split it with the group.',
        ts: Date.now(),
      },
    ],
    settlements: [],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { settlements: [], ...parsed };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return defaultState();
}

export default function App() {
  const [state, setState] = useState(loadState);
  const [membersOpen, setMembersOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [upiRequest, setUpiRequest] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage may be unavailable */
    }
  }, [state]);

  const { group, messages, settlements } = state;

  const membersById = useMemo(
    () => Object.fromEntries(group.members.map((m) => [m.id, m])),
    [group.members]
  );

  function setMembers(members) {
    setState((s) => ({ ...s, group: { ...s.group, members } }));
  }

  function sendMessage(msg) {
    setState((s) => ({
      ...s,
      messages: [...s.messages, { id: `msg_${Date.now()}`, ts: Date.now(), ...msg }],
    }));
  }

  // Replace an existing split with an edited version, keeping its id/timestamp.
  // The recomputed debts start unsettled; already-recorded settlements stay in
  // the ledger, so group balances stay consistent.
  function updateMessage(id, msg) {
    setState((s) => ({
      ...s,
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, ...msg, id: m.id, ts: m.ts, edited: true } : m
      ),
    }));
  }

  function openAddBill() {
    setEditBill(null);
    setBillOpen(true);
  }

  function openEditBill(message) {
    setEditBill(message);
    setBillOpen(true);
  }

  function closeBill() {
    setBillOpen(false);
    setEditBill(null);
  }

  function addSettlement({ from, to, amount }) {
    setState((s) => ({
      ...s,
      settlements: [
        ...s.settlements,
        { id: `st_${Date.now()}`, from, to, amount, ts: Date.now() },
      ],
    }));
  }

  // Paying a specific bill debt: tick it off on the card AND record it as a
  // settlement so the group-wide balance reflects the payment.
  function markSettled(messageId, debtIndex) {
    setState((s) => {
      let paid = null;
      const nextMessages = s.messages.map((m) => {
        if (m.id !== messageId || m.type !== 'split') return m;
        const debts = m.debts.map((d, i) => {
          if (i !== debtIndex || d.settled) return d;
          paid = { from: d.from, to: d.to, amount: d.amount };
          return { ...d, settled: true };
        });
        return { ...m, debts };
      });
      const nextSettlements = paid
        ? [...s.settlements, { id: `st_${Date.now()}`, ...paid, ts: Date.now() }]
        : s.settlements;
      return { ...s, messages: nextMessages, settlements: nextSettlements };
    });
  }

  return (
    <div className="app">
      <Sidebar group={group} onOpenMembers={() => setMembersOpen(true)} />

      <ChatWindow
        group={group}
        messages={messages}
        membersById={membersById}
        onOpenMembers={() => setMembersOpen(true)}
        onOpenSettle={() => setSettleOpen(true)}
        onAddBill={openAddBill}
        onEditBill={openEditBill}
        onPay={(req) => setUpiRequest(req)}
        onSettled={markSettled}
      />

      {membersOpen && (
        <MembersModal
          members={group.members}
          onSave={setMembers}
          onClose={() => setMembersOpen(false)}
        />
      )}

      {billOpen && (
        <BillModal
          members={group.members}
          initial={editBill}
          onClose={closeBill}
          onPost={(splitMessage, editId) => {
            if (editId) updateMessage(editId, splitMessage);
            else sendMessage(splitMessage);
            closeBill();
          }}
        />
      )}

      {settleOpen && (
        <SettleUpModal
          members={group.members}
          messages={messages}
          settlements={settlements}
          onPay={(req) => setUpiRequest(req)}
          onSettle={addSettlement}
          onClose={() => setSettleOpen(false)}
        />
      )}

      {upiRequest && (
        <UpiModal request={upiRequest} onClose={() => setUpiRequest(null)} />
      )}
    </div>
  );
}
