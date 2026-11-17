import { mkdir } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
await mkdir('reports', { recursive: true });
const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', '--test-reporter=junit', '--test-reporter-destination=stdout', '--test-reporter-destination=reports/junit.xml', ...readdirSync('test').filter(f=>f.endsWith('.test.mjs')).map(f=>'test/'+f)], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status || 0);
