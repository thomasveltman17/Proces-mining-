/**
 * AI layer for cross-app process discovery.
 *
 * Three narrow jobs: normalize raw interactions into canonical activity names,
 * extract stitching entities from noisy text, and name a discovered process
 * cluster. A fourth (describeScreenshot) is the vision fallback for the desktop
 * agent when accessibility data is thin.
 *
 * Every function has a DETERMINISTIC offline fallback so the whole discovery
 * pipeline runs and is testable with no API key. Real Claude is used only when
 * ANTHROPIC_API_KEY is present. Model: claude-opus-4-8 (high-resolution vision
 * for the screenshot path).
 */

const MODEL = 'claude-opus-4-8';
const hasKey = !!process.env.ANTHROPIC_API_KEY;

let _client = null;
async function client() {
  if (!hasKey) return null;
  if (_client) return _client;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  _client = new Anthropic();
  return _client;
}

export const aiEnabled = hasKey;

/** Pull the first JSON value out of a model response, tolerant of prose/fences. */
function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start === -1) return null;
  try {
    return JSON.parse(body.slice(start));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- activity labels

const ACTION_WORDS = {
  click: 'Click',
  submit: 'Submit',
  input: 'Fill',
  nav: 'View',
  open: 'Open',
  send: 'Send',
  edit: 'Edit',
  save: 'Save',
};

const VERB_PREFIX = /^(View|Open|Click|Fill|Submit|Send|Save|Enter|Log|Create|Add|Approve|Reject|Reply|Review|Schedule|Print|Attach|Download)\b/i;

/**
 * Canonicalize a label into an activity *type* — strip case-specific entities
 * (invoice/PO/order/… IDs, "from <party>", "(name)", trailing prepositions,
 * file extensions) so runs of the same process share activity names and can be
 * clustered. This is the classic activity-vs-instance distinction in process
 * mining: the entity is the case id, not part of the activity.
 */
export function canonicalize(name) {
  let s = String(name);
  for (const re of ENTITY_PATTERNS) s = s.replace(re, '');
  s = s
    .replace(/\bfrom\s+[A-Z][\w.&'’-]*(?:\s+[A-Z][\w.&'’-]*)*/g, '') // "from Vendor Co"
    .replace(/\bto\s+[A-Z][\w.&'’-]*(?:\s+[A-Z][\w.&'’-]*)*/g, '') // "to Customer"
    .replace(/\([^)]*\)/g, '') // "(Acme Retail)"
    .replace(/\.\w{2,4}\b/g, '') // ".pdf", ".xlsx"
    .replace(/\b(re|for|of|with)\s*:?\s*$/i, '') // dangling prepositions
    .replace(/[:•\-–]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s || String(name).trim();
}

/** Deterministic canonical activity name from a raw event. */
export function labelActivityFallback(e) {
  const label = (e.label ?? '').trim();
  const app = e.app ? ` (${e.app})` : '';
  // Desktop/accessibility events already carry an action phrase as the label.
  if (VERB_PREFIX.test(label)) return canonicalize(label);
  let base;
  switch (e.type) {
    case 'nav':
      base = label ? `View ${label}` : 'View page';
      break;
    case 'input':
      base = label ? `Fill "${label}"` : 'Fill field';
      break;
    case 'submit':
      base = label ? `Submit ${label}` : 'Submit form';
      break;
    case 'click':
      base = label || `Click${app}`;
      break;
    default:
      base = label || `${ACTION_WORDS[e.type] ?? 'Action'}${app}`;
  }
  return canonicalize(base);
}

/**
 * Normalize a batch of distinct raw labels into canonical activity names.
 * Returns a Map<rawKey, canonicalName>. Uses Claude to merge near-duplicates
 * ("Approve", "Approve invoice", "Approve Invoice") when a key is present.
 */
export async function normalizeActivities(rawEvents) {
  const map = new Map();
  for (const e of rawEvents) {
    const key = `${e.type}|${e.app ?? ''}|${(e.label ?? '').trim()}`;
    if (!map.has(key)) map.set(key, { event: e, name: labelActivityFallback(e) });
  }
  const c = await client();
  if (!c) return new Map([...map].map(([k, v]) => [k, v.name]));

  try {
    const distinct = [...map.values()].map((v) => v.name);
    const unique = [...new Set(distinct)];
    const resp = await c.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system:
        'You normalize UI interaction labels into canonical process-activity names. ' +
        'Merge synonyms and casing/wording variants to one canonical name. Keep names short and verb-first.',
      messages: [
        {
          role: 'user',
          content:
            'Return ONLY a JSON object mapping each input label to its canonical name.\n' +
            JSON.stringify(unique),
        },
      ],
    });
    const canon = parseJson(resp.content.find((b) => b.type === 'text')?.text ?? '');
    if (canon && typeof canon === 'object') {
      return new Map([...map].map(([k, v]) => [k, canon[v.name] ?? v.name]));
    }
  } catch {
    /* fall through to deterministic */
  }
  return new Map([...map].map(([k, v]) => [k, v.name]));
}

// ---------------------------------------------------------------- entity extraction

// Structured identifiers that reliably stitch a case across apps.
const ENTITY_PATTERNS = [
  /\b(INV-\d{3,})\b/gi,
  /\b(PO-\d{3,})\b/gi,
  /\b(ORD-\d{3,})\b/gi,
  /\b(TICKET-\d{3,}|TCK-\d{3,})\b/gi,
  /\b(EXP-\d{3,})\b/gi,
  /\b(CUS-\d{3,}|CUST-\d{3,})\b/gi,
  /\b(JE-\d{3,})\b/gi,
];

/** Deterministic entity extraction from a piece of text. */
export function extractEntitiesFallback(text) {
  if (!text) return [];
  const found = new Set();
  for (const re of ENTITY_PATTERNS) {
    for (const m of text.matchAll(re)) found.add(m[1].toUpperCase());
  }
  return [...found];
}

/**
 * Extract stitching entities from an episode's text (labels + window titles).
 * Regex handles structured IDs; Claude adds fuzzy ones (vendor, subject) when
 * a key is present. Returns a deduped array of entity strings.
 */
export async function extractEntities(texts) {
  const joined = texts.filter(Boolean).join(' • ');
  const structured = extractEntitiesFallback(joined);
  const c = await client();
  if (!c) return structured;

  try {
    const resp = await c.messages.create({
      model: MODEL,
      max_tokens: 500,
      system:
        'Extract business case identifiers that would link activities across apps ' +
        '(invoice/PO/order/ticket numbers, and clear entity names like a vendor or customer).',
      messages: [
        {
          role: 'user',
          content: 'Return ONLY a JSON array of identifier strings from:\n' + joined.slice(0, 4000),
        },
      ],
    });
    const arr = parseJson(resp.content.find((b) => b.type === 'text')?.text ?? '');
    if (Array.isArray(arr)) return [...new Set([...structured, ...arr.map(String)])];
  } catch {
    /* fall through */
  }
  return structured;
}

// ---------------------------------------------------------------- process naming

/** Deterministic process name from representative activity sequences. */
export function nameProcessFallback(sequences) {
  const first = sequences[0] ?? [];
  const apps = new Set();
  for (const seq of sequences) for (const a of seq) if (a.app) apps.add(a.app);
  const start = first[0]?.name ?? 'Start';
  const end = first[first.length - 1]?.name ?? 'End';
  const strip = (s) =>
    s
      .replace(/^(View|Open|Click|Fill|Submit|Send)\s+/i, '')
      .replace(/^email\s*:\s*/i, '')
      .replace(/\b(to|from|of|for|with)\s*$/i, '')
      .replace(/["']/g, '')
      .trim();
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  return {
    name: `${cap(strip(start))} → ${cap(strip(end))}`,
    description: `Auto-discovered process spanning ${[...apps].join(', ') || 'one app'}.`,
  };
}

/** Name a discovered process cluster from a few representative sequences. */
export async function nameProcess(sequences) {
  const c = await client();
  if (!c) return nameProcessFallback(sequences);
  try {
    const sample = sequences.slice(0, 5).map((seq) => seq.map((a) => a.name));
    const resp = await c.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: 'You name business processes discovered from user behavior. Give a short, human name and one-line description.',
      messages: [
        {
          role: 'user',
          content:
            'Return ONLY JSON {"name": "...", "description": "..."} for these activity sequences:\n' +
            JSON.stringify(sample),
        },
      ],
    });
    const obj = parseJson(resp.content.find((b) => b.type === 'text')?.text ?? '');
    if (obj && obj.name) return { name: String(obj.name), description: String(obj.description ?? '') };
  } catch {
    /* fall through */
  }
  return nameProcessFallback(sequences);
}

// ---------------------------------------------------------------- vision fallback

/**
 * Turn a screenshot into a semantic interaction event. Used by the desktop
 * agent where accessibility data is thin (canvas apps, remote desktops).
 * Requires a key + image; returns null offline.
 */
export async function describeScreenshot(pngBuffer, contextHint = '') {
  const c = await client();
  if (!c) return null;
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 400,
    system:
      'You observe a user\'s screen for process mining. Describe the single most salient ' +
      'action or state as a semantic event. Never transcribe sensitive field values.',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBuffer.toString('base64') } },
          {
            type: 'text',
            text:
              (contextHint ? `Context: ${contextHint}\n` : '') +
              'Return ONLY JSON {"app": "...", "activity": "...", "entities": ["..."]}.',
          },
        ],
      },
    ],
  });
  return parseJson(resp.content.find((b) => b.type === 'text')?.text ?? '');
}
