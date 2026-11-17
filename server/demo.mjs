import { randomUUID } from 'node:crypto';
export function startDemo(store, changed) {
  const id = 'demo-verification';
  let iteration = 0, phase = 0;
  const emit = (type, data = {}, agentId) => { store.ingest({ sessionId: id, name: 'Implement session authentication', cwd: 'acme / trading-platform', source: 'demo', event: { id: randomUUID(), type, data, agentId, timestamp: new Date().toISOString() } }); changed(); };
  const start = (key, name, model, task) => { emit('tool.execution_start', { toolCallId: key, toolName: 'task' }); emit('subagent.started', { toolCallId: key, agentId: key, agentName: name.toLowerCase(), agentDisplayName: name, model, agentDescription: task }); };
  emit('assistant.turn_start', { turnId: '1' });
  emit('assistant.usage', { model: 'Demo · coordinator', inputTokens: 1840, outputTokens: 211, duration: 1400 });
  start('planner', 'Planner', 'Demo · reasoning model', 'Break down the authentication change');
  emit('assistant.intent', { intent: 'Mapping session boundaries and verification criteria' }, 'planner');
  const timer = setInterval(() => {
    phase++;
    emit('viewer.heartbeat');
    if (phase === 2) {
      emit('subagent.completed', { toolCallId: 'planner' });
      start('builder', 'Implementer', 'Demo · coding model', 'Implement token refresh and session middleware');
      emit('viewer.edge', { source: 'planner', target: 'builder', label: 'implementation plan' });
    }
    if (phase === 3) { emit('tool.execution_start', { toolCallId: 'edit-' + iteration, toolName: 'edit', arguments: { path: 'src/auth/session.ts' } }, 'builder'); }
    if (phase === 5) {
      emit('tool.execution_complete', { toolCallId: 'edit-' + iteration, success: true, result: 'Updated session middleware' }, 'builder');
      emit('subagent.completed', { toolCallId: 'builder' });
      start('tester', 'Test runner', 'Demo · fast model', 'Verify refresh, expiry and invalid token paths');
      start('reviewer', 'Reviewer', 'Demo · reasoning model', 'Review changes independently');
      emit('viewer.edge', { source: 'builder', target: 'tester', label: 'verify' });
      emit('viewer.edge', { source: 'builder', target: 'reviewer', label: 'review' });
      emit('tool.execution_start', { toolCallId: 'tests-' + iteration, toolName: 'shell', arguments: { command: 'npm test -- auth' } }, 'tester');
      emit('assistant.intent', { intent: 'Checking token expiry and concurrent refresh handling' }, 'reviewer');
    }
    if (phase === 8) emit('assistant.message', { content: 'Refresh race detected: two concurrent requests may reuse an expired token. Add a single-flight guard and rerun verification.' }, 'reviewer');
    if (phase === 10) {
      emit('subagent.completed', { toolCallId: 'reviewer' });
      emit('tool.execution_complete', { toolCallId: 'tests-' + iteration, success: false, error: '1 failed: concurrent refresh should issue one token request' }, 'tester');
      emit('subagent.failed', { toolCallId: 'tester', error: 'Concurrent refresh assertion failed' });
      emit('viewer.edge', { source: 'tester', target: 'builder', kind: 'feedback', label: 'rework · ' + (iteration + 1) });
      emit('viewer.structure_change', { message: 'Verification returned to Implementer. Feedback loop is now active.' });
    }
    if (phase === 12) {
      iteration++; phase = 2;
      start('builder', 'Implementer', 'Demo · coding model', 'Fix concurrent refresh, iteration ' + (iteration + 1));
      emit('assistant.intent', { intent: 'Applying reviewer findings · iteration ' + (iteration + 1) }, 'builder');
    }
  }, 1700);
  return () => { clearInterval(timer); store.sessions.delete(id); changed(); };
}
