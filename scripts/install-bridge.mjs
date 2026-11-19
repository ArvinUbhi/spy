import { mkdir, readFile, writeFile, unlink, rmdir, cp, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.env.SPY_EXTENSION_DIR || resolve(process.env.COPILOT_HOME || resolve(homedir(),'.copilot'),'extensions/spy');
const file = resolve(target, 'extension.mjs');
const marker = '// Spy session bridge';
let previous;
try { previous = await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (previous && !previous.startsWith(marker)) throw new Error(`Another extension already exists at ${file}. Rename it before installing Spy.`);
if (process.argv.includes('--remove')) {
  if (previous) { await unlink(file); for (const name of ['core.mjs','collector.mjs','lifecycle.mjs','sdk.mjs','control.mjs']) { try { await unlink(resolve(target,name)); } catch (error) { if (error.code !== 'ENOENT') throw error; } } try { await rmdir(target); } catch (error) { if (error.code !== 'ENOTEMPTY') throw error; } }
  console.log('Spy session extension removed. Run stop.cmd before deleting the Spy folder or cached runtime.');
} else {
  const content = marker + '\n' + await readFile(resolve(root, 'bridge/extension.mjs'), 'utf8');
  await access(resolve(root, 'dist/index.html')).catch(()=>{throw Error('Build Spy first (npm run build), or use the ready-built release ZIP.');});
  await mkdir(target, { recursive: true });
  for (const name of ['core.mjs','collector.mjs','lifecycle.mjs','sdk.mjs','control.mjs']) await writeFile(resolve(target,name),await readFile(resolve(root,'bridge',name)));
  await cp(resolve(root,'shared'),resolve(target,'runtime/shared'),{recursive:true});
  await cp(resolve(root,'server'),resolve(target,'runtime/server'),{recursive:true});
  await cp(resolve(root,'dist'),resolve(target,'runtime/dist'),{recursive:true});
  if (previous !== content) await writeFile(file, content);
  console.log(`Spy extension ready at ${target}\nNew Copilot sessions connect while start.cmd or start.sh is running; they do not launch hidden collectors.
No gh or Git installation is required.`);
}
