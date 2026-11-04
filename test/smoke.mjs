/**
 * Host smoke suite (canvas v3 M1): pure model, claim engine, durable store +
 * engine integration, the v3 model tools (translation read + immediate atomic
 * write, AI switch, pref merge) and the HTTP surface. No browser, no running
 * dsh instance required.
 *
 * Run: node test/smoke.mjs   (from the bundle directory)
 */

import assert from 'node:assert/strict';

import { __test } from '../index.js';
import { createRouteHandler } from '../host/routes.js';

const { model, createClaims, createStore, createMemoryBackend, createEngine, createReadTool, createReplaceTool } = __test;

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

const T0 = 1_700_000_000_000;

function seedCanvas() {
  const doc = model.createCanvas('cv-test-0001', '画板', T0);
  const out = model.applyHumanOps(doc, [
    { kind: 'insert', id: 'el-a', type: 'rect', x: 10, y: 20, w: 100, h: 50, color: 'ink' },
    { kind: 'insert', id: 'el-b', type: 'text', x: 200, y: 20, w: 88, h: 22, color: 'accent', text: '你好' },
  ], { kind: 'user', sessionId: 'session-user' }, T0);
  assert.equal(out.ok, true);
  return out.doc;
}

/* ------------------------------------------------------------------ */
console.log('--- model: human operations ---');

{
  const doc = model.createCanvas('cv-test-0001', '画板', T0);
  eq('createCanvas rev', doc.rev, 0);
  eq('createCanvas schemaVersion', doc.schemaVersion, 2);
  eq('createCanvas empty elements', Object.keys(doc.elements).length, 0);
}

{
  const doc = seedCanvas();
  eq('human insert rev', doc.rev, 1);
  eq('human insert element count', Object.keys(doc.elements).length, 2);
  const change = doc.changes[doc.changes.length - 1];
  eq('human change author kind', change.author.kind, 'user');
  eq('human change op kinds', change.ops.map((op) => op.kind), ['insert', 'insert']);
  eq('insert fieldRevs', doc.elements['el-a'].fieldRevs.color, 1);
  eq('insert origin', doc.elements['el-a'].origin, 'user');

  const recolored = model.applyHumanOps(doc, [
    { kind: 'replace', id: 'el-a', fields: { color: 'red', x: 10 } },
    { kind: 'delete', id: 'el-b' },
  ], { kind: 'user', sessionId: 'session-user' }, T0 + 1);
  eq('replace+delete ok', recolored.ok, true);
  eq('replace+delete rev', recolored.doc.rev, 2);
  eq('replace color', recolored.doc.elements['el-a'].color, 'red');
  eq('replace fieldRev', recolored.doc.elements['el-a'].fieldRevs.color, 2);
  eq('delete removed', recolored.doc.elements['el-b'], undefined);
  const change2 = recolored.doc.changes[recolored.doc.changes.length - 1];
  const replaceOp = change2.ops.find((op) => op.kind === 'replace');
  eq('replace op from/to', replaceOp.fields.color, { from: 'ink', to: 'red', revAfter: 2 });
  eq('delete op keeps old element', change2.ops.find((op) => op.kind === 'delete').element.type, 'text');
}

{
  const doc = seedCanvas();
  const undo = model.undoChange(doc, 1, { kind: 'user', sessionId: 'session-user' }, T0 + 2);
  eq('undo change ok', undo.ok, true);
  eq('undo removes elements', Object.keys(undo.doc.elements).length, 0);
}

/* ------------------------------------------------------------------ */
console.log('--- model: claims / patch validation ---');

{
  const doc = seedCanvas();
  const basis = model.captureBasis(doc, ['el-a', 'el-b']);
  eq('basis rect fields', Object.keys(basis['el-a']).sort(), ['color', 'h', 'w', 'x', 'y']);
  eq('basis text fields', Object.keys(basis['el-b']).sort(), ['color', 'h', 'text', 'w', 'x', 'y']);
  eq('basis rev', basis['el-a'].color, 1);
}

{
  const doc = seedCanvas();
  const claim = { claimId: 'lk-test-0001', ids: ['el-a'], basis: model.captureBasis(doc, ['el-a']), staged: { replace: [], insert: [] } };
  const okPatch = model.normalizeModelPatch(doc, claim, {
    replace: [{ id: 'el-a', color: 'green' }],
    insert: [{ type: 'text', x: 0, y: 0, text: 'hello world', color: 'ink' }],
  });
  eq('patch accepted', okPatch.ok, true);
  eq('patch replace entry', okPatch.replace[0].fields, { color: 'green' });
  eq('patch insert temp id', okPatch.insert[0].id, 'new:1');
  eq('patch insert text', okPatch.insert[0].text, 'hello world');

  const outside = model.normalizeModelPatch(doc, claim, { replace: [{ id: 'el-b', color: 'red' }] });
  eq('patch outside claim rejected', outside.ok, false);
  ok('outside claim reason', /outside_selection/.test(outside.error));

  const empty = model.normalizeModelPatch(doc, claim, { replace: [{ id: 'el-a', type: 'ellipse' }] });
  eq('patch with no usable field ok', empty.ok, true);
  eq('patch ignored no_usable_field', empty.ignored[0].reason, 'no_usable_field');

  const penDoc = model.applyHumanOps(doc, [
    { kind: 'insert', id: 'el-pen', type: 'pen', x: 0, y: 0, w: 0, h: 0, color: 'ink', points: [[0, 0], [5, 5]] },
  ], { kind: 'user', sessionId: 'session-user' }, T0).doc;
  const penClaim = { claimId: 'lk-test-0002', ids: ['el-pen'], basis: {}, staged: { replace: [], insert: [] } };
  const penPatch = model.normalizeModelPatch(penDoc, penClaim, { replace: [{ id: 'el-pen', color: 'red' }] });
  eq('pen read-only', penPatch.ok, false);
  ok('pen read-only reason', /unsupported_type/.test(penPatch.error));
}

/* ------------------------------------------------------------------ */
console.log('--- model: turn-end merge (field-level optimistic) ---');

{
  const doc = seedCanvas();
  const claim = { claimId: 'lk-test-ab12', ids: ['el-a'], basis: model.captureBasis(doc, ['el-a']), staged: { replace: [{ id: 'el-a', fields: { color: 'green', x: 30 } }], insert: [] } };
  const merged = model.mergeClaimIntoDoc(doc, claim, T0 + 10);
  eq('merge applies cleanly', merged.result, 'applied');
  eq('merge color', merged.doc.elements['el-a'].color, 'green');
  eq('merge x', merged.doc.elements['el-a'].x, 30);
  eq('merge origin ai', merged.doc.elements['el-a'].origin, 'ai');
  eq('merge rev monotonic', merged.doc.rev, doc.rev + 1);
  eq('merge fieldRev color', merged.doc.elements['el-a'].fieldRevs.color, 2);
  eq('merge author kind', merged.doc.changes.at(-1).author.kind, 'ai');
}

{
  /* Human edits one field while the turn runs: that field conflicts, the other applies. */
  const doc = seedCanvas();
  const claim = { claimId: 'lk-test-ab12', ids: ['el-a'], basis: model.captureBasis(doc, ['el-a']), staged: { replace: [{ id: 'el-a', fields: { color: 'green', x: 30 } }], insert: [] } };
  const humanEdited = model.applyHumanOps(doc, [{ kind: 'replace', id: 'el-a', fields: { color: 'amber' } }], { kind: 'user', sessionId: 'session-user' }, T0 + 5).doc;
  const merged = model.mergeClaimIntoDoc(humanEdited, claim, T0 + 11);
  eq('partial result', merged.result, 'partial');
  eq('conflict recorded', merged.conflicts.length, 1);
  eq('conflict field', merged.conflicts[0].field, 'color');
  eq('conflict reason', merged.conflicts[0].reason, 'stale_base');
  eq('human color wins', merged.doc.elements['el-a'].color, 'amber');
  eq('other field applied', merged.doc.elements['el-a'].x, 30);
}

{
  const doc = seedCanvas();
  const stagedInsert = model.normalizeInsert(
    { type: 'rect', x: 0, y: 0, w: 10, h: 10, color: 'red' },
    { path: 'insert[0]', notes: [], now: T0 },
  ).element;
  stagedInsert.id = 'new:1';
  const claim = { claimId: 'lk-test-ab12', ids: ['el-a'], basis: model.captureBasis(doc, ['el-a']), staged: { replace: [], insert: [stagedInsert] } };
  const merged = model.mergeClaimIntoDoc(doc, claim, T0 + 12);
  const inserted = Object.values(merged.doc.elements).find((element) => element.origin === 'ai');
  ok('insert id assigned by host', /^el-ai-ab12-\d+$/.test(inserted.id));
  eq('insert element count', Object.keys(merged.doc.elements).length, 3);
}

/* ------------------------------------------------------------------ */
console.log('--- claims: TTL / overlap / ownership ---');

{
  const doc = seedCanvas();
  let clock = T0;
  const claims = createClaims(() => clock);
  const first = claims.create({ canvasId: doc.id, ids: ['el-a'], sessionId: 'session-a', doc });
  eq('claim created', first.ok, true);
  eq('claim staged zero', first.claim.stagedCount, 0);

  const overlap = claims.create({ canvasId: doc.id, ids: ['el-a', 'el-b'], sessionId: 'session-b', doc });
  eq('overlap rejected', overlap.ok, false);
  eq('overlap conflict holder', overlap.conflicts[0].ownerSessionId, 'session-a');

  const disjoint = claims.create({ canvasId: doc.id, ids: ['el-b'], sessionId: 'session-b', doc });
  eq('disjoint claim allowed', disjoint.ok, true);

  const superseded = claims.create({ canvasId: doc.id, ids: ['el-b'], sessionId: 'session-b', doc });
  eq('same-session supersede', superseded.ok, true);
  eq('other session claim intact', claims.get(first.claim.claimId) !== null, true);

  eq('heartbeat ok', claims.heartbeat(first.claim.claimId, 'session-a').ok, true);
  eq('heartbeat forbidden', claims.heartbeat(first.claim.claimId, 'session-b').ok, false);

  clock = T0 + 11 * 60 * 1000;
  eq('claim expired by TTL', claims.get(first.claim.claimId), null);
  eq('claims swept', claims.size(), 0);
}

/* ------------------------------------------------------------------ */
console.log('--- engine: durable store + commit + restart ---');

const backend = createMemoryBackend();
const store = createStore({ resolveBackend: async () => backend });
const engine = createEngine({ store });

{
  await engine.ready();
  const doc = await engine.getCanvas();
  ok('default canvas created', typeof doc.id === 'string' && doc.id.startsWith('cv-'));
  eq('default canvas empty', Object.keys(doc.elements).length, 0);

  const inserted = await engine.applyOps({
    canvasId: doc.id,
    sessionId: 'session-user',
    requestId: 'req-1',
    ops: [
      { kind: 'insert', id: 'el-x', type: 'rect', x: 0, y: 0, w: 100, h: 60, color: 'ink' },
      { kind: 'insert', id: 'el-y', type: 'rect', x: 200, y: 0, w: 100, h: 60, color: 'ink' },
    ],
  });
  eq('applyOps ok', inserted.ok, true);
  eq('applyOps rev', inserted.rev, 1);

  const replayed = await engine.applyOps({
    canvasId: doc.id, sessionId: 'session-user', requestId: 'req-1',
    ops: [{ kind: 'insert', id: 'el-z', type: 'rect', x: 0, y: 0, w: 1, h: 1, color: 'ink' }],
  });
  eq('applyOps idempotent replay', replayed.replayed, true);
  eq('replay did not duplicate', (await engine.getCanvas(doc.id)).elements['el-z'], undefined);

  const claimResult = await engine.createClaim({ canvasId: doc.id, ids: ['el-x', 'el-y'], sessionId: 'session-ai' });
  eq('engine claim ok', claimResult.ok, true);
  const claim = engine.__claims.get(claimResult.claim.claimId);

  /* The v3 tools read a canvas by id and write immediately: no claim handle is
     exposed to the model, and a stale expectRev is rejected. */
  const toolExec = { agent: { id: 'session-ai' } };
  const readTool = createReadTool(engine);
  const readOut = await readTool.execute({ canvasId: doc.id, ids: ['el-x', 'el-y'], expectRev: 1 }, toolExec);
  eq('tool read canvas id', readOut.canvasId, doc.id);
  eq('tool read rev', readOut.rev, 1);
  eq('tool read object count', readOut.objects.length, 2);
  eq('tool read canvas name', readOut.canvasName, '画板');
  eq('tool read output is lossless JSON', JSON.parse(JSON.stringify(readOut)), readOut);
  eq('tool read omits text on rects', Object.prototype.hasOwnProperty.call(readOut.objects[0], 'text'), false);
  const replaceTool = createReplaceTool(engine);
  const toolApplied = await replaceTool.execute({
    canvasId: doc.id,
    expectRev: 1,
    patches: [{ id: 'el-x', set: { color: '#2f6fed' } }],
  }, toolExec);
  eq('tool replace rev', toolApplied.rev, 2);
  eq('tool replace applied', toolApplied.applied, [{ id: 'el-x', fields: ['color'] }]);
  eq('tool replace hex color note', toolApplied.notes, ['replace[0].color: color "#2f6fed" -> "accent"']);
  eq('tool replace output is lossless JSON', JSON.parse(JSON.stringify(toolApplied)), toolApplied);
  eq('tool replace stores palette id', (await engine.getCanvas(doc.id)).elements['el-x'].color, 'accent');

  const staged = await engine.stageClaimPatch(claim, {
    replace: [{ id: 'el-x', w: 120 }],
    insert: [{ type: 'text', x: 0, y: 100, text: 'hello' }],
  });
  eq('engine stage ok', staged.ok, true);
  eq('engine staged count', staged.staged, 2);

  const committed = await engine.commitSession('session-ai', 7);
  eq('commit ok', committed.ok, true);
  const outcome = committed.outcomes[0];
  eq('commit result', outcome.result, 'applied');
  const after = await engine.getCanvas(doc.id);
  eq('committed color kept from atomic write', after.elements['el-x'].color, 'accent');
  eq('committed insert count', Object.keys(after.elements).length, 3);
  eq('commit clears claim', engine.__claims.size(), 0);
  eq('commit change author', after.changes.at(-1).author.kind, 'ai');
  eq('commit rev', after.rev, 3);

  /* The atomic write and the legacy turn-end commit both show up in /sync. */
  const sync = await engine.sync({ canvasId: doc.id, sinceRev: 1 });
  eq('sync delta seq', sync.changes.map((change) => change.seq), [2, 3]);

  const undo = await engine.undo({ canvasId: doc.id, sessionId: 'session-user', seq: 2, requestId: 'undo-1' });
  eq('undo ok', undo.ok, true);
  const undone = await engine.getCanvas(doc.id);
  eq('undo reverts color', undone.elements['el-x'].color, 'ink');
  eq('undo keeps the later v2 change', Object.keys(undone.elements).length, 3);
  const undoCommit = await engine.undo({ canvasId: doc.id, sessionId: 'session-user', seq: 3, requestId: 'undo-2' });
  eq('undo v2 commit ok', undoCommit.ok, true);
  const undone2 = await engine.getCanvas(doc.id);
  eq('undo removes ai insert', Object.keys(undone2.elements).length, 2);
  eq('undo v2 restores width', undone2.elements['el-x'].w, 100);

  const pref = await engine.setSessionPref('session-user', { lastCanvasId: doc.id });
  eq('session pref ok', pref.ok, true);

  await store.close();
  const store2 = createStore({ resolveBackend: async () => backend });
  const engine2 = createEngine({ store: store2 });
  await engine2.ready();
  const reloaded = await engine2.getCanvas(doc.id);
  ok('restart keeps canvas', reloaded !== null && reloaded.rev === undone2.rev);
  eq('restart keeps pref', (await engine2.getSessionPref('session-user')).lastCanvasId, doc.id);
  await store2.close();
}

{
  const doc = model.createCanvas('cv-arrow-0001', '画板', T0);
  const out = model.applyHumanOps(doc, [
    { kind: 'insert', id: 'el-arrow', type: 'arrow', x: 100, y: 100, w: -80, h: 40, color: 'ink' },
    { kind: 'insert', id: 'el-rect', type: 'rect', x: 0, y: 0, w: -10, h: 5, color: 'ink' },
  ], { kind: 'user', sessionId: 'session-user' }, T0);
  eq('arrow insert signed w', out.doc.elements['el-arrow'].w, -80);
  eq('arrow insert signed h', out.doc.elements['el-arrow'].h, 40);
  eq('rect insert still clamps w', out.doc.elements['el-rect'].w, 0);
  const replaced = model.applyHumanOps(out.doc, [
    { kind: 'replace', id: 'el-arrow', fields: { w: 10, h: -20 } },
  ], { kind: 'user', sessionId: 'session-user' }, T0 + 1);
  eq('arrow replace signed w', replaced.doc.elements['el-arrow'].w, 10);
  eq('arrow replace signed h', replaced.doc.elements['el-arrow'].h, -20);
  const claim = createClaims(() => T0).create({
    canvasId: out.doc.id,
    ids: ['el-arrow'],
    sessionId: 'session-ai',
    doc: out.doc,
  });
  const patch = model.normalizeModelPatch(out.doc, claim.claim, {
    replace: [{ id: 'el-arrow', w: -30, h: -5 }],
  });
  eq('model patch signed w', patch.replace[0].fields.w, -30);
  eq('model patch signed h', patch.replace[0].fields.h, -5);
}

/* ------------------------------------------------------------------ */
console.log('--- v3 tools: translation read ---');

async function rejected(label, fn, pattern) {
  let error = null;
  try {
    await fn();
  } catch (caught) {
    error = caught;
  }
  ok(label, error !== null && pattern.test(error.message));
  return error;
}

const v3Backend = createMemoryBackend();
const v3Store = createStore({ resolveBackend: async () => v3Backend });
const v3Engine = createEngine({ store: v3Store });
const v3Exec = { agent: { id: 'session-v3' } };
const v3Read = createReadTool(v3Engine);
const v3Replace = createReplaceTool(v3Engine);

{
  const seed = await v3Engine.createCanvasDocument('画板 v3');
  const canvasId = seed.id;
  await v3Engine.applyOps({
    canvasId: canvasId,
    sessionId: 'session-user',
    requestId: 'v3-seed',
    ops: [
      { kind: 'insert', id: 'el-r1', type: 'rect', x: 120, y: 80, w: 200, h: 120, color: 'ink' },
      { kind: 'insert', id: 'el-ar1', type: 'arrow', x: 320, y: 140, w: 200, h: 0, color: 'accent' },
      { kind: 'insert', id: 'el-t1', type: 'text', x: 120, y: 240, w: 88, h: 22, color: 'red', text: '请求进入网关' },
      { kind: 'insert', id: 'el-pen1', type: 'pen', x: 0, y: 0, w: 0, h: 0, color: 'ink', points: [[0, 0], [5, 5]] },
    ],
  });

  const readWhole = await v3Read.execute({ canvasId }, v3Exec);
  eq('v3 read whole canvas rev', readWhole.rev, 1);
  eq('v3 read whole canvas object count', readWhole.objects.length, 3);
  eq('v3 read excludes pen', readWhole.objects.map((item) => item.type), ['rect', 'arrow', 'text']);
  eq('v3 read whole canvas invalid empty', readWhole.invalid, []);
  eq('v3 read object fields', Object.keys(readWhole.objects[0]).sort(), ['color', 'h', 'id', 'rev', 'type', 'w', 'x', 'y']);
  eq('v3 read text carries text', readWhole.objects[2].text, '请求进入网关');
  eq('v3 read objects are lossless JSON', JSON.parse(JSON.stringify(readWhole)), readWhole);
  const translation = v3Read.output.render({}, readWhole)[0].text;
  ok('v3 read translation header', translation.includes('【画板选区引用】画板 v3 · 3 个对象 · rev 1'));
  ok('v3 read translation rect line', translation.includes('- el-r1 · 矩形 · 位置(120,80) · 200×120 · 填充 #1f2329（ink）'));
  ok('v3 read translation arrow line', translation.includes('- el-ar1 · 箭头 · (320,140) → (520,140) · 描边 #2f6fed（accent） · 线宽 2.2'));
  ok('v3 read translation text line', translation.includes('- el-t1 · 文本 · 位置(120,240) · 字号 22 · 颜色 #d9343a（red） · 内容「请求进入网关」'));
  ok('v3 read translation includes JSON', translation.includes('"canvasId"') && translation.includes('"objects"'));

  await rejected(
    'v3 read stale expectRev',
    () => v3Read.execute({ canvasId, expectRev: 0 }, v3Exec),
    /^stale_revision: canvas is at rev 1, expected 0; call whiteboard_read_selection again for fresh data$/,
  );

  const readIds = await v3Read.execute({ canvasId, ids: ['el-r1', 'el-gone'] }, v3Exec);
  eq('v3 read explicit ids keeps existing', readIds.objects.map((item) => item.id), ['el-r1']);
  eq('v3 read deleted id is invalid', readIds.invalid, ['el-gone']);
  ok('v3 read invalid id marked in translation', v3Read.output.render({}, readIds)[0].text.includes('- el-gone · 已删除（invalid）'));
  const readPen = await v3Read.execute({ canvasId, ids: ['el-pen1'] }, v3Exec);
  eq('v3 read pen id excluded', readPen.objects, []);
  eq('v3 read pen id is not invalid', readPen.invalid, []);

  await rejected('v3 read missing canvas', () => v3Read.execute({ canvasId: 'cv-missing' }, v3Exec), /^canvas_not_found: /);

  const big = await v3Engine.createCanvasDocument('大画板');
  const bigOps = [];
  for (let i = 0; i < 41; i += 1) {
    bigOps.push({ kind: 'insert', id: 'el-big-' + i, type: 'rect', x: i * 10, y: 0, w: 10, h: 10, color: 'ink' });
  }
  await v3Engine.applyOps({ canvasId: big.id, sessionId: 'session-user', requestId: 'v3-big', ops: bigOps });
  await rejected('v3 read whole canvas too large', () => v3Read.execute({ canvasId: big.id }, v3Exec), /^too_large: limit 40 objects per read/);
  const manyIds = Array.from({ length: 41 }, (_, i) => 'el-big-' + i);
  await rejected('v3 read explicit ids too large', () => v3Read.execute({ canvasId: big.id, ids: manyIds }, v3Exec), /^too_large: limit 40 objects per read/);
  const underLimit = await v3Read.execute({ canvasId: big.id, ids: manyIds.slice(0, 40) }, v3Exec);
  eq('v3 read explicit ids under limit', underLimit.objects.length, 40);

  /* --- AI switch (Host side) --- */
  await v3Engine.setSessionPref('session-v3', { aiByCanvas: { [canvasId]: false } });
  await rejected('v3 read ai disabled', () => v3Read.execute({ canvasId }, v3Exec), /^ai_disabled: AI is turned off for this canvas/);
  await rejected(
    'v3 replace ai disabled',
    () => v3Replace.execute({ canvasId, expectRev: 1, patches: [{ id: 'el-r1', set: { color: 'red' } }] }, v3Exec),
    /^ai_disabled: /,
  );
  await v3Engine.setSessionPref('session-v3', { aiByCanvas: { [canvasId]: true } });
  eq('v3 read ai re-enabled', (await v3Read.execute({ canvasId }, v3Exec)).objects.length, 3);

  /* --- pref merge: lastCanvasId + aiByCanvas live together --- */
  const prefLast = await v3Engine.setSessionPref('session-v3', { lastCanvasId: canvasId });
  eq('v3 pref stores lastCanvasId', prefLast.pref.lastCanvasId, canvasId);
  const prefAi = await v3Engine.setSessionPref('session-v3', { aiByCanvas: { [canvasId]: false } });
  eq('v3 pref merge keeps lastCanvasId', prefAi.pref.lastCanvasId, canvasId);
  eq('v3 pref merge stores aiByCanvas', prefAi.pref.aiByCanvas, { [canvasId]: false });
  eq('v3 pref has updatedAt', typeof prefAi.pref.updatedAt, 'number');
  const prefAgain = await v3Engine.setSessionPref('session-v3', { lastCanvasId: canvasId });
  eq('v3 pref merge keeps aiByCanvas', prefAgain.pref.aiByCanvas, { [canvasId]: false });
  eq('v3 getSessionPref returns merge', (await v3Engine.getSessionPref('session-v3')).aiByCanvas, { [canvasId]: false });
  await v3Engine.setSessionPref('session-v3', { aiByCanvas: { [canvasId]: true } });

  /* --- replace: atomic write, stale, applied fields, inserts-only --- */
  await rejected(
    'v3 replace stale expectRev',
    () => v3Replace.execute({ canvasId, expectRev: 0, patches: [{ id: 'el-r1', set: { color: 'red' } }] }, v3Exec),
    /^stale_revision: canvas is at rev 1, expected 0; call whiteboard_read_selection again and retry$/,
  );
  eq('v3 replace stale leaves canvas', (await v3Engine.getCanvas(canvasId)).rev, 1);

  const applied = await v3Replace.execute({
    canvasId: canvasId,
    expectRev: 1,
    patches: [
      { id: 'el-r1', set: { color: '#2f6fed', x: 130 } },
      { id: 'el-t1', set: { text: '网关入口' } },
    ],
    inserts: [{ type: 'rect', x: 400, y: 300, w: 120, h: 80, color: 'green' }],
  }, v3Exec);
  eq('v3 replace ok', applied.ok, true);
  eq('v3 replace rev bump', applied.rev, 2);
  eq('v3 replace applied fields', applied.applied, [
    { id: 'el-r1', fields: ['x', 'color'] },
    { id: 'el-t1', fields: ['text'] },
  ]);
  eq('v3 replace hex color note', applied.notes, ['replace[0].color: color "#2f6fed" -> "accent"']);
  eq('v3 replace inserted count', applied.inserted.length, 1);
  eq('v3 replace inserted type', applied.inserted[0].type, 'rect');
  ok('v3 replace inserted id is host assigned', /^el-ai-[a-z0-9]+-1$/.test(applied.inserted[0].id));

  const namedSeed = await v3Engine.createCanvasDocument('命名颜色');
  await v3Engine.applyOps({
    canvasId: namedSeed.id,
    sessionId: 'session-user',
    requestId: 'v3-named-seed',
    ops: [{ kind: 'insert', id: 'el-n1', type: 'rect', x: 10, y: 10, w: 20, h: 20, color: 'ink' }],
  });
  const namedApplied = await v3Replace.execute({
    canvasId: namedSeed.id,
    expectRev: 1,
    patches: [{ id: 'el-n1', set: { color: '蓝' } }],
  }, v3Exec);
  eq('v3 replace named color note', namedApplied.notes, ['replace[0].color: color "蓝" -> "accent"']);
  eq('v3 replace named color stored', (await v3Engine.getCanvas(namedSeed.id)).elements['el-n1'].color, 'accent');
  eq('v3 replace conflicts empty', applied.conflicts, []);
  eq('v3 replace ignored empty', applied.ignored, []);
  eq('v3 replace output is lossless JSON', JSON.parse(JSON.stringify(applied)), applied);
  const afterWrite = await v3Engine.getCanvas(canvasId);
  eq('v3 replace hex became palette id', afterWrite.elements['el-r1'].color, 'accent');
  eq('v3 replace text updated', afterWrite.elements['el-t1'].text, '网关入口');
  eq('v3 replace adds one element', Object.keys(afterWrite.elements).length, 5);
  eq('v3 replace one ai change', afterWrite.changes.at(-1).author.kind, 'ai');
  eq('v3 replace change seq', afterWrite.changes.at(-1).seq, 2);
  eq('v3 replace no claims left', v3Engine.__claims.size(), 0);
  ok('v3 replace render summary', v3Replace.output.render({}, applied)[0].text
    .includes('已应用 2 个对象的修改，新增 1 个对象，画板 rev 2。'));

  const insertOnly = await v3Replace.execute({ canvasId, expectRev: 2, inserts: [{ type: 'text', x: 40, y: 400, text: '新增对象', color: 'amber' }] }, v3Exec);
  eq('v3 replace inserts-only ok', insertOnly.ok, true);
  eq('v3 replace inserts-only rev', insertOnly.rev, 3);
  eq('v3 replace inserts-only applied empty', insertOnly.applied, []);
  eq('v3 replace inserts-only inserted', insertOnly.inserted.length, 1);
  eq('v3 replace inserts-only type', insertOnly.inserted[0].type, 'text');

  const withMissing = await v3Replace.execute({
    canvasId: canvasId,
    expectRev: 3,
    patches: [
      { id: 'el-gone', set: { color: 'red' } },
      { id: 'el-r1', set: { x: 140 } },
    ],
  }, v3Exec);
  eq('v3 replace ignores deleted id', withMissing.ignored, [{ id: 'el-gone', reason: 'missing' }]);
  eq('v3 replace still applies live id', withMissing.applied, [{ id: 'el-r1', fields: ['x'] }]);
  eq('v3 replace partial rev', withMissing.rev, 4);

  await rejected('v3 replace empty patch', () => v3Replace.execute({ canvasId, expectRev: 4 }, v3Exec), /^invalid_proposal: empty patch/);
  await rejected(
    'v3 replace bad insert type',
    () => v3Replace.execute({ canvasId, expectRev: 4, inserts: [{ type: 'pen', x: 0, y: 0 }] }, v3Exec),
    /^invalid_proposal: unsupported_type/,
  );
  await rejected(
    'v3 replace missing canvas',
    () => v3Replace.execute({ canvasId: 'cv-missing', expectRev: 0, inserts: [{ type: 'rect', x: 0, y: 0 }] }, v3Exec),
    /^canvas_not_found: /,
  );

  /* --- human edits win: a read records the field basis, a later human edit
     makes that one field stale while the rest of the patch still applies. --- */
  const conflictCanvas = await v3Engine.createCanvasDocument('冲突板');
  await v3Engine.applyOps({
    canvasId: conflictCanvas.id,
    sessionId: 'session-user',
    requestId: 'v3-conflict-1',
    ops: [{ kind: 'insert', id: 'el-c1', type: 'rect', x: 0, y: 0, w: 100, h: 50, color: 'ink' }],
  });
  const readForConflict = await v3Engine.readModelSelection({ canvasId: conflictCanvas.id, ids: ['el-c1'], sessionId: 'session-v3' });
  eq('v3 conflict read rev', readForConflict.rev, 1);
  await v3Engine.applyOps({
    canvasId: conflictCanvas.id,
    sessionId: 'session-user',
    requestId: 'v3-conflict-2',
    ops: [{ kind: 'replace', id: 'el-c1', fields: { color: 'amber' } }],
  });
  const conflicted = await v3Engine.applyModelPatch({
    canvasId: conflictCanvas.id,
    expectRev: 2,
    sessionId: 'session-v3',
    patches: [{ id: 'el-c1', set: { color: 'green', w: 140 } }],
  });
  eq('v3 conflict ok', conflicted.ok, true);
  eq('v3 conflict change seq', conflicted.changeSeq, 3);
  eq('v3 conflict reports field', conflicted.conflicts, [{ id: 'el-c1', field: 'color', reason: 'stale_base' }]);
  eq('v3 conflict applies other field', conflicted.applied, [{ id: 'el-c1', fields: ['w'] }]);
  const conflictDoc = await v3Engine.getCanvas(conflictCanvas.id);
  eq('v3 conflict keeps human value', conflictDoc.elements['el-c1'].color, 'amber');
  eq('v3 conflict applies width', conflictDoc.elements['el-c1'].w, 140);

  /* The same race through the tool interface: stale expectRev is rejected
     without a crash and the human value stays. */
  await rejected(
    'v3 human edit then stale AI patch',
    () => v3Replace.execute({
      canvasId: conflictCanvas.id,
      expectRev: 2,
      patches: [{ id: 'el-c1', set: { color: 'red' } }],
    }, v3Exec),
    /^stale_revision: canvas is at rev 3, expected 2/,
  );
  eq('v3 human edit kept after stale patch', (await v3Engine.getCanvas(conflictCanvas.id)).elements['el-c1'].color, 'amber');

  /* --- selective undo of one AI change --- */
  const undoAi = await v3Engine.undo({ canvasId: canvasId, sessionId: 'session-user', seq: 2, requestId: 'v3-undo-ai' });
  eq('v3 undo ai ok', undoAi.ok, true);
  const undoneCanvas = await v3Engine.getCanvas(canvasId);
  eq('v3 undo ai reverts color', undoneCanvas.elements['el-r1'].color, 'ink');
  eq('v3 undo ai reverts text', undoneCanvas.elements['el-t1'].text, '请求进入网关');
  eq('v3 undo ai keeps later field edit', undoneCanvas.elements['el-r1'].x, 140);
  eq('v3 undo ai removes inserted', Object.keys(undoneCanvas.elements).length, 5);

  /* Nothing staged by the v3 tools, so the turn-end commit is a no-op. */
  const commitAfterReplace = await v3Engine.commitSession('session-v3', 11);
  eq('v3 turn-end commit finds no staged claim', commitAfterReplace.outcomes, []);
  eq('v3 turn-end commit leaves rev', (await v3Engine.getCanvas(canvasId)).rev, 5);
  eq('v3 no claims after tools', v3Engine.__claims.size(), 0);

  /* --- pure translation helper + hex normalization --- */
  const pureTranslation = model.translateSelection({
    canvasName: '默认画板',
    rev: 12,
    objects: [
      { id: 'o1', type: 'rect', x: 120, y: 80, w: 200, h: 120, color: 'amber' },
      { id: 'o2', type: 'arrow', x: 320, y: 140, w: 200, h: 0, color: 'ink' },
      { id: 'o3', type: 'text', x: 120, y: 240, w: 88, h: 22, color: 'ink', text: 'x'.repeat(140) },
    ],
    invalid: [{ id: 'o9', reason: 'missing' }],
  });
  ok('v3 translation helper header', pureTranslation.startsWith('【画板选区引用】默认画板 · 3 个对象 · rev 12'));
  ok('v3 translation helper rect', pureTranslation.includes('- o1 · 矩形 · 位置(120,80) · 200×120 · 填充 #d98b0f（amber）'));
  ok('v3 translation helper arrow', pureTranslation.includes('- o2 · 箭头 · (320,140) → (520,140) · 描边 #1f2329（ink） · 线宽 2.2'));
  ok('v3 translation helper truncates text', pureTranslation.includes('内容「' + 'x'.repeat(120) + '…」'));
  ok('v3 translation helper invalid line', pureTranslation.includes('- o9 · 已删除（invalid）'));
  eq('v3 hex exact mapping', model.paletteIdForHex('#2F6FED'), 'accent');
  eq('v3 hex nearest mapping', model.paletteIdForHex('#f00'), 'red');
  eq('v3 unknown color falls back to ink', model.paletteIdForHex('not-a-color'), 'ink');

  await v3Store.close();
}

/* ------------------------------------------------------------------ */
console.log('--- http surface ---');

{
  const httpBackend = createMemoryBackend();
  const httpStore = createStore({ resolveBackend: async () => httpBackend });
  const httpEngine = createEngine({ store: httpStore });
  const handler = createRouteHandler(httpEngine);

  function request(options) {
    const body = options.body === undefined ? null : Buffer.from(JSON.stringify(options.body));
    const chunks = body ? [body] : [];
    return {
      method: options.method || 'GET',
      url: 'http://127.0.0.1:3080' + options.url,
      headers: Object.assign({ host: '127.0.0.1:3080' }, options.headers || {}),
      async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk; },
    };
  }
  function response() {
    const state = { status: 0, headers: null, body: '' };
    return {
      writeHead(status, headers) { state.status = status; state.headers = headers; },
      end(body) { state.body = body; },
      get status() { return state.status; },
      json() { return JSON.parse(state.body); },
    };
  }
  async function call(options) {
    const res = response();
    await handler(request(options), res);
    return res;
  }

  const health = await call({ url: '/api/whiteboard/v2/health' });
  eq('route health 200', health.status, 200);

  const canvasRes = await call({ url: '/api/whiteboard/v2/canvas' });
  eq('route canvas 200', canvasRes.status, 200);
  const canvasPayload = canvasRes.json();
  const canvasId = canvasPayload.canvas.id;
  eq('route canvas empty', canvasPayload.canvas.elements.length, 0);

  const opRes = await call({
    method: 'POST', url: '/api/whiteboard/v2/op',
    headers: { 'content-type': 'application/json' },
    body: { canvasId, sessionId: 'session-user', requestId: 'http-op-1', ops: [{ kind: 'insert', id: 'el-h1', type: 'rect', x: 0, y: 0, w: 10, h: 10, color: 'ink' }] },
  });
  eq('route op 200', opRes.status, 200);
  eq('route op rev', opRes.json().rev, 1);

  const prefRes = await call({
    method: 'POST', url: '/api/whiteboard/v2/session-pref',
    headers: { 'content-type': 'application/json' },
    body: { sessionId: 'session-http-pref', lastCanvasId: canvasId, aiByCanvas: { [canvasId]: false } },
  });
  eq('route session-pref 200', prefRes.status, 200);
  eq('route session-pref aiByCanvas', prefRes.json().pref.aiByCanvas, { [canvasId]: false });
  eq('route session-pref lastCanvasId', prefRes.json().pref.lastCanvasId, canvasId);
  const prefGetRes = await call({ url: '/api/whiteboard/v2/session-pref?sessionId=session-http-pref' });
  eq('route session-pref get aiByCanvas', prefGetRes.json().pref.aiByCanvas, { [canvasId]: false });
  const prefMergeRes = await call({
    method: 'POST', url: '/api/whiteboard/v2/session-pref',
    headers: { 'content-type': 'application/json' },
    body: { sessionId: 'session-http-pref', lastCanvasId: canvasId },
  });
  eq('route session-pref merge keeps aiByCanvas', prefMergeRes.json().pref.aiByCanvas, { [canvasId]: false });
  eq('route session-pref merge keeps lastCanvasId', prefMergeRes.json().pref.lastCanvasId, canvasId);

  const claimRes = await call({
    method: 'POST', url: '/api/whiteboard/v2/claim',
    headers: { 'content-type': 'application/json' },
    body: { canvasId, sessionId: 'session-a', ids: ['el-h1'] },
  });
  eq('route claim 200', claimRes.status, 200);
  const claimId = claimRes.json().claim.claimId;

  const overlapRes = await call({
    method: 'POST', url: '/api/whiteboard/v2/claim',
    headers: { 'content-type': 'application/json' },
    body: { canvasId, sessionId: 'session-b', ids: ['el-h1'] },
  });
  eq('route claim conflict 409', overlapRes.status, 409);
  eq('route conflict payload', overlapRes.json().conflicts.length, 1);

  const heartbeatRes = await call({
    method: 'POST', url: '/api/whiteboard/v2/claim/heartbeat',
    headers: { 'content-type': 'application/json' },
    body: { claimId, sessionId: 'session-a' },
  });
  eq('route heartbeat 200', heartbeatRes.status, 200);

  const abortRes = await call({
    method: 'POST', url: '/api/whiteboard/v2/claim/abort',
    headers: { 'content-type': 'application/json' },
    body: { claimId, sessionId: 'session-a' },
  });
  eq('route abort 200', abortRes.status, 200);

  const syncRes = await call({ url: '/api/whiteboard/v2/sync?canvasId=' + canvasId + '&sinceRev=0' });
  eq('route sync 200', syncRes.status, 200);
  eq('route sync delta', syncRes.json().changes.length, 1);

  const exportRes = await call({ url: '/api/whiteboard/v2/export?canvasId=' + canvasId });
  eq('route export 200', exportRes.status, 200);

  const badOrigin = await call({ url: '/api/whiteboard/v2/canvas', headers: { origin: 'https://evil.example' } });
  eq('route origin 403', badOrigin.status, 403);

  const listRes = await call({ url: '/api/whiteboard/v2/canvases' });
  eq('route canvases 200', listRes.status, 200);
  ok('route canvases includes default', listRes.json().canvases.some((item) => item.id === canvasId));

  const renameRes = await call({
    method: 'POST', url: '/api/whiteboard/v2/canvas/rename',
    headers: { 'content-type': 'application/json' },
    body: { canvasId: canvasId, name: '重命名板' },
  });
  eq('route rename 200', renameRes.status, 200);
  eq('route rename name', renameRes.json().canvas.name, '重命名板');

  const deleteRes = await call({
    method: 'POST', url: '/api/whiteboard/v2/canvas/delete',
    headers: { 'content-type': 'application/json' },
    body: { canvasId: canvasId },
  });
  eq('route delete 200', deleteRes.status, 200);
  ok('route delete picks a default', typeof deleteRes.json().defaultCanvasId === 'string');
  const listAfter = await call({ url: '/api/whiteboard/v2/canvases' });
  ok('route delete removed canvas', !listAfter.json().canvases.some((item) => item.id === canvasId));

  await httpStore.close();
}

console.log('\n' + passed + ' checks passed');
console.log('SMOKE OK');




