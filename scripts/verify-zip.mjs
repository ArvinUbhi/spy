import { mkdtemp, readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const temp = await mkdtemp(resolve(tmpdir(), 'spy-zip-check-'));
let child, launcherPid;
try {
  const files = unzipSync(await readFile(resolve(root, `release/spy-v${version}.zip`)));
  for (const [name, bytes] of Object.entries(files)) { const path = resolve(temp, name); assert.ok(path.startsWith(temp + '/'.replace('/', process.platform === 'win32' ? '\\' : '/'))); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); }
  const app = resolve(temp, 'spy');
  await assert.rejects(access(resolve(app, 'node_modules')));
  const extension = resolve(temp, 'extension');
  const install = spawnSync(process.execPath, ['scripts/install-bridge.mjs'], { cwd: app, env: { ...process.env, SPY_EXTENSION_DIR: extension }, encoding: 'utf8' });
  assert.equal(install.status, 0, install.stderr);
  assert.match(await readFile(resolve(extension, 'extension.mjs'), 'utf8'), /Spy session bridge/);
  for(const path of ['core.mjs','collector.mjs','runtime/server/metrics.mjs','runtime/dist/index.html']) await access(resolve(extension,path));
  child = spawn(process.execPath, ['server/index.mjs', '--production', '--port', '0'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = await new Promise((yes, no) => {
    let output = ''; const timer = setTimeout(() => no(new Error('ZIP server startup timed out')), 10000);
    child.on('error', no); child.on('exit', code => { clearTimeout(timer); no(new Error('ZIP server exited ' + code)); });
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); yes(match[0]); } });
    child.stderr.on('data', chunk => { output += chunk; });
  });
  const page = await (await fetch(base)).text(); assert.match(page, /Spy/);
  const asset = page.match(/src="([^"]+\.js)"/)[1];
  const module = await fetch(base + asset);
  assert.equal(module.status, 200);
  assert.match(module.headers.get('content-type'), /(?:text|application)\/javascript/);
  assert.equal(await module.text(), await readFile(resolve(app, 'dist', '.' + asset), 'utf8'));
  const css = page.match(/href="([^"]+\.css)"/)[1];
  const style = await fetch(base + css); assert.equal(style.status, 200); assert.match(style.headers.get('content-type'), /text\/css/);
  const missing = await fetch(base + '/assets/missing.js'); assert.equal(missing.status, 404); assert.doesNotMatch(await missing.text(), /<!doctype/i);
  assert.equal((await (await fetch(base + '/api/health')).json()).storage, 'memory');
  const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const launchPort=probe.address().port;await new Promise(r=>probe.close(r));
  const launch=spawnSync(process.execPath,['scripts/launch.mjs','--no-open','--port',String(launchPort)],{cwd:app,env:{...process.env,SPY_EXTENSION_DIR:extension},encoding:'utf8',timeout:15000});
  const pidMatch=launch.stdout?.match(/PID (\d+)/);if(pidMatch)launcherPid=Number(pidMatch[1]);
  assert.equal(launch.status,0,launch.stderr+'\n'+launch.stdout);
  const background=await(await fetch(`http://127.0.0.1:${launchPort}/api/health`)).json();assert.equal(background.service,'spy');assert.equal(background.pid,launcherPid);
  await assert.rejects(access(resolve(app,'node_modules')));
  console.log('ZIP smoke check passed: extracted build starts without node_modules and serves React assets; bridge installer works and the end-user launcher starts a background collector.');
} finally {
  if(launcherPid)try{process.kill(launcherPid);}catch(error){if(error.code!=='ESRCH')throw error;}
  if (child && child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); }
  await rm(temp, { recursive: true, force: true });
}
