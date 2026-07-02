import { getCategory } from './categories.js';

function name(members, id) {
  const m = members.find((x) => x.id === id);
  return m ? m.name.split(' ')[0] : '?';
}

// A single chronological "who paid whom / what" timeline, newest first.
// Combines posted bills (someone paid the vendor) and settlement payments
// (one member paid another back). Each entry carries its timestamp so the UI
// can show the date.
export function buildActivityLog(messages, settlements, members) {
  const entries = [];

  for (const m of messages) {
    if (m.type !== 'split') continue;
    const cat = getCategory(m.category);
    entries.push({
      id: m.id,
      ts: m.ts,
      kind: 'bill',
      icon: cat.icon,
      amount: m.total,
      title: `${name(members, m.payerId)} paid ${m.merchant || cat.label}`,
      subtitle: `${cat.label} · split ${m.mode === 'equal' ? 'equally' : 'by items'}`,
    });
  }

  for (const s of settlements || []) {
    entries.push({
      id: s.id,
      ts: s.ts,
      kind: 'settlement',
      icon: '💸',
      amount: s.amount,
      title: `${name(members, s.from)} paid ${name(members, s.to)}`,
      subtitle: 'Settlement',
    });
  }

  return entries.sort((a, b) => b.ts - a.ts);
}
