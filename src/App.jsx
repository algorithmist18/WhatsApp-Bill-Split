import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import ChatWindow from './components/ChatWindow.jsx';
import MembersModal from './components/MembersModal.jsx';
import BillModal from './components/BillModal.jsx';
import UpiModal from './components/UpiModal.jsx';

const STORAGE_KEY = 'splitchat.state.v1';

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
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore corrupt storage */
  }
  return defaultState();
}

export default function App() {
  const [state, setState] = useState(loadState);
  const [membersOpen, setMembersOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [upiRequest, setUpiRequest] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage may be unavailable */
    }
  }, [state]);

  const { group, messages } = state;

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

  function markSettled(messageId, debtIndex) {
    setState((s) => ({
      ...s,
      messages: s.messages.map((m) => {
        if (m.id !== messageId || m.type !== 'split') return m;
        const debts = m.debts.map((d, i) =>
          i === debtIndex ? { ...d, settled: true } : d
        );
        return { ...m, debts };
      }),
    }));
  }

  return (
    <div className="app">
      <Sidebar group={group} onOpenMembers={() => setMembersOpen(true)} />

      <ChatWindow
        group={group}
        messages={messages}
        membersById={membersById}
        onOpenMembers={() => setMembersOpen(true)}
        onAddBill={() => setBillOpen(true)}
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
          onClose={() => setBillOpen(false)}
          onPost={(splitMessage) => {
            sendMessage(splitMessage);
            setBillOpen(false);
          }}
        />
      )}

      {upiRequest && (
        <UpiModal request={upiRequest} onClose={() => setUpiRequest(null)} />
      )}
    </div>
  );
}
