/**
 * Host half of the Whiteboard bundle (canvas v2).
 *
 * The canvas is a first-class document kept in the Harness storage hub; the
 * AI never owns it — a *claim* binds one session to one element set for the
 * duration of one turn. The model reads through that claim and stages a patch;
 * the patch is merged only when the turn closes successfully, field by field,
 * with human edits winning any conflict.
 *
 * See docs/adr/0002-canvas-authority.md for the full decision record.
 */

import { ROUTE_PREFIX } from './host/constants.js';
import { createEngine } from './host/engine.js';
import { createRouteHandler } from './host/routes.js';
import { createStore } from './host/store.js';
import { createReadTool, createReplaceTool } from './host/tools.js';
import { createClaims } from './host/claims.js';
import * as model from './host/model.js';
import { createMemoryBackend } from './host/store.js';

export const name = 'whiteboard';
export const inject = ['tools', 'storage'];

const CLAIM_SWEEP_MS = 30 * 1000;
const BACKEND_RETRY_MS = 200;

function log(ctx, message) {
  try {
    if (typeof ctx.logger === 'function') ctx.logger('[whiteboard] ' + message);
    else console.warn('[whiteboard] ' + message);
  } catch (error) {
    /* logging must never break the plugin */
  }
}

export function apply(ctx) {
  const store = createStore({
    resolveBackend: async () => {
      const storage = ctx.get('storage');
      if (!storage) throw new Error('storage_unavailable');
      return storage.backend.get('json');
    },
  });
  const engine = createEngine({ store, now: Date.now });
  let disposed = false;
  let backendTimer = null;
  let sweepTimer = null;
  /** @type {Map<string, any>} */
  const abortTimers = new Map();

  function holdWhileBackendMissing() {
    if (disposed) return;
    let names = [];
    try {
      const storage = ctx.get('storage');
      names = storage && storage.backend && typeof storage.backend.names === 'function' ? storage.backend.names() : [];
    } catch (error) {
      names = [];
    }
    if (names.includes('json')) {
      engine.ready().catch((error) => log(ctx, 'store open failed: ' + (error && error.message ? error.message : error)));
      return;
    }
    backendTimer = setTimeout(holdWhileBackendMissing, BACKEND_RETRY_MS);
    if (backendTimer.unref) backendTimer.unref();
  }

  holdWhileBackendMissing();

  sweepTimer = setInterval(() => {
    try {
      engine.sweepClaims();
    } catch (error) {
      /* a sweep failure must not kill the timer */
    }
  }, CLAIM_SWEEP_MS);
  if (sweepTimer.unref) sweepTimer.unref();

  /* Routes: the web host is optional (TUI/headless hosts never render a
     canvas); `ctx.inject` delivers it once live and skips cleanly otherwise. */
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: createRouteHandler(engine),
    }), 'whiteboard: canvas api');
  });

  /* Tools: claim-scoped read/write. */
  ctx.effect(() => ctx.tools.register(createReadTool(engine)), 'whiteboard: read selection tool');
  ctx.effect(() => ctx.tools.register(createReplaceTool(engine)), 'whiteboard: replace selection tool');

  /* Turn lifecycle: a staged patch commits only when the turn closes
     successfully; interruption/error/idle drops it without touching the
     canvas. A short delay on error/idle lets a same-tick turn-stopping win. */
  function sessionIdOf(payload) {
    const agent = payload && payload.agent;
    return agent && agent.id ? String(agent.id) : '';
  }

  function clearAbortTimer(sessionId) {
    const timer = abortTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      abortTimers.delete(sessionId);
    }
  }

  function scheduleAbort(sessionId, reason, delayMs) {
    if (disposed || sessionId === '') return;
    clearAbortTimer(sessionId);
    const timer = setTimeout(() => {
      abortTimers.delete(sessionId);
      engine.abortSession(sessionId, reason).catch((error) => log(ctx, 'abort failed: ' + (error && error.message ? error.message : error)));
    }, delayMs);
    if (timer.unref) timer.unref();
    abortTimers.set(sessionId, timer);
  }

  ctx.effect(() => {
    const disposers = [];
    disposers.push(ctx.on('agent/turn-stopping', function (payload) {
      const sessionId = sessionIdOf(payload);
      if (sessionId === '') return;
      clearAbortTimer(sessionId);
      if (payload && payload.signal && payload.signal.aborted) {
        engine.abortSession(sessionId, 'aborted').catch((error) => log(ctx, 'abort failed: ' + (error && error.message ? error.message : error)));
        return;
      }
      const turn = payload && payload.turn !== undefined ? payload.turn : null;
      engine.commitSession(sessionId, turn).then((result) => {
        if (!result.ok) log(ctx, 'commit failed for ' + sessionId);
      }).catch((error) => log(ctx, 'commit failed: ' + (error && error.message ? error.message : error)));
    }));
    disposers.push(ctx.on('agent/error', function (payload) {
      const sessionId = sessionIdOf(payload);
      if (sessionId === '') return;
      scheduleAbort(sessionId, 'error', 1500);
    }));
    disposers.push(ctx.on('agent/status', function (payload) {
      const sessionId = sessionIdOf(payload);
      if (sessionId === '' || !payload || payload.status !== 'idle') return;
      scheduleAbort(sessionId, 'stopped', 300);
    }));
    return function () {
      for (const dispose of disposers) {
        if (typeof dispose === 'function') dispose();
      }
    };
  }, 'whiteboard: turn lifecycle');

  ctx.effect(() => function () {
    disposed = true;
    if (backendTimer) clearTimeout(backendTimer);
    if (sweepTimer) clearInterval(sweepTimer);
    for (const timer of abortTimers.values()) clearTimeout(timer);
    abortTimers.clear();
    engine.__store.close().catch(() => {});
  }, 'whiteboard: canvas teardown');
}

/* Test seam: smoke/unit tests import pure model functions and an in-memory
   engine without a Host. */
export const __test = {
  model,
  createClaims,
  createStore,
  createMemoryBackend,
  createEngine,
  createReadTool,
  createReplaceTool,
};
