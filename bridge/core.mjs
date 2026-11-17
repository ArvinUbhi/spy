// Pure, dependency-free bridge projection and bounded delivery queue.
const allowed = new Set(['session.start', 'session.title_changed', 'session.model_change', 'session.idle', 'session.shutdown', 'session.error', 'assistant.turn_start', 'assistant.turn_end', 'assistant.intent', 'assistant.message_delta', 'assistant.message', 'assistant.usage', 'subagent.started', 'subagent.configured', 'subagent.completed', 'subagent.failed', 'tool.execution_start', 'tool.execution_complete', 'tool.execution_partial_result', 'tool.execution_progress', 'tool.shell_output', 'viewer.metadata', 'viewer.heartbeat', 'viewer.disconnect', 'viewer.structure_change']);
const fields = new Set(['toolCallId', 'toolName', 'agentName', 'agentDisplayName', 'agentDescription', 'model', 'selectedModel', 'newModel', 'parentId', 'agentId', 'parentAgentId', 'title', 'reasoningEffort', 'inputTokens', 'outputTokens', 'totalTokens', 'duration', 'durationMs', 'turnId', 'intent', 'content', 'deltaContent', 'text', 'partialOutput', 'output', 'progressMessage', 'arguments', 'result', 'error', 'success', 'name', 'message']);
export function projectEvent(event, uuid) {
  if (!allowed.has(event.type)) return null;
  const data = {};
  for (const [key, value] of Object.entries(event.data || {})) {
    if (!fields.has(key)) continue;
    data[key] = typeof value === 'string' ? value.slice(0, 6000) : typeof value === 'object' && value !== null ? JSON.stringify(value).slice(0, 6000) : value;
  }
  return { id: event.id || uuid(), type: event.type, timestamp: event.timestamp || new Date().toISOString(), agentId: event.agentId, data };
}
export function createBuffer(limit = 300, maxBatchBytes = 240_000) {
  let queue = [], dropped = 0;
  const trim = () => { if (queue.length > limit) { dropped += queue.length - limit; queue = queue.slice(-limit); } };
  return {
    get size() { return queue.length; },
    push(packet) { queue.push(packet); trim(); },
    retry(batch) { queue = [...batch, ...queue]; trim(); },
    take() {
      const batch = []; let bytes = 2;
      while (queue.length && batch.length < 50) {
        const nextBytes = new TextEncoder().encode(JSON.stringify(queue[0])).length + 1;
        if (batch.length && bytes + nextBytes > maxBatchBytes) break;
        batch.push(queue.shift()); bytes += nextBytes;
      }
      return batch;
    },
    drainDropped() { const count = dropped; dropped = 0; return count; }
  };
}
