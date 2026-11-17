import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
test('installer is repeatable, installs companion module, and uninstalls only Spy files', async () => {
  const target = await mkdtemp(resolve(tmpdir(), 'spy-install-'));
  const run = (...args) => spawnSync(process.execPath, ['scripts/install-bridge.mjs', ...args], { env: { ...process.env, SPY_EXTENSION_DIR: target }, encoding: 'utf8' });
  try {
    assert.equal(run().status, 0); assert.equal(run().status, 0);
    assert.match(await readFile(resolve(target, 'extension.mjs'), 'utf8'), /Spy session bridge/);
    await access(resolve(target, 'core.mjs'));
    await writeFile(resolve(target, 'keep.txt'), 'unrelated');
    assert.equal(run('--remove').status, 0); assert.equal(await readFile(resolve(target, 'keep.txt'), 'utf8'), 'unrelated');
    await assert.rejects(access(resolve(target, 'extension.mjs')));
  } finally { await rm(target, { recursive: true, force: true }); }
});
test('installer refuses to overwrite an unrelated extension', async () => {
  const target = await mkdtemp(resolve(tmpdir(), 'spy-install-'));
  try {
    await writeFile(resolve(target, 'extension.mjs'), '// unrelated');
    const result = spawnSync(process.execPath, ['scripts/install-bridge.mjs'], { env: { ...process.env, SPY_EXTENSION_DIR: target }, encoding: 'utf8' });
    assert.notEqual(result.status, 0); assert.equal(await readFile(resolve(target, 'extension.mjs'), 'utf8'), '// unrelated');
  } finally { await rm(target, { recursive: true, force: true }); }
});
