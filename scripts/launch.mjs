import { existsSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { collectorEndpoint, stopCollector } from '../bridge/lifecycle.mjs';
import { createViewer } from '../server/index.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) { console.error('Spy needs Node.js 22.12 or newer. Install the current Node.js LTS and run start again.'); process.exit(1); }
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(command, args) { const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && command === npm }); if (result.error) throw result.error; if (result.status !== 0) process.exit(result.status || 1); }
if (!existsSync(resolve(root, 'dist/index.html'))) {
  if (!existsSync(resolve(root, 'node_modules/vite/package.json'))) { console.log('Installing Spy dependencies for this source ZIP. Release ZIPs include the built app and skip this step.'); run(npm, ['ci', '--no-audit', '--no-fund']); }
  run(npm, ['run', 'build']);
}
const endpoint = collectorEndpoint();
const stopped = await stopCollector({ endpoint });
if (stopped) console.log(`Stopped previous Spy collector (PID ${stopped}).`);
console.log('Setting up the Spy extension for your Copilot CLI sessions.');
run(process.execPath, ['scripts/install-bridge.mjs']);
const viewer = await createViewer({ port: Number(new URL(endpoint).port), production: true });
let stopping;
function shutdown() {
  return stopping ||= (async () => { console.log('\nStopping Spy…'); await viewer.close(); process.exitCode = 0; })();
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, () => { void shutdown(); });
console.log(`Spy is running in this window (PID ${process.pid}).\n${endpoint}\nKeep this window open. Press Ctrl+C or run stop.cmd to stop Spy.\nClosing this command window stops the viewer. Closing the browser alone does not.\nStart Copilot sessions with: copilot --experimental\nAfter upgrading, ask existing sessions: Reload my extensions`);
if(!process.argv.includes('--no-open')) {
  const program=process.platform==='win32'?'cmd.exe':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['/c','start','',endpoint]:[endpoint];
  const browser=spawn(program,args,{stdio:'ignore',detached:true});browser.on('error',()=>console.log('Open '+endpoint+' in your browser.'));browser.unref();
}
