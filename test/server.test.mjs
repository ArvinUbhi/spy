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
