import { existsSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { ensureCollector } from '../bridge/collector.mjs';
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
console.log('Setting up the Spy extension for your Copilot CLI sessions.');
run(process.execPath, ['scripts/install-bridge.mjs']);
console.log('\nStart your next Copilot session with: copilot --experimental\n');
const flag=process.argv.indexOf('--port');
const port=flag>=0?process.argv[flag+1]:(process.env.PORT || new URL(process.env.SPY_URL || 'http://127.0.0.1:4317').port || '4317');
const endpoint=`http://127.0.0.1:${port}`;
const installed=process.env.SPY_EXTENSION_DIR || resolve(process.env.COPILOT_HOME || resolve(homedir(),'.copilot'),'extensions/spy');
const collector=await ensureCollector({endpoint,script:resolve(installed,'runtime/server/index.mjs'),lockDirectory:resolve(installed,'runtime'),requiredFeatures:['skill-events','context-transfers','agent-states','diagnostics','retention','skill-authoring','native-static-assets'],allowReplace:true});
console.log(`Spy is running in the background (PID ${collector.pid}).\n${endpoint}\nYou can close this terminal. New Copilot sessions share this collector.`);
if(!process.argv.includes('--no-open')) {
  const program=process.platform==='win32'?'cmd.exe':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['/c','start','',endpoint]:[endpoint];
  const browser=spawn(program,args,{stdio:'ignore',detached:true});browser.on('error',()=>console.log('Open '+endpoint+' in your browser.'));browser.unref();
}
