// WHITEBOARD_DISPOSABLE_INSTALL_ROLLBACK_FIXTURE_V1
/**
 * Exercise the original PowerShell scripts in a disposable synthetic profile.
 * Run: node test/e2e/install-rollback.mjs
 * This does not start DSH, a browser, or a model, or validate historical v1.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const childTimeoutMs = 20_000;
function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function assertDirectoryChain(root, directory) {
  assert.ok(directory === root || isInside(root, directory), 'directory must be inside the owned fixture');
  const relative = path.relative(root, directory);
  const parts = relative ? relative.split(path.sep) : [];
  let current = root;
  for (const part of ['', ...parts]) {
    if (part) current = path.join(current, part);
    const stat = fs.lstatSync(current);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'fixture directory must not be a link: ' + current);
  }
}
function assertRegularFile(root, file) {
  assert.ok(isInside(root, file), 'file must be inside the owned fixture');
  assertDirectoryChain(root, path.dirname(file));
  const stat = fs.lstatSync(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'fixture file must not be a link: ' + file);
}
function sameDirectory(a, b) {
  return fs.realpathSync.native(a).toLowerCase() === fs.realpathSync.native(b).toLowerCase();
}
function linkValue(target) {
  return 'link:' + target.replace(/\\/g, '/');
}
function profileContents(target) {
  return {
    name: 'synthetic-web-profile',
    private: true,
    dependencies: {
      '@local/whiteboard': linkValue(target),
      '@local/unrelated': 'link:../unrelated',
      'other-package': '1.2.3',
    },
    fixtureSettings: { preserved: true, nested: ['synthetic', 'unchanged'] },
  };
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}
function checkState(fixture, expectedTarget) {
  assertDirectoryChain(fixture.root, fixture.currentDir);
  assertDirectoryChain(fixture.root, fixture.v1Dir);
  assertDirectoryChain(fixture.root, path.dirname(fixture.link));
  assertRegularFile(fixture.root, fixture.profilePackage);
  assertRegularFile(fixture.root, fixture.currentSentinel);
  assertRegularFile(fixture.root, fixture.v1Sentinel);
  const stat = fs.lstatSync(fixture.link);
  assert.ok(stat.isSymbolicLink(), 'synthetic profile entry must be a junction');
  assert.ok(sameDirectory(fixture.link, expectedTarget), 'synthetic junction target must match the expected checkout');
  assert.deepEqual(readJson(fixture.profilePackage), profileContents(expectedTarget), 'profile settings and unrelated dependencies must be preserved');
  assert.equal(fs.readFileSync(fixture.currentSentinel, 'utf8'), 'synthetic current checkout\n');
  assert.equal(fs.readFileSync(fixture.v1Sentinel, 'utf8'), 'synthetic v1 checkout\n');
}
// Do not descend through junctions. Verify ownership before removing the root.
function removeOwnedTree(root, identity) {
  const rootStat = fs.lstatSync(root, { throwIfNoEntry: false });
  if (!rootStat) return;
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || rootStat.dev !== identity.dev || rootStat.ino !== identity.ino) {
    throw new Error('refusing to clean a replaced fixture root: ' + root);
  }
  function removeEntry(entry) {
    const stat = fs.lstatSync(entry);
    if (stat.isSymbolicLink()) {
      try {
        fs.unlinkSync(entry);
      } catch (error) {
        if (process.platform !== 'win32' || !['EPERM', 'EISDIR'].includes(error.code)) throw error;
        fs.rmdirSync(entry);
      }
    } else if (stat.isDirectory()) {
      for (const child of fs.readdirSync(entry)) removeEntry(path.join(entry, child));
      fs.rmdirSync(entry);
    } else {
      fs.unlinkSync(entry);
    }
  }
  removeEntry(root);
}
function runPowerShell(fixture, scriptName, expectedTarget, scriptBytes) {
  checkState(fixture, expectedTarget);
  const script = path.join(fixture.currentDir, 'scripts', scriptName);
  assertRegularFile(fixture.root, script);
  assert.deepEqual(fs.readFileSync(script), scriptBytes, scriptName + ' copy must match the source bytes');
  assertDirectoryChain(fixture.root, fixture.home);
  assertDirectoryChain(fixture.root, fixture.temp);
  // The byte-checked fixture scripts use a child-only policy: no registry change
  // or desktop Zone validation is needed in a headless Windows runner.
  const quote = value => "'" + value.replace(/'/g, "''") + "'";
  const moduleRoot = path.join(path.dirname(fixture.powershell), 'Modules');
  // Windows PowerShell can extend PSModulePath at startup; reset only this
  // child process before importing the two required built-in manifests.
  const command = [
    "[Environment]::SetEnvironmentVariable('PSModulePath', " + quote(moduleRoot) + ", 'Process')",
    "$ErrorActionPreference = 'Stop'",
    "[Console]::Out.WriteLine('fixture: importing Management')",
    'Import-Module ' + quote(path.join(moduleRoot, 'Microsoft.PowerShell.Management', 'Microsoft.PowerShell.Management.psd1')) + ' -ErrorAction Stop',
    "[Console]::Out.WriteLine('fixture: importing Utility')",
    'Import-Module ' + quote(path.join(moduleRoot, 'Microsoft.PowerShell.Utility', 'Microsoft.PowerShell.Utility.psd1')) + ' -ErrorAction Stop',
    "[Console]::Out.WriteLine('fixture: running script')",
    '& ' + quote(script),
  ].join('; ');
  const started = Date.now();
  const result = spawnSync(fixture.powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command,
  ], {
    cwd: fixture.currentDir,
    env: fixture.childEnv,
    encoding: 'utf8',
    timeout: childTimeoutMs,
    maxBuffer: 128 * 1024,
    windowsHide: true,
  });
  if (result.error) throw new Error(scriptName + ' could not complete after ' + (Date.now() - started) + 'ms: ' + result.error.message + '\nstdout:\n' + (result.stdout || '') + '\nstderr:\n' + (result.stderr || ''), { cause: result.error });
  if (result.signal !== null) throw new Error(scriptName + ' was terminated by signal ' + result.signal);
  if (result.status !== 0) {
    throw new Error(scriptName + ' failed with exit ' + result.status + ':\n' + (result.stderr || result.stdout || '').trim());
  }
}
/** The optional observer can inspect the owned fixture or reject to test cleanup. */
export async function runInstallRollbackFixture({ onPhase = () => {} } = {}) {
  if (process.platform !== 'win32') throw new Error('This fixture requires Windows and Windows PowerShell.');
  assert.equal(typeof onPhase, 'function', 'onPhase must be a function');
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  if (!systemRoot || !path.isAbsolute(systemRoot)) throw new Error('Windows SystemRoot is required to locate PowerShell.');
  const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  if (!fs.existsSync(powershell)) throw new Error('Windows PowerShell was not found at ' + powershell);
  const installBytes = fs.readFileSync(path.join(repo, 'scripts', 'install-v3.ps1'));
  const rollbackBytes = fs.readFileSync(path.join(repo, 'scripts', 'rollback-v1.ps1'));
  const tempParent = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tempParent, 'whiteboard-install-rollback-'));
  const identity = fs.lstatSync(root);
  let failure;
  try {
    assert.ok(identity.isDirectory() && !identity.isSymbolicLink(), 'created fixture root must be a directory');
    const currentDir = path.join(root, 'synthetic-current');
    const v1Dir = path.join(root, 'whiteboard-plugin-v1');
    const home = path.join(root, 'synthetic-home');
    const temp = path.join(root, 'temp');
    const profileDir = path.join(home, '.dsh', 'profiles', 'web');
    const link = path.join(profileDir, 'node_modules', '@local', 'whiteboard');
    const profilePackage = path.join(profileDir, 'package.json');
    const currentSentinel = path.join(currentDir, 'SYNTHETIC.txt');
    const v1Sentinel = path.join(v1Dir, 'SYNTHETIC.txt');
    const appData = path.join(home, 'AppData', 'Roaming');
    const localAppData = path.join(home, 'AppData', 'Local');
    for (const dir of [path.join(currentDir, 'scripts'), v1Dir, path.dirname(link), temp, appData, localAppData]) {
      assert.ok(isInside(root, dir), 'fixture path must stay inside its owned root');
      fs.mkdirSync(dir, { recursive: true });
    }
    const writeNew = (file, data) => fs.writeFileSync(file, data, { flag: 'wx', mode: 0o600 });
    writeNew(path.join(currentDir, 'scripts', 'install-v3.ps1'), installBytes);
    writeNew(path.join(currentDir, 'scripts', 'rollback-v1.ps1'), rollbackBytes);
    writeNew(path.join(currentDir, 'package.json'), JSON.stringify({ name: 'synthetic-current-checkout' }));
    writeNew(path.join(v1Dir, 'package.json'), JSON.stringify({ name: 'synthetic-v1-checkout' }));
    writeNew(currentSentinel, 'synthetic current checkout\n');
    writeNew(v1Sentinel, 'synthetic v1 checkout\n');
    writeNew(profilePackage, '\uFEFF' + JSON.stringify(profileContents(v1Dir), null, 2));
    fs.symlinkSync(v1Dir, link, 'junction');
    const homeRoot = path.parse(home).root.replace(/[\\/]$/, '');
    const childEnv = Object.freeze({
      SystemRoot: systemRoot,
      WINDIR: systemRoot,
      PATH: path.join(systemRoot, 'System32'),
      // Command discovery must not scan unrelated machine/user module trees.
      PSModulePath: path.join(path.dirname(powershell), 'Modules'),
      USERPROFILE: home,
      HOME: home,
      HOMEDRIVE: homeRoot,
      HOMEPATH: home.slice(homeRoot.length),
      APPDATA: appData,
      LOCALAPPDATA: localAppData,
      TEMP: temp,
      TMP: temp,
    });
    const fixture = Object.freeze({
      root, currentDir, v1Dir, home, temp, profileDir, profilePackage, link,
      currentSentinel, v1Sentinel, powershell, childEnv,
    });
    assert.notEqual(currentDir.toLowerCase(), v1Dir.toLowerCase(), 'synthetic checkouts must be distinct');
    checkState(fixture, v1Dir);
    await onPhase('prepared', fixture);
    runPowerShell(fixture, 'install-v3.ps1', v1Dir, installBytes);
    checkState(fixture, currentDir);
    await onPhase('installed', fixture);
    runPowerShell(fixture, 'rollback-v1.ps1', currentDir, rollbackBytes);
    checkState(fixture, v1Dir);
    await onPhase('rolledBack', fixture);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try {
      removeOwnedTree(root, identity);
    } catch (cleanupError) {
      if (failure) throw new AggregateError([failure, cleanupError], 'fixture failed and cleanup failed at ' + root);
      throw new Error('fixture cleanup failed at ' + root, { cause: cleanupError });
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    await runInstallRollbackFixture({
      onPhase(phase, fixture) {
        if (phase === 'prepared') console.log('Synthetic fixture root:', fixture.root);
      },
    });
    console.log('SYNTHETIC INSTALL/ROLLBACK OK');
  } catch (error) {
    console.error('SYNTHETIC INSTALL/ROLLBACK FAILED:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}
