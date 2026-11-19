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
  assert.equal(store.snapshot(at + 8*24*60*60*1000).length, 0);
});
test('feedback edges are explicit, and buffers remain bounded', () => {
  const store = new Store();
  store.ingest(packet('viewer.edge', { source: 'reviewer', target: 'builder', kind: 'feedback', label: 'retry' }), at);
  for (let i = 0; i < 300; i++) store.ingest(packet('assistant.intent', { intent: 'Working' }), at);
  const s = store.snapshot(at)[0]; assert.equal(s.edges[0].kind, 'feedback'); assert.equal(s.agents[0].events.length, 120);
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
test('native shell output streams into its owning tool', () => {
  const store = new Store();
  store.ingest(packet('tool.execution_start', { toolCallId: 'shell', toolName: 'shell' }, { agentId: 'worker' }), at);
  store.ingest(packet('tool.shell_output', { toolCallId: 'shell', text: '3 tests passed\n' }), at);
  assert.match(store.snapshot(at)[0].agents.find(a=>a.id==='worker').tools.shell.result, /3 tests passed/);
});
test('session, agent, output and active-tool buffers stay bounded under churn', () => {
  const store = new Store();
  for (let i=0;i<50;i++) store.ingest({ ...packet('viewer.heartbeat'), sessionId:'session-'+i }, at);
  assert.equal(store.sessions.size,40);
  for (let i=0;i<200;i++) store.ingest(packet('subagent.started',{ toolCallId:'agent-'+i }),at);
  assert.equal(store.snapshot(at).find(s=>s.id==='s').agents.length,160);
  for (let i=0;i<150;i++) store.ingest(packet('tool.execution_start',{ toolCallId:'tool-'+i,toolName:'shell' }),at);
  const root=store.snapshot(at).find(s=>s.id==='s').agents.find(a=>a.id==='root');
  assert.equal(Object.keys(root.tools).length,24); assert.equal(root.droppedTools,126);
  for(let i=0;i<20;i++) store.ingest(packet('assistant.message_delta',{deltaContent:'x'.repeat(1000)}),at);
  assert.equal(root.output.length,4000);
});
test('rejects nonfinite metrics and malformed IDs before changing state', () => {
  const store = new Store();
  assert.throws(()=>store.ingest(packet('assistant.usage',{inputTokens:'100'}),at));
  assert.throws(()=>store.ingest(packet('tool.execution_start',{toolCallId:{bad:1}}),at));
  assert.equal(store.sessions.size,0);
});
test('live view streams only selected details while retaining other session summaries',()=>{
  const store=new Store();
  store.ingest({...packet('assistant.message',{content:'private output one'}),sessionId:'one'},at);
  store.ingest({...packet('assistant.message',{content:'private output two'}),sessionId:'two'},at);
  const view=store.liveView('two',at);
  assert.equal(view.selectedSessionId,'two');assert.equal(view.sessions[0].agents.length,0);assert.equal(view.sessions[0].runningCount,1);
  assert.match(JSON.stringify(view),/private output two/);assert.doesNotMatch(JSON.stringify(view),/private output one/);
});
test('resource metrics are retained per bridge and hard caps do not leak aliases',()=>{
  const store=new Store();store.ingest({...packet('viewer.heartbeat'),bridgeMetrics:{rssMiB:25,cpuPercent:.1}},at);
  for(let i=0;i<1000;i++)store.ingest(packet('subagent.started',{toolCallId:'agent-'+i}),at);
  assert.ok(Object.keys(store.sessions.get('s').aliases).length<=160);assert.equal(store.liveView('s',at).sessions[0].bridgeMetrics.rssMiB,25);
});
