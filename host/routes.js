/**
 * HTTP surface of the canvas engine, mounted at `/api/whiteboard/v2`.
 * Same-origin only (no cookie auth on plugin routes, exactly like v1); every
 * mutating call is idempotent via a client-supplied `requestId`.
 */

import { ERROR_CODES, LIMITS, ROUTE_PREFIX } from './constants.js';

function sendJson(response, status, value, headers) {
  const body = JSON.stringify(value);
  response.writeHead(status, Object.assign({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  }, headers || {}));
  response.end(body);
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (typeof origin !== 'string' || origin.length === 0) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch (error) {
    return false;
  }
}

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > LIMITS.bodyBytes) return { ok: false, error: ERROR_CODES.tooLarge };
    chunks.push(chunk);
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf8') };
}

async function readJson(request) {
  const contentType = String(request.headers['content-type'] ?? '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return { ok: false, status: 415, error: ERROR_CODES.contentRequired };
  }
  const body = await readBody(request);
  if (!body.ok) return { ok: false, status: 413, error: body.error };
  if (body.text.trim().length === 0) return { ok: false, status: 400, error: ERROR_CODES.invalidJson };
  try {
    return { ok: true, value: JSON.parse(body.text) };
  } catch (error) {
    return { ok: false, status: 400, error: ERROR_CODES.invalidJson };
  }
}

function statusFor(result) {
  if (result && typeof result.status === 'number') return result.status;
  if (result && typeof result.error === 'string') {
    if (result.error.startsWith('claim_conflict')) return 409;
    if (result.error.startsWith('canvas_not_found') || result.error.startsWith('claim_not_found')) return 404;
    if (result.error.startsWith('claim_forbidden')) return 403;
    if (result.error.startsWith('too_large')) return 413;
  }
  return 400;
}

function respond(response, result) {
  if (result && result.ok) {
    const payload = Object.assign({ ok: true }, result);
    delete payload.status;
    return sendJson(response, 200, payload);
  }
  const payload = { ok: false, error: result && result.error ? result.error : 'error' };
  if (result && Array.isArray(result.conflicts) && result.conflicts.length > 0) payload.conflicts = result.conflicts;
  return sendJson(response, statusFor(result), payload);
}

function methodNotAllowed(response) {
  return sendJson(response, 405, { ok: false, error: ERROR_CODES.methodNotAllowed });
}

/**
 * Build the prefix-route handler. The engine may still be opening its storage
 * unit (returns 503 until `engine.ready()` resolves — the client retries).
 */
export function createRouteHandler(engine) {
  return async function handle(request, response) {
    try {
      const url = new URL(request.url ?? '/', 'http://whiteboard.invalid');
      if (!url.pathname.startsWith(ROUTE_PREFIX + '/')) {
        return sendJson(response, 404, { ok: false, error: 'not_found' });
      }
      if (!sameOrigin(request)) {
        return sendJson(response, 403, { ok: false, error: ERROR_CODES.originNotAllowed });
      }
      const action = url.pathname.slice(ROUTE_PREFIX.length + 1).replace(/\/+$/, '');
      const method = request.method || 'GET';

      try {
        await engine.ready();
      } catch (error) {
        return sendJson(response, 503, { ok: false, error: ERROR_CODES.notReady, detail: String(error && error.message ? error.message : error) });
      }

      if (action === 'health') {
        if (method !== 'GET') return methodNotAllowed(response);
        return sendJson(response, 200, { ok: true, rev: 2, unit: 'whiteboard', time: Date.now() });
      }

      if (action === 'canvas') {
        if (method === 'GET') {
          const id = url.searchParams.get('id') || url.searchParams.get('canvasId') || undefined;
          const doc = await engine.getCanvas(id);
          if (!doc) return sendJson(response, 404, { ok: false, error: ERROR_CODES.canvasNotFound });
          const claims = engine.__claims.listForCanvas(doc.id);
          const sinceRaw = url.searchParams.get('sinceRev');
          const sinceRev = sinceRaw === null ? NaN : Number(sinceRaw);
          const changes = Number.isFinite(sinceRev)
            ? doc.changes.filter((change) => change.seq > sinceRev)
            : doc.changes.slice(Math.max(0, doc.changes.length - LIMITS.changesTail));
          return sendJson(response, 200, {
            ok: true,
            canvas: {
              schemaVersion: doc.schemaVersion,
              id: doc.id,
              name: doc.name,
              rev: doc.rev,
              createdAt: doc.createdAt,
              updatedAt: doc.updatedAt,
              elements: Object.values(doc.elements),
              changes: changes,
            },
            claims: claims,
            serverTime: Date.now(),
          });
        }
        if (method === 'POST') {
          const body = await readJson(request);
          if (!body.ok) return sendJson(response, body.status, { ok: false, error: body.error });
          const doc = await engine.createCanvasDocument(body.value && body.value.name);
          return sendJson(response, 200, { ok: true, canvasId: doc.id, name: doc.name, rev: doc.rev });
        }
        return methodNotAllowed(response);
      }

      if (action === 'canvases') {
        if (method !== 'GET') return methodNotAllowed(response);
        return respond(response, await engine.listCanvases());
      }

      if (action === 'canvas/rename') {
        if (method !== 'POST') return methodNotAllowed(response);
        const body = await readJson(request);
        if (!body.ok) return sendJson(response, body.status, { ok: false, error: body.error });
        return respond(response, await engine.renameCanvas(body.value || {}));
      }

      if (action === 'canvas/delete') {
        if (method !== 'POST') return methodNotAllowed(response);
        const body = await readJson(request);
        if (!body.ok) return sendJson(response, body.status, { ok: false, error: body.error });
        return respond(response, await engine.deleteCanvas(body.value || {}));
      }

      if (action === 'sync' || action === 'state') {
        if (method !== 'GET') return methodNotAllowed(response);
        const canvasId = url.searchParams.get('canvasId');
        if (!canvasId) return sendJson(response, 400, { ok: false, error: ERROR_CODES.invalidBody });
        const sinceRaw = url.searchParams.get('sinceRev');
        const sinceRev = sinceRaw === null ? -1 : Number(sinceRaw);
        return respond(response, await engine.sync({ canvasId: canvasId, sinceRev: Number.isFinite(sinceRev) ? sinceRev : -1 }));
      }

      if (action === 'op') {
        if (method !== 'POST') return methodNotAllowed(response);
        const body = await readJson(request);
        if (!body.ok) return sendJson(response, body.status, { ok: false, error: body.error });
        return respond(response, await engine.applyOps(body.value || {}));
      }

      if (action === 'undo') {
        if (method !== 'POST') return methodNotAllowed(response);
        const body = await readJson(request);
        if (!body.ok) return sendJson(response, body.status, { ok: false, error: body.error });
        return respond(response, await engine.undo(body.value || {}));
      }

      if (action === 'claim') {
        if (method !== 'POST') return methodNotAllowed(response);
        const body = await readJson(request);
        if (!body.ok) return sendJson(response, body.status, { ok: false, error: body.error });
        return respond(response, await engine.createClaim(body.value || {}));
      }

      if (action === 'claim/heartbeat') {
        if (method !== 'POST') return methodNotAllowed(response);
        const body = await readJson(request);
        if (!body.ok) return sendJson(response, body.status, { ok: false, error: body.error });
        return respond(response, await engine.heartbeatClaim(body.value || {}));
      }

      if (action === 'claim/abort') {
        if (method !== 'POST') return methodNotAllowed(response);
        const body = await readJson(request);
        if (!body.ok) return sendJson(response, body.status, { ok: false, error: body.error });
        return respond(response, await engine.abortClaim(body.value || {}));
      }

      if (action === 'export') {
        if (method !== 'GET') return methodNotAllowed(response);
        const canvasId = url.searchParams.get('canvasId');
        if (!canvasId) return sendJson(response, 400, { ok: false, error: ERROR_CODES.invalidBody });
        const result = await engine.exportCanvas(canvasId);
        if (!result.ok) return respond(response, result);
        const body = JSON.stringify(result.canvas, null, 2);
        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': 'attachment; filename="whiteboard-' + canvasId + '.json"',
          'cache-control': 'no-store',
        });
        return response.end(body);
      }

      if (action === 'import') {
        if (method !== 'POST') return methodNotAllowed(response);
        const body = await readJson(request);
        if (!body.ok) return sendJson(response, body.status, { ok: false, error: body.error });
        const raw = body.value && body.value.canvas ? body.value.canvas : body.value;
        return respond(response, await engine.importCanvas(raw));
      }

      if (action === 'session-pref') {
        if (method === 'GET') {
          const sessionId = url.searchParams.get('sessionId');
          if (!sessionId) return sendJson(response, 400, { ok: false, error: ERROR_CODES.invalidBody });
          const pref = await engine.getSessionPref(sessionId);
          return sendJson(response, 200, { ok: true, pref: pref });
        }
        if (method === 'POST') {
          const body = await readJson(request);
          if (!body.ok) return sendJson(response, body.status, { ok: false, error: body.error });
          const value = body.value || {};
          if (!value.sessionId) return sendJson(response, 400, { ok: false, error: ERROR_CODES.invalidBody });
          return respond(response, await engine.setSessionPref(String(value.sessionId), value));
        }
        return methodNotAllowed(response);
      }

      return sendJson(response, 404, { ok: false, error: 'not_found' });
    } catch (error) {
      return sendJson(response, 500, {
        ok: false,
        error: 'internal_error',
        detail: String(error && error.message ? error.message : error),
      });
    }
  };
}
