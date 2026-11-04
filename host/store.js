/**
 * Durable canvas store over the Harness `storage` hub (the `json` backend's
 * raw KV facet, `per-record` layout). One unit named `whiteboard` holds the
 * `canvas` and `session_pref` tables plus the global singleton.
 *
 * Writes are serialized on one promise chain (the KV unit does not serialize
 * concurrent writes) and each `mutateCanvas` is an atomic read-modify-write on
 * that chain; `putRecord` resolves only after the write is durable.
 *
 * See docs/adr/0002-canvas-authority.md §3.1, §4 (D9).
 */

import { LIMITS, UNIT } from './constants.js';

export function createStore(options) {
  const resolveBackend = options.resolveBackend;
  const now = options.now || Date.now;

  let unit = null;
  let opening = null;
  let chain = Promise.resolve();
  let closed = false;
  const cache = {
    global: null,
    canvas: new Map(),
    sessionPref: new Map(),
  };

  function enqueue(fn) {
    const run = chain.then(fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function assertOpen() {
    if (closed) throw new Error('store_closed');
    if (!unit) throw new Error('store_not_open');
  }

  const store = {
    async open() {
      if (closed) throw new Error('store_closed');
      if (unit) return store;
      if (!opening) {
        opening = (async () => {
          const backend = await resolveBackend();
          if (!backend || !backend.kv || typeof backend.kv.open !== 'function') {
            throw new Error('storage_kv_unavailable: the storage hub has no kv backend');
          }
          const opened = await backend.kv.open(UNIT);
          unit = opened;
          const snapshot = await opened.loadAll();
          cache.global = snapshot.global && typeof snapshot.global === 'object' ? snapshot.global : null;
          cache.canvas.clear();
          cache.sessionPref.clear();
          const tables = snapshot.tables || {};
          for (const [key, value] of Object.entries(tables.canvas || {})) cache.canvas.set(key, value);
          for (const [key, value] of Object.entries(tables.session_pref || {})) cache.sessionPref.set(key, value);
          return store;
        })();
        opening.catch(() => {
          opening = null;
        });
      }
      return opening;
    },

    get ready() {
      return unit !== null;
    },

    getGlobal() {
      return cache.global;
    },

    setGlobal(value) {
      return enqueue(async () => {
        assertOpen();
        await unit.setGlobal(value);
        cache.global = value;
        return value;
      });
    },

    getCanvas(id) {
      return cache.canvas.get(id) || null;
    },

    listCanvasIds() {
      return Array.from(cache.canvas.keys());
    },

    createCanvasRecord(doc) {
      return enqueue(async () => {
        assertOpen();
        await unit.putRecord('canvas', doc.id, doc);
        cache.canvas.set(doc.id, doc);
        return doc;
      });
    },

    /**
     * Serialized read-modify-write of one canvas. `fn(currentDoc)` returns
     * `{ doc, ... }` or `{ ok: false, error }`; the new value is persisted
     * before it becomes the readable state.
     */
    mutateCanvas(id, fn) {
      return enqueue(async () => {
        assertOpen();
        const current = cache.canvas.get(id);
        if (!current) return { ok: false, error: 'canvas_not_found' };
        const out = fn(current);
        if (!out || out.ok === false) return out || { ok: false, error: 'invalid_mutation' };
        if (!out.doc || out.doc === current) return Object.assign({}, out, { ok: true, doc: current, unchanged: true });
        const bytes = Buffer.byteLength(JSON.stringify(out.doc), 'utf8');
        if (bytes > LIMITS.docBytes) {
          return { ok: false, error: 'too_large: the canvas document would exceed ' + LIMITS.docBytes + ' bytes; export and compact it first' };
        }
        await unit.putRecord('canvas', id, out.doc);
        cache.canvas.set(id, out.doc);
        return Object.assign({}, out, { ok: true, doc: out.doc, bytes: bytes });
      });
    },

    deleteCanvasRecord(id) {
      return enqueue(async () => {
        assertOpen();
        await unit.deleteRecord('canvas', id);
        cache.canvas.delete(id);
      });
    },

    getPref(sessionId) {
      return cache.sessionPref.get(sessionId) || null;
    },

    setPref(sessionId, value) {
      return enqueue(async () => {
        assertOpen();
        await unit.putRecord('session_pref', sessionId, value);
        cache.sessionPref.set(sessionId, value);
        return value;
      });
    },

    async close() {
      if (closed) return;
      closed = true;
      await chain;
      if (unit && typeof unit.close === 'function') await unit.close();
      unit = null;
    },

    now,
  };

  return store;
}

/**
 * In-memory KV unit with the same surface as the `json` backend; used by the
 * engine unit tests (and by `node test/smoke.mjs`).
 */
export function createMemoryBackend() {
  const state = {
    global: null,
    tables: { canvas: new Map(), session_pref: new Map() },
  };
  return {
    state,
    kv: {
      async open(descriptor) {
        if (!descriptor || !Array.isArray(descriptor.tables)) throw new Error('invalid_descriptor');
        return {
          async loadAll() {
            const tables = {};
            for (const name of descriptor.tables) {
              tables[name] = Object.fromEntries(Array.from((state.tables[name] || new Map()).entries()));
            }
            return { tables: tables, global: state.global };
          },
          async putRecord(table, key, value) {
            if (!state.tables[table]) state.tables[table] = new Map();
            state.tables[table].set(key, JSON.parse(JSON.stringify(value)));
          },
          async deleteRecord(table, key) {
            if (state.tables[table]) state.tables[table].delete(key);
          },
          async setGlobal(value) {
            state.global = JSON.parse(JSON.stringify(value));
          },
          async close() {},
        };
      },
    },
    async close() {},
  };
}
