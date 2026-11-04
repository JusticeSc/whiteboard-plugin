/**
 * Canvas v3 browser e2e — isolated DSH home, real Chrome.
 *
 * Covers the v3 carrier + bridge without touching the user's store:
 *   - boot a throwaway `dsh web` with DSH_HOME under <workspace>/.spike-e2e
 *     (credentials copied read-only; profile link points at this package);
 *   - open the board from the native right-sidebar "new tab" guide;
 *   - draw two rectangles, select them, get the composer dock chip;
 *   - insert the native reference chip and send one message with it;
 *   - AI switch off hides the dock chip, on restores it;
 *   - no conversation-scoped whiteboard view remains (single .dsh-wb);
 *   - real DSH_HOME sessions/canvases are byte/mtime identical afterwards.
 *
 * Run: node test/e2e/v3.mjs   (from whiteboard-plugin-v2/test/e2e)
 */
import { spawn, execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const workspace = path.resolve(repo, '..');
const scratchRoot = path.join(workspace, '.spike-e2e');
const home = path.join(scratchRoot, 'dsh-home');
const artifacts = path.join(here, '.artifacts');
fs.mkdirSync(artifacts, { recursive: true });
/* Every run starts from a clean isolated store so element/rev assertions are
   deterministic; WB_E2E_KEEP_HOME=1 keeps it for debugging. */
if (process.env.WB_E2E_KEEP_HOME !== '1') fs.rmSync(home, { recursive: true, force: true });
fs.mkdirSync(home, { recursive: true });

const PORT = Number(process.env.WB_E2E_PORT || 3092);
const ORIGIN = 'http://127.0.0.1:' + PORT;
const TURN_TIMEOUT = Number(process.env.WB_E2E_TIMEOUT || 240000);
const realHome = process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh');

let host = null;
let browser = null;
let page = null;
let hostLog = '';
const pageErrors = [];
const consoleErrors = [];

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (error) { /* gone */ }
}

/** Copy credentials only; never write to the real DSH home. */
function seedCredentials() {
  const source = path.join(realHome, '.credentials.yaml');
  const target = path.join(home, '.credentials.yaml');
  if (!fs.existsSync(target) && fs.existsSync(source)) fs.copyFileSync(source, target);
}

/** Snapshot the parts of the real store the run must not touch. */
function snapshotRealStore() {
  const snapshot = { sessions: [], whiteboard: [], workspaceMtime: null };
  const sessionsRoot = path.join(realHome, 'sessions');
  const collect = (dir, out) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (error) { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      let stat = null;
      try { stat = fs.statSync(full); } catch (error) { continue; }
      out.push(full.slice(realHome.length) + '|' + stat.size + '|' + Math.round(stat.mtimeMs));
    }
  };
  let workspaces = [];
  try { workspaces = fs.readdirSync(sessionsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()); } catch (error) { /* none */ }
  for (const entry of workspaces) collect(path.join(sessionsRoot, entry.name), snapshot.sessions);
  collect(path.join(realHome, 'storages', 'whiteboard'), snapshot.whiteboard);
  try {
    const stat = fs.statSync(path.join(realHome, 'storages', 'workspace.json'));
    snapshot.workspaceMtime = Math.round(stat.mtimeMs) + '|' + stat.size;
  } catch (error) { /* none */ }
  return snapshot;
}

async function spawnHost() {
  const child = spawn('dsh', ['web', '--port', String(PORT), '--host', '127.0.0.1', '--no-open'], {
    cwd: repo,
    shell: true,
    env: { ...process.env, DSH_HOME: home, DSH_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buffer = '';
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('host did not print a token URL in 90s:\n' + buffer)), 90000);
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    child.stderr.on('data', (chunk) => { buffer += chunk.toString(); });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error('host exited early with ' + code + ':\n' + buffer)); });
  });
  hostLog = buffer;
  return { child, url };
}

async function waitHealth() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(ORIGIN + '/api/whiteboard/v2/health', { cache: 'no-store' });
      if (response.ok) return;
    } catch (error) { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('whiteboard health route did not answer within 40s:\n' + hostLog);
}

function installPluginLink() {
  const profileDir = path.join(home, 'profiles', 'web');
  const pkgFile = path.join(profileDir, 'package.json');
  if (!fs.existsSync(pkgFile)) throw new Error('isolated profile was not initialized: ' + profileDir);
  const pkgName = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).name;
  const link = path.join(profileDir, 'node_modules', ...pkgName.split('/'));
  fs.mkdirSync(path.dirname(link), { recursive: true });
  if (fs.existsSync(link)) fs.rmSync(link, { recursive: true, force: true });
  fs.symlinkSync(repo, link, 'junction');
  const profile = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  profile.dependencies = profile.dependencies || {};
  profile.dependencies[pkgName] = 'link:' + repo.replace(/\\/g, '/');
  profile.dsh = profile.dsh || {};
  profile.dsh.profile = profile.dsh.profile || {};
  profile.dsh.profile.bundles = profile.dsh.profile.bundles || [];
  if (!profile.dsh.profile.bundles.includes(pkgName)) profile.dsh.profile.bundles.push(pkgName);
  fs.writeFileSync(pkgFile, JSON.stringify(profile, null, 2) + '\n', 'utf8');
}

async function bootIsolated() {
  seedCredentials();
  /* First boot initializes profiles/web for this DSH_HOME. */
  if (!fs.existsSync(path.join(home, 'profiles', 'web', 'package.json'))) {
    const first = await spawnHost();
    killTree(first.child);
    await sleep(800);
  }
  installPluginLink();
  const second = await spawnHost();
  host = second.child;
  await waitHealth();
  return second.url;
}

async function readCanvases() {
  const response = await fetch(ORIGIN + '/api/whiteboard/v2/canvases', { cache: 'no-store' });
  const body = await response.json();
  return body.canvases || [];
}
async function readCanvas(canvasId) {
  const response = await fetch(ORIGIN + '/api/whiteboard/v2/canvas?canvasId=' + encodeURIComponent(canvasId), { cache: 'no-store' });
  if (!response.ok) return null;
  return (await response.json()).canvas;
}

async function waitFor(predicate, timeoutMs, label) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await predicate();
    if (last) return last;
    await sleep(300);
  }
  throw new Error('timed out waiting for ' + label + ' (last=' + JSON.stringify(last) + ')');
}

async function capture(name) {
  try { await page.screenshot({ path: path.join(artifacts, name + '.png'), fullPage: false }); } catch (error) { /* best effort */ }
}

async function dismissPreviewModal() {
  const button = page.getByRole('button', { name: '继续', exact: true });
  if (await button.count()) {
    await button.first().click();
    await page.waitForTimeout(500);
  }
}

async function waitApp() {
  await page.waitForSelector('[contenteditable="true"]', { timeout: 30000 });
  await page.waitForTimeout(600);
}

async function newSession() {
  await page.getByRole('button', { name: '新建会话', exact: true }).first().click();
  await page.waitForTimeout(900);
  await waitApp();
}

async function settleTurn() {
  await page.waitForTimeout(700);
  try { await page.waitForSelector('[aria-label="停止生成"]', { timeout: 8000 }); } catch (error) { /* fast turn */ }
  await page.waitForSelector('[aria-label="停止生成"]', { state: 'detached', timeout: TURN_TIMEOUT });
  await page.waitForTimeout(700);
}

async function sendComposer(text) {
  const composer = page.locator('[contenteditable="true"]').first();
  await composer.click();
  await composer.type(text);
  await page.keyboard.press('Enter');
}

/** True when the element exists and sits inside the visible viewport. */
async function isVisible(locator) {
  if ((await locator.count()) === 0) return false;
  const box = await locator.first().boundingBox().catch(() => null);
  if (!box) return false;
  const viewport = page.viewportSize();
  return box.width > 0 && box.height > 0 && box.x + box.width <= viewport.width + 2 && box.x >= -2;
}

/** Click the right-most top-bar button (the right-sidebar toggle in this shell). */
async function clickRightbarToggle() {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'))
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.top < 80 && rect.left > window.innerWidth * 0.6;
      })
      .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
    if (buttons.length === 0) return false;
    buttons[0].click();
    return true;
  });
}

/** Open the right sidebar (if collapsed), its add-tab guide, then the board. */
async function openBoardTab() {
  const add = page.locator('button[aria-label="新标签页"]');
  const entry = page.locator('[data-sidebar-right-guide-entry="whiteboard"]');
  if (!(await isVisible(add)) && (await entry.count()) === 0) {
    const openSidebar = page.locator('button[aria-label="打开右侧边栏"]');
    if ((await openSidebar.count()) > 0) await openSidebar.first().click({ force: true });
    else await clickRightbarToggle();
  }
  /* The rightbar opens empty sessions onto its guide, but the layout measure can
     take a beat; wait for either the guide card or the add-tab control. */
  try {
    await waitFor(async () => ((await entry.count()) > 0) || (await isVisible(add)), 12000, 'the right sidebar surface');
  } catch (error) {
    /* Older shells only reveal the rightbar after the conversation has a turn. */
    await sendComposer('你好');
    await settleTurn();
    const openSidebar = page.locator('button[aria-label="打开右侧边栏"]');
    if ((await openSidebar.count()) > 0) await openSidebar.first().click({ force: true });
    await waitFor(async () => ((await entry.count()) > 0) || (await isVisible(add)), 12000, 'the right sidebar surface after a turn');
  }
  if ((await entry.count()) === 0) {
    await add.first().click({ force: true });
    await page.waitForTimeout(800);
  }
  const card = await waitFor(async () => {
    const locator = page.locator('[data-sidebar-right-guide-entry="whiteboard"]');
    return (await locator.count()) > 0 ? locator.first() : null;
  }, 20000, 'the whiteboard entry in the sidebar guide');
  await card.click();
  await page.waitForSelector('.dsh-wb-canvas', { timeout: 30000 });
  await page.waitForTimeout(900);
}
async function canvasBox() {
  const box = await page.locator('.dsh-wb-canvas').boundingBox();
  assert.ok(box, 'canvas must have a bounding box');
  return box;
}

async function drawRect(box, x1, y1, x2, y2) {
  await page.locator('.dsh-wb-bar button[aria-label="矩形"]').click();
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

async function selectBoth(box) {
  await page.locator('.dsh-wb-bar button[aria-label="选择"]').click();
  await page.mouse.click(box.x + 90, box.y + 80);
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + 230, box.y + 80);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(600);
}

const results = {};
try {
  const before = snapshotRealStore();
  const url = await bootIsolated();
  results.host = ORIGIN;
  console.log('isolated host ready on', ORIGIN);

  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  const prefWrites = [];
  page.on('request', (request) => {
    if (!request.url().includes('/session-pref') || request.method() !== 'POST') return;
    try { prefWrites.push(JSON.parse(request.postData() || '{}')); } catch (error) { /* ignore */ }
  });
  page.on('pageerror', (error) => { pageErrors.push(error.message); console.log('[pageerror]', error.message); });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/favicon|net::ERR_ABORTED/i.test(text)) return;
    consoleErrors.push(text);
    console.log('[console error]', text);
  });

  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await waitApp();
  await dismissPreviewModal();

  /* 1. new conversation, then open the board from the native sidebar guide */
  await newSession();
  await openBoardTab();
  results.carrier = await page.evaluate(() => ({
    boardRoots: document.querySelectorAll('.dsh-wb').length,
    hasCanvas: Boolean(document.querySelector('.dsh-wb-canvas')),
    tabTitle: (() => {
      const title = document.querySelector('.dsh-wb-panel')?.closest('[data-sidebar-right-tab]');
      return title ? 'mounted' : 'missing';
    })(),
    aiToggle: (() => {
      const button = document.querySelector('.dsh-wb-ai-toggle');
      return button ? button.getAttribute('aria-pressed') : null;
    })(),
    legacyViewTab: Array.from(document.querySelectorAll('button[role="tab"]')).some((button) => (button.textContent || '').trim() === '画板'),
  }));
  assert.equal(results.carrier.hasCanvas, true, 'the board must render in the sidebar tab');
  assert.equal(results.carrier.boardRoots, 1, 'exactly one board root (no conversation view duplicate)');
  assert.equal(results.carrier.legacyViewTab, false, 'the old conversation view tab must be gone');
  await capture('v3-01-board-tab');

  /* 1b. keepMounted: the board stays mounted while another right tab is active */
  await page.locator('button[aria-label="新标签页"]').click();
  await page.waitForSelector('[data-sidebar-right-guide-entry="files"]', { timeout: 20000 });
  await page.locator('[data-sidebar-right-guide-entry="files"]').click();
  await page.waitForTimeout(1200);
  results.keepMounted = await page.evaluate(() => {
    const board = document.querySelector('.dsh-wb');
    return {
      mounted: board !== null,
      hidden: board ? board.offsetParent === null : null,
      canvases: document.querySelectorAll('.dsh-wb-canvas').length,
    };
  });
  assert.equal(results.keepMounted.mounted, true, 'the board body must stay mounted when another tab is active');
  assert.equal(results.keepMounted.hidden, true, 'the inactive board body must be hidden');
  const switchedBack = await page.evaluate(() => {
    const leaves = Array.from(document.querySelectorAll('*')).filter((node) => {
      if ((node.children || []).length > 0) return false;
      if ((node.textContent || '').trim() !== '画板') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.left > 650 && rect.top < 80;
    });
    if (leaves.length === 0) return false;
    leaves[0].click();
    return true;
  });
  assert.equal(switchedBack, true, 'the board tab must still be reachable in the tab strip');
  await page.waitForFunction(() => {
    const board = document.querySelector('.dsh-wb');
    return board !== null && board.offsetParent !== null;
  }, null, { timeout: 10000 });
  results.keepMounted.visibleAgain = true;

  /* 2. draw two rectangles and confirm the host document */
  const box = await canvasBox();
  await drawRect(box, 60, 60, 160, 140);
  await drawRect(box, 200, 60, 300, 140);
  const canvasId = await waitFor(async () => {
    const list = await readCanvases();
    if (list.length === 0) return null;
    const canvas = await readCanvas(list[0].id);
    return canvas && Object.keys(canvas.elements).length >= 2 ? list[0].id : null;
  }, 20000, 'two rectangles in the host document');
  results.draw = { canvasId: canvasId, elements: Object.keys((await readCanvas(canvasId)).elements).length };
  assert.equal(results.draw.elements, 2);
  await capture('v3-02-drawn');

  /* 3. select both -> the dock chip appears over the composer */
  await selectBoth(box);
  await page.waitForSelector('.dsh-wb-dock-chip', { timeout: 15000 });
  results.dock = { label: (await page.locator('.dsh-wb-dock-chip').innerText()).trim() };
  assert.match(results.dock.label, /画板选区 · 2 个对象/);
  results.dock.alignment = await page.evaluate(() => {
    const chip = document.querySelector('.dsh-wb-dock-chip');
    const editor = document.querySelector('[contenteditable="true"]');
    return {
      chipLeft: Math.round(chip.getBoundingClientRect().left),
      editorLeft: Math.round(editor.getBoundingClientRect().left),
      delta: Math.round(chip.getBoundingClientRect().left - editor.getBoundingClientRect().left),
    };
  });
  assert.ok(Math.abs(results.dock.alignment.delta) <= 1, 'the dock chip must line up with the composer: ' + JSON.stringify(results.dock.alignment));
  await capture('v3-03-dock-chip');

  /* 3.1 wide column: collapsing the sidebar centres the composer card (it is
     narrower than the column), so the dock chip must track the card inset
     instead of sitting at the stack edge. */
  await clickRightbarToggle();
  await page.waitForTimeout(1200);
  results.dock.wideAlignment = await page.evaluate(() => {
    const chip = document.querySelector('.dsh-wb-dock-chip');
    const editor = document.querySelector('[contenteditable="true"]');
    const card = document.querySelector('[class*="uV2eYG_card"]');
    return {
      chipLeft: chip ? Math.round(chip.getBoundingClientRect().left) : null,
      editorLeft: editor ? Math.round(editor.getBoundingClientRect().left) : null,
      cardLeft: card ? Math.round(card.getBoundingClientRect().left) : null,
      delta: chip && editor ? Math.round(chip.getBoundingClientRect().left - editor.getBoundingClientRect().left) : null,
    };
  });
  assert.ok(results.dock.wideAlignment.delta !== null && Math.abs(results.dock.wideAlignment.delta) <= 1, 'the dock chip must track the centred composer in a wide column: ' + JSON.stringify(results.dock.wideAlignment));
  await capture('v3-03b-wide-column');
  await clickRightbarToggle();
  await page.waitForTimeout(1400);
  await page.waitForSelector('.dsh-wb-dock-chip', { timeout: 15000 });
  assert.equal(await page.locator('.dsh-wb-dock-chip').count(), 1, 'the dock chip must survive collapsing and reopening the sidebar');

  /* 4. insert the native reference chip */
  await page.locator('.dsh-wb-dock-chip').click();
  await page.waitForSelector('span[data-composer-chip="whiteboard"]', { timeout: 15000 });
  results.chip = {
    chips: await page.locator('span[data-composer-chip="whiteboard"]').count(),
    composer: (await page.locator('[contenteditable="true"]').first().innerText()).trim(),
  };
  assert.equal(results.chip.chips, 1);
  await capture('v3-04-inside-composer');

  /* 5. send one message with the chip and confirm the sent-message rendering */
  await sendComposer('请只回复 E2E-OK，不要调用工具，也不要复述引用内容。');
  await settleTurn();
  const bodyText = await page.evaluate(() => document.body.innerText);
  results.send = {
    modelAnswered: bodyText.includes('E2E-OK'),
    transcriptHasChipLabel: bodyText.includes('画板选区 · 2 个对象'),
    transcriptHasInstruction: bodyText.includes('请只回复 E2E-OK'),
    rawHeaderVisible: bodyText.includes('【画板选区引用】'),
  };
  assert.equal(results.send.modelAnswered, true, 'the model must answer the turn');
  assert.equal(results.send.transcriptHasChipLabel, true, 'the sent message must render the reference chip');
  assert.equal(results.send.transcriptHasInstruction, true, 'the sent message must keep the user instruction next to the chip');
  assert.equal(results.send.rawHeaderVisible, false, 'the serialized block must not leak into the transcript');
  await capture('v3-05-sent');

  /* 6. AI switch off hides the chip, on restores it */
  await page.locator('.dsh-wb-ai-toggle').click();
  await waitFor(() => prefWrites.length > 0, 8000, 'the AI switch POST');
  const offWrite = prefWrites[prefWrites.length - 1];
  const offStored = await waitFor(async () => {
    const prefResponse = await fetch(ORIGIN + '/api/whiteboard/v2/session-pref?sessionId=' + encodeURIComponent(offWrite.sessionId), { cache: 'no-store' });
    const prefBody = await prefResponse.json();
    const pref = prefBody && prefBody.pref ? prefBody.pref : null;
    return pref && pref.aiByCanvas && pref.aiByCanvas[canvasId] === false ? pref : null;
  }, 8000, 'the stored AI switch');
  results.aiOff = {
    pressed: await page.locator('.dsh-wb-ai-toggle').getAttribute('aria-pressed'),
    dockVisible: (await page.locator('.dsh-wb-dock-chip').count()) > 0,
    prefWrite: offWrite,
    prefStored: offStored,
  };
  assert.equal(results.aiOff.pressed, 'false');
  assert.equal(results.aiOff.dockVisible, false, 'AI off must hide the reference chip');
  assert.equal(results.aiOff.prefWrite.aiByCanvas[canvasId], false, 'the switch must persist per canvas');
  assert.equal(results.aiOff.prefStored.aiByCanvas[canvasId], false, 'the Host must store the AI switch');
  await page.locator('.dsh-wb-ai-toggle').click();
  await waitFor(() => prefWrites.length > 1, 8000, 'the AI switch POST (re-enable)');
  const onWrite = prefWrites[prefWrites.length - 1];
  results.aiOn = {
    pressed: await page.locator('.dsh-wb-ai-toggle').getAttribute('aria-pressed'),
    dockVisible: (await page.locator('.dsh-wb-dock-chip').count()) > 0,
    prefWrite: onWrite,
  };
  assert.equal(results.aiOn.pressed, 'true');
  assert.equal(onWrite.aiByCanvas[canvasId], true);
  await capture('v3-06-ai-toggle');

  /* 7. optional selection snapshot (B6): toggle on, insert, send, image lands in the message */
  await page.mouse.click(box.x + box.width - 60, box.y + box.height - 60);
  await page.waitForTimeout(500);
  await selectBoth(box);
  await page.locator('.dsh-wb-snapshot-toggle').click();
  results.snapshot = {
    pressed: await page.locator('.dsh-wb-snapshot-toggle').getAttribute('aria-pressed'),
  };
  assert.equal(results.snapshot.pressed, 'true', 'the snapshot toggle must turn on');
  await page.locator('.dsh-wb-dock-chip').click();
  await waitFor(async () => {
    const status = (await page.locator('.dsh-wb-dock-note').allInnerTexts()).join(' ');
    return /已附带快照|快照添加失败/.test(status) ? status : null;
  }, 15000, 'the snapshot attach result');
  results.snapshot.previewImages = await page.evaluate(() => document.querySelectorAll('img[src^="blob:"]').length);
  assert.ok(results.snapshot.previewImages > 0, 'the composer must show the snapshot preview');
  await sendComposer('请只回复 IMG-OK，不要调用工具，也不要复述引用内容。');
  await settleTurn();
  const snapshotBody = await page.evaluate(() => ({
    text: document.body.innerText,
    blobImages: document.querySelectorAll('img[src^="blob:"]').length,
  }));
  results.snapshot.modelAnswered = snapshotBody.text.includes('IMG-OK');
  results.snapshot.messageImages = snapshotBody.blobImages;
  results.snapshot.chipLabel = snapshotBody.text.includes('画板选区 · 2 个对象');
  assert.equal(results.snapshot.modelAnswered, true, 'the model must answer the snapshot turn');
  assert.ok(results.snapshot.messageImages > 0, 'the sent user message must carry the snapshot image');
  assert.equal(results.snapshot.chipLabel, true, 'the reference chip must still render next to the image');
  await capture('v3-07-snapshot-sent');

  /* 8. the model writes the canvas through whiteboard_replace_selection, then undo */
  const beforeWrite = await readCanvas(results.draw.canvasId);
  const rectIds = beforeWrite.elements.filter((element) => element.type === 'rect').map((element) => element.id);
  const rectColors = () => beforeWrite.elements
    .filter((element) => element.type === 'rect')
    .map((element) => element.color);
  results.aiWrite = { canvasId: results.draw.canvasId, rev: beforeWrite.rev, ids: rectIds, before: rectColors(), attempts: 0 };
  await page.evaluate(() => {
    window.__wbToasts = [];
    const observer = new MutationObserver(() => {
      const toast = document.querySelector('.dsh-wb-toast');
      if (!toast) return;
      const text = toast.innerText.trim();
      if (text && !window.__wbToasts.includes(text)) window.__wbToasts.push(text);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__wbToastObserver = observer;
  });
  assert.equal(rectIds.length, 2, 'the e2e canvas must have two rectangles');
  for (let attempt = 0; attempt < 2 && !results.aiWrite.after; attempt += 1) {
    results.aiWrite.attempts = attempt + 1;
    const prompt = '请直接调用 whiteboard_replace_selection 工具，必须调用、不要问我确认、不要只解释：'
      + 'canvasId=' + results.draw.canvasId + '，expectRev=' + beforeWrite.rev + '，'
      + '用 patches 把 id 为 ' + rectIds.join(' 和 ') + ' 的两个矩形的 color 都改成蓝色（palette id "accent"，不要用 blue 这个值）。'
      + '完成后用一句话说明。';
    await sendComposer(prompt);
    await settleTurn();
    try {
      const changed = await waitFor(async () => {
        const canvas = await readCanvas(results.draw.canvasId);
        if (!canvas) return null;
        const rects = canvas.elements.filter((element) => rectIds.indexOf(element.id) !== -1);
        if (rects.length !== rectIds.length) return null;
        const wanted = ['accent', '#4176e6', '#2f6fed', 'blue'];
        return rects.every((element) => wanted.includes(element.color)) ? canvas : null;
      }, 45000, 'the model write');
      results.aiWrite.after = changed.elements.filter((element) => rectIds.indexOf(element.id) !== -1).map((element) => element.color);
      results.aiWrite.revAfter = changed.rev;
    } catch (error) {
      results.aiWrite.lastError = String(error && error.message ? error.message : error);
    }
  }
  assert.ok(results.aiWrite.after, 'the model must apply an atomic write to the canvas: ' + JSON.stringify(results.aiWrite));
  assert.equal(results.aiWrite.after.every((color) => color === results.aiWrite.after[0]), true, 'both rectangles must share the new color');
  results.aiWrite.toasts = await page.evaluate(() => window.__wbToasts || []);
  assert.equal(results.aiWrite.toasts.some((text) => text.includes('AI 修改了')), true, 'the provenance toast must appear: ' + JSON.stringify(results.aiWrite.toasts));
  results.aiWrite.toast = await page.evaluate(() => {
    const toast = document.querySelector('.dsh-wb-toast');
    return toast ? toast.innerText : '';
  });
  results.aiWrite.undoVisible = await page.locator('.dsh-wb-toast-act').count();
  await capture('v3-08-ai-write');
  if (results.aiWrite.undoVisible > 0) {
    await page.locator('.dsh-wb-toast-act').click();
  } else {
    await page.locator('.dsh-wb-canvas').click({ position: { x: 30, y: 30 } });
    await page.keyboard.press('Control+z');
  }
  await waitFor(async () => {
    const canvas = await readCanvas(results.draw.canvasId);
    if (!canvas) return null;
    const rects = canvas.elements.filter((element) => rectIds.indexOf(element.id) !== -1);
    if (rects.length !== rectIds.length) return null;
    const colors = rects.map((element) => element.color);
    return colors.join(',') === results.aiWrite.before.join(',') ? canvas : null;
  }, 20000, 'the AI change undo');
  results.aiWrite.undone = true;
  results.aiWrite.undoPath = results.aiWrite.undoVisible > 0 ? 'toast' : 'ctrl+z';

  /* 8b. AI off: the model cannot write the canvas (Host rejects both tools) */
  const beforeReject = await readCanvas(results.draw.canvasId);
  await page.locator('.dsh-wb-ai-toggle').click();
  await waitFor(() => prefWrites.length > 2, 8000, 'the AI switch POST (off before the rejection turn)');
  await sendComposer('请调用 whiteboard_replace_selection，把 canvasId=' + results.draw.canvasId
    + ' 中 id 为 ' + rectIds.join(' 和 ') + ' 的两个矩形改成红色，不要问我确认。');
  await settleTurn();
  const afterReject = await readCanvas(results.draw.canvasId);
  results.aiReject = {
    pressed: await page.locator('.dsh-wb-ai-toggle').getAttribute('aria-pressed'),
    colors: afterReject.elements.filter((element) => rectIds.indexOf(element.id) !== -1).map((element) => element.color),
    rev: afterReject.rev,
    originalRev: beforeReject.rev,
  };
  assert.equal(results.aiReject.pressed, 'false', 'the AI switch must be off for the rejection turn');
  assert.equal(results.aiReject.colors.join(','), 'ink,ink', 'AI off must leave the canvas untouched: ' + JSON.stringify(results.aiReject));
  assert.equal(results.aiReject.rev, results.aiReject.originalRev, 'AI off must not commit any change');
  await page.locator('.dsh-wb-ai-toggle').click();
  await waitFor(() => prefWrites.length > 3, 8000, 'the AI switch POST (re-enable after the rejection turn)');
  results.aiReject.reEnabled = await page.locator('.dsh-wb-ai-toggle').getAttribute('aria-pressed');
  assert.equal(results.aiReject.reEnabled, 'true');

  /* 9. dock chip re-inserts after the composer chip is deleted by hand */
  await page.locator('.dsh-wb-dock-chip').click();
  await page.waitForSelector('span[data-composer-chip="whiteboard"]', { timeout: 8000 });
  results.dockReinsert = { first: await page.locator('span[data-composer-chip="whiteboard"]').count() };
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await waitFor(async () => ((await page.locator('span[data-composer-chip="whiteboard"]').count()) === 0), 5000, 'the composer chip deletion');
  await page.waitForTimeout(900);
  await page.locator('.dsh-wb-dock-chip').click();
  await page.waitForSelector('span[data-composer-chip="whiteboard"]', { timeout: 8000 });
  results.dockReinsert.second = await page.locator('span[data-composer-chip="whiteboard"]').count();
  assert.equal(results.dockReinsert.first, 1, 'the dock must insert one native chip');
  assert.equal(results.dockReinsert.second, 1, 'the dock must be clickable again after the composer chip is deleted');
  await capture('v3-09-dock-reinsert');
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');

  /* 10. reload persistence: the board tab, canvas and AI switch survive a refresh */
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2600);
  let reloadBoard = await page.evaluate(() => !!document.querySelector('.dsh-wb'));
  if (!reloadBoard) {
    await clickRightbarToggle();
    await page.waitForTimeout(900);
    const guide = page.locator('[data-sidebar-right-guide-entry="whiteboard"]');
    if ((await guide.count()) > 0) {
      await guide.first().click();
    } else {
      await page.evaluate(() => {
        const leaves = Array.from(document.querySelectorAll('*')).filter((node) => {
          if ((node.children || []).length > 0) return false;
          if ((node.textContent || '').trim() !== '画板') return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.left > 650 && rect.top < 80;
        });
        if (leaves[0]) leaves[0].click();
      });
    }
    await page.waitForTimeout(1800);
  }
  await page.waitForSelector('.dsh-wb-canvas', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  results.reload = await page.evaluate(() => {
    const board = document.querySelector('.dsh-wb');
    const ai = document.querySelector('.dsh-wb-ai-toggle');
    return {
      boardMounted: board !== null,
      boardVisible: board !== null && board.offsetParent !== null,
      canvases: document.querySelectorAll('.dsh-wb-canvas').length,
      aiPressed: ai ? ai.getAttribute('aria-pressed') : null,
      transcriptChip: document.body.innerText.includes('画板选区 · 2 个对象'),
    };
  });
  assert.equal(results.reload.boardMounted, true, 'the board tab must survive a page reload');
  assert.equal(results.reload.boardVisible, true, 'the board tab must be visible after a page reload');
  assert.equal(results.reload.canvases, 1, 'the canvas must remount after a page reload');
  assert.equal(results.reload.aiPressed, 'true', 'the AI switch state must survive a page reload');
  assert.equal(results.reload.transcriptChip, true, 'sent reference chips must re-render after a page reload');
  await capture('v3-10-reload');

  /* 11. narrow viewport: dock stays aligned and the board bar wraps without overflow */
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(1000);
  const selectTool = page.locator('.dsh-wb-bar button[aria-label="选择"]');
  if ((await selectTool.count()) > 0 && (await selectTool.first().getAttribute('aria-pressed')) !== 'true') {
    await selectTool.first().click();
    await page.waitForTimeout(300);
  }
  const narrowBox = await canvasBox();
  await page.mouse.move(narrowBox.x + 6, narrowBox.y + 6);
  await page.mouse.down();
  await page.mouse.move(narrowBox.x + narrowBox.width - 6, narrowBox.y + narrowBox.height - 6, { steps: 10 });
  await page.mouse.up();
  await page.waitForSelector('.dsh-wb-dock-chip', { timeout: 12000 });
  results.narrowViewport = await page.evaluate(() => {
    const chip = document.querySelector('.dsh-wb-dock-chip');
    const editor = document.querySelector('[contenteditable="true"]');
    const bar = document.querySelector('.dsh-wb-bar');
    return {
      viewport: [innerWidth, innerHeight],
      chipLeft: Math.round(chip.getBoundingClientRect().left),
      editorLeft: Math.round(editor.getBoundingClientRect().left),
      delta: Math.round(chip.getBoundingClientRect().left - editor.getBoundingClientRect().left),
      barOverflow: bar ? bar.scrollWidth - bar.clientWidth : null,
    };
  });
  assert.ok(Math.abs(results.narrowViewport.delta) <= 1, 'the dock chip must stay aligned in a narrow viewport: ' + JSON.stringify(results.narrowViewport));
  assert.ok(results.narrowViewport.barOverflow <= 1, 'the board bar must wrap without horizontal overflow: ' + JSON.stringify(results.narrowViewport));
  await capture('v3-11-narrow-viewport');

  /* 12. zero-write assertion on the real DSH home */
  await sleep(1200);
  const after = snapshotRealStore();
  const diffs = [];
  if (JSON.stringify(before.sessions) !== JSON.stringify(after.sessions)) diffs.push('sessions');
  if (JSON.stringify(before.whiteboard) !== JSON.stringify(after.whiteboard)) diffs.push('whiteboard-store');
  if (before.workspaceMtime !== after.workspaceMtime) diffs.push('workspace.json');
  results.zeroWrite = { ok: diffs.length === 0, diffs: diffs };
  assert.deepEqual(diffs, [], 'real DSH store must not change');

  results.pageErrors = pageErrors;
  results.consoleErrors = consoleErrors;
  assert.deepEqual(pageErrors, [], 'no page errors');
  assert.deepEqual(consoleErrors, [], 'no console errors');

  console.log(JSON.stringify(results, null, 2));
  console.log('E2E V3 OK');
  process.exitCode = 0;
} catch (error) {
  results.failure = String(error && error.stack ? error.stack : error);
  results.pageErrors = pageErrors;
  results.consoleErrors = consoleErrors;
  try {
    results.diagnostics = await page.evaluate(() => {
      const describe = (el) => {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          cls: String(el.className || '').slice(0, 80),
          label: el.getAttribute && el.getAttribute('aria-label'),
          title: el.getAttribute && el.getAttribute('title'),
          text: (el.textContent || '').trim().slice(0, 30),
          x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height),
        };
      };
      const points = [1180, 1227, 1258].map((x) => ({ x: x, el: describe(document.elementFromPoint(x, 25)) }));
      const buttons = Array.from(document.querySelectorAll('button'))
        .filter((button) => {
          const rect = button.getBoundingClientRect();
          return rect.top < 80 && rect.width > 0;
        })
        .map(describe);
      const sidebar = document.querySelector('[data-rightbar-col]');
      return {
        points: points,
        buttons: buttons.slice(0, 20),
        rightbar: sidebar ? describe(sidebar) : null,
        addTab: (() => {
          const el = document.querySelector('button[aria-label="新标签页"]');
          return el ? describe(el) : null;
        })(),
        expandButton: (() => {
          const el = document.querySelector('button[aria-label="打开右侧边栏"]');
          return el ? describe(el) : null;
        })(),
      };
    });
  } catch (diagnosticError) { results.diagnostics = String(diagnosticError.message); }
  await capture('v3-99-failure');
  console.error(JSON.stringify(results, null, 2));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  killTree(host);
  fs.writeFileSync(path.join(artifacts, 'v3-result.json'), JSON.stringify(results, null, 2));
}





















