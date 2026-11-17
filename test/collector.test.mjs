import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { ensureCollector } from '../bridge/collector.mjs';
async function freePort(){const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('eight simultaneous sessions launch exactly one shared collector',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'spy-singleton-')),port=await freePort(),endpoint=`http://127.0.0.1:${port}`;
  let launches=0,pid;
  try {
    const options={endpoint,script:resolve('server/index.mjs'),lockDirectory:dir,spawnProcess:(...args)=>{launches++;return spawn(...args);}};
    const results=await Promise.all(Array.from({length:8},()=>ensureCollector(options)));
    pid=results[0].pid;assert.equal(launches,1);assert.equal(new Set(results.map(r=>r.pid)).size,1);
    const again=await ensureCollector(options);assert.equal(again.started,false);assert.equal(launches,1);
    await assert.rejects(access(resolve(dir,`collector-${port}.lock`)));
  } finally {if(pid)process.kill(pid);await rm(dir,{recursive:true,force:true});}
});
test('never sends telemetry to a foreign service occupying the port',async()=>{
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:'another-app'}));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let launched=false;
  try{await assert.rejects(ensureCollector({endpoint:`http://127.0.0.1:${server.address().port}`,spawnProcess:()=>{launched=true;}}),/another service/);assert.equal(launched,false);}finally{await new Promise(r=>server.close(r));}
});
test('rejects remote collector URLs',async()=>{await assert.rejects(ensureCollector({endpoint:'http://example.com:4317'}),/local HTTP/);});
