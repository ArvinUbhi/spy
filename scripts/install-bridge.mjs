import { mkdir, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.env.SPY_EXTENSION_DIR || resolve(homedir(), '.copilot/extensions/spy');
const file = resolve(target, 'extension.mjs');
const marker = '// Spy session bridge';
let previous;
try { previous = await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (previous && !previous.startsWith(marker)) throw new Error(`Another extension already exists at ${file}. Rename it before installing Spy.`);
if (process.argv.includes('--remove')) {
  if (previous) { await unlink(file); try { await unlink(resolve(target, 'core.mjs')); } catch (error) { if (error.code !== 'ENOENT') throw error; } try { await rmdir(target); } catch (error) { if (error.code !== 'ENOTEMPTY') throw error; } }
  console.log('Spy session extension removed.');
} else {
  const content = marker + '\n' + await readFile(resolve(root, 'bridge/extension.mjs'), 'utf8');
  await mkdir(target, { recursive: true });
  await writeFile(resolve(target, 'core.mjs'), await readFile(resolve(root, 'bridge/core.mjs')));
  if (previous !== content) await writeFile(file, content);
  console.log(`Spy extension ready at ${target}\nOnly new sessions, or sessions with this extension loaded, will appear.`);
}
