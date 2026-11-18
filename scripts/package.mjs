import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, unzipSync } from 'fflate';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const files = {};
const privatePaths=new Set(process.env.SPY_HISTORY_PATH?[resolve(process.env.SPY_HISTORY_PATH),resolve(process.env.SPY_HISTORY_PATH)+'.mcp.json',resolve(process.env.SPY_HISTORY_PATH)+'.mcp.json.tmp',resolve(process.env.SPY_HISTORY_PATH)+'.tmp',resolve(process.env.SPY_HISTORY_PATH)+'.archive',resolve(process.env.SPY_HISTORY_PATH)+'.designs.json',resolve(process.env.SPY_HISTORY_PATH)+'.designs.json.tmp']:[]);
const excluded = new Set(['node_modules', '.git', 'release', '.codex', 'reports', 'test-results']);
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name.startsWith('.spy-e2e-history-') || entry.name.endsWith('.log')) continue;
    const path = resolve(dir, entry.name);
    if(privatePaths.has(path)||entry.name.endsWith('.json.archive')||entry.name.endsWith('.mcp.json')||entry.name.endsWith('.mcp.json.tmp')||entry.name.endsWith('.designs.json')||entry.name.endsWith('.designs.json.tmp'))continue;
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) files['spy/' + relative(root, path).replaceAll('\\', '/')] = new Uint8Array(await readFile(path));
  }
}
await walk(root);
const archive = zipSync(files, { level: 6 });
const verified = unzipSync(archive);
for (const required of ['spy/start.cmd', 'spy/start.sh', 'spy/README.md', 'spy/package-lock.json', 'spy/dist/index.html']) if (!verified[required]) throw new Error(`ZIP missing ${required}. Run npm run build first.`);
await mkdir(resolve(root, 'release'), { recursive: true });
const destination = resolve(root, `release/spy-v${version}.zip`);
await writeFile(destination, archive);
console.log(`Created ${destination}\n${Object.keys(files).length} files; no node_modules, credentials, or session history.`);
