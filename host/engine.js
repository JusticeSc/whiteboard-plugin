/**
 * Canvas engine: the single writer over the durable canvas documents. Routes
 * and model tools both call into this module; it owns the claim table, the
 * turn-end commit path, idempotent request handling and the v3 model tools
 * (translation read + immediate atomic write, human edits winning field by
 * field).
 *
 * See docs/adr/0002-canvas-authority.md §4 and docs/adr/0003-canvas-agent-bridge.md §5.2.
 */

import { CLAIM_TTL_MS, HOST_SCHEMA_VERSION, LIMITS } from './constants.js';
import { createClaims, publicClaim } from './claims.js';
import {
  applyHumanOps,
  captureBasis,
  createCanvas,
  isCanvasShape,
  isFiniteNumber,
  makeCanvasId,
  makeClaimId,
  mergeClaimIntoDoc,
  normalizeModelPatch,
  serializeCanvas,
  undoChange,
} from './model.js';

export function createEngine(options) {
  const store = options.store;
  const now = options.now || Date.now;
  const claims = createClaims(now);

  let readyPromise = null;
  let defaultId = null;
  let defaulting = null;
  const idempotent = new Map();

  /* v3 model tools: the read keeps a short-lived field basis per
     (session, canvas) so a human edit made after the read can be reported as a
     field-level conflict (human wins) even though the patch itself is written
     in one atomic mutate. The basis is internal: it is never exposed to the
     model, never shows up in /sync, and nothing is staged, so the turn-end
     commit path finds no claim for these writes. */
  const readBases = new Map();

  function readBasisKey(sessionId, canvasId) {
    return String(sessionId) + '\n' + canvasId;
  }

  function sweepReadBases() {
    const t = now();
    for (const [key, entry] of readBases) {
      if (t - entry.at > CLAIM_TTL_MS) readBases.delete(key);
    }
  }

  function rememberReadBasis(sessionId, canvasId, doc, ids) {
    if (!sessionId || ids.length === 0) return;
    sweepReadBases();
    readBases.set(readBasisKey(sessionId, canvasId), {
      canvasId: canvasId,
      ids: ids.slice(),
      basis: captureBasis(doc, ids),
      rev: doc.rev,
      at: now(),
    });
    while (readBases.size > LIMITS.idempotency) {
      const oldest = readBases.keys().next();
      if (oldest.done) break;
      readBases.delete(oldest.value);
    }
  }

  function readBasisFor(sessionId, canvasId) {
    if (!sessionId) return null;
    sweepReadBases();
    return readBases.get(readBasisKey(sessionId, canvasId)) || null;
  }

  function forgetReadBasis(sessionId, canvasId) {
    if (!sessionId) return;
    readBases.delete(readBasisKey(sessionId, canvasId));
  }

  function fieldBasis(doc, ids, prior) {
    const basis = {};
    for (const id of ids) {
      if (!doc.elements[id]) continue;
      if (prior && Array.isArray(prior.ids) && prior.ids.includes(id) && prior.basis && prior.basis[id]) {
        basis[id] = prior.basis[id];
      } else {
        basis[id] = captureBasis(doc, [id])[id] || {};
      }
    }
    return basis;
  }

  function modelObject(element) {
    const object = {
      id: element.id,
      type: element.type,
      x: isFiniteNumber(element.x) ? element.x : 0,
      y: isFiniteNumber(element.y) ? element.y : 0,
      w: isFiniteNumber(element.w) ? element.w : 0,
      h: isFiniteNumber(element.h) ? element.h : 0,
      color: typeof element.color === 'string' ? element.color : 'ink',
      rev: isFiniteNumber(element.rev) ? element.rev : 0,
    };
    /* Only text elements carry `text`: a missing key keeps the tool result
       lossless JSON (an `undefined` value fails the Host's output check). */
    if (element.type === 'text' && typeof element.text === 'string') object.text = element.text;
    return object;
  }

  function failure(error, status) {
    return { ok: false, error: error, status: status };
  }

  /** Normalize a proposal error to a readable `code: message` string. */
  function readableProposalError(error) {
    const text = String(error || 'invalid_proposal: the patch could not be applied');
    const code = text.split(':')[0];
    if (code === 'invalid_proposal' || code === 'too_large' || code === 'canvas_not_found'
      || code === 'stale_revision' || code === 'ai_disabled') return text;
    return 'invalid_proposal: ' + text;
  }

  function statusForProposal(error) {
    const code = String(error || '').split(':')[0];
    if (code === 'canvas_not_found') return 404;
    if (code === 'stale_revision') return 409;
    if (code === 'too_large') return 413;
    if (code === 'ai_disabled') return 403;
    return 400;
  }

  function isPlainRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function ready() {
    if (!readyPromise) readyPromise = store.open();
    return readyPromise;
  }

  function remember(key, result) {
    idempotent.set(key, { at: now(), result: result });
    if (idempotent.size > LIMITS.idempotency) {
      let oldestKey = null;
      let oldestAt = Infinity;
      for (const [candidate, entry] of idempotent) {
        if (entry.at < oldestAt) { oldestAt = entry.at; oldestKey = candidate; }
      }
      if (oldestKey !== null) idempotent.delete(oldestKey);
    }
  }

  function replay(key) {
    const hit = idempotent.get(key);
    return hit ? hit.result : null;
  }

  async function ensureDefault() {
    if (defaultId) {
      const doc = store.getCanvas(defaultId);
      if (doc) return doc;
      defaultId = null;
    }
    if (defaulting) return defaulting;
    defaulting = (async () => {
      const global = store.getGlobal();
      const storedId = global && typeof global.defaultCanvasId === 'string' ? global.defaultCanvasId : null;
      if (storedId) {
        const doc = store.getCanvas(storedId);
        if (doc) { defaultId = doc.id; return doc; }
      }
      const doc = createCanvas(makeCanvasId(), '画板', now());
      await store.createCanvasRecord(doc);
      await store.setGlobal({ schemaVersion: HOST_SCHEMA_VERSION, defaultCanvasId: doc.id, updatedAt: now() });
      defaultId = doc.id;
      return doc;
    })().finally(() => { defaulting = null; });
    return defaulting;
  }

  async function getCanvas(id) {
    await ready();
    if (typeof id === 'string' && id.length > 0) {
      let doc = store.getCanvas(id);
      if (doc) return doc;
      // A session may remember a canvas that was never created on this Host.
      return null;
    }
    return ensureDefault();
  }

  async function createCanvasDocument(name) {
    await ready();
    const doc = createCanvas(makeCanvasId(), name, now());
    await store.createCanvasRecord(doc);
    const global = store.getGlobal();
    if (!global || typeof global.defaultCanvasId !== 'string') {
      await store.setGlobal({ schemaVersion: HOST_SCHEMA_VERSION, defaultCanvasId: doc.id, updatedAt: now() });
      defaultId = doc.id;
    }
    return doc;
  }

  async function applyOps(payload) {
    await ready();
    const { canvasId, sessionId, ops, requestId } = payload || {};
    const key = 'op:' + canvasId + ':' + requestId;
    if (typeof requestId === 'string' && requestId.length > 0) {
      const cached = replay(key);
      if (cached) return Object.assign({}, cached, { replayed: true });
    }
    const outcome = await store.mutateCanvas(canvasId, (current) => {
      const applied = applyHumanOps(current, ops, { kind: 'user', sessionId: sessionId ? String(sessionId) : null }, now());
      if (!applied.ok) return { ok: false, error: applied.error };
      return {
        doc: applied.doc,
        applied: applied.applied,
        rejected: applied.rejected,
        change: applied.change,
        notes: applied.notes || [],
      };
    });
    if (!outcome.ok) return outcome;
    const result = {
      ok: true,
      rev: outcome.doc.rev,
      applied: outcome.applied || [],
      rejected: outcome.rejected || [],
      notes: outcome.notes || [],
      changeSeq: outcome.change ? outcome.change.seq : null,
      change: outcome.change || null,
    };
    if (typeof requestId === 'string' && requestId.length > 0) remember(key, result);
    return result;
  }

  async function undo(payload) {
    await ready();
    const { canvasId, sessionId, seq, requestId } = payload || {};
    const key = 'undo:' + canvasId + ':' + requestId;
    if (typeof requestId === 'string' && requestId.length > 0) {
      const cached = replay(key);
      if (cached) return Object.assign({}, cached, { replayed: true });
    }
    const outcome = await store.mutateCanvas(canvasId, (current) => {
      const applied = undoChange(current, seq, { kind: 'user', sessionId: sessionId ? String(sessionId) : null }, now());
      if (!applied.ok) return { ok: false, error: applied.error };
      return { doc: applied.doc, applied: applied.applied, skipped: applied.skipped, change: applied.change };
    });
    if (!outcome.ok) return outcome;
    const result = {
      ok: true,
      rev: outcome.doc.rev,
      applied: outcome.applied || [],
      skipped: outcome.skipped || [],
      changeSeq: outcome.change ? outcome.change.seq : null,
      change: outcome.change || null,
    };
    if (typeof requestId === 'string' && requestId.length > 0) remember(key, result);
    return result;
  }

  async function createClaim(payload) {
    await ready();
    const { canvasId, ids, sessionId } = payload || {};
    const doc = await getCanvas(canvasId);
    if (!doc) return { ok: false, error: 'canvas_not_found', status: 404 };
    const created = claims.create({ canvasId: doc.id, ids: ids, sessionId: sessionId ? String(sessionId) : '', doc: doc });
    if (!created.ok) return created;
    return { ok: true, claim: publicClaim(created.claim, now()) };
  }

  async function heartbeatClaim(payload) {
    await ready();
    const result = claims.heartbeat(payload && payload.claimId, payload && payload.sessionId ? String(payload.sessionId) : '');
    if (!result.ok) return result;
    return { ok: true, claim: publicClaim(result.claim, now()) };
  }

  async function abortClaim(payload) {
    await ready();
    const result = claims.abort(payload && payload.claimId, payload && payload.sessionId ? String(payload.sessionId) : '', payload && payload.reason);
    if (!result.ok) return result;
    return { ok: true, claimId: result.claim.claimId, reason: result.reason };
  }

  function claimForSession(sessionId, canvasId) {
    return claims.ofSession(String(sessionId), canvasId);
  }

  function stagePatch(claim, input) {
    return normalizeModelPatch(store.getCanvas(claim.canvasId), claim, input);
  }

  async function stageClaimPatch(claim, input) {
    const normalized = stagePatch(claim, input);
    if (!normalized.ok) return normalized;
    const staged = claims.stage(claim, normalized);
    if (!staged.ok) return staged;
    return {
      ok: true,
      claimId: claim.claimId,
      accepted: normalized.accepted,
      ignored: normalized.ignored,
      normalized: normalized.normalized,
      staged: claim.stagedCount,
    };
  }

  /**
   * v3 read: translate the requested objects (all non-pen objects when ids is
   * omitted) plus the canvas rev. Also remembers a short-lived field basis used
   * by the next atomic write to report human edits as conflicts.
   */
  async function readModelSelection(payload) {
    await ready();
    const input = payload || {};
    const canvasId = typeof input.canvasId === 'string' ? input.canvasId.trim() : '';
    if (canvasId === '') return failure('canvas_not_found: canvasId is required to read a whiteboard canvas.', 400);
    const doc = await getCanvas(canvasId);
    if (!doc) return failure('canvas_not_found: no canvas with id ' + JSON.stringify(canvasId) + ' exists on this Host.', 404);
    if (input.expectRev !== undefined && input.expectRev !== null) {
      if (!isFiniteNumber(input.expectRev)) return failure('invalid_proposal: expectRev must be a number.', 400);
      if (input.expectRev !== doc.rev) {
        return failure('stale_revision: canvas is at rev ' + doc.rev + ', expected ' + input.expectRev
          + '; call whiteboard_read_selection again for fresh data', 409);
      }
    }
    let ids;
    if (input.ids !== undefined && input.ids !== null) {
      if (!Array.isArray(input.ids)) return failure('invalid_proposal: ids must be an array of object ids.', 400);
      const unique = [];
      for (const raw of input.ids) {
        if (typeof raw !== 'string' || raw.length === 0) return failure('invalid_proposal: ids must be non-empty strings.', 400);
        if (!unique.includes(raw)) unique.push(raw);
      }
      if (unique.length > LIMITS.claimIds) {
        return failure('too_large: limit ' + LIMITS.claimIds + ' objects per read, but ' + unique.length
          + ' ids were passed; pass fewer ids.', 413);
      }
      ids = unique;
    } else {
      ids = Object.keys(doc.elements).filter((id) => doc.elements[id] && doc.elements[id].type !== 'pen');
      if (ids.length > LIMITS.claimIds) {
        return failure('too_large: limit ' + LIMITS.claimIds + ' objects per read, but this canvas has ' + ids.length
          + '; pass ids to read a smaller selection.', 413);
      }
    }
    const objects = [];
    const invalid = [];
    const liveIds = [];
    for (const id of ids) {
      const element = doc.elements[id];
      if (!element) { invalid.push(id); continue; }
      /* Pen strokes are human-only and read-only: never returned. */
      if (element.type === 'pen') continue;
      objects.push(modelObject(element));
      liveIds.push(id);
    }
    const sessionId = input.sessionId === undefined || input.sessionId === null ? '' : String(input.sessionId);
    rememberReadBasis(sessionId, doc.id, doc, liveIds);
    return { ok: true, canvasId: doc.id, canvasName: doc.name, rev: doc.rev, objects: objects, invalid: invalid };
  }

  /**
   * v3 write: one atomic read-modify-write. `expectRev` is verified inside the
   * mutate callback; the patch is normalized/staged through the v2 merge
   * machinery so a field the human changed after the read is reported as a
   * conflict and keeps the human value. No claim is registered: nothing is left
   * for the turn-end commit to apply.
   */
  async function applyModelPatch(payload) {
    await ready();
    const input = payload || {};
    const canvasId = typeof input.canvasId === 'string' ? input.canvasId.trim() : '';
    if (canvasId === '') return failure('canvas_not_found: canvasId is required to write to a whiteboard canvas.', 400);
    const doc = await getCanvas(canvasId);
    if (!doc) return failure('canvas_not_found: no canvas with id ' + JSON.stringify(canvasId) + ' exists on this Host.', 404);
    const expectRev = input.expectRev;
    if (!isFiniteNumber(expectRev)) {
      return failure('invalid_proposal: expectRev is required and must be a number; call whiteboard_read_selection first and pass the rev it returned.', 400);
    }
    const patchesIn = input.patches === undefined || input.patches === null ? [] : input.patches;
    const insertsIn = input.inserts === undefined || input.inserts === null ? [] : input.inserts;
    if (!Array.isArray(patchesIn)) return failure('invalid_proposal: patches must be an array of { id, set }.', 400);
    if (!Array.isArray(insertsIn)) return failure('invalid_proposal: inserts must be an array.', 400);
    if (patchesIn.length === 0 && insertsIn.length === 0) {
      return failure('invalid_proposal: empty patch; pass patches and/or inserts.', 400);
    }
    if (patchesIn.length > LIMITS.patchOps) return failure('too_large: at most ' + LIMITS.patchOps + ' patches per call.', 413);
    if (insertsIn.length > LIMITS.insertsPerCall) return failure('too_large: at most ' + LIMITS.insertsPerCall + ' inserts per call.', 413);
    const replace = [];
    for (let i = 0; i < patchesIn.length; i += 1) {
      const raw = patchesIn[i];
      const path = 'patches[' + i + ']';
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return failure('invalid_proposal: ' + path + ' is not an object.', 400);
      if (typeof raw.id !== 'string' || raw.id.length === 0) return failure('invalid_proposal: ' + path + '.id must be a non-empty string.', 400);
      if (!raw.set || typeof raw.set !== 'object' || Array.isArray(raw.set)) {
        return failure('invalid_proposal: ' + path + '.set must be an object of fields.', 400);
      }
      replace.push({ id: raw.id, fields: raw.set });
    }
    const sessionId = input.sessionId === undefined || input.sessionId === null ? '' : String(input.sessionId);
    const patchIds = [];
    for (const item of replace) {
      if (!patchIds.includes(item.id)) patchIds.push(item.id);
    }
    const claim = {
      claimId: makeClaimId(),
      canvasId: doc.id,
      ids: patchIds.slice(),
      ownerSessionId: sessionId === '' ? null : sessionId,
      basis: fieldBasis(doc, patchIds, readBasisFor(sessionId, doc.id)),
      staged: { replace: [], insert: [] },
      stagedCount: 0,
      status: 'open',
      reason: null,
      turnId: null,
      parentSessionId: null,
      createdAt: now(),
      heartbeatAt: now(),
      expiresAt: now() + CLAIM_TTL_MS,
    };
    const normalized = normalizeModelPatch(doc, claim, { replace: replace, insert: insertsIn });
    if (!normalized.ok) return failure(readableProposalError(normalized.error), statusForProposal(normalized.error));
    const staged = claims.stage(claim, normalized);
    if (!staged.ok) return failure(readableProposalError(staged.error), statusForProposal(staged.error));
    const outcome = await store.mutateCanvas(doc.id, (current) => {
      if (current.rev !== expectRev) {
        return {
          ok: false,
          error: 'stale_revision: canvas is at rev ' + current.rev + ', expected ' + expectRev
            + '; call whiteboard_read_selection again and retry',
        };
      }
      const merged = mergeClaimIntoDoc(current, claim, now());
      return { doc: merged.doc, merged: merged };
    });
    if (!outcome.ok) return failure(readableProposalError(outcome.error), statusForProposal(outcome.error));
    const merged = outcome.merged || { doc: outcome.doc, conflicts: [], change: null };
    const applied = [];
    const inserted = [];
    if (merged.change) {
      for (const op of merged.change.ops) {
        if (op.kind === 'replace') applied.push({ id: op.id, fields: Object.keys(op.fields || {}) });
        else if (op.kind === 'insert') inserted.push({ id: op.id, type: op.element && op.element.type ? op.element.type : 'object' });
      }
    }
    forgetReadBasis(sessionId, doc.id);
    return {
      ok: true,
      rev: outcome.doc.rev,
      applied: applied,
      inserted: inserted,
      ignored: normalized.ignored,
      conflicts: merged.conflicts || [],
      notes: normalized.normalized || [],
      changeSeq: merged.change ? merged.change.seq : null,
    };
  }

  async function sync(payload) {
    await ready();
    const canvasId = payload && payload.canvasId;
    const doc = store.getCanvas(canvasId);
    if (!doc) return { ok: false, error: 'canvas_not_found', status: 404 };
    const sinceRev = Number.isFinite(payload && payload.sinceRev) ? payload.sinceRev : -1;
    const changes = doc.changes.filter((change) => change.seq > sinceRev);
    return {
      ok: true,
      rev: doc.rev,
      changes: changes,
      claims: claims.listForCanvas(doc.id),
      serverTime: now(),
    };
  }

  async function commitSession(sessionId, turn) {
    await ready();
    const open = claims.listOfSession(String(sessionId));
    const outcomes = [];
    for (const claim of open) {
      claim.turnId = turn === undefined || turn === null ? null : turn;
      const doc = store.getCanvas(claim.canvasId);
      if (!doc) {
        outcomes.push({ claimId: claim.claimId, canvasId: claim.canvasId, result: 'missing_canvas' });
        claims.abort(claim.claimId, claim.ownerSessionId, 'canvas_missing');
        continue;
      }
      const outcome = await store.mutateCanvas(claim.canvasId, (current) => {
        const merged = mergeClaimIntoDoc(current, claim, now());
        if (!merged.ok) return { ok: false, error: merged.error };
        return {
          doc: merged.doc,
          result: merged.result,
          conflicts: merged.conflicts,
          change: merged.change,
          applied: merged.applied,
        };
      });
      if (!outcome.ok) {
        outcomes.push({ claimId: claim.claimId, canvasId: claim.canvasId, result: 'error', error: outcome.error });
      } else {
        outcomes.push({
          claimId: claim.claimId,
          canvasId: claim.canvasId,
          result: outcome.result,
          conflicts: outcome.conflicts || [],
          changeSeq: outcome.change ? outcome.change.seq : null,
          applied: outcome.applied || 0,
        });
      }
      claims.abort(claim.claimId, claim.ownerSessionId, 'committed');
    }
    return { ok: true, outcomes: outcomes };
  }

  async function abortSession(sessionId, reason) {
    await ready();
    return claims.abortSession(String(sessionId), reason);
  }

  function sweepClaims() {
    const before = claims.size();
    claims.sweep();
    return before - claims.size();
  }

  async function exportCanvas(canvasId) {
    await ready();
    const doc = store.getCanvas(canvasId);
    if (!doc) return { ok: false, error: 'canvas_not_found', status: 404 };
    const payload = serializeCanvas(doc, { changesTail: doc.changes.length });
    payload.exportedAt = now();
    return { ok: true, canvas: payload };
  }

  async function importCanvas(raw) {
    await ready();
    if (!isCanvasShape(raw)) return { ok: false, error: 'invalid_body: the JSON is not a canvas document (schemaVersion 2)' };
    const doc = {
      schemaVersion: raw.schemaVersion,
      id: makeCanvasId(),
      name: (typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim() : '画板') + '（导入）',
      rev: raw.rev,
      createdAt: now(),
      updatedAt: now(),
      elements: raw.elements,
      changes: Array.isArray(raw.changes) ? raw.changes : [],
    };
    await store.createCanvasRecord(doc);
    return { ok: true, canvasId: doc.id, name: doc.name };
  }

  /** Board switcher support: every canvas with the metadata the picker shows. */
  async function listCanvases() {
    await ready();
    const out = [];
    for (const id of store.listCanvasIds()) {
      const doc = store.getCanvas(id);
      if (!doc) continue;
      out.push({
        id: doc.id,
        name: doc.name,
        rev: doc.rev,
        elementCount: Object.keys(doc.elements || {}).length,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      });
    }
    out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return { ok: true, canvases: out };
  }

  async function renameCanvas(payload) {
    await ready();
    const canvasId = payload && typeof payload.canvasId === 'string' ? payload.canvasId : '';
    const name = payload && typeof payload.name === 'string' ? payload.name.trim().slice(0, 120) : '';
    if (!canvasId) return { ok: false, error: 'invalid_body: canvasId is required' };
    if (name.length === 0) return { ok: false, error: 'invalid_body: name must be non-empty' };
    const outcome = await store.mutateCanvas(canvasId, (current) => {
      if (current.name === name) return { doc: current, unchanged: true };
      return { doc: Object.assign({}, current, { name: name, updatedAt: now() }) };
    });
    if (!outcome.ok) return outcome;
    return {
      ok: true,
      canvas: { id: outcome.doc.id, name: outcome.doc.name, rev: outcome.doc.rev, updatedAt: outcome.doc.updatedAt },
    };
  }

  async function deleteCanvas(payload) {
    await ready();
    const canvasId = payload && typeof payload.canvasId === 'string' ? payload.canvasId : '';
    if (!canvasId) return { ok: false, error: 'invalid_body: canvasId is required' };
    if (!store.getCanvas(canvasId)) return { ok: false, error: 'canvas_not_found', status: 404 };
    for (const claim of claims.listForCanvas(canvasId)) {
      claims.abort(claim.claimId, null, 'canvas_deleted');
    }
    await store.deleteCanvasRecord(canvasId);
    const global = store.getGlobal();
    let defaultCanvasId = global && typeof global.defaultCanvasId === 'string' ? global.defaultCanvasId : null;
    if (defaultCanvasId === canvasId) {
      const remaining = store.listCanvasIds();
      defaultCanvasId = remaining.length > 0 ? remaining[0] : null;
      if (defaultCanvasId === null) {
        const doc = createCanvas(makeCanvasId(), '画板', now());
        await store.createCanvasRecord(doc);
        defaultCanvasId = doc.id;
      }
      await store.setGlobal({ schemaVersion: HOST_SCHEMA_VERSION, defaultCanvasId: defaultCanvasId, updatedAt: now() });
      defaultId = defaultCanvasId;
    }
    return { ok: true, defaultCanvasId: defaultCanvasId };
  }

  async function getSessionPref(sessionId) {
    await ready();
    return store.getPref(String(sessionId));
  }

  /**
   * Merge (never replace) the session preference: `lastCanvasId` and the
   * per-canvas AI switch (`aiByCanvas: { [canvasId]: boolean }`) live together
   * with `updatedAt`; fields the caller omits stay as they were.
   */
  async function setSessionPref(sessionId, payload) {
    await ready();
    const input = payload || {};
    const current = store.getPref(String(sessionId));
    const next = Object.assign({}, isPlainRecord(current) ? current : {});
    if (input.lastCanvasId !== undefined) {
      const lastCanvasId = typeof input.lastCanvasId === 'string' && input.lastCanvasId.length > 0 ? input.lastCanvasId : null;
      if (lastCanvasId && !store.getCanvas(lastCanvasId)) return { ok: false, error: 'canvas_not_found', status: 404 };
      next.lastCanvasId = lastCanvasId;
    }
    if (input.aiByCanvas !== undefined) {
      if (!isPlainRecord(input.aiByCanvas)) {
        return { ok: false, error: 'invalid_body: aiByCanvas must be an object of canvasId -> boolean' };
      }
      const merged = Object.assign({}, isPlainRecord(next.aiByCanvas) ? next.aiByCanvas : {});
      for (const [canvasId, enabled] of Object.entries(input.aiByCanvas)) {
        if (canvasId.length === 0) return { ok: false, error: 'invalid_body: aiByCanvas keys must be canvas ids' };
        if (typeof enabled !== 'boolean') return { ok: false, error: 'invalid_body: aiByCanvas values must be booleans' };
        merged[canvasId] = enabled;
      }
      next.aiByCanvas = merged;
    }
    next.updatedAt = now();
    await store.setPref(String(sessionId), next);
    return { ok: true, pref: next };
  }

  return {
    ready,
    getCanvas,
    createCanvasDocument,
    applyOps,
    undo,
    createClaim,
    heartbeatClaim,
    abortClaim,
    claimForSession,
    stageClaimPatch,
    readModelSelection,
    applyModelPatch,
    sync,
    commitSession,
    abortSession,
    sweepClaims,
    exportCanvas,
    importCanvas,
    listCanvases,
    renameCanvas,
    deleteCanvas,
    getSessionPref,
    setSessionPref,
    // test seam
    __store: store,
    __claims: claims,
  };
}
