/** Run: node test/install-rollback-isolation.mjs (Windows behavioral checks). */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import fs from 'node:fs';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const fixtureUrl = new URL('./e2e/install-rollback.mjs', import.meta.url);
const fixtureSource = fs.readFileSync(fixtureUrl, 'utf8');
const fixtureMarker = '// WHITEBOARD_DISPOSABLE_INSTALL_ROLLBACK_FIXTURE_V1';
const phases = ['prepared', 'installed', 'rolledBack'];
const windowsOnly = { skip: process.platform !== 'win32' && 'requires Windows junctions and Windows PowerShell' };
function assertSafeSource(source = fixtureSource) {
  assert.ok(source.startsWith(fixtureMarker),
    'refusing to import or execute the legacy real-profile probe');
}
async function loadFixture() {
  assertSafeSource();
  return (await import(fixtureUrl)).runInstallRollbackFixture;
}
function checkPhase(phase, fixture) {
  assert.ok(phases.includes(phase));
  const { root, currentDir, v1Dir, link, profilePackage } = fixture;
  assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('whiteboard-install-rollback-'));
  for (const owned of [currentDir, v1Dir, link, profilePackage, fixture.home, fixture.temp]) {
    const relative = path.relative(root, owned);
    assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
  }
  const expectedTarget = phase === 'installed' ? currentDir : v1Dir;
  assert.ok(fs.lstatSync(link).isSymbolicLink(), 'profile entry must remain a junction');
  assert.equal(path.resolve(fs.readlinkSync(link)).toLowerCase(), expectedTarget.toLowerCase(), 'exact junction target');
  assert.equal(fs.realpathSync(link).toLowerCase(), fs.realpathSync(expectedTarget).toLowerCase());
  assert.deepEqual(JSON.parse(fs.readFileSync(profilePackage, 'utf8').replace(/^\uFEFF/, '')), {
    name: 'synthetic-web-profile',
    private: true,
    dependencies: {
      '@local/whiteboard': 'link:' + expectedTarget.replace(/\\/g, '/'),
      '@local/unrelated': 'link:../unrelated',
      'other-package': '1.2.3',
    },
    fixtureSettings: { preserved: true, nested: ['synthetic', 'unchanged'] },
  }, 'complete profile manifest must survive each switch');
  assert.equal(fs.readFileSync(fixture.currentSentinel, 'utf8'), 'synthetic current checkout\n');
  assert.equal(fs.readFileSync(fixture.v1Sentinel, 'utf8'), 'synthetic v1 checkout\n');
  for (const name of ['install-v3.ps1', 'rollback-v1.ps1']) {
    assert.deepEqual(fs.readFileSync(path.join(currentDir, 'scripts', name)),
      fs.readFileSync(new URL('../scripts/' + name, import.meta.url)), 'original script bytes preserved');
  }
  assert.equal(fixture.childEnv.USERPROFILE, fixture.home);
  assert.equal(fixture.childEnv.HOME, fixture.home);
  assert.equal(fixture.childEnv.TEMP, fixture.temp);
  assert.equal(fixture.childEnv.TMP, fixture.temp);
  assert.equal(fixture.childEnv.DSH_HOME, undefined);
}
function assertRemoved(root) {
  assert.ok(root, 'observer must have seen an allocated root');
  assert.equal(fs.lstatSync(root, { throwIfNoEntry: false }), undefined, 'owned root must be fully removed');
}
if (process.argv.includes('--isolation-worker')) {
  try {
    const run = await loadFixture();
    await run({
      async onPhase(phase, fixture) {
        const released = once(process, 'message', { signal: AbortSignal.timeout(60_000) });
        process.send({ phase, fixture });
        const [message] = await released;
        if (message.error) throw new Error(message.error);
      },
    });
    process.send({ done: true });
  } catch (error) {
    process.send({ error: error.stack || String(error) });
    process.exitCode = 1;
  } finally {
    process.disconnect();
  }
} else {
  test('safety gate refuses to load the legacy real-profile probe', () => {
    assertSafeSource();
    assert.throws(() => assertSafeSource('// legacy real-profile probe'), /refusing to import/);
  });
  test('install and rollback preserve exact targets, full manifest and ambient state', windowsOnly, async () => {
    const run = await loadFixture();
    const environment = { ...process.env };
    const cwd = process.cwd();
    const seen = [];
    let root;
    await run({ onPhase(phase, fixture) {
      root = fixture.root;
      seen.push(phase);
      checkPhase(phase, fixture);
    } });
    assertRemoved(root);
    assert.deepEqual(seen, phases);
    assert.deepEqual({ ...process.env }, environment);
    assert.equal(process.cwd(), cwd);
  });
  for (const failedPhase of phases) {
    test('observer rejection at ' + failedPhase + ' preserves failure and removes the root', windowsOnly, async () => {
      const run = await loadFixture();
      const failure = new Error('injected observer failure at ' + failedPhase);
      const seen = [];
      let root;
      await assert.rejects(run({ async onPhase(phase, fixture) {
        root = fixture.root;
        seen.push(phase);
        checkPhase(phase, fixture);
        if (phase === failedPhase) throw failure;
      } }), error => error === failure);
      assert.deepEqual(seen, phases.slice(0, phases.indexOf(failedPhase) + 1));
      assertRemoved(root);
    });
  }
  test('independent processes overlap with distinct roots and both dispose completely', windowsOnly, async () => {
    assertSafeSource();
    const workers = [];
    let aborted;
    function reply(worker, message) {
      if (worker.child.connected) worker.child.send(message, error => {
        if (error) worker.failure = error;
      });
    }
    function failWorkers(error) {
      aborted ||= error;
      for (const worker of workers) reply(worker, { error: aborted.message });
    }
    function releasePrepared() {
      if (workers.length !== 2 || !workers.every(worker => worker.prepared)) return;
      for (const worker of workers) {
        // Both roots must exist before either process can install.
        try {
          assert.notEqual(workers[0].root.toLowerCase(), workers[1].root.toLowerCase());
          for (const other of workers) assert.ok(fs.lstatSync(other.root).isDirectory());
          reply(worker, { release: true });
        } catch (error) {
          worker.failure = error;
          failWorkers(error);
        }
      }
    }
    for (let index = 0; index < 2; index++) {
      const child = fork(fileURLToPath(import.meta.url), ['--isolation-worker'], {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        execArgv: [],
      });
      const worker = { child, seen: [], done: false, prepared: false, output: '' };
      workers.push(worker);
      child.stdout.on('data', data => { worker.output += data; });
      child.stderr.on('data', data => { worker.output += data; });
      worker.exited = new Promise(resolve => {
        child.on('error', error => { worker.failure = error; failWorkers(error); });
        child.on('close', (code, signal) => {
          worker.code = code;
          worker.signal = signal;
          if (!worker.done) failWorkers(new Error('peer exited before completion'));
          resolve();
        });
      });
      child.on('message', message => {
        if (message.error) { worker.failure = new Error(message.error); failWorkers(worker.failure); return; }
        if (message.done) { worker.done = true; return; }
        worker.root = message.fixture.root;
        worker.seen.push(message.phase);
        if (aborted) { reply(worker, { error: aborted.message }); return; }
        try {
          checkPhase(message.phase, message.fixture);
          if (message.phase === 'prepared') {
            worker.prepared = true;
            releasePrepared();
          } else reply(worker, { release: true });
        } catch (error) {
          worker.failure = error;
          failWorkers(error);
        }
      });
    }
    await Promise.all(workers.map(worker => worker.exited));
    for (const worker of workers) {
      assertRemoved(worker.root);
      assert.equal(worker.signal, null, 'worker must complete without termination');
      assert.ifError(worker.failure);
      assert.equal(worker.code, 0, worker.output);
      assert.equal(worker.done, true);
      assert.deepEqual(worker.seen, phases);
    }
  });
}
