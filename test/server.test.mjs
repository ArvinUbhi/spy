import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewer } from '../server/index.mjs';
test('collector accepts bridge events, streams them, and rejects foreign browser origins', async () => {
  const viewer = await createViewer({ port: 0, production: true, demo: false });
  const base = `http://127.0.0.1:${viewer.server.address().port}`;
  const abort = new AbortController();
  try {
    const payload = { sessionId: 'integration', event: { id: 'one', type: 'assistant.intent', data: { intent: 'Inspecting code' } } };
    assert.equal((await fetch(base + '/api/events', { method: 'POST', body: JSON.stringify(payload) })).status, 403);
    assert.equal((await fetch(base + '/api/events', { method: 'POST', headers: { 'X-Agent-Viewer': '1', Origin: 'https://untrusted.example' }, body: JSON.stringify(payload) })).status, 403);
    assert.equal((await fetch(base + '/api/events', { method: 'POST', headers: { 'X-Agent-Viewer': '1', Origin: 'malformed' }, body: JSON.stringify(payload) })).status, 403);
    assert.equal((await fetch(base + '/api/events', { method: 'POST', headers: { 'X-Agent-Viewer': '1' }, body: JSON.stringify(payload) })).status, 200);
    const stream = await fetch(base + '/api/stream', { signal: abort.signal });
    assert.equal(stream.headers.get('Content-Type'), 'text/event-stream');
    const reader = stream.body.getReader(); const chunk = new TextDecoder().decode((await reader.read()).value);
    assert.match(chunk, /Inspecting code/); assert.match(chunk, /integration/);
    await reader.cancel();
    assert.equal((await fetch(base + '/api/events', { method: 'POST', headers: { 'X-Agent-Viewer': '1' }, body: '{broken' })).status, 400);
  } finally { abort.abort(); await viewer.close(); }
});
test('health identifies Spy and resource endpoint reports process CPU/RSS',async()=>{
  const viewer=await createViewer({port:0,production:true,demo:false});const base=`http://127.0.0.1:${viewer.server.address().port}`;
  try{const health=await(await fetch(base+'/api/health')).json();assert.equal(health.service,'spy');assert.equal(health.protocol,1);const metrics=await(await fetch(base+'/api/metrics')).json();assert.ok(metrics.rssMiB>0);assert.ok(metrics.cpuPercent>=0);assert.equal(metrics.pid,process.pid);}finally{await viewer.close();}
});
test('production serves actual JavaScript and CSS and never substitutes HTML for missing modules',async()=>{
  const {readFile}=await import('node:fs/promises');
  const viewer=await createViewer({port:0,production:true});const base=`http://127.0.0.1:${viewer.server.address().port}`;
  try {
    const page=await(await fetch(base)).text();
    for(const [pattern,mime] of [[/src="([^"]+\.js)"/,/javascript/],[/href="([^"]+\.css)"/,/text\/css/]]) {
      const asset=page.match(pattern)[1],response=await fetch(base+asset);
      assert.equal(response.status,200);assert.match(response.headers.get('content-type'),mime);
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');
      assert.equal(await response.text(),await readFile(new URL('../dist'+asset,import.meta.url),'utf8'));
    }
    for(const asset of ['/assets/old-build.js','/missing.mjs','/assets/missing.wasm']) {
      const response=await fetch(base+asset);assert.equal(response.status,404);assert.doesNotMatch(await response.text(),/<!doctype/i);
    }
    assert.equal((await fetch(base+'/%ZZ')).status,400);
    assert.equal((await fetch(base+'/%2e%2e%2fpackage.json')).status,403);
  }finally{await viewer.close();}
});
