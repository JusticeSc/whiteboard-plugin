/**
 * Canvas v2 client smoke suite (Phase B): the pure data layer of the browser
 * bundle. Loads client.js with a stubbed `window.__ModuleLoader__` and React,
 * then exercises the element mapping, diff/flush op batches, change
 * application and redo reconstruction. No browser and no running dsh needed.
 *
 * Run: node test/client-smoke.mjs   (from the bundle directory)
 */

import assert from 'node:assert/strict';

import { LIMITS } from '../host/constants.js';

let passed = 0;

function eq(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  passed += 1;
  console.log('OK   ' + label);
}

function ok(label, condition) {
  assert.ok(condition, label);
  passed += 1;
  console.log('OK   ' + label);
}

/* ------------------------------------------------------------------ */
/* Load the client bundle through the ModuleLoader seam                 */
/* ------------------------------------------------------------------ */

let definition = null;
globalThis.window = {
  __ModuleLoader__: {
    load(next) { definition = next; },
  },
};

await import(new URL('../client.js', import.meta.url).href);
ok('client registers through the module loader', definition !== null);
eq('client module id', definition.id, '@local/whiteboard');

const ReactStub = {
  createElement() { return null; },
  useState(value) { return [value, function () {}]; },
  useRef(value) { return { current: value }; },
  useEffect() {},
  useReducer(value) { return [value, function () {}]; },
  Fragment: 'fragment',
};
const mod = definition.factory(function requireStub(name) {
  if (name === 'react') return ReactStub;
  throw new Error('unexpected require: ' + name);
});
ok('client module exports apply', typeof mod.apply === 'function');
eq('client module name', mod.name, '@local/whiteboard');

const core = mod.__test;
ok('client exposes the test seam', core !== null && typeof core.diffOps === 'function');

/* ------------------------------------------------------------------ */
console.log('--- limits stay aligned with the Host ---');

eq('MAX_ELEMENTS aligns', core.constants.MAX_ELEMENTS, LIMITS.elements);
eq('MAX_TEXT aligns', core.constants.MAX_TEXT, LIMITS.textLength);
eq('sync interval', core.constants.SYNC_MS, 600);
eq('flush debounce', core.constants.FLUSH_MS, 350);

/* ------------------------------------------------------------------ */
console.log('--- element mapping ---');

const serverRect = {
  id: 'el-a', type: 'rect', x: 10, y: 20, w: 100, h: 50, color: 'accent',
  rev: 3, fieldRevs: { x: 3, y: 2 }, origin: 'ai', turnId: 'turn-1',
  sessionId: 's-ai', parentSessionId: 's-parent', updatedAt: 42,
};

{
  const element = core.clientElement(serverRect);
  eq('maps id', element.id, 'el-a');
  eq('maps x', element.x, 10);
  eq('maps w', element.w, 100);
  eq('maps color', element.color, 'accent');
  eq('keeps rev', element.rev, 3);
  eq('keeps fieldRevs', element.fieldRevs.x, 3);
  eq('keeps origin', element.origin, 'ai');
  eq('seed is derived, not persisted', element.seed, core.hashSeed('el-a'));
  ok('seed is not a serialized field', !Object.prototype.hasOwnProperty.call(serverRect, 'seed'));
}

{
  const arrow = { id: 'el-arrow', type: 'arrow', x: 100, y: 100, w: -80, h: 40, color: 'ink', rev: 1, fieldRevs: {}, origin: 'user', updatedAt: 1 };
  const element = core.clientElement(arrow);
  eq('arrow keeps signed w', element.w, -80);
  eq('arrow keeps signed h', element.h, 40);
}

{
  const pen = { id: 'el-p', type: 'pen', x: 1, y: 2, w: 3, h: 4, color: 'ink', points: [[1, 2], [10, 20]], rev: 1, fieldRevs: {}, origin: 'user', updatedAt: 1 };
  const element = core.clientElement(pen);
  eq('pen keeps points', element.points, [[1, 2], [10, 20]]);
  eq('pen insert op carries the first point', core.insertOp(element).x, 1);
  eq('pen fields are color+points only', Object.keys(core.elementFields(element)), ['color', 'points']);
}

eq('hashSeed is stable', core.hashSeed('el-a'), core.hashSeed('el-a'));
ok('hashSeed differs across ids', core.hashSeed('el-a') !== core.hashSeed('el-b'));
eq('clientElement rejects junk', core.clientElement(null), null);

/* ------------------------------------------------------------------ */
console.log('--- diff -> op batches ---');

function rect(id, x, y, w, h, extra) {
  return Object.assign({ id: id, type: 'rect', x: x, y: y, w: w, h: h, color: 'ink' }, extra || {});
}

{
  const elements = [rect('r1', 0, 0, 10, 10), rect('r2', 20, 20, 30, 30)];
  const base = core.snapshotOf(elements);
  eq('no changes -> no ops', core.diffOps(base, elements), []);
}

{
  const elements = [rect('r1', 0, 0, 10, 10)];
  const base = core.snapshotOf(elements);
  const moved = [rect('r1', 5, 7, 10, 10)];
  const ops = core.diffOps(base, moved);
  eq('move -> one replace', ops.length, 1);
  eq('move replace kind', ops[0].kind, 'replace');
  eq('move replace fields', ops[0].fields, { x: 5, y: 7 });
}

{
  const base = core.snapshotOf([rect('r1', 0, 0, 10, 10)]);
  const ops = core.diffOps(base, [rect('r1', 0, 0, 10, 10), { id: 'r2', type: 'ellipse', x: 3, y: 4, w: 5, h: 6, color: 'red' }]);
  eq('insert -> one insert op', ops.length, 1);
  eq('insert op kind', ops[0].kind, 'insert');
  eq('insert op id', ops[0].id, 'r2');
  eq('insert op type', ops[0].type, 'ellipse');
}

{
  const base = core.snapshotOf([rect('r1', 0, 0, 10, 10), rect('r2', 1, 1, 2, 2)]);
  const ops = core.diffOps(base, [rect('r2', 1, 1, 2, 2)]);
  eq('delete -> one delete op', ops.length, 1);
  eq('delete op', ops[0], { kind: 'delete', id: 'r1' });
}

{
  const elements = [{ id: 't1', type: 'text', x: 0, y: 0, w: 40, h: 22, color: 'ink', text: '你好' }];
  const base = core.snapshotOf(elements);
  const edited = [{ id: 't1', type: 'text', x: 0, y: 0, w: 44, h: 22, color: 'ink', text: '你好呀' }];
  const ops = core.diffOps(base, edited);
  eq('text edit fields', ops[0].fields, { w: 44, text: '你好呀' });
}

/* ------------------------------------------------------------------ */
console.log('--- applying server changes ---');

const insertChange = {
  seq: 1,
  author: { kind: 'user', sessionId: 's-user' },
  ops: [{
    kind: 'insert',
    element: { id: 'a1', type: 'rect', x: 1, y: 2, w: 3, h: 4, color: 'ink', rev: 0, fieldRevs: {}, origin: 'user', updatedAt: 10 },
  }],
};

{
  const next = core.applyChange([], insertChange);
  eq('insert change adds the element', next.length, 1);
  eq('insert change element fields', next[0].x, 1);
}

const aiReplace = {
  seq: 2,
  claimId: 'claim-1',
  author: { kind: 'ai', sessionId: 's-ai', turnId: 'turn-9', parentSessionId: 's-user' },
  ops: [{ kind: 'replace', id: 'a1', fields: { x: { from: 1, to: 9, revAfter: 3 }, color: { from: 'ink', to: 'red', revAfter: 2 } } }],
};

{
  const next = core.applyChange(core.applyChange([], insertChange), aiReplace);
  const element = next[0];
  eq('replace sets x', element.x, 9);
  eq('replace sets color', element.color, 'red');
  eq('replace stores fieldRevs', element.fieldRevs.x, 3);
  eq('replace bumps rev', element.rev, 1);
  eq('ai replace marks origin', element.origin, 'ai');
  eq('ai replace marks turn', element.turnId, 'turn-9');
}

{
  const next = core.applyChange(core.applyChange(core.applyChange([], insertChange), aiReplace), {
    seq: 3, author: { kind: 'user', sessionId: 's-user' }, ops: [{ kind: 'delete', id: 'a1' }],
  });
  eq('delete change removes the element', next.length, 0);
}

/* ------------------------------------------------------------------ */
console.log('--- redo reconstruction ---');

{
  const change = {
    seq: 5,
    author: { kind: 'user', sessionId: 's-user' },
    ops: [
      { kind: 'insert', element: { id: 'n1', type: 'rect', x: 0, y: 0, w: 5, h: 5, color: 'ink', rev: 0, fieldRevs: {}, origin: 'user', updatedAt: 1 } },
      { kind: 'replace', id: 'n2', fields: { y: { from: 0, to: 12, revAfter: 4 } } },
      { kind: 'delete', id: 'n3', element: { id: 'n3', type: 'rect', x: 0, y: 0, w: 1, h: 1, color: 'ink', rev: 0, fieldRevs: {}, origin: 'user', updatedAt: 1 } },
    ],
  };
  const ops = core.redoOpsOf(change);
  eq('redo keeps op count', ops.length, 3);
  eq('redo insert becomes insert', ops[0].kind, 'insert');
  eq('redo insert keeps type', ops[0].type, 'rect');
  eq('redo replace uses the to-value', ops[1].fields, { y: 12 });
  eq('redo delete stays a delete', ops[2], { kind: 'delete', id: 'n3' });
}

/* ------------------------------------------------------------------ */
console.log('--- v3 bridge: translation format ---');

{
  eq('v3 reference label', core.bridgeLabel({ ids: ['a', 'b'] }), '画板选区 · 2 个对象');
  eq('v3 full translation threshold', core.REF_FULL_LIMIT, 20);
  eq('v3 header marker', core.REF_HEADER, '【画板选区引用】');

  const ref = {
    canvasId: 'cv-1',
    rev: 7,
    name: '默认画板',
    ids: ['r1', 'a1', 't1'],
    objects: [
      { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 60, color: 'ink' },
      { id: 'a1', type: 'arrow', x: 0, y: 5, w: 80, h: 40, color: 'accent' },
      { id: 't1', type: 'text', x: 10, y: 90, w: 120, h: 30, color: 'red', text: '请求进入网关' },
    ],
  };
  const text = core.bridgeTranslate(ref);
  const lines = text.split('\n');
  eq('v3 translation header', lines[0], '【画板选区引用】默认画板 · 3 个对象 · rev 7 · canvasId cv-1');
  eq('v3 rect line', lines[1], '- r1 · 矩形 · 位置(10,20) · 100×60 · 填充 #1f2329');
  eq('v3 arrow line', lines[2], '- a1 · 箭头 · (0,5) → (80,45) · 描边 #2f6fed · 线宽 2.2');
  eq('v3 text line', lines[3], '- t1 · 文本 · 位置(10,90) · 字号 22 · 颜色 #d9343a · 内容「请求进入网关」');

  const missing = core.bridgeTranslate({ canvasId: 'cv-1', rev: 2, name: '板', ids: ['gone'], objects: [] });
  eq('v3 deleted object marked invalid', missing.split('\n')[1], '- gone · 已删除（invalid）');

  const bigIds = Array.from({ length: 21 }, (_, index) => 'n' + index);
  const big = core.bridgeTranslate({
    canvasId: 'cv-1', rev: 3, name: '板', ids: bigIds,
    objects: bigIds.map((id) => ({ id: id, type: 'rect', x: 0, y: 0, w: 1, h: 1, color: 'ink' })),
  });
  eq('v3 large selection marker header', big.split('\n')[0], '【画板选区引用】板 · 21 个对象 · rev 3 · canvasId cv-1');
  ok('v3 large selection asks for read', big.includes('whiteboard_read_selection'));
  ok('v3 large selection lists ids', big.includes('n0, n1'));

  eq('v3 selection bounds union', core.selectionBounds([
    { type: 'rect', x: 10, y: 20, w: 100, h: 60 },
    { type: 'rect', x: 0, y: 0, w: 10, h: 10 },
  ]), { x1: 0, y1: 0, x2: 110, y2: 80 });
  eq('v3 selection bounds empty', core.selectionBounds([]), null);
  const snapshotBounds = core.selectionBounds([{ type: 'arrow', x: 30, y: 40, w: -50, h: -10 }]);
  eq('v3 selection bounds signed arrow', snapshotBounds, { x1: -20, y1: 30, x2: 30, y2: 40 });

  const truncated = core.bridgeTranslate({
    canvasId: 'cv-1', rev: 1, name: '板', ids: ['t'], objects: [{ id: 't', type: 'text', x: 0, y: 0, w: 1, h: 1, color: 'ink', text: 'x'.repeat(400) }],
  });
  ok('v3 long text is truncated with ellipsis', truncated.includes('…') && !truncated.includes('x'.repeat(200)));
}

/* ------------------------------------------------------------------ */
console.log('--- v3 bridge: per-session store ---');

{
  const store = core.bridgeStoreFor('session-store');
  eq('v3 store starts unready', store.get().ready, false);
  let calls = 0;
  const off = store.subscribe(() => { calls += 1; });
  store.set({ ready: true, ids: ['a'] });
  eq('v3 store notifies subscribers', calls, 1);
  eq('v3 store keeps patched state', store.get().ids, ['a']);
  store.set({ ready: true });
  eq('v3 store skips no-op patches', calls, 1);
  off();
  store.set({ ready: false });
  eq('v3 store unsubscribe works', calls, 1);
  ok('v3 store is per session', core.bridgeStoreFor('session-store') === store && core.bridgeStoreFor('other') !== store);
}

/* ------------------------------------------------------------------ */
console.log('--- v3 carrier: module apply registers the new surfaces ---');

{
  const registered = { slots: [], tabs: null, source: null, rules: [], errors: [] };
  const t = (key) => 'key:' + key;
  function makeContext(extra) {
    const services = {
      sessions: { scope: () => null },
      uiConversation: { userText: { register: (rule) => registered.rules.push(rule) } },
      sidebarRightTabs: { register: (definition) => { registered.tabs = definition; return () => {}; } },
      inputTriggers: { registerSource: (source) => { registered.source = source; return () => {}; } },
      ...extra,
    };
    return {
      locale: { bind: () => t, register: () => () => {} },
      get: (name) => services[name] || null,
      inject: (deps, callback) => { callback(makeContext(extra)); },
      effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {}; },
      slots: {
        inject: (name, callback) => callback(),
        register: (definition, component) => {
          registered.slots.push({ name: definition.name, key: definition.key, id: definition.id, component: component });
          return () => {};
        },
      },
    };
  }
  ok('v3 apply runs against a fake context', (() => {
    try { mod.apply(makeContext()); return true; } catch (error) { registered.errors.push(String(error && error.message ? error.message : error)); return false; }
  })());
  eq('v3 apply errors are empty', registered.errors, []);
  eq('v3 tab kind', registered.tabs && registered.tabs.kind, 'whiteboard');
  eq('v3 tab id', registered.tabs && registered.tabs.id, '@local/whiteboard');
  eq('v3 tab priority', registered.tabs && registered.tabs.priority, 'extension');
  eq('v3 tab keepMounted', registered.tabs && registered.tabs.keepMounted, true);
  ok('v3 tab title is a function', typeof (registered.tabs && registered.tabs.title) === 'function');
  const names = registered.slots.map((slot) => slot.name);
  ok('v3 registers the sidebar body slot', names.includes('sidebar.right.pane.tab'));
  ok('v3 registers the sidebar title slot', names.includes('sidebar.right.pane.tab.title'));
  ok('v3 registers the composer dock', names.includes('conversation.input.dock'));
  ok('v3 registers the user text node', names.includes('conversation.user.text.node'));
  ok('v3 has no conversation.view slot', !names.includes('conversation.view'));
  ok('v3 reference source registered', registered.source !== null);
  eq('v3 reference source name', registered.source && registered.source.name, 'whiteboard');
  eq('v3 reference trigger', registered.source && registered.source.trigger, '§');
  const serialized = await registered.source.codec.serialize({
    canvasId: 'cv-1', rev: 4, name: '板', ids: ['r1'], objects: [{ id: 'r1', type: 'rect', x: 1, y: 2, w: 3, h: 4, color: 'ink' }],
  }, new AbortController().signal);
  eq('v3 codec serialize is line-isolated', serialized, '\n【画板选区引用】板 · 1 个对象 · rev 4 · canvasId cv-1\n- r1 · 矩形 · 位置(1,2) · 3×4 · 填充 #1f2329\n');
  ok('v3 clipboard text uses the label', registered.source.codec.clipboardText({ ids: ['a', 'b'] }) === '◈ 画板选区 · 2 个对象');
  const rule = registered.rules[0];
  ok('v3 userText rule registered', rule !== undefined);
  const sample = '【画板选区引用】板 · 2 个对象 · rev 9\n- a · 矩形\n- b · 矩形\n普通文字';
  const match = rule.match(sample, 0);
  eq('v3 rule start', match && match.start, 0);
  eq('v3 rule label', match && match.data.label, '画板选区 · 2 个对象');
  eq('v3 rule does not leak trailing text', sample.slice(match.start, match.end).includes('普通文字'), false);
  eq('v3 rule ignores plain text', rule.match('你好世界', 0), undefined);
  /* Legacy prompts appended the typed instruction to the last generated line
     without a separator; the rule must stop after the object fields. */
  const legacy = '【画板选区引用】画板 · 1 个对象 · rev 20 · canvasId cv-1\n- el-1 · 矩形 · 位置(-1,-2) · 140×130 · 填充 #1f2329 改成红色';
  const legacyMatch = rule.match(legacy, 0);
  ok('v3 legacy match exists', legacyMatch !== undefined);
  eq('v3 legacy chip line has no instruction', legacyMatch && legacyMatch.data.line.includes('改成红色'), false);
  eq('v3 legacy trailing instruction survives', legacy.slice(legacyMatch.end), ' 改成红色');
  const legacyText = '【画板选区引用】画板 · 1 个对象 · rev 20 · canvasId cv-1\n- el-2 · 文本 · 位置(1,2) · 字号 22 · 颜色 #1f2329 · 内容「你好世界」 改成黑色';
  const legacyTextMatch = rule.match(legacyText, 0);
  eq('v3 legacy text chip line has no instruction', legacyTextMatch && legacyTextMatch.data.line.includes('改成黑色'), false);
  eq('v3 legacy text trailing instruction survives', legacyText.slice(legacyTextMatch.end), ' 改成黑色');
  const bigIds = Array.from({ length: 21 }, (_, i) => 'el-' + (i + 1)).join(', ');
  const legacyBig = '【画板选区引用】画板 · 21 个对象 · rev 3 · canvasId cv-1\n- 对象较多（21 个）· 类型统计：矩形 21\n- id 列表：' + bigIds + '\n- 请调用 whiteboard_read_selection 读取这些对象的字段后再修改。 改成蓝色';
  const legacyBigMatch = rule.match(legacyBig, 0);
  ok('v3 large-selection match exists', legacyBigMatch !== undefined);
  eq('v3 large-selection chip line has no instruction', legacyBigMatch && legacyBigMatch.data.line.includes('改成蓝色'), false);
  eq('v3 large-selection trailing instruction survives', legacyBig.slice(legacyBigMatch.end), ' 改成蓝色');
  /* Text bounds must follow the current glyphs, not a stale committed box:
     the AI can replace 你好世界 with Hello World while w/h stay at the CJK
     measurement, which used to shrink the selection outline. */
  const textElement = { id: 't1', type: 'text', x: 0, y: 0, w: 88, h: 22, text: '你好世界' };
  const smallText = mod.__test.boundsOf(textElement, 'system-ui, sans-serif');
  textElement.text = 'Hello World';
  const latinText = mod.__test.boundsOf(textElement, 'system-ui, sans-serif');
  ok('v3 text bounds follow the new text width', (latinText.x2 - latinText.x1) > 100);
  ok('v3 text bounds ignore the stale stored width', (latinText.x2 - latinText.x1) !== 88);
  ok('v3 text bounds keep the anchor', smallText.x1 === 0 && latinText.x1 === 0 && latinText.y1 === 0);
}

/* ------------------------------------------------------------------ */
console.log('\n' + passed + ' checks passed');
console.log('CLIENT SMOKE OK');







