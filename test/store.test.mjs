import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';
const packet = (type, data = {}, extra = {}) => ({ sessionId: 's', event: { type, data, timestamp: '2026-11-17T19:00:00Z', ...extra } });
const at = Date.parse('2026-11-17T19:00:00Z');
test('delegation correlation uses tool owner, not event parentId ordering', () => {
  const store = new Store();
  store.ingest(packet('tool.execution_start', { toolCallId: 'call', toolName: 'task' }, { agentId: 'parent', parentId: 'previous-event' }), at);
  store.ingest(packet('subagent.started', { toolCallId: 'call', agentId: 'child', agentName: 'tester', model: 'actual-model' }), at);
  store.ingest(packet('assistant.intent', { intent: 'Testing' }, { agentId: 'child' }), at + 10);
  const s = store.snapshot(at)[0];
  assert.equal(s.edges[0].source, 'parent'); assert.equal(s.edges[0].target, 'child'); assert.equal(s.edges[0].inferred, false);
  assert.equal(s.agents.find(a => a.id === 'child').activity, 'Testing');
  assert.equal(s.agents.find(a => a.id === 'child').model, 'actual-model');
  assert.equal(s.agents.some(a => a.id === 'previous-event'), false);
});
test('unknown parents are visibly unconfirmed', () => {
  const store = new Store(); store.ingest(packet('subagent.started', { toolCallId: 'a', agentName: 'reviewer' }), at);
  assert.equal(store.snapshot(at)[0].edges[0].inferred, true);
});
test('parallel tool timing, completion and model usage stay attributed', () => {
  const store = new Store();
  store.ingest(packet('tool.execution_start', { toolCallId: 't1', toolName: 'shell' }, { agentId: 'one' }), at);
  store.ingest(packet('tool.execution_start', { toolCallId: 't2', toolName: 'search' }, { agentId: 'two' }), at);
  store.ingest(packet('tool.execution_complete', { toolCallId: 't1', success: false, error: 'failure' }), at + 100);
  const agents = store.snapshot(at)[0].agents;
  assert.equal(agents.find(a => a.id === 'one').tools.t1.status, 'failed');
  assert.equal(agents.find(a => a.id === 'two').tools.t2.status, 'running');
});
test('deduplicates reconnect retries, expires sessions and flags missing heartbeats', () => {
  const store = new Store(); const p = packet('assistant.usage', { model: 'model', inputTokens: 15, outputTokens: 5 }, { id: 'event-id' });
  store.ingest(p, at); store.ingest(p, at + 1000);
  assert.equal(store.snapshot(at)[0].agents[0].tokens, 20);
  assert.equal(store.snapshot(at + 40_000)[0].status, 'disconnected');
  assert.equal(store.snapshot(at + 700_000).length, 0);
});
test('feedback edges are explicit, and buffers remain bounded', () => {
  const store = new Store();
  store.ingest(packet('viewer.edge', { source: 'reviewer', target: 'builder', kind: 'feedback', label: 'retry' }), at);
  for (let i = 0; i < 100; i++) store.ingest(packet('assistant.intent', { intent: 'Working' }), at);
  const s = store.snapshot(at)[0]; assert.equal(s.edges[0].kind, 'feedback'); assert.equal(s.agents[0].events.length, 60);
});
test('heartbeat does not overwrite an idle session; new turn reactivates it', () => {
  const store = new Store(); store.ingest(packet('session.idle'), at); store.ingest(packet('viewer.heartbeat'), at + 1000);
  assert.equal(store.snapshot(at + 1000)[0].status, 'idle');
  store.ingest(packet('assistant.turn_start', { turnId: '2' }), at + 2000);
  assert.equal(store.snapshot(at + 2000)[0].status, 'connected');
});
test('rejects malformed events', () => { assert.throws(() => new Store().ingest({ sessionId: 's', event: {} })); });
test('instance IDs cannot mutate object prototypes', () => {
  const store = new Store(); store.ingest(packet('assistant.intent', { intent: 'safe' }, { agentId: '__proto__' }), at);
  assert.equal(store.snapshot(at)[0].agents.find(a => a.id === '__proto__').activity, 'safe');
  assert.equal({}.activity, undefined);
});
test('restarted logical agent resets timer and closes delegation tools', () => {
  const store = new Store();
  store.ingest(packet('tool.execution_start', { toolCallId: 'builder', toolName: 'task' }), at);
  store.ingest(packet('subagent.started', { toolCallId: 'builder', agentId: 'b' }), at);
  store.ingest(packet('subagent.completed', { toolCallId: 'builder', durationMs: 100 }), at + 100);
  assert.equal(store.snapshot(at + 100)[0].agents[0].tools.builder.status, 'completed');
  store.ingest(packet('subagent.started', { toolCallId: 'builder', agentId: 'b' }, { timestamp: new Date(at + 200).toISOString() }), at + 200);
  const b = store.snapshot(at + 200)[0].agents.find(a => a.id === 'b');
  assert.equal(b.endedAt, undefined); assert.equal(b.durationMs, undefined); assert.equal(b.startedAt, at + 200);
});
test('native lifecycle envelope IDs correlate child events and configured model', () => {
  const store = new Store();
  store.ingest(packet('tool.execution_start', { toolCallId: 'task-call', toolName: 'task' }), at);
  store.ingest(packet('subagent.started', { toolCallId: 'task-call', agentName: 'reviewer' }, { agentId: 'instance' }), at);
  store.ingest(packet('subagent.configured', { model: 'resolved-model' }, { agentId: 'instance' }), at);
  store.ingest(packet('assistant.intent', { intent: 'Reviewing' }, { agentId: 'instance' }), at);
  const s = store.snapshot(at)[0]; assert.equal(s.agents.length, 2);
  assert.equal(s.agents[1].model, 'resolved-model'); assert.equal(s.agents[1].activity, 'Reviewing');
  assert.equal(s.edges[0].source, 'root');
});
