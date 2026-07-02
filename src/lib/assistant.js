import { computeBalances, minimalTransactions } from './balances.js';
import { buildActivityLog } from './activity.js';
import { inr } from './format.js';

// A tiny keyword-driven "SplitBot". Given a typed message and the current
// group state, it returns a structured reply { title, lines[], kind } that the
// chat renders as a bot bubble. It answers questions about balances, what a
// specific person owes, and the transaction history.

function first(member) {
  return member.name.trim().split(/\s+/)[0].toLowerCase();
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function balanceReply(members, net) {
  const lines = members.map((m) => {
    const amt = net[m.id] || 0;
    if (amt > 0.009) return `🟢 ${m.name.split(' ')[0]} gets back ${inr(amt)}`;
    if (amt < -0.009) return `🔴 ${m.name.split(' ')[0]} owes ${inr(-amt)}`;
    return `⚪ ${m.name.split(' ')[0]} is settled`;
  });
  const tx = minimalTransactions(net);
  if (tx.length === 0) {
    lines.push('', '🎉 Everyone is squared up.');
  } else {
    lines.push('', 'Suggested payments:');
    for (const t of tx) {
      lines.push(`• ${first(byId(members, t.from))} → ${first(byId(members, t.to))}: ${inr(t.amount)}`);
    }
  }
  return { title: 'Group balances', lines, kind: 'balance' };
}

function byId(members, id) {
  return members.find((m) => m.id === id) || { name: '?' };
}

function memberReply(member, members, net) {
  const amt = net[member.id] || 0;
  const nm = member.name.split(' ')[0];
  const lines = [];
  if (Math.abs(amt) < 0.009) {
    lines.push(`${nm} is all settled up 🎉`);
  } else if (amt < 0) {
    lines.push(`${nm} owes ${inr(-amt)} overall.`);
  } else {
    lines.push(`${nm} should get back ${inr(amt)} overall.`);
  }
  const tx = minimalTransactions(net).filter(
    (t) => t.from === member.id || t.to === member.id
  );
  if (tx.length) {
    lines.push('');
    for (const t of tx) {
      if (t.from === member.id) {
        lines.push(`• Pay ${first(byId(members, t.to))}: ${inr(t.amount)}`);
      } else {
        lines.push(`• Collect from ${first(byId(members, t.from))}: ${inr(t.amount)}`);
      }
    }
  }
  return { title: `${nm}'s balance`, lines, kind: 'balance' };
}

function logReply(messages, settlements, members) {
  const log = buildActivityLog(messages, settlements, members).slice(0, 8);
  if (log.length === 0) {
    return { title: 'Transaction log', lines: ['No activity yet.'], kind: 'log' };
  }
  const lines = log.map(
    (e) => `${e.icon} ${fmtDate(e.ts)} — ${e.title} · ${inr(e.amount)}`
  );
  return { title: 'Recent activity', lines, kind: 'log' };
}

function helpReply() {
  return {
    title: 'SplitBot',
    lines: [
      'Ask me things like:',
      '• “who owes what” — group balances',
      '• “how much does Rahul owe”',
      '• “show the log” — recent transactions',
    ],
    kind: 'help',
  };
}

export function answer(text, { members, messages, settlements }) {
  const q = ` ${text.toLowerCase()} `;
  const net = computeBalances(messages, settlements, members);

  if (/\b(log|history|transactions?|activity|who paid|statement)\b/.test(q)) {
    return logReply(messages, settlements, members);
  }

  const named = members.find((m) => new RegExp(`\\b${first(m)}\\b`).test(q));
  const isBalanceQuery =
    /\b(owe|owes|owing|balance|balances|settle|settled|due|square|how much|split)\b/.test(q);

  if (named && isBalanceQuery) return memberReply(named, members, net);
  if (isBalanceQuery) return balanceReply(members, net);
  if (named) return memberReply(named, members, net);

  return helpReply();
}
