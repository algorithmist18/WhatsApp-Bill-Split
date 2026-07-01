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

// Keywords that mean "share this across the whole group".
const ALL_RE = /\b(everyone|everybody|all of us|all|together|group|shared?)\b/;

function firstName(member) {
  return member.name.trim().split(/\s+/)[0].toLowerCase();
}

// Pick the most identifying word of an item name (longest alphabetic token),
// so "Margherita Pizza" can be matched by just saying "pizza".
function itemKeywords(item) {
  const words = item.name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3);
  return words.sort((a, b) => b.length - a.length);
}

// Returns { items: updatedItems, log: humanReadableAssignments }.
export function parseAssignments(transcript, items, members) {
  const clauses = transcript
    .toLowerCase()
    .split(/[,.;]|\bthen\b|\balso\b/)
    .map((s) => s.trim())
    .filter(Boolean);

  const result = items.map((it) => ({ ...it, assignedTo: [...(it.assignedTo || [])] }));
  const log = [];

  for (const clause of clauses) {
    const matchedMembers = members.filter((m) => clause.includes(firstName(m)));
    const wantsAll = ALL_RE.test(clause);
    let targets = wantsAll ? members : matchedMembers;
    if (targets.length === 0) continue;

    for (const it of result) {
      const keywords = itemKeywords(it);
      const hit =
        clause.includes(it.name.toLowerCase()) ||
        keywords.some((k) => new RegExp(`\\b${k}\\b`).test(clause));
      if (hit) {
        it.assignedTo = targets.map((m) => m.id);
        log.push(`${it.name} → ${targets.map((m) => m.name.split(' ')[0]).join(', ')}`);
      }
    }
  }

  return { items: result, log };
}
