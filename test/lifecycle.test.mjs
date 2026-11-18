import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { collectorEndpoint, inspectCollector, stopCollector } from '../bridge/lifecycle.mjs';

test('stop validates local service identity and refuses unrelated or own PIDs',async()=>{
  let identity={service:'another-service',protocol:1,pid:process.pid};
  const server=http.createServer((q,r)=>{r.setHeader('content-type','application/json');r.end(JSON.stringify(identity));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const endpoint=`http://127.0.0.1:${server.address().port}`;
  try{
    await assert.rejects(stopCollector({endpoint}),/safely identify/);
    identity.service='spy';await assert.rejects(stopCollector({endpoint}),/safely identify/);
    identity.pid=0;await assert.rejects(stopCollector({endpoint}),/safely identify/);
    await assert.rejects(inspectCollector('https://example.com'),/local HTTP/);
    assert.equal(server.listening,true);
  }finally{await new Promise(r=>server.close(r));}
});
test('stop finds a hidden legacy collector by health PID and waits for its process to exit',async()=>{
  const child=spawn(process.execPath,['server/index.mjs','--production','--port','0'],{stdio:['ignore','pipe','pipe']});
  const exit=new Promise(r=>child.once('exit',r));
  try{
    const endpoint=await new Promise((yes,no)=>{let output='';const t=setTimeout(()=>no(Error('startup timeout')),5000);child.on('error',no);child.stdout.on('data',data=>{output+=data;const m=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(t);yes(m[0]);}});});
    assert.equal((await inspectCollector(endpoint)).pid,child.pid);
    assert.equal(await stopCollector({endpoint}),child.pid);await exit;
    assert.equal(await stopCollector({endpoint}),null);
  }finally{if(child.exitCode===null&&child.signalCode===null)child.kill();await exit;}
});
test('start and stop resolve the same explicit, environment and default port',()=>{
  assert.equal(collectorEndpoint([],{}),'http://127.0.0.1:4317');
  assert.equal(collectorEndpoint([],{SPY_URL:'http://localhost:4320'}),'http://127.0.0.1:4320');
  assert.equal(collectorEndpoint(['--port','4321'],{PORT:'4320'}),'http://127.0.0.1:4321');
  for(const port of ['0','65536','bad',undefined])assert.throws(()=>collectorEndpoint(['--port',port],{}),/port must/);
});
