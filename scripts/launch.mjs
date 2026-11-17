import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
run(process.execPath, ['server/index.mjs', '--production', '--open', ...process.argv.slice(2)]);
