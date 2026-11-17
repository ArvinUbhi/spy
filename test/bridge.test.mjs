import test from 'node:test';
import assert from 'node:assert/strict';
import { projectEvent, createBuffer } from '../bridge/core.mjs';
test('bridge excludes private reasoning and opaque fields, clips huge output', () => {
  assert.equal(projectEvent({ type: 'assistant.reasoning', data: { content: 'private' } }, () => 'id'), null);
  const event = projectEvent({ type: 'assistant.message', data: { content: 'x'.repeat(100_000), reasoningOpaque: 'secret', encryptedContent: 'secret', reasoningText: 'private' } }, () => 'id');
  assert.equal(event.data.content.length, 6000); assert.equal(event.data.reasoningOpaque, undefined); assert.equal(event.data.reasoningText, undefined);
});
test('bounded bridge retries retain order and report dropped events', () => {
  const buffer = createBuffer(3);
  for (let i = 0; i < 5; i++) buffer.push({ i });
  assert.equal(buffer.size, 3); assert.equal(buffer.drainDropped(), 2);
  const batch = buffer.take(); assert.deepEqual(batch.map(p => p.i), [2,3,4]);
  buffer.push({ i: 5 }); buffer.retry(batch);
  assert.deepEqual(buffer.take().map(p => p.i), [3,4,5]); assert.equal(buffer.drainDropped(), 1);
});
test('batch payloads stay within collector limits for multi-byte output', () => {
  const buffer = createBuffer();
  for (let i = 0; i < 100; i++) buffer.push({ i, output: '漢'.repeat(6000) });
  let count = 0;
  while (buffer.size) { const batch = buffer.take(); count += batch.length; assert.ok(Buffer.byteLength(JSON.stringify(batch)) < 512000); }
  assert.equal(count, 100);
});
test('custom context metadata rejects missing participants and invalid states',async()=>{
 const {metadataEvent}=await import('../bridge/core.mjs');
 assert.throws(()=>metadataEvent({type:'viewer.context_handoff',source:'a'}),/distinct/);
 assert.throws(()=>metadataEvent({type:'viewer.agent_state',state:'guessed'}),/Valid state/);
 assert.deepEqual(metadataEvent({type:'viewer.context_mode',agentId:'a',mode:'isolated'}),{type:'viewer.context_mode',agentId:'a',data:{mode:'isolated'}});
});
