// Event-backed observations only. Context membership is never inferred from token usage.
const text = (value, limit=6000) => (value==null?'':typeof value==='string'?value:JSON.stringify(value)).slice(0,limit);
const read = value => { if(typeof value!=='string')return value;try{return JSON.parse(value);}catch{return null;} };
const terminal = a => ['completed','failed','cancelled'].includes(a.status);
const list=value=>Array.isArray(read(value))?read(value).filter(x=>x&&typeof x==='object'):[];
const modes=new Set(['shared','isolated','unknown']);
export function observe(session, agent, event, at) {
  const d=event.data,type=event.type;
  agent.skills ||= [];
  agent.waits ||= Object.create(null);
  agent.contextMode ||= 'unknown';
  if(['assistant.intent','assistant.message','assistant.message_delta','skill.invoked'].includes(type)&&['idle','unknown'].includes(agent.status)&&!Object.keys(agent.waits).length){agent.status='running';delete agent.endedAt;}
  if(type==='skill.invoked') {
    const name=text(d.name||'Unnamed skill',200),previous=agent.skills.find(s=>s.name===name);
    const skill={name,count:(previous?.count||0)+1,lastInvokedAt:at,path:text(d.path,800),description:text(d.description,1000),pluginName:text(d.pluginName,200),arguments:text(d.arguments),content:text(d.content,2000),truncated:d.truncated===true||(d.content?.length||0)>2000,evidence:'runtime'};
    agent.skills=[skill,...agent.skills.filter(s=>s.name!==name)].slice(0,20);
  }
  if(type==='session.skills_loaded') { session.skillsReported=true;session.skillCatalog=list(d.skills).slice(0,60).map(s=>({name:text(s.name,200),description:text(s.description,800),path:text(s.path,800),enabled:s.enabled!==false,source:text(s.source,100)}));}
  if(type==='session.custom_agents_updated') {session.agentsReported=true;session.agentCatalog=list(d.agents).slice(0,60).map(a=>({id:text(a.id||a.name,200),name:text(a.name,200),displayName:text(a.displayName||a.name,200),model:text(a.model,200),description:text(a.description,800),source:text(a.source,100)}));}
  if(type==='viewer.agent_state') {
    if(!['running','idle','waiting','blocked','completed','failed','cancelled','unknown'].includes(d.state))throw Error('Invalid agent state');
    agent.status=d.state;agent.stateEvidence='orchestrator';agent.activity=text(d.reason||d.state,1000);
    if(terminal(agent))agent.endedAt=at;else delete agent.endedAt;
  }
  if(type==='viewer.context_mode' && modes.has(d.mode)) {agent.contextMode=d.mode;agent.contextEvidence='orchestrator';}
  if(['assistant.turn_start','tool.execution_start','subagent.started'].includes(type)) {agent.blockedReason=undefined;if(!Object.keys(agent.waits).length){agent.status='running';agent.stateEvidence='runtime';}}
  if(['assistant.turn_end','assistant.idle'].includes(type) && !terminal(agent) && !Object.keys(agent.waits).length){agent.status='idle';agent.endedAt=at;agent.stateEvidence='runtime';}
  const requestTypes={'permission.requested':'permission','user_input.requested':'user input','elicitation.requested':'elicitation'};
  const completionTypes={'permission.completed':'permission','user_input.completed':'user input','elicitation.completed':'elicitation'};
  if(requestTypes[type] && !d.resolvedByHook && typeof d.requestId==='string') {
    if(terminal(agent))return;
    if(Object.keys(session.pendingRequests).length>=200)return;
    if(!Object.keys(agent.waits).length){agent.resumeStatus=agent.status;agent.waitStartedAt=at;}
    const reason=requestTypes[type]==='permission'?'Waiting for permission':text(d.question||'Waiting for '+requestTypes[type],1000);
    agent.waits[d.requestId]={kind:requestTypes[type],reason,startedAt:at};
    session.pendingRequests[d.requestId]=agent.id;delete agent.endedAt;agent.status='waiting';agent.activity=reason;agent.stateEvidence='runtime';
  }
  if(completionTypes[type] && typeof d.requestId==='string' && agent.waits[d.requestId]) {
    delete agent.waits[d.requestId];delete session.pendingRequests[d.requestId];
    if(terminal(agent))return;
    const result=read(d.result),kind=result?.kind||'';
    if(type==='permission.completed' && /^(denied|rejected)/.test(kind)){agent.blockedReason='Permission denied: '+kind;}
    const pending=Object.values(agent.waits);
    if(pending.length){agent.status='waiting';agent.activity=pending[0].reason;}
    else {
      agent.waitMs=(agent.waitMs||0)+Math.max(0,at-(agent.waitStartedAt||at));delete agent.waitStartedAt;
      agent.status=agent.blockedReason?'blocked':agent.resumeStatus==='idle'?'idle':'running';
      agent.activity=agent.blockedReason||'Request resolved';delete agent.resumeStatus;
    }
    agent.stateEvidence='runtime';
  }
  if(type==='subagent.completed' && d.cancelled){agent.status='cancelled';agent.activity='Cancelled by runtime';}
  if(!terminal(agent)&&Object.keys(agent.waits).length){agent.status='waiting';agent.activity=Object.values(agent.waits)[0].reason;}
  if(terminal(agent)){if(agent.waitStartedAt)agent.waitMs=(agent.waitMs||0)+Math.max(0,at-agent.waitStartedAt);for(const id of Object.keys(agent.waits))delete session.pendingRequests[id];agent.waits=Object.create(null);delete agent.waitStartedAt;}
}
export function recordContext(s, input, at) {
  if(!input.source||!input.target||input.source===input.target)return;
  const id=text(input.id||`context:${input.source}:${input.target}:${at}`,200);
  const payload=input.payload===undefined?null:text(input.payload);
  const transfer={id,source:input.source,target:input.target,label:text(input.label||'Context handoff',200),kind:text(input.kind||'handoff',100),mode:modes.has(input.mode)?input.mode:'unknown',payload,summary:text(input.summary,1000),at,evidence:input.evidence==='runtime'?'runtime':'orchestrator',truncated:input.truncated===true||(typeof input.payload==='string'&&input.payload.length>6000),scope:text(input.scope||'Only the recorded payload is observable',300)};
  s.contexts=[transfer,...s.contexts.filter(c=>c.id!==id)].slice(0,120);
}
export function delegatedPrompt(s, child, callId, at) {
  const parent=s.agents[child.parentId];const args=read(parent?.tools[callId]?.args);
  if(typeof args?.prompt==='string')recordContext(s,{id:`prompt:${callId}`,source:parent.id,target:child.id,label:'Delegated prompt',kind:'prompt',payload:args.prompt,evidence:'runtime',scope:'Task-tool prompt only; full context inheritance is not reported'},at);
}
