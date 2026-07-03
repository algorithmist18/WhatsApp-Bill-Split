import { round2 } from './format.js';

// Sum the raw total of a set of OCR line items.
export function itemsTotal(items) {
  return round2(items.reduce((sum, it) => sum + Number(it.price || 0), 0));
}

// Work out how much each member's share of the bill is.
//
// mode 'equal'      -> the whole total is divided evenly across every member.
// mode 'itemized'   -> each item is shared equally among the people it was
//                      assigned to (an unassigned item falls back to everyone).
// mode 'percentage' -> the total is split by each member's percentage share.
//
// Returns a map of { memberId: amountOwedForTheirFood }.
export function computeShares({ mode, items, members, percents = {} }) {
  const shares = Object.fromEntries(members.map((m) => [m.id, 0]));
  if (members.length === 0) return shares;

  if (mode === 'equal') {
    const total = itemsTotal(items);
    const per = total / members.length;
    members.forEach((m) => {
      shares[m.id] += per;
    });
  } else if (mode === 'percentage') {
    const total = itemsTotal(items);
    members.forEach((m) => {
      shares[m.id] += (total * Number(percents[m.id] || 0)) / 100;
    });
  } else {
    for (const it of items) {
      const assignees =
        it.assignedTo && it.assignedTo.length ? it.assignedTo : members.map((m) => m.id);
      const per = Number(it.price || 0) / assignees.length;
      assignees.forEach((id) => {
        if (id in shares) shares[id] += per;
      });
    }
  }

  for (const id of Object.keys(shares)) shares[id] = round2(shares[id]);
  return shares;
}

// An even percentage spread across members (the last one absorbs rounding so
// the set always sums to exactly 100).
export function equalPercents(members) {
  const out = {};
  if (members.length === 0) return out;
  const base = Math.floor((100 / members.length) * 100) / 100;
  members.forEach((m) => {
    out[m.id] = base;
  });
  const used = base * members.length;
  out[members[members.length - 1].id] = round2(out[members[members.length - 1].id] + (100 - used));
  return out;
}

export function percentTotal(percents, members) {
  return round2(members.reduce((sum, m) => sum + Number(percents[m.id] || 0), 0));
}

// One person paid the whole bill, so everyone else owes the payer their share.
// Returns [{ from, to, amount }] sorted biggest-debt-first.
export function computeDebts({ shares, payerId, members }) {
  return members
    .filter((m) => m.id !== payerId)
    .map((m) => ({ from: m.id, to: payerId, amount: round2(shares[m.id] || 0) }))
    .filter((d) => d.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}
