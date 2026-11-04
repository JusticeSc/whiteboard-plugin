/**
 * Install / rollback verification without touching the running 3080 host.
 *
 * Flips the profile link `@local/whiteboard` between the preserved v1 checkout
 * and this v2 checkout, boots a throwaway `dsh web` for each, and probes the
 * routes from a real page (the token URL authenticates the browser context):
 *
 *   v1 link  -> /api/whiteboard/v2/health != 200 and /api/whiteboard/state == 200
 *   v2 link  -> /api/whiteboard/v2/health == 200 and /api/whiteboard/state != 200
 *
 * The link is restored to whatever it was before the run, even on failure.
 *
 * Run: node test/e2e/install-rollback.mjs   (from whiteboard-plugin)
 */
import { spawn, execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const profile = path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh', 'profiles', 'web');
const link = path.join(profile, 'node_modules', '@local', 'whiteboard');
const v1Dir = path.resolve(repo, '..', 'whiteboard-plugin');
const v2Dir = repo;

function linkTarget() {
  try { return fs.readlinkSync(link, { encoding: 'utf8' }).replace(/^\\\\\?\\/, ''); } catch (error) { return null; }
}
function setLink(target) {
  const stat = fs.lstatSync(link, { throwIfNoEntry: false });
  if (stat) {
    if (stat.isSymbolicLink()) fs.unlinkSync(link);
    else fs.rmSync(link, { recursive: true, force: true });
  }
  fs.symlinkSync(target, link, 'junction');
  assert.equal(fs.realpathSync(link).toLowerCase(), fs.realpathSync(target).toLowerCase(), 'link must resolve to ' + target);
}
function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (error) { /* gone */ }
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function probe(port, tokenTimeoutMs) {
  const child = spawn('dsh', ['web', '--port', String(port), '--host', '127.0.0.1', '--no-open'], {
    cwd: repo, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buffer = '';
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no token URL in ' + tokenTimeoutMs + 'ms:\n' + buffer)), tokenTimeoutMs);
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    child.stderr.on('data', (chunk) => { buffer += chunk.toString(); });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error('host exited with ' + code + ':\n' + buffer)); });
  });

  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1500);
    const statuses = await page.evaluate(async () => {
      const probe = async (path) => {
        try { return (await fetch(path, { cache: 'no-store' })).status; } catch (error) { return 0; }
      };
      return {
        v2health: await probe('/api/whiteboard/v2/health'),
        v1state: await probe('/api/whiteboard/state'),
      };
    });
    return statuses;
  } finally {
    await browser.close();
    killTree(child);
    await sleep(500);
  }
}

const original = linkTarget();
console.log('profile link before:', original);
console.log('v1 checkout:', v1Dir);
console.log('v2 checkout:', v2Dir);
assert.ok(original, 'a profile link must exist before this test');

let failures = 0;
try {
  for (const scenario of [
    { name: 'v1 (rollback)', target: v1Dir, port: 3085, expectV2: false },
    { name: 'v2 (install)', target: v2Dir, port: 3086, expectV2: true },
  ]) {
    console.log('\n--- ' + scenario.name + ' -> ' + scenario.target);
    setLink(scenario.target);
    const statuses = await probe(scenario.port, 90000);
    console.log('routes:', JSON.stringify(statuses));
    if (scenario.expectV2) {
      assert.equal(statuses.v2health, 200, 'v2 health must be 200 when v2 is installed');
      assert.notEqual(statuses.v1state, 200, 'the v1 route must not be served by v2');
    } else {
      assert.notEqual(statuses.v2health, 200, 'v2 health must not answer when v1 is installed');
      assert.equal(statuses.v1state, 200, 'the v1 route must answer when v1 is installed');
    }
    console.log('OK', scenario.name);
  }
} catch (error) {
  failures = 1;
  console.error('\nINSTALL/ROLLBACK VERIFY FAILED:', error && error.stack ? error.stack : error);
} finally {
  setLink(original);
  console.log('\nprofile link restored:', linkTarget());
}

if (failures) process.exit(1);
console.log('\nINSTALL/ROLLBACK OK');
