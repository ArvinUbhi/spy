import { mkdir } from 'node:fs/promises';
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if(!existsSync('dist/index.html')) {
  const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'inherit'});
  if(build.error)throw build.error;if(build.status!==0)process.exit(build.status||1);
}
await mkdir('reports', { recursive: true });
const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', '--test-reporter=junit', '--test-reporter-destination=stdout', '--test-reporter-destination=reports/junit.xml', ...readdirSync('test').filter(f=>f.endsWith('.test.mjs')).map(f=>'test/'+f)], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status || 0);
