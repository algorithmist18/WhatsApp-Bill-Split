import { round2 } from './format.js';

// Net position of every member across ALL posted bills and settlement payments.
//
//   net > 0  -> the group owes this person (they're up)
//   net < 0  -> this person owes the group (they're down)
//
// For each bill: a member "paid" the whole total if they're the payer, and
// "consumed" their share. net += paid - share. A settlement payment from A to B
// moves A back toward zero (they cleared debt) and B down by the same amount.
export function computeBalances(messages, settlements, members) {
  const net = Object.fromEntries(members.map((m) => [m.id, 0]));

  for (const msg of messages) {
    if (msg.type !== 'split' || !msg.shares) continue;
    for (const m of members) {
      const share = msg.shares[m.id] || 0;
      const paid = m.id === msg.payerId ? msg.total : 0;
      net[m.id] += paid - share;
    }
  }

  for (const s of settlements || []) {
    if (s.from in net) net[s.from] += s.amount;
    if (s.to in net) net[s.to] -= s.amount;
  }

  for (const id of Object.keys(net)) net[id] = round2(net[id]);
  return net;
}

// Greedy minimum-cash-flow: settle everyone with the fewest transactions by
// repeatedly matching the biggest debtor to the biggest creditor.
export function minimalTransactions(net) {
  const creditors = [];
  const debtors = [];
  for (const [id, amt] of Object.entries(net)) {
    if (amt > 0.009) creditors.push({ id, amt });
    else if (amt < -0.009) debtors.push({ id, amt: -amt });
  }
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const tx = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    tx.push({ from: debtors[i].id, to: creditors[j].id, amount: round2(pay) });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt < 0.009) i += 1;
    if (creditors[j].amt < 0.009) j += 1;
  }
  return tx;
}
