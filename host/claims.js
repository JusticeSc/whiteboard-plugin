/**
 * Claim engine: the "one session × one element set" soft reservation that
 * binds an AI turn to a frozen selection. In-memory only (Host restart drops
 * every claim, which is safe: staged patches are never durable until commit).
 *
 * See docs/adr/0002-canvas-authority.md §4.
 */

import { CLAIM_TTL_MS, LIMITS } from './constants.js';
import { captureBasis, makeClaimId } from './model.js';

export function publicClaim(claim, now) {
  return {
    claimId: claim.claimId,
    canvasId: claim.canvasId,
    ids: claim.ids.slice(),
    ownerSessionId: claim.ownerSessionId,
    status: claim.status,
    stagedCount: claim.stagedCount,
    createdAt: claim.createdAt,
    expiresAt: claim.expiresAt,
    remainingMs: Math.max(0, claim.expiresAt - now),
  };
}

export function createClaims(now = Date.now) {
  /** @type {Map<string, any>} */
  const claims = new Map();

  function sweep() {
    const t = now();
    for (const [claimId, claim] of claims) {
      if (claim.expiresAt <= t) claims.delete(claimId);
    }
  }

  function listOfSession(sessionId) {
    sweep();
    const out = [];
    for (const claim of claims.values()) {
      if (claim.ownerSessionId === sessionId) out.push(claim);
    }
    return out;
  }

  function ofSession(sessionId, canvasId) {
    const candidates = listOfSession(sessionId);
    if (candidates.length === 0) return null;
    if (canvasId) {
      const hit = candidates.find((claim) => claim.canvasId === canvasId);
      if (hit) return hit;
    }
    candidates.sort((a, b) => b.createdAt - a.createdAt);
    return candidates[0];
  }

  /**
   * Create a claim. Same-session claims are superseded; overlapping ids held
   * by another session are reported as a conflict.
   */
  function create({ canvasId, ids, sessionId, doc }) {
    sweep();
    if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: 'empty_selection' };
    if (ids.length > LIMITS.claimIds) {
      return { ok: false, error: 'too_large: a claim can freeze at most ' + LIMITS.claimIds + ' objects' };
    }
    const unique = [];
    for (const id of ids) {
      if (typeof id !== 'string' || id.length === 0) return { ok: false, error: 'invalid_id' };
      if (!unique.includes(id)) unique.push(id);
    }
    for (const id of unique) {
      if (!doc.elements[id]) return { ok: false, error: 'outside_canvas: ' + id + ' is not on this canvas' };
    }
    const conflicts = [];
    for (const claim of claims.values()) {
      if (claim.canvasId !== canvasId) continue;
      if (claim.ownerSessionId === sessionId) continue;
      for (const id of unique) {
        if (claim.ids.includes(id)) {
          conflicts.push({ id: id, claimId: claim.claimId, ownerSessionId: claim.ownerSessionId });
        }
      }
    }
    if (conflicts.length > 0) {
      return { ok: false, error: 'claim_conflict', conflicts: conflicts };
    }
    for (const [claimId, claim] of Array.from(claims.entries())) {
      if (claim.ownerSessionId === sessionId) claims.delete(claimId);
    }
    const t = now();
    const claim = {
      claimId: makeClaimId(),
      canvasId: canvasId,
      ids: unique,
      ownerSessionId: sessionId,
      basis: captureBasis(doc, unique),
      staged: { replace: [], insert: [] },
      stagedCount: 0,
      status: 'open',
      reason: null,
      turnId: null,
      parentSessionId: null,
      createdAt: t,
      heartbeatAt: t,
      expiresAt: t + CLAIM_TTL_MS,
    };
    claims.set(claim.claimId, claim);
    return { ok: true, claim: claim };
  }

  function get(claimId) {
    sweep();
    return claims.get(claimId) || null;
  }

  function heartbeat(claimId, sessionId) {
    const claim = get(claimId);
    if (!claim) return { ok: false, error: 'claim_not_found', status: 404 };
    if (claim.ownerSessionId !== sessionId) return { ok: false, error: 'claim_forbidden', status: 403 };
    claim.expiresAt = now() + CLAIM_TTL_MS;
    claim.heartbeatAt = now();
    return { ok: true, claim: claim };
  }

  function abort(claimId, sessionId, reason) {
    const claim = get(claimId);
    if (!claim) return { ok: false, error: 'claim_not_found', status: 404 };
    if (sessionId && claim.ownerSessionId !== sessionId) return { ok: false, error: 'claim_forbidden', status: 403 };
    claims.delete(claimId);
    return { ok: true, claim: claim, reason: reason || 'aborted' };
  }

  function abortSession(sessionId, reason) {
    const removed = [];
    for (const [claimId, claim] of Array.from(claims.entries())) {
      if (claim.ownerSessionId === sessionId) {
        claims.delete(claimId);
        removed.push(claim);
      }
    }
    return { removed, reason: reason || 'aborted' };
  }

  function listForCanvas(canvasId) {
    sweep();
    const t = now();
    const out = [];
    for (const claim of claims.values()) {
      if (claim.canvasId === canvasId) out.push(publicClaim(claim, t));
    }
    return out;
  }

  /** Merge a normalized patch into the claim's staged patch (last write wins). */
  function stage(claim, patch) {
    const replace = new Map();
    for (const item of claim.staged.replace) replace.set(item.id, { id: item.id, fields: { ...item.fields } });
    for (const item of patch.replace) {
      const existing = replace.get(item.id);
      replace.set(item.id, {
        id: item.id,
        fields: Object.assign({}, existing ? existing.fields : {}, item.fields),
      });
    }
    const insert = new Map();
    for (const item of claim.staged.insert) insert.set(item.id, { ...item });
    for (const item of patch.insert) insert.set(item.id, { ...item });
    const replaceList = Array.from(replace.values());
    const insertList = Array.from(insert.values());
    if (replaceList.length + insertList.length > LIMITS.patchOps) {
      return { ok: false, error: 'too_large: a claim can stage at most ' + LIMITS.patchOps + ' objects' };
    }
    claim.staged = { replace: replaceList, insert: insertList };
    claim.stagedCount = replaceList.length + insertList.length;
    claim.status = 'staged';
    return { ok: true, claim: claim };
  }

  function clearStaged(claim) {
    claim.staged = { replace: [], insert: [] };
    claim.stagedCount = 0;
    claim.status = 'open';
  }

  return {
    sweep,
    create,
    get,
    ofSession,
    listOfSession,
    heartbeat,
    abort,
    abortSession,
    listForCanvas,
    stage,
    clearStaged,
    size() {
      sweep();
      return claims.size;
    },
  };
}
