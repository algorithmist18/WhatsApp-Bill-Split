// Voice-driven item assignment using the browser's Web Speech API.
//
// The recogniser turns speech into a transcript; parseAssignments() then maps
// spoken phrases like "pizza for Raj, drinks split by everyone, biryani for
// Priya and Sam" onto the OCR line items. Voice is a convenience layer over
// the manual assignment UI, so anything it gets wrong can be fixed by hand.

export function isVoiceSupported() {
  return (
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

export function createRecognizer({ onResult, onError, onEnd }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = 'en-IN';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  rec.onresult = (event) => {
    let finalText = '';
    let interimText = '';
    for (let i = 0; i < event.results.length; i += 1) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += chunk;
      else interimText += chunk;
    }
    onResult?.({ finalText: finalText.trim(), interimText: interimText.trim() });
  };
  rec.onerror = (e) => onError?.(e);
  rec.onend = () => onEnd?.();
  return rec;
}

// Phrases that mean "share this across the WHOLE group". Deliberately narrow:
// words like "share"/"together" only mean the *named* people share an item, so
// they must NOT trigger a group-wide split.
const ALL_RE =
  /\b(everyone|everybody|every ?one|all of us|whole group|entire group|the group|\ball\b)\b/;

// First-person words map to the member literally named "You" (the phone owner).
const SELF_RE = /\b(me|my|mine|i|myself|i'?ll|i'?m)\b/;

// Filler words that appear inside item names but shouldn't be used to match.
const STOP = new Set([
  'the', 'and', 'for', 'with', 'plus', 'extra', 'reg', 'regular', 'large',
  'small', 'medium', 'pcs', 'pc', 'qty', 'combo', 'set', 'plate', 'half', 'full',
]);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstName(member) {
  return member.name.trim().split(/\s+/)[0].toLowerCase();
}

// Identifying words of an item name, longest first, so "Margherita Pizza" can be
// matched by just saying "pizza" and stopwords like "the"/"reg" are ignored.
function itemKeywords(item) {
  const words = item.name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
  return words.sort((a, b) => b.length - a.length);
}

// Members mentioned in a clause. Uses word boundaries so "Sam" doesn't also
// match "Sameer", and maps first-person words to the "You" member.
function membersInClause(clause, members) {
  const found = [];
  for (const m of members) {
    const fn = escapeRe(firstName(m));
    if (new RegExp(`\\b${fn}\\b`).test(clause)) found.push(m);
  }
  if (SELF_RE.test(clause)) {
    const self = members.find((m) => m.name.trim().toLowerCase() === 'you');
    if (self && !found.includes(self)) found.push(self);
  }
  return found;
}

// Items mentioned in a clause (by full name or any identifying keyword).
function itemsInClause(clause, items) {
  return items.filter((it) => {
    const name = it.name.toLowerCase().trim();
    if (name && clause.includes(name)) return true;
    return itemKeywords(it).some((k) => new RegExp(`\\b${escapeRe(k)}\\b`).test(clause));
  });
}

// Maps a spoken transcript onto the line items.
//
// Each comma / "then" / "also" separated clause is one instruction: the items
// it names go to the people it names. "everyone" (with no specific names) shares
// across the whole group. Items named with nobody are left unassigned (they fall
// back to an even split at settle time).
//
// Returns { items: updatedItems, log: humanReadableAssignments }.
export function parseAssignments(transcript, items, members) {
  const clean = ` ${transcript.toLowerCase().replace(/&/g, ' and ')} `;
  const clauses = clean
    .split(/[,;.]|\bthen\b|\balso\b|\bplus\b|\bnext\b/)
    .map((s) => s.trim())
    .filter(Boolean);

  const result = items.map((it) => ({ ...it, assignedTo: [...(it.assignedTo || [])] }));
  const log = [];

  for (const raw of clauses) {
    const clause = ` ${raw} `;
    const mentionedItems = itemsInClause(clause, result);
    if (mentionedItems.length === 0) continue;

    const mentionedMembers = membersInClause(clause, members);
    const wantsAll = mentionedMembers.length === 0 && ALL_RE.test(clause);

    let targets;
    if (mentionedMembers.length > 0) targets = mentionedMembers;
    else if (wantsAll) targets = members;
    else continue; // item named but no people — leave it unassigned

    for (const it of mentionedItems) {
      it.assignedTo = targets.map((m) => m.id);
      log.push(
        `${it.name} → ${targets.map((m) => m.name.split(' ')[0]).join(', ')}`
      );
    }
  }

  return { items: result, log };
}
