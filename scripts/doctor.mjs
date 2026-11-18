import {spawnSync} from 'node:child_process';import {access} from 'node:fs/promises';import {homedir} from 'node:os';import {resolve} from 'node:path';
const result={node:process.version,cli:'not found',extension:'not installed',collector:'not reachable',acceptance:'A real Copilot task is required: check a delegated agent, model, tool, skill, permission wait and reconnect in Spy.'};
const cli=process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c','copilot --version'],{encoding:'utf8',timeout:20000}):spawnSync('copilot',['--version'],{encoding:'utf8',timeout:20000});
if(cli.status===0)result.cli=cli.stdout.trim().slice(0,200);
const extensionDir=process.env.SPY_EXTENSION_DIR||resolve(process.env.COPILOT_HOME||resolve(homedir(),'.copilot'),'extensions/spy');
result.extensionPath=extensionDir;
const missing=[];for(const file of ['extension.mjs','core.mjs','collector.mjs','sdk.mjs'])try{await access(resolve(extensionDir,file));}catch{missing.push(file);}
result.extension=missing.length?'missing files: '+missing.join(', '):'bridge files present (SDK v1/v2); runtime status is in /extensions manage';
result.nextStep='Keep start.cmd open. In Copilot, run /experimental on, then /extensions manage. After upgrading ask: Reload my extensions. If Spy fails, select it and inspect the extension log.';
try{const url=process.env.SPY_URL||'http://127.0.0.1:4317';if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Localhost required');const health=await(await fetch(url+'/api/health',{signal:AbortSignal.timeout(1500)})).json();result.collector=health.service==='spy'?`Spy ${health.version}`:'port occupied by another service';}catch{}
console.log(JSON.stringify(result,null,2));if(result.cli==='not found')process.exitCode=1;
