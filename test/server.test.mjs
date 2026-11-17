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
