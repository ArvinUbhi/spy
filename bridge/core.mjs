// Pure, dependency-free bridge projection and bounded delivery queue.
const allowed = new Set(['viewer.iteration','skill.invoked','session.skills_loaded','session.custom_agents_updated','permission.requested','permission.completed','user_input.requested','user_input.completed','elicitation.requested','elicitation.completed','assistant.idle','viewer.context_handoff','viewer.context_mode','viewer.agent_state','session.start', 'session.title_changed', 'session.model_change', 'session.idle', 'session.shutdown', 'session.error', 'assistant.turn_start', 'assistant.turn_end', 'assistant.intent', 'assistant.message_delta', 'assistant.message', 'assistant.usage', 'subagent.started', 'subagent.configured', 'subagent.completed', 'subagent.failed', 'tool.execution_start', 'tool.execution_complete', 'tool.execution_partial_result', 'tool.execution_progress', 'tool.shell_output', 'viewer.metadata', 'viewer.heartbeat', 'viewer.disconnect', 'viewer.structure_change']);
const fields = new Set(['loopId','iteration','outcome','progressKey','cacheReadTokens','cacheWriteTokens','toolCallId', 'toolName', 'agentName', 'agentDisplayName', 'agentDescription', 'model', 'selectedModel', 'newModel', 'parentId', 'agentId', 'parentAgentId', 'title', 'reasoningEffort', 'inputTokens', 'outputTokens', 'totalTokens', 'duration', 'durationMs', 'turnId', 'intent', 'content', 'deltaContent', 'text', 'partialOutput', 'output', 'progressMessage', 'arguments', 'result', 'error', 'success', 'name', 'message', 'id', 'path','description','pluginName','pluginVersion','allowedTools','skills','agents','requestId','question','resolvedByHook','ownerAgentId','cancelled','state','reason','source','target','label','mode','kind','payload','summary','scope','truncated']);
export function projectEvent(event, uuid) {
  if (!allowed.has(event.type)) return null;
  const data = {};
  for (const [key, value] of Object.entries(event.data || {})) {
    if (!fields.has(key)) continue;
    if((key==='skills'||key==='agents')&&Array.isArray(value)){
      data[key]=value.filter(item=>item&&typeof item==='object').slice(0,60).map(item=>Object.fromEntries(Object.entries(item).filter(([k])=>['id','name','displayName','model','description','source','path','enabled'].includes(k)).map(([k,v])=>[k,typeof v==='string'?v.slice(0,k==='description'?800:200):v])));continue;
    }
    if(key==='allowedTools'&&Array.isArray(value)){data[key]=value.slice(0,30).map(x=>String(x).slice(0,100));continue;}
    if(typeof value==='string'&&value.length>6000)data.truncated=true;
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
export function metadataEvent(args) {
  const types=['viewer.iteration','viewer.context_handoff','viewer.context_mode','viewer.agent_state','viewer.structure_change'];
  if(args.type==='viewer.iteration'&&(!args.loopId||args.loopId.length>200||!Number.isSafeInteger(args.iteration)||args.iteration<1||!['running','passed','failed','cancelled'].includes(args.outcome)))throw Error('Iteration needs loopId, positive integer iteration and valid outcome');
  if(!types.includes(args.type))throw Error('Unsupported metadata type');
  if(args.type==='viewer.context_handoff' && (!args.source||!args.target||args.source===args.target))throw Error('Context handoffs need distinct source and target agent IDs');
  if(args.type==='viewer.agent_state'&&!['running','idle','waiting','blocked','completed','failed','cancelled','unknown'].includes(args.state))throw Error('Valid state required');
  if(args.type==='viewer.context_mode'&&!['shared','isolated','unknown'].includes(args.mode))throw Error('Valid context mode required');
  if(args.type==='viewer.structure_change'&&!args.message)throw Error('Change message required');
  const {type,agentId,...data}=args;return {type,agentId,data};
}
