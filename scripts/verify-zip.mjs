import { mkdtemp, readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const temp = await mkdtemp(resolve(tmpdir(), 'spy-zip-check-'));
let child;
try {
  const files = unzipSync(await readFile(resolve(root, `release/spy-v${version}.zip`)));
  for (const [name, bytes] of Object.entries(files)) { const path = resolve(temp, name); assert.ok(path.startsWith(temp + '/'.replace('/', process.platform === 'win32' ? '\\' : '/'))); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); }
  const app = resolve(temp, 'spy');
  await assert.rejects(access(resolve(app, 'node_modules')));
  const extension = resolve(temp, 'extension');
  const install = spawnSync(process.execPath, ['scripts/install-bridge.mjs'], { cwd: app, env: { ...process.env, SPY_EXTENSION_DIR: extension }, encoding: 'utf8' });
  assert.equal(install.status, 0, install.stderr);
  assert.match(await readFile(resolve(extension, 'extension.mjs'), 'utf8'), /Spy session bridge/);
  child = spawn(process.execPath, ['server/index.mjs', '--production', '--port', '0'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = await new Promise((yes, no) => {
    let output = ''; const timer = setTimeout(() => no(new Error('ZIP server startup timed out')), 10000);
    child.on('error', no); child.on('exit', code => { clearTimeout(timer); no(new Error('ZIP server exited ' + code)); });
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); yes(match[0]); } });
    child.stderr.on('data', chunk => { output += chunk; });
  });
  const page = await (await fetch(base)).text(); assert.match(page, /Spy/);
  const asset = page.match(/src="([^"]+\.js)"/)[1];
  assert.equal((await fetch(base + asset)).status, 200);
  assert.equal((await (await fetch(base + '/api/health')).json()).storage, 'memory');
  console.log('ZIP smoke check passed: extracted build starts without node_modules and serves React assets; bridge installer works.');
} finally {
  if (child && child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); }
  await rm(temp, { recursive: true, force: true });
}
