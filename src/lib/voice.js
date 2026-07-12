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

// Words that mean "share this across the WHOLE group".
const ALL_RE =
  /\b(everyone|everybody|every ?one|all of us|whole group|entire group|the group|together|\ball\b|\bus\b)\b/g;

// First-person words map to the member literally named "You" (the phone owner):
// "for me", "I had it", "mine", "split by me" all select You.
const SELF_RE = /\b(me|my|mine|myself|i|i'?m|i'?ll|i'?ve)\b/g;

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

// Earliest index where an item is mentioned (by full name or a keyword), or -1.
function itemMentionIndex(text, item) {
  let best = -1;
  const name = item.name.toLowerCase().replace(/\s+/g, ' ').trim();
  if (name.length >= 3) {
    const i = text.indexOf(name);
    if (i >= 0) best = i;
  }
  for (const k of itemKeywords(item)) {
    const m = text.match(new RegExp(`\\b${escapeRe(k)}\\b`));
    if (m && (best < 0 || m.index < best)) best = m.index;
  }
  return best;
}

// All start indices where a word-boundary regex matches.
function allIndices(text, source) {
  const re = new RegExp(source, 'g');
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    out.push(m.index);
    if (m.index === re.lastIndex) re.lastIndex += 1; // avoid zero-width loop
  }
  return out;
}

// Maps a spoken transcript onto the line items.
//
// Speech has no punctuation, so a whole sentence arrives as one string. We scan
// it left-to-right: naming an item makes it the "current" item, and any people
// named after it attach to THAT item — so "biryani for Rahul and pizza for
// Priya" assigns each item to only its own person. People named before the first
// item attach to the first item that follows ("Rahul and I share the pizza").
//
// Returns { items: updatedItems, log: humanReadableAssignments }.
export function parseAssignments(transcript, items, members) {
  const text = ` ${transcript.toLowerCase().replace(/&/g, ' and ')} `;
  const self = members.find((m) => m.name.trim().toLowerCase() === 'you');

  // Build a timeline of events (item / people / everyone) ordered by position.
  const events = [];
  for (const it of items) {
    const idx = itemMentionIndex(text, it);
    if (idx >= 0) events.push({ index: idx, kind: 'item', id: it.id });
  }
  for (const m of members) {
    const re = `\\b${escapeRe(firstName(m))}\\b`;
    for (const idx of allIndices(text, re)) {
      events.push({ index: idx, kind: 'people', ids: [m.id] });
    }
  }
  if (self) {
    for (const idx of allIndices(text, SELF_RE.source)) {
      events.push({ index: idx, kind: 'people', ids: [self.id] });
    }
  }
  for (const idx of allIndices(text, ALL_RE.source)) {
    events.push({ index: idx, kind: 'all' });
  }
  events.sort((a, b) => a.index - b.index);

  // Walk the timeline, attaching people to the most-recently-named item.
  const assigned = {}; // itemId -> Set(memberId)
  let current = null;
  let pending = []; // people named before any item yet
  for (const ev of events) {
    if (ev.kind === 'item') {
      current = ev.id;
      if (!assigned[current]) assigned[current] = new Set();
      pending.forEach((id) => assigned[current].add(id));
      pending = [];
    } else {
      const ids = ev.kind === 'all' ? members.map((m) => m.id) : ev.ids;
      if (current) ids.forEach((id) => assigned[current].add(id));
      else pending.push(...ids);
    }
  }

  // Apply. Only items that were mentioned AND got at least one person are
  // changed; everything else keeps its existing assignment.
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const result = items.map((it) => ({ ...it, assignedTo: [...(it.assignedTo || [])] }));
  const log = [];
  for (const it of result) {
    const set = assigned[it.id];
    if (set && set.size > 0) {
      it.assignedTo = [...set];
      log.push(
        `${it.name} → ${it.assignedTo.map((id) => byId[id]?.name.split(' ')[0] || '?').join(', ')}`
      );
    }
  }
  return { items: result, log };
}
