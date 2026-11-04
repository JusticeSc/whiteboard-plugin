/**
 * Pure CanvasDoc model: creation, human operations, claim patch staging,
 * turn-end merge (field-level optimistic concurrency), selective undo and the
 * client serialization. No IO and no clock beyond the injected `now`.
 *
 * See docs/adr/0002-canvas-authority.md §3–§4.
 */

import {
  AI_INSERT_TYPES,
  CANVAS_SCHEMA_VERSION,
  COLOR_IDS,
  COORD_LIMIT,
  EDITABLE_FIELDS,
  ELEMENT_TYPES,
  HUMAN_INSERT_TYPES,
  INSERT_DEFAULTS,
  LIMITS,
  REV_FIELDS,
} from './constants.js';

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sameValue(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!sameValue(a[i], b[i])) return false;
    return true;
  }
  return false;
}

export function randomToken(length = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function makeCanvasId() {
  return 'cv-' + Date.now().toString(36) + '-' + randomToken(4);
}

export function makePatchId() {
  return 'pt-' + Date.now().toString(36) + '-' + randomToken(4);
}

export function makeClaimId() {
  return 'lk-' + Date.now().toString(36) + '-' + randomToken(4);
}

export function fieldRev(element, field) {
  const revs = element && element.fieldRevs;
  const raw = revs ? revs[field] : undefined;
  return isFiniteNumber(raw) ? raw : 0;
}

const SAFE_KEY_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function isSafeKey(value) {
  return typeof value === 'string' && SAFE_KEY_RE.test(value);
}

/* ------------------------------------------------------------------ */
/* Canvas / element construction                                       */
/* ------------------------------------------------------------------ */

export function createCanvas(id, name, now) {
  const canvasId = isSafeKey(id) ? id : makeCanvasId();
  const label = typeof name === 'string' && name.trim().length > 0 ? name.trim().slice(0, 120) : '画板';
  return {
    schemaVersion: CANVAS_SCHEMA_VERSION,
    id: canvasId,
    name: label,
    rev: 0,
    createdAt: now,
    updatedAt: now,
    elements: {},
    changes: [],
  };
}

function initialFieldRevs(type, element) {
  const fields = REV_FIELDS[type] || [];
  const revs = {};
  for (const field of fields) {
    if (field === 'w' || field === 'h') {
      revs[field] = 1;
      continue;
    }
    if (field === 'text') {
      if (type === 'text') revs[field] = 1;
      continue;
    }
    if (field === 'points') {
      if (type === 'pen') revs[field] = 1;
      continue;
    }
    revs[field] = 1;
  }
  return revs;
}

function makeElement(type, fields, now) {
  const element = {
    id: '',
    type,
    rev: 0,
    fieldRevs: {},
    origin: 'user',
    turnId: null,
    sessionId: null,
    parentSessionId: null,
    updatedAt: now,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    element[key] = value;
  }
  element.fieldRevs = initialFieldRevs(type, element);
  return element;
}

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

/** Palette fallbacks (the client resolves CSS tokens to these values; the
 *  Host has no tokens, so it uses the same fallbacks for translation and for
 *  hex -> palette normalization). Mirrors client.js PALETTE. */
export const PALETTE_HEX = Object.freeze({
  ink: '#1f2329',
  accent: '#2f6fed',
  red: '#d9343a',
  green: '#2f9e44',
  amber: '#d98b0f',
});

/** Normalize `#rgb` / `#rrggbb` (case-insensitive) to `#rrggbb`; null when the
 *  value is not a hex color. */
export function normalizeHexColor(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().toLowerCase();
  if (text.length === 4 && text[0] === '#') {
    const digits = text.slice(1);
    if (!/^[0-9a-f]{3}$/.test(digits)) return null;
    return '#' + digits[0] + digits[0] + digits[1] + digits[1] + digits[2] + digits[2];
  }
  if (text.length === 7 && text[0] === '#') {
    return /^#[0-9a-f]{6}$/.test(text) ? text : null;
  }
  return null;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  if (normalized === null) return null;
  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ];
}

const PALETTE_RGB = Object.freeze(Object.keys(PALETTE_HEX).map((id) => ({
  id: id,
  rgb: hexToRgb(PALETTE_HEX[id]),
})));

/** Human color words (English and Chinese) -> palette id. Models often answer
 *  "blue"/"蓝" when a person asked for 蓝色; mapping them avoids a needless
 *  failed tool call before the model retries with a hex value. */
export const COLOR_NAMES = Object.freeze({
  ink: 'ink', black: 'ink', dark: 'ink', 黑: 'ink', 黑色: 'ink', 墨: 'ink', 墨色: 'ink',
  accent: 'accent', blue: 'accent', 蓝: 'accent', 蓝色: 'accent',
  red: 'red', 红: 'red', 红色: 'red',
  green: 'green', 绿: 'green', 绿色: 'green',
  amber: 'amber', yellow: 'amber', orange: 'amber', 黄: 'amber', 黄色: 'amber', 橙: 'amber', 橙色: 'amber',
});

/** Nearest palette id for a hex color: exact fallback match first, then the
 *  smallest RGB distance (ties keep PALETTE_HEX order). */
export function paletteIdForHex(raw) {
  const hex = normalizeHexColor(raw);
  if (hex === null) return 'ink';
  for (const id of Object.keys(PALETTE_HEX)) {
    if (PALETTE_HEX[id] === hex) return id;
  }
  const rgb = hexToRgb(hex);
  let best = 'ink';
  let bestDistance = Infinity;
  for (const entry of PALETTE_RGB) {
    const dr = entry.rgb[0] - rgb[0];
    const dg = entry.rgb[1] - rgb[1];
    const db = entry.rgb[2] - rgb[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry.id;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Field sanitizers (shared by human and model paths)                  */
/* ------------------------------------------------------------------ */

/**
 * Colors are stored as palette ids, but models (and people) may hand back the
 * hex shown in the translation. A palette id wins as-is; a hex color is mapped
 * to the nearest palette id (exact fallback first) with a note; anything else
 * degrades to "ink" as before.
 */
function sanitizeColor(raw, path, notes) {
  if (raw === undefined) return undefined;
  if (typeof raw === 'string') {
    const text = raw.trim().toLowerCase();
    if (COLOR_IDS.has(text)) return text;
    if (Object.prototype.hasOwnProperty.call(COLOR_NAMES, text)) {
      const id = COLOR_NAMES[text];
      notes.push(path + ': color ' + JSON.stringify(raw) + ' -> "' + id + '"');
      return id;
    }
    const hex = normalizeHexColor(text);
    if (hex !== null) {
      const id = paletteIdForHex(hex);
      notes.push(path + ': color ' + JSON.stringify(raw) + ' -> "' + id + '"');
      return id;
    }
  }
  notes.push(path + ': color ' + JSON.stringify(raw) + ' -> "ink"');
  return 'ink';
}

function sanitizeCoord(raw, path, notes) {
  if (raw === undefined) return undefined;
  if (!isFiniteNumber(raw)) {
    notes.push(path + ': ignored (not a finite number)');
    return undefined;
  }
  const clamped = clampNumber(raw, -COORD_LIMIT, COORD_LIMIT);
  if (clamped !== raw) notes.push(path + ': clamped ' + raw + ' -> ' + clamped);
  return clamped;
}

function sanitizeSize(raw, path, notes) {
  if (raw === undefined) return undefined;
  if (!isFiniteNumber(raw)) {
    notes.push(path + ': ignored (not a finite number)');
    return undefined;
  }
  const clamped = clampNumber(raw, 0, COORD_LIMIT);
  if (clamped !== raw) notes.push(path + ': clamped ' + raw + ' -> ' + clamped);
  return clamped;
}

/** Size sanitizer for elements whose direction matters (arrow): signed.
 *  A negative w/h means the element extends left/up from (x, y), which is how
 *  an arbitrary arrow direction survives the x/y/w/h representation. */
function sanitizeSignedSize(raw, path, notes) {
  if (raw === undefined) return undefined;
  if (!isFiniteNumber(raw)) {
    notes.push(path + ': ignored (not a finite number)');
    return undefined;
  }
  const clamped = clampNumber(raw, -COORD_LIMIT, COORD_LIMIT);
  if (clamped !== raw) notes.push(path + ': clamped ' + raw + ' -> ' + clamped);
  return clamped;
}

function sanitizeTextValue(raw, path, notes) {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') {
    notes.push(path + ': ignored (not a string)');
    return undefined;
  }
  if (raw.length === 0) {
    notes.push(path + ': ignored (empty text; deleting content is the user\'s action)');
    return undefined;
  }
  if (raw.length > LIMITS.textLength) {
    notes.push(path + ': truncated to ' + LIMITS.textLength + ' characters');
    return raw.slice(0, LIMITS.textLength);
  }
  return raw;
}

function sanitizePoints(raw, path, notes) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 4000) {
    notes.push(path + ': ignored (points must be a non-empty list)');
    return undefined;
  }
  const points = [];
  for (const point of raw) {
    if (!Array.isArray(point) || point.length < 2 || !isFiniteNumber(point[0]) || !isFiniteNumber(point[1])) {
      notes.push(path + ': ignored (every point needs two finite numbers)');
      return undefined;
    }
    points.push([point[0], point[1]]);
  }
  return points;
}

/**
 * Normalize one element insert (human or model). Returns
 * `{ ok: true, element }` or `{ ok: false, error }`.
 */
export function normalizeInsert(raw, options) {
  const human = options && options.human === true;
  const notes = (options && options.notes) || [];
  const path = (options && options.path) || 'insert';
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid_object: ' + path + ' is not an object' };
  const types = human ? HUMAN_INSERT_TYPES : AI_INSERT_TYPES;
  if (typeof raw.type !== 'string' || !types.has(raw.type)) {
    return {
      ok: false,
      error: 'unsupported_type: ' + path + '.type ' + JSON.stringify(raw.type)
        + ' (allowed: ' + Array.from(types).join(', ') + ')',
    };
  }
  const x = sanitizeCoord(raw.x, path + '.x', notes);
  const y = sanitizeCoord(raw.y, path + '.y', notes);
  if (x === undefined || y === undefined) return { ok: false, error: 'invalid_object: ' + path + ' needs finite x and y' };
  const defaults = INSERT_DEFAULTS[raw.type] || { w: 0, h: 0 };
  const fields = { x, y };
  if (raw.type === 'pen') {
    const points = sanitizePoints(raw.points, path + '.points', notes);
    if (points === undefined) return { ok: false, error: 'invalid_object: ' + path + ' is a pen stroke, so points are required' };
    fields.points = points;
    fields.color = sanitizeColor(raw.color, path + '.color', notes) || 'ink';
    return { ok: true, element: makeElement('pen', fields, options && options.now ? options.now : Date.now()) };
  }
  const signed = raw.type === 'arrow';
  const w = signed ? sanitizeSignedSize(raw.w, path + '.w', notes) : sanitizeSize(raw.w, path + '.w', notes);
  const h = signed ? sanitizeSignedSize(raw.h, path + '.h', notes) : sanitizeSize(raw.h, path + '.h', notes);
  fields.w = w === undefined ? defaults.w : w;
  fields.h = h === undefined ? defaults.h : h;
  fields.color = sanitizeColor(raw.color, path + '.color', notes) || 'ink';
  if (raw.type === 'text') {
    const text = sanitizeTextValue(raw.text, path + '.text', notes);
    if (text === undefined || text.length === 0) {
      return { ok: false, error: 'invalid_object: ' + path + ' is a text insert, so a non-empty text is required' };
    }
    fields.text = text;
  } else if (raw.text !== undefined) {
    notes.push(path + '.text: ignored (only text inserts carry text)');
  }
  return { ok: true, element: makeElement(raw.type, fields, options && options.now ? options.now : Date.now()) };
}

/* ------------------------------------------------------------------ */
/* Human operations                                                    */
/* ------------------------------------------------------------------ */

function humanReplaceFields(element, raw, notes, path) {
  const type = element.type;
  const allowed = type === 'pen' ? ['color', 'points'] : EDITABLE_FIELDS[type] || [];
  const fields = {};
  for (const field of allowed) {
    if (raw[field] === undefined) continue;
    let value;
    if (field === 'color') value = sanitizeColor(raw[field], path + '.' + field, notes);
    else if (field === 'x' || field === 'y') value = sanitizeCoord(raw[field], path + '.' + field, notes);
    else if (field === 'w' || field === 'h') {
      value = type === 'arrow'
        ? sanitizeSignedSize(raw[field], path + '.' + field, notes)
        : sanitizeSize(raw[field], path + '.' + field, notes);
    }
    else if (field === 'text') value = sanitizeTextValue(raw[field], path + '.' + field, notes);
    else if (field === 'points') value = sanitizePoints(raw[field], path + '.' + field, notes);
    if (value !== undefined) fields[field] = value;
  }
  for (const key of Object.keys(raw)) {
    if (key === 'kind' || key === 'id' || allowed.includes(key)) continue;
    notes.push(path + '.' + key + ': ignored (not an editable field)');
  }
  return fields;
}

/**
 * Apply a batch of human operations (optimistic client input, server-ordered).
 * Returns `{ ok: true, doc, applied, rejected, change }`; `doc` is a new value
 * (unchanged reference when nothing applied).
 */
export function applyHumanOps(doc, ops, author, now) {
  if (!doc || typeof doc !== 'object') return { ok: false, error: 'canvas_not_found' };
  if (!Array.isArray(ops) || ops.length === 0) return { ok: false, error: 'invalid_body: ops must be a non-empty array' };
  if (ops.length > LIMITS.patchOps) return { ok: false, error: 'too_large: at most ' + LIMITS.patchOps + ' operations per batch' };
  const notes = [];
  const rejected = [];
  const applied = [];
  const changeOps = [];
  const elements = { ...doc.elements };
  let effective = false;

  for (let i = 0; i < ops.length; i += 1) {
    const raw = ops[i];
    const path = 'ops[' + i + ']';
    if (!raw || typeof raw !== 'object') { rejected.push({ index: i, reason: 'invalid_op' }); continue; }
    if (raw.kind === 'insert') {
      if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > 80) {
        rejected.push({ index: i, id: raw.id, reason: 'invalid_id' });
        continue;
      }
      if (elements[raw.id]) { rejected.push({ index: i, id: raw.id, reason: 'duplicate_id' }); continue; }
      if (Object.keys(elements).length >= LIMITS.elements) { rejected.push({ index: i, reason: 'too_many_elements' }); continue; }
      const normalized = normalizeInsert(raw, { human: true, notes, path, now });
      if (!normalized.ok) { rejected.push({ index: i, id: raw.id, reason: normalized.error }); continue; }
      const element = normalized.element;
      element.id = raw.id;
      element.origin = 'user';
      element.sessionId = author && author.sessionId ? String(author.sessionId) : null;
      elements[element.id] = element;
      changeOps.push({ kind: 'insert', id: element.id, element: { ...element } });
      applied.push({ kind: 'insert', id: element.id });
      effective = true;
      continue;
    }
    const id = typeof raw.id === 'string' ? raw.id : '';
    const target = elements[id];
    if (!target) { rejected.push({ index: i, id: id || null, reason: 'missing' }); continue; }
    if (raw.kind === 'delete') {
      delete elements[id];
      changeOps.push({ kind: 'delete', id: id, element: { ...target } });
      applied.push({ kind: 'delete', id: id });
      effective = true;
      continue;
    }
    if (raw.kind !== 'replace') { rejected.push({ index: i, id: id, reason: 'invalid_kind' }); continue; }
    const source = raw.fields && typeof raw.fields === 'object' ? raw.fields : raw;
    const fields = humanReplaceFields(target, source, notes, path);
    const next = { ...target, fieldRevs: { ...target.fieldRevs } };
    const changed = {};
    for (const [field, value] of Object.entries(fields)) {
      if (sameValue(next[field], value)) continue;
      const currentRev = fieldRev(next, field);
      next[field] = value;
      next.fieldRevs[field] = currentRev + 1;
      changed[field] = { from: target[field] === undefined ? null : target[field], to: value, revAfter: currentRev + 1 };
    }
    if (Object.keys(changed).length === 0) {
      if (Object.keys(fields).length === 0) rejected.push({ index: i, id: id, reason: 'no_usable_field' });
      continue;
    }
    next.rev = (target.rev || 0) + 1;
    next.origin = 'user';
    next.sessionId = author && author.sessionId ? String(author.sessionId) : target.sessionId;
    next.updatedAt = now;
    elements[id] = next;
    changeOps.push({ kind: 'replace', id: id, fields: changed });
    applied.push({ kind: 'replace', id: id, fields: Object.keys(changed) });
    effective = true;
  }

  if (!effective) {
    return { ok: true, doc, applied: [], rejected, change: null, notes };
  }
  const nextDoc = {
    ...doc,
    rev: doc.rev + 1,
    updatedAt: now,
    elements,
  };
  const change = {
    seq: nextDoc.rev,
    patchId: makePatchId(),
    claimId: null,
    author: {
      kind: 'user',
      sessionId: author && author.sessionId ? String(author.sessionId) : null,
      turnId: null,
      parentSessionId: null,
    },
    baseRev: doc.rev,
    ops: changeOps,
    result: 'applied',
    conflicts: [],
    at: now,
  };
  nextDoc.changes = doc.changes.concat([change]);
  return { ok: true, doc: nextDoc, applied, rejected, change, notes };
}

/* ------------------------------------------------------------------ */
/* Claims: basis capture and model patch normalization                 */
/* ------------------------------------------------------------------ */

export function captureBasis(doc, ids) {
  const basis = {};
  for (const id of ids) {
    const element = doc.elements[id];
    if (!element) continue;
    const fields = REV_FIELDS[element.type] || [];
    const entry = {};
    for (const field of fields) entry[field] = fieldRev(element, field);
    basis[id] = entry;
  }
  return basis;
}

/**
 * Validate and normalize one model patch (`whiteboard_replace_selection`
 * arguments). Staging only — merging happens at turn end.
 */
export function normalizeModelPatch(doc, claim, input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_proposal: body is not an object' };
  const replaceIn = input.replace === undefined ? [] : input.replace;
  const insertIn = input.insert === undefined ? [] : input.insert;
  if (!Array.isArray(replaceIn) || !Array.isArray(insertIn)) {
    return { ok: false, error: 'invalid_proposal: replace and insert must be arrays' };
  }
  if (replaceIn.length === 0 && insertIn.length === 0) {
    return { ok: false, error: 'invalid_proposal: empty patch (nothing to change)' };
  }
  if (replaceIn.length > LIMITS.patchOps) return { ok: false, error: 'too_large: at most ' + LIMITS.patchOps + ' replace entries' };
  if (insertIn.length > LIMITS.insertsPerCall) return { ok: false, error: 'too_large: at most ' + LIMITS.insertsPerCall + ' inserts per call' };

  const claimed = new Set(claim.ids);
  const notes = [];
  const ignored = [];
  const accepted = [];
  const replace = [];
  const replaceAt = new Map();

  for (let i = 0; i < replaceIn.length; i += 1) {
    const raw = replaceIn[i];
    const path = 'replace[' + i + ']';
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid_object: ' + path + ' is not an object' };
    const id = typeof raw.id === 'string' ? raw.id : '';
    if (!claimed.has(id)) {
      return { ok: false, error: 'outside_selection: ' + path + '.id ' + JSON.stringify(raw.id) + ' is not part of the claim' };
    }
    const element = doc.elements[id];
    if (!element) { ignored.push({ id: id, reason: 'missing' }); continue; }
    if (element.type === 'pen') {
      return { ok: false, error: 'unsupported_type: ' + path + '.id ' + id + ' is a pen stroke; strokes are read-only' };
    }
    if (raw.type !== undefined && raw.type !== element.type) notes.push(path + '.type: ignored (type cannot be changed)');
    const allowed = EDITABLE_FIELDS[element.type] || [];
    const source = raw.fields && typeof raw.fields === 'object' ? raw.fields : raw;
    const fields = {};
    for (const field of allowed) {
      if (source[field] === undefined) continue;
      let value;
      if (field === 'color') value = sanitizeColor(source[field], path + '.' + field, notes);
      else if (field === 'x' || field === 'y') value = sanitizeCoord(source[field], path + '.' + field, notes);
      else if (field === 'w' || field === 'h') {
        value = element.type === 'arrow'
          ? sanitizeSignedSize(source[field], path + '.' + field, notes)
          : sanitizeSize(source[field], path + '.' + field, notes);
      }
      else if (field === 'text') value = sanitizeTextValue(source[field], path + '.' + field, notes);
      if (value !== undefined) fields[field] = value;
    }
    for (const key of Object.keys(source)) {
      if (key === 'id' || key === 'type' || allowed.includes(key)) continue;
      notes.push(path + '.' + key + ': ignored (not an editable field)');
    }
    if (Object.keys(fields).length === 0) { ignored.push({ id: id, reason: 'no_usable_field' }); continue; }
    const at = replaceAt.get(id);
    if (at !== undefined) {
      replace[at].fields = Object.assign({}, replace[at].fields, fields);
      notes.push(path + ': merged into the earlier replace for ' + id);
    } else {
      replaceAt.set(id, replace.length);
      replace.push({ id: id, fields: fields });
      accepted.push({ id: id, fields: Object.keys(fields) });
    }
  }

  const insert = [];
  const insertAt = new Map();
  let serial = 0;
  for (let i = 0; i < insertIn.length; i += 1) {
    const raw = insertIn[i];
    const path = 'insert[' + i + ']';
    const normalized = normalizeInsert(raw, { notes, path, now: Date.now() });
    if (!normalized.ok) return { ok: false, error: normalized.error };
    serial += 1;
    const element = normalized.element;
    const tempId = 'new:' + serial;
    element.id = tempId;
    const at = insertAt.get(tempId);
    if (at !== undefined) { insert[at] = element; notes.push(path + ': replaced the earlier insert with id ' + tempId); continue; }
    insertAt.set(tempId, insert.length);
    insert.push(element);
    accepted.push({ id: tempId, type: element.type });
  }

  return { ok: true, accepted, ignored, normalized: notes, replace, insert };
}

/* ------------------------------------------------------------------ */
/* Turn-end merge                                                      */
/* ------------------------------------------------------------------ */

function claimSuffix(claimId) {
  const match = /^lk-([a-z0-9]+)-([a-z0-9]+)$/.exec(claimId || '');
  return match ? match[2] : randomToken(4);
}

/**
 * Merge a claim's staged patch into the canvas. Field-level optimistic check:
 * a field applies only when its current rev equals the claim basis rev; other
 * fields are reported as conflicts and left untouched (the human edit wins).
 */
export function mergeClaimIntoDoc(doc, claim, now) {
  const stagedReplace = claim.staged && Array.isArray(claim.staged.replace) ? claim.staged.replace : [];
  const stagedInsert = claim.staged && Array.isArray(claim.staged.insert) ? claim.staged.insert : [];
  if (stagedReplace.length === 0 && stagedInsert.length === 0) {
    return { ok: true, doc, result: 'empty', conflicts: [], change: null, applied: 0 };
  }
  const elements = { ...doc.elements };
  const changeOps = [];
  const conflicts = [];
  let applied = 0;

  for (const item of stagedReplace) {
    const target = elements[item.id];
    if (!target) { conflicts.push({ id: item.id, field: null, reason: 'missing' }); continue; }
    const basis = (claim.basis && claim.basis[item.id]) || {};
    const next = { ...target, fieldRevs: { ...target.fieldRevs } };
    const fields = {};
    for (const [field, value] of Object.entries(item.fields || {})) {
      const currentRev = fieldRev(next, field);
      const baseRev = isFiniteNumber(basis[field]) ? basis[field] : 0;
      if (currentRev !== baseRev) {
        conflicts.push({ id: item.id, field: field, reason: 'stale_base' });
        continue;
      }
      if (sameValue(next[field], value)) continue;
      next[field] = value;
      next.fieldRevs[field] = currentRev + 1;
      fields[field] = { from: target[field] === undefined ? null : target[field], to: value, revAfter: currentRev + 1 };
    }
    if (Object.keys(fields).length === 0) continue;
    next.rev = (target.rev || 0) + 1;
    next.origin = 'ai';
    next.turnId = claim.turnId === undefined ? null : claim.turnId;
    next.sessionId = claim.ownerSessionId || null;
    next.parentSessionId = claim.parentSessionId || null;
    next.updatedAt = now;
    elements[item.id] = next;
    changeOps.push({ kind: 'replace', id: item.id, fields: fields });
    applied += Object.keys(fields).length;
  }

  const suffix = claimSuffix(claim.claimId);
  let serial = 0;
  for (const staged of stagedInsert) {
    if (Object.keys(elements).length >= LIMITS.elements) {
      conflicts.push({ id: staged.id || null, field: null, reason: 'too_many_elements' });
      continue;
    }
    serial += 1;
    const element = { ...staged, id: 'el-ai-' + suffix + '-' + serial, rev: 0, updatedAt: now };
    element.origin = 'ai';
    element.turnId = claim.turnId === undefined ? null : claim.turnId;
    element.sessionId = claim.ownerSessionId || null;
    element.parentSessionId = claim.parentSessionId || null;
    elements[element.id] = element;
    changeOps.push({ kind: 'insert', id: element.id, element: { ...element } });
    applied += 1;
  }

  if (changeOps.length === 0) {
    return {
      ok: true,
      doc,
      result: conflicts.length > 0 ? 'conflict' : 'empty',
      conflicts,
      change: null,
      applied: 0,
    };
  }
  const nextDoc = {
    ...doc,
    rev: doc.rev + 1,
    updatedAt: now,
    elements,
  };
  const change = {
    seq: nextDoc.rev,
    patchId: makePatchId(),
    claimId: claim.claimId,
    author: {
      kind: 'ai',
      sessionId: claim.ownerSessionId || null,
      turnId: claim.turnId === undefined ? null : claim.turnId,
      parentSessionId: claim.parentSessionId || null,
    },
    baseRev: doc.rev,
    ops: changeOps,
    result: conflicts.length > 0 ? 'partial' : 'applied',
    conflicts,
    at: now,
  };
  nextDoc.changes = doc.changes.concat([change]);
  return { ok: true, doc: nextDoc, result: change.result, conflicts, change, applied };
}

/* ------------------------------------------------------------------ */
/* Selective undo                                                      */
/* ------------------------------------------------------------------ */

/**
 * Undo one logged change (selectively): replace fields revert only when their
 * current rev still equals the rev recorded at apply time; an inserted element
 * is removed only when nobody edited it since; a delete is restored only when
 * the id is still free.
 */
export function undoChange(doc, seq, author, now) {
  const target = doc.changes.find((change) => change.seq === seq);
  if (!target) return { ok: false, error: 'unknown_change: no change with seq ' + JSON.stringify(seq) };
  const elements = { ...doc.elements };
  const changeOps = [];
  const applied = [];
  const skipped = [];

  for (let i = target.ops.length - 1; i >= 0; i -= 1) {
    const op = target.ops[i];
    if (op.kind === 'replace') {
      const element = elements[op.id];
      if (!element) { skipped.push({ id: op.id, reason: 'missing' }); continue; }
      const next = { ...element, fieldRevs: { ...element.fieldRevs } };
      const fields = {};
      for (const [field, record] of Object.entries(op.fields || {})) {
        const currentRev = fieldRev(next, field);
        if (currentRev !== record.revAfter) { skipped.push({ id: op.id, field: field, reason: 'changed_since' }); continue; }
        if (!sameValue(next[field], record.to)) { skipped.push({ id: op.id, field: field, reason: 'changed_since' }); continue; }
        next[field] = record.from;
        next.fieldRevs[field] = currentRev + 1;
        fields[field] = { from: record.to, to: record.from, revAfter: currentRev + 1 };
      }
      if (Object.keys(fields).length === 0) continue;
      next.rev = (element.rev || 0) + 1;
      next.origin = 'user';
      next.sessionId = author && author.sessionId ? String(author.sessionId) : element.sessionId;
      next.updatedAt = now;
      elements[op.id] = next;
      changeOps.push({ kind: 'replace', id: op.id, fields: fields });
      applied.push({ kind: 'replace', id: op.id, fields: Object.keys(fields) });
      continue;
    }
    if (op.kind === 'insert') {
      const element = elements[op.id];
      if (!element) { skipped.push({ id: op.id, reason: 'missing' }); continue; }
      if ((element.rev || 0) > 0) { skipped.push({ id: op.id, reason: 'changed_since' }); continue; }
      delete elements[op.id];
      changeOps.push({ kind: 'delete', id: op.id, element: { ...element } });
      applied.push({ kind: 'delete', id: op.id });
      continue;
    }
    if (op.kind === 'delete') {
      if (elements[op.id]) { skipped.push({ id: op.id, reason: 'exists' }); continue; }
      const restored = { ...op.element };
      elements[op.id] = restored;
      changeOps.push({ kind: 'insert', id: op.id, element: { ...restored } });
      applied.push({ kind: 'insert', id: op.id });
    }
  }

  if (changeOps.length === 0) {
    return { ok: true, doc, applied: [], skipped, change: null };
  }
  const nextDoc = {
    ...doc,
    rev: doc.rev + 1,
    updatedAt: now,
    elements,
  };
  const change = {
    seq: nextDoc.rev,
    patchId: makePatchId(),
    claimId: null,
    author: {
      kind: 'user',
      sessionId: author && author.sessionId ? String(author.sessionId) : null,
      turnId: null,
      parentSessionId: null,
    },
    baseRev: doc.rev,
    ops: changeOps,
    result: 'applied',
    conflicts: [],
    undoOf: seq,
    at: now,
  };
  nextDoc.changes = doc.changes.concat([change]);
  return { ok: true, doc: nextDoc, applied, skipped, change };
}

/* ------------------------------------------------------------------ */
/* Selection translation (v3 model-facing read, DECISIONS B5)          */
/* ------------------------------------------------------------------ */

const TRANSLATION_TEXT_LIMIT = 120;

/** `#2f6fed（accent）`: the hex the model should see plus the palette id it
 *  may write back. Unknown colors fall back to ink. */
function translationColorLabel(color) {
  const text = typeof color === 'string' ? color.trim().toLowerCase() : '';
  if (COLOR_IDS.has(text)) return PALETTE_HEX[text] + '（' + text + '）';
  const hex = normalizeHexColor(text);
  if (hex !== null) return hex + '（' + paletteIdForHex(hex) + '）';
  return PALETTE_HEX.ink + '（ink）';
}

function translationNumber(value) {
  if (!isFiniteNumber(value)) return '0';
  const rounded = Math.round(value);
  return String(rounded === 0 ? 0 : rounded);
}

function translationEndpoint(origin, delta) {
  const base = isFiniteNumber(origin) ? origin : 0;
  const size = isFiniteNumber(delta) ? delta : 0;
  return translationNumber(base + size);
}

function translationText(raw) {
  const text = String(raw === undefined || raw === null ? '' : raw).replace(/\s+/g, ' ').trim();
  return text.length > TRANSLATION_TEXT_LIMIT ? text.slice(0, TRANSLATION_TEXT_LIMIT) + '…' : text;
}

function translationObjectLine(object) {
  const id = typeof object.id === 'string' ? object.id : '';
  const color = translationColorLabel(object.color);
  if (object.type === 'rect' || object.type === 'ellipse') {
    return '- ' + id + ' · ' + (object.type === 'rect' ? '矩形' : '椭圆')
      + ' · 位置(' + translationNumber(object.x) + ',' + translationNumber(object.y) + ') · '
      + translationNumber(object.w) + '×' + translationNumber(object.h) + ' · 填充 ' + color;
  }
  if (object.type === 'arrow') {
    return '- ' + id + ' · 箭头 · (' + translationNumber(object.x) + ',' + translationNumber(object.y)
      + ') → (' + translationEndpoint(object.x, object.w) + ',' + translationEndpoint(object.y, object.h)
      + ') · 描边 ' + color + ' · 线宽 2.2';
  }
  if (object.type === 'text') {
    return '- ' + id + ' · 文本 · 位置(' + translationNumber(object.x) + ',' + translationNumber(object.y)
      + ') · 字号 22 · 颜色 ' + color + ' · 内容「' + translationText(object.text) + '」';
  }
  return '- ' + id + ' · ' + (typeof object.type === 'string' ? object.type : '对象');
}

/**
 * DECISIONS B5 translation: one header line (canvas name · object count · rev)
 * plus one line per object. Pure; used by the read tool's render. `invalid`
 * entries may be ids or `{ id, reason }`.
 */
export function translateSelection(value) {
  const objects = value && Array.isArray(value.objects) ? value.objects : [];
  const invalid = value && Array.isArray(value.invalid) ? value.invalid : [];
  const name = value && typeof value.canvasName === 'string' && value.canvasName.length > 0 ? value.canvasName : '画板';
  const rev = value && isFiniteNumber(value.rev) ? value.rev : 0;
  const lines = ['【画板选区引用】' + name + ' · ' + objects.length + ' 个对象 · rev ' + rev];
  for (const object of objects) {
    if (object && typeof object === 'object') lines.push(translationObjectLine(object));
  }
  for (const entry of invalid) {
    if (entry === null || entry === undefined) continue;
    const id = typeof entry === 'string' ? entry : typeof entry.id === 'string' ? entry.id : '';
    if (id === '') continue;
    const reason = typeof entry === 'string' ? 'missing' : entry.reason;
    lines.push('- ' + id + (reason === 'pen' ? ' · 笔迹（只读，未返回）' : ' · 已删除（invalid）'));
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Client serialization / import validation                            */
/* ------------------------------------------------------------------ */

export function serializeCanvas(doc, options) {
  const tail = options && isFiniteNumber(options.changesTail) ? options.changesTail : LIMITS.changesTail;
  return {
    schemaVersion: doc.schemaVersion,
    id: doc.id,
    name: doc.name,
    rev: doc.rev,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    elements: Object.values(doc.elements),
    changes: doc.changes.slice(Math.max(0, doc.changes.length - tail)),
  };
}

export function isCanvasShape(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.schemaVersion !== CANVAS_SCHEMA_VERSION) return false;
  if (!isSafeKey(value.id)) return false;
  if (!isFiniteNumber(value.rev) || value.rev < 0) return false;
  if (!value.elements || typeof value.elements !== 'object' || Array.isArray(value.elements)) return false;
  if (!Array.isArray(value.changes)) return false;
  for (const [id, element] of Object.entries(value.elements)) {
    if (!element || typeof element !== 'object') return false;
    if (element.id !== id) return false;
    if (!ELEMENT_TYPES.has(element.type)) return false;
  }
  return true;
}


