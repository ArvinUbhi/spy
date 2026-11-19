import {createHash} from 'node:crypto';
// Bounded live instrumentation; no journals or background polling.
export function transport(s, packet) {
  s.coverage ||= {missingEvents:0,reorderedEvents:0,attachments:0};
  const {bridgeId,sequence}=packet;
  if(typeof bridgeId!=='string'||bridgeId.length>200||!Number.isSafeInteger(sequence)||sequence<1)return;
  if(s.coverage.bridgeId!==bridgeId){s.coverage.bridgeId=bridgeId;s.coverage.sequence=0;s.coverage.gaps=[];s.coverage.attachments++;}
  const previous=s.coverage.sequence;
  if(sequence>previous+1){s.coverage.missingEvents+=sequence-previous-1;s.coverage.gaps.push([previous+1,sequence-1]);s.coverage.gaps=s.coverage.gaps.slice(-64);}
  if(sequence<previous){s.coverage.reorderedEvents++;const i=s.coverage.gaps.findIndex(([from,to])=>sequence>=from&&sequence<=to);if(i>=0){const [from,to]=s.coverage.gaps[i],replacement=[];if(from<sequence)replacement.push([from,sequence-1]);if(sequence<to)replacement.push([sequence+1,to]);s.coverage.gaps.splice(i,1,...replacement);s.coverage.gaps=s.coverage.gaps.slice(-64);s.coverage.missingEvents--;}}
  s.coverage.sequence=Math.max(previous,sequence);
}
export function instrument(s,a,event,at) {
  s.timeline ||= [];s.loops ||= [];
  const type=event.type,d=event.data;
  // Cumulative state durations survive agent restarts. The timeline retains only
  // 800 recent state intervals, so parallelism explicitly reports its window.
  const state=a.status;
  if(a.observedState!==state){
    if(a.stateSince!==undefined){const end=Math.max(a.stateSince,at),span={agentId:a.id,state:a.observedState,start:a.stateSince,end};a.stateMs ||= Object.create(null);a.stateMs[a.observedState]=(a.stateMs[a.observedState]||0)+end-a.stateSince;s.timeline.push(span);if(s.timeline.length>800){s.timeline.shift();s.timelineClipped=true;}}
    a.observedState=state;a.stateSince=Math.max(a.stateSince??at,at);
  }
  if(type==='subagent.started'||(a.id==='root'&&type==='assistant.turn_start')){
    a.runs ||= [];const prior=a.runs.at(-1);if(prior&&!prior.end)prior.end=at;
    a.runs.push({start:at});if(a.runs.length>30){a.runs.shift();a.runsClipped=true;}
  }
  if(['completed','failed','cancelled'].includes(state)||type==='assistant.turn_end'||type==='session.idle'){const run=a.runs?.at(-1);if(run&&!run.end)run.end=at;}
  if(type==='tool.execution_start'){
    a.toolCalls=(a.toolCalls||0)+1;
    let args=d.arguments;if(typeof args==='string')try{args=JSON.parse(args);}catch{}
    const canonical=value=>value&&typeof value==='object'?(Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]))):value;
    a.attempts ||= [];a.attempts.push({id:d.toolCallId,name:String(d.toolName||'Tool').slice(0,200),key:createHash('sha256').update(JSON.stringify([d.toolName,canonical(args)])).digest('hex'),at});a.attempts=a.attempts.slice(-60);
  }
  if(type==='tool.execution_complete'){const owner=s.agents[s.aliases[d.toolCallId]]?.parentId;const target=Object.values(s.agents).find(x=>x.attempts?.some(t=>t.id===d.toolCallId))||s.agents[owner]||a;const t=target.attempts?.find(t=>t.id===d.toolCallId);if(t){t.outcome=d.success===false?'failed':'completed';t.end=at;}if(d.success===false)target.toolFailures=(target.toolFailures||0)+1;}
  if(type==='assistant.usage'){
    a.usage ||= [];const model=String(d.model||a.model||'Not reported').slice(0,200);
    let row=a.usage.find(r=>r.model===model);
    if(!row){if(a.usage.length>=20){a.usageClipped=true;return;}a.usage.push(row={model,input:0,output:0,cacheRead:0,cacheWrite:0,calls:0,ms:0,inputReported:false,outputReported:false});}
    for(const [key,field] of [['input','inputTokens'],['output','outputTokens'],['cacheRead','cacheReadTokens'],['cacheWrite','cacheWriteTokens']])if(Number.isFinite(d[field])&&d[field]>=0){row[key]+=d[field];if(key==='input'||key==='output')row[key+'Reported']=true;}
    if(!Number.isFinite(d.inputTokens)||!Number.isFinite(d.outputTokens))row.incomplete=(row.incomplete||0)+1;
    row.calls++;row.ms+=Number.isFinite(d.duration)?d.duration:0;
  }
  if(type==='viewer.iteration'&&typeof d.loopId==='string'&&Number.isSafeInteger(d.iteration)&&d.iteration>=1&&['passed','failed','running','cancelled'].includes(d.outcome)){
    let loop=s.loops.find(l=>l.id===d.loopId);if(!loop){if(s.loops.length>=30)s.loops.shift();s.loops.push(loop={id:d.loopId.slice(0,200),iterations:[]});}
    const item={iteration:d.iteration,outcome:d.outcome,progressKey:String(d.progressKey||'').slice(0,300),at,agentId:a.id};
    const old=loop.iterations.find(i=>i.iteration===d.iteration);
    if(old){item.start=old.start;Object.assign(old,item);}else{item.start=d.outcome==='running'?at:null;loop.iterations.push(item);loop.iterations.sort((a,b)=>a.iteration-b.iteration);if(loop.iterations.length>30){loop.iterations.shift();loop.clipped=true;}}
  }
}
