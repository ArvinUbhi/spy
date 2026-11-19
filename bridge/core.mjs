// Pure, dependency-free bridge projection and bounded delivery queue.
const allowed = new Set(['viewer.progress','viewer.task_state','user.message','viewer.iteration','skill.invoked','session.skills_loaded','session.custom_agents_updated','permission.requested','permission.completed','user_input.requested','user_input.completed','elicitation.requested','elicitation.completed','assistant.idle','viewer.context_handoff','viewer.context_mode','viewer.agent_state','session.start', 'session.title_changed', 'session.model_change', 'session.idle', 'session.shutdown', 'session.error', 'assistant.turn_start', 'assistant.turn_end', 'assistant.intent', 'assistant.message_delta', 'assistant.message', 'assistant.usage', 'subagent.started', 'subagent.configured', 'subagent.completed', 'subagent.failed', 'tool.execution_start', 'tool.execution_complete', 'tool.execution_partial_result', 'tool.execution_progress', 'tool.shell_output', 'viewer.metadata', 'viewer.heartbeat', 'viewer.disconnect', 'viewer.structure_change']);
const fields = new Set(['objective','nextStep','mcpServerName','mcpToolName','messageId','parentToolCallId','runtimeTaskId','executionMode','loopId','iteration','outcome','progressKey','cacheReadTokens','cacheWriteTokens','toolCallId', 'toolName', 'agentName', 'agentDisplayName', 'agentDescription', 'model', 'selectedModel', 'newModel', 'parentId', 'agentId', 'parentAgentId', 'title', 'reasoningEffort', 'inputTokens', 'outputTokens', 'totalTokens', 'duration', 'durationMs', 'turnId', 'intent', 'content', 'deltaContent', 'text', 'partialOutput', 'output', 'progressMessage', 'arguments', 'result', 'error', 'success', 'name', 'message', 'id', 'path','description','pluginName','pluginVersion','allowedTools','skills','agents','requestId','question','resolvedByHook','ownerAgentId','cancelled','state','reason','source','target','label','mode','kind','payload','summary','scope','truncated']);
export function projectEvent(event, uuid) {
  if (!allowed.has(event.type)) return null;
  const data = {};
  for (const [key, value] of Object.entries(event.data || {})) {
    if(key==='capabilities'&&event.type==='viewer.metadata'){data.capabilities={prompt:value?.prompt===true,taskPrompt:value?.taskPrompt===true};continue;}
    if (!fields.has(key)) continue;
    if(key==='truncated'){data.truncated=data.truncated||value===true;continue;}
    if((key==='skills'||key==='agents')&&Array.isArray(value)){
      data[key]=value.filter(item=>item&&typeof item==='object').slice(0,60).map(item=>Object.fromEntries(Object.entries(item).filter(([k])=>['id','name','displayName','model','description','source','path','enabled'].includes(k)).map(([k,v])=>[k,typeof v==='string'?v.slice(0,k==='description'?800:200):v])));continue;
    }
    if(key==='allowedTools'&&Array.isArray(value)){data[key]=value.slice(0,30).map(x=>String(x).slice(0,100));continue;}
    const encoded=typeof value==='object'&&value!==null?JSON.stringify(value):value;if(typeof encoded==='string'&&encoded.length>64000)data.truncated=true;
    data[key] = typeof encoded==='string'?encoded.slice(0,64000):encoded;
  }
  while(new TextEncoder().encode(JSON.stringify(data)).length>192000){const key=Object.keys(data).filter(k=>typeof data[k]==='string'&&data[k].length>1000).sort((a,b)=>data[b].length-data[a].length)[0];if(!key)break;data[key]=data[key].slice(0,Math.floor(data[key].length/2));data.truncated=true;}
  return { id: typeof event.id==='string'&&event.id.length<=200?event.id:uuid(), type: event.type, timestamp: event.timestamp || new Date().toISOString(), agentId: event.agentId, data };
}
export function createBuffer(limit = 2048, maxBatchBytes = 480_000, maxQueueBytes = 8*1024*1024) {
 let queue=[],bytes=0,dropped=0;const encoder=new TextEncoder();
 const entry=packet=>({packet,bytes:encoder.encode(JSON.stringify(packet)).length+1});
 const trim=()=>{while(queue.length&&(queue.length>limit||bytes>maxQueueBytes)){bytes-=queue.shift().bytes;dropped++;}};
 return {get size(){return queue.length;},get bytes(){return bytes;},
 push(packet){const item=entry(packet);if(item.bytes+2>maxBatchBytes||item.bytes>maxQueueBytes){dropped++;return;}queue.push(item);bytes+=item.bytes;trim();},
 retry(batch){const items=batch.map(entry).filter(item=>{if(item.bytes+2>maxBatchBytes){dropped++;return false;}return true;});queue=[...items,...queue];bytes+=items.reduce((n,i)=>n+i.bytes,0);trim();},
 take(){const batch=[];let size=2;while(queue.length&&batch.length<50){const item=queue[0];if(size+item.bytes>maxBatchBytes)break;queue.shift();bytes-=item.bytes;size+=item.bytes;batch.push(item.packet);}return batch;},
 clear(){queue=[];bytes=0;},drainDropped(){const count=dropped;dropped=0;return count;}};
}
export function metadataEvent(args) {
  const types=['viewer.progress','viewer.iteration','viewer.context_handoff','viewer.context_mode','viewer.agent_state','viewer.structure_change'];
  if(args.type==='viewer.iteration'&&(!args.loopId||args.loopId.length>200||!Number.isSafeInteger(args.iteration)||args.iteration<1||!['running','passed','failed','cancelled'].includes(args.outcome)))throw Error('Iteration needs loopId, positive integer iteration and valid outcome');
  if(!types.includes(args.type))throw Error('Unsupported metadata type');
  if(args.type==='viewer.context_handoff' && (!args.source||!args.target||args.source===args.target))throw Error('Context handoffs need distinct source and target agent IDs');
  if(args.type==='viewer.agent_state'&&!['running','idle','waiting','blocked','completed','failed','cancelled','unknown'].includes(args.state))throw Error('Valid state required');
  if(args.type==='viewer.context_mode'&&!['shared','isolated','unknown'].includes(args.mode))throw Error('Valid context mode required');
  if(args.type==='viewer.structure_change'&&!args.message)throw Error('Change message required');
  const {type,agentId,...data}=args;return {type,agentId,data};
}
