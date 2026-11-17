import { randomUUID } from 'node:crypto';
export function startDemo(store, changed) {
  const id = 'demo-verification';
  let iteration = 0, phase = 0;
  const emit = (type, data = {}, agentId) => { store.ingest({ sessionId: id, name: 'Implement session authentication', cwd: 'acme / trading-platform', source: 'demo', event: { id: randomUUID(), type, data, agentId, timestamp: new Date().toISOString() } }); changed(); };
  const start = (key, name, model, task) => { emit('tool.execution_start', { toolCallId: key, toolName: 'task',arguments:{prompt:task} }); emit('subagent.started', { toolCallId: key, agentId: key, agentName: name.toLowerCase(), agentDisplayName: name, model, agentDescription: task }); };
  emit('assistant.turn_start', { turnId: '1' });
  emit('assistant.usage', { model: 'Demo · coordinator', inputTokens: 1840, outputTokens: 211, duration: 1400 });
  emit('session.skills_loaded',{skills:[{name:'verification-loop',description:'Verify changes against explicit acceptance criteria',enabled:true,source:'project'},{name:'test-first',description:'Exercise concurrency and expiry paths',enabled:true,source:'project'}]});
  emit('session.custom_agents_updated',{agents:[{id:'security-definition',name:'security-auditor',displayName:'Security auditor',description:'Available but not dispatched in this demo',model:'Demo · audit model',source:'project'}]});
  start('planner', 'Planner', 'Demo · reasoning model', 'Break down the authentication change');
  emit('skill.invoked',{name:'verification-loop',path:'.github/skills/verification-loop/SKILL.md',description:'Verify changes against explicit acceptance criteria',content:'Define acceptance criteria, delegate implementation, run tests and independent review, and rework failed checks.'},'planner');
  emit('assistant.intent', { intent: 'Mapping session boundaries and verification criteria' }, 'planner');
  const timer = setInterval(() => {
    phase++;
    emit('viewer.heartbeat');
    if (phase === 2) {
      emit('subagent.completed', { toolCallId: 'planner' });
      start('builder', 'Implementer', 'Demo · coding model', 'Implement token refresh and session middleware');
      emit('viewer.edge', { source: 'planner', target: 'builder', label: 'implementation plan' });
      emit('viewer.context_handoff',{id:'demo-plan',source:'planner',target:'builder',label:'Acceptance criteria',mode:'isolated',summary:'Only the plan and acceptance criteria are passed to the implementer.',payload:'Implement single-flight token refresh. Verify expired and invalid tokens, concurrent requests and one refresh per session.'});
      emit('viewer.context_mode',{mode:'isolated'},'builder');
    }
    if (phase === 3) { emit('permission.requested',{requestId:'demo-permission',question:'Allow source edit?'},'builder');
 emit('tool.execution_start', { toolCallId: 'edit-' + iteration, toolName: 'edit', arguments: { path: 'src/auth/session.ts' } }, 'builder'); }
    if(phase===4)emit('permission.completed',{requestId:'demo-permission',result:{kind:'approved'}});
    if (phase === 5) {
      emit('tool.execution_complete', { toolCallId: 'edit-' + iteration, success: true, result: 'Updated session middleware' }, 'builder');
      emit('subagent.completed', { toolCallId: 'builder' });
      start('tester', 'Test runner', 'Demo · fast model', 'Verify refresh, expiry and invalid token paths');
      start('reviewer', 'Reviewer', 'Demo · reasoning model', 'Review changes independently');
      emit('viewer.edge', { source: 'builder', target: 'tester', label: 'verify' });
      emit('viewer.edge', { source: 'builder', target: 'reviewer', label: 'review' });
      emit('tool.execution_start', { toolCallId: 'tests-' + iteration, toolName: 'shell', arguments: { command: 'npm test -- auth' } }, 'tester');
      emit('skill.invoked',{name:'test-first',description:'Exercise concurrency and expiry paths',content:'Run focused tests for concurrent refresh, token expiry and rejected tokens.'},'tester');
      emit('viewer.agent_state',{state:'waiting',reason:'Waiting for independent verification results'},'root');
      emit('assistant.intent', { intent: 'Checking token expiry and concurrent refresh handling' }, 'reviewer');
    }
    if (phase === 8) emit('assistant.message', { content: 'Refresh race detected: two concurrent requests may reuse an expired token. Add a single-flight guard and rerun verification.' }, 'reviewer');
    if (phase === 10) {
      emit('subagent.completed', { toolCallId: 'reviewer' });
      emit('tool.execution_complete', { toolCallId: 'tests-' + iteration, success: false, error: '1 failed: concurrent refresh should issue one token request' }, 'tester');
      emit('viewer.agent_state',{state:'blocked',reason:'Verification failed; implementation needs rework'},'root');
      emit('subagent.failed', { toolCallId: 'tester', error: 'Concurrent refresh assertion failed' });
      emit('viewer.edge', { source: 'tester', target: 'builder', kind: 'feedback', label: 'rework · ' + (iteration + 1) });
      emit('viewer.structure_change', { message: 'Verification returned to Implementer. Feedback loop is now active.' });
    }
    if (phase === 12) {
      iteration++; phase = 2;emit('viewer.agent_state',{state:'running',reason:'Starting next verification iteration'},'root');
      start('builder', 'Implementer', 'Demo · coding model', 'Fix concurrent refresh, iteration ' + (iteration + 1));
      emit('assistant.intent', { intent: 'Applying reviewer findings · iteration ' + (iteration + 1) }, 'builder');
    }
  }, 1700);
  return () => { clearInterval(timer); store.sessions.delete(id); changed(); };
}
