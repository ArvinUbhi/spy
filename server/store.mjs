import {RETENTION,maintain,compactMaps,budgetSession,trimDetails} from './retention.mjs';
import { transport, instrument } from './diagnostics.mjs';
import { observe, recordContext, delegatedPrompt } from './observability.mjs';
// Bounded session projection; the server can persist a local history snapshot.
const MAX_SESSIONS = 40, MAX_AGENTS = 160, MAX_EVENTS = RETENTION.eventCount;
const terminal = s => ['completed', 'failed', 'cancelled'].includes(s);
const clip = value => (typeof value === 'string' ? value : JSON.stringify(value ?? '')).slice(0, 6000);
export class Store {
  sessions = new Map();
  ingest(packet, now = Date.now()) {
    if (!packet || typeof packet.sessionId !== 'string' || packet.sessionId.length > 200) throw new Error('sessionId required');
    const event = packet.event;
    if (!event || typeof event.type !== 'string' || event.type.length > 100 || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) throw new Error('event.type and event.data required');
    for(const value of [event.id,event.timestamp])if(value!==undefined&&(typeof value!=='string'||value.length>200))throw Error('Invalid event identifier or timestamp');
    for (const id of [event.data.parentAgentId,event.data.parentId,event.agentId, event.data.toolCallId, event.data.agentId, event.data.source, event.data.target, event.data.requestId, event.data.ownerAgentId,event.data.runtimeTaskId]) if (id !== undefined && (typeof id !== 'string' || id.length > 200)) throw new Error('Invalid instance identifier');
    for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'duration', 'durationMs', 'cacheReadTokens', 'cacheWriteTokens']) if (event.data[key] !== undefined && (!Number.isFinite(event.data[key]) || event.data[key] < 0)) throw new Error('Invalid metric: ' + key);
    if(event.type==='tool.execution_start'&&typeof event.data.toolCallId!=='string')throw Error('Tool start requires toolCallId');
    let s = this.sessions.get(packet.sessionId);
    if (!s) {
      if (this.sessions.size >= MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value);
      s = { id: packet.sessionId, name: clip(packet.name || 'Copilot session'), cwd: clip(packet.cwd || ''), source: packet.source === 'demo' ? 'demo' : 'live', startedAt: now, lastSeen: now, status: 'connected', agents: Object.create(null), edges: [], aliases: Object.create(null), calls: Object.create(null), pendingRequests: Object.create(null), contexts: [], skillCatalog: [], agentCatalog: [], seen: new Set(), notices: [] };
      this.sessions.set(s.id, s);
    }
    transport(s,packet);
    s.lastSeen = now; s.restored=false;
    if(packet.bridgeMetrics && ['rssMiB','cpuPercent'].every(k=>Number.isFinite(packet.bridgeMetrics[k]) && packet.bridgeMetrics[k]>=0)) s.bridgeMetrics={rssMiB:packet.bridgeMetrics.rssMiB,cpuPercent:packet.bridgeMetrics.cpuPercent};
    if (event.id && s.seen.has(event.id)) return s;
    if (event.id) { s.seen.add(event.id); if (s.seen.size > RETENTION.dedupe) s.seen.delete(s.seen.values().next().value); }
    const d = event.data, type = event.type;
    const parsed = Date.parse(event.timestamp);
    const at = Math.max(s.lastEventAt||0,Number.isFinite(parsed)?Math.min(parsed,now):now);
    s.lastEventAt=at;
    const agent = (id, name) => {
      if (!s.agents[id]) {
        if (Object.keys(s.agents).length >= MAX_AGENTS) {
          const old = Object.values(s.agents).find(a => terminal(a.status) && a.id !== 'root');
          if (!old){s.visibilityDropped=(s.visibilityDropped||0)+1;return null;}
          delete s.agents[old.id];
          s.timeline=(s.timeline||[]).filter(t=>t.agentId!==old.id);
          s.edges = s.edges.filter(e => e.source !== old.id && e.target !== old.id);
          s.contexts=s.contexts.filter(c=>c.source!==old.id&&c.target!==old.id);
          for(const [key,owner] of Object.entries(s.pendingRequests))if(owner===old.id)delete s.pendingRequests[key];
          for (const [key, value] of Object.entries(s.aliases)) if (value === old.id) delete s.aliases[key];
        }
        s.agents[id] = { id, name: name?clip(name).slice(0,200):(id === 'root' ? 'Orchestrator' : 'Agent ' + id.slice(0, 8)), model: null, status: id==='root'?'idle':'unknown', startedAt: at, lastActivity: at, activity: 'Waiting for activity', tools: Object.create(null), events: [], tokens: 0, modelMs: 0, turns: 0, skills: [], contextMode: 'unknown', kind: id === 'root' ? 'coordinator' : 'worker' };
      }
      return s.agents[id];
    };
    const root = agent('root');
    if (type === 'viewer.heartbeat') { if (s.status === 'disconnected') s.status = 'connected'; return s; }
    if (type === 'viewer.disconnect' || type === 'session.shutdown') { s.status = 'disconnected'; return s; }
    if (type === 'viewer.metadata') { if (d.title || (!s.named && d.name)) s.name = clip(d.title || d.name); if(d.title)s.named=true; if(d.capabilities)s.capabilities=d.capabilities; return s; }
    if(type==='viewer.task_state'&&d.toolCallId&&s.aliases[d.toolCallId]){s.aliases[d.agentId]=s.aliases[d.toolCallId];}
    const requestedOwner=s.pendingRequests[d.requestId] || d.ownerAgentId;
    const origin=requestedOwner?(s.aliases[requestedOwner]||requestedOwner):(event.agentId||d.agentId)?(s.aliases[event.agentId||d.agentId]||event.agentId||d.agentId):'root';
    if (type === 'tool.execution_start' && d.toolCallId) { s.calls[d.toolCallId] = origin; if (Object.keys(s.calls).length > 320) delete s.calls[Object.keys(s.calls)[0]]; }
    let id = origin;
    if(type.startsWith('subagent.')&&!d.toolCallId){const known=Object.entries(s.aliases).find(([key,value])=>value===(s.aliases[d.agentId||event.agentId]||d.agentId||event.agentId)&&key!==(d.agentId||event.agentId));if(known)d.toolCallId=known[0];}
    if (type.startsWith('subagent.') && d.toolCallId) {
      const caller = s.calls[d.toolCallId];
      const childInstance = d.agentId || (event.agentId && event.agentId !== caller ? event.agentId : null);
      id = s.aliases[d.toolCallId] || childInstance || d.toolCallId;
      // Correlate lifecycle IDs with their spawning tool. An envelope ID that
      // matches the known caller remains the parent; distinct IDs identify the child.
      const a = agent(id, d.agentDisplayName || d.agentName);
      if (!a) return s;
      s.aliases[d.toolCallId] = id;
      if (childInstance) s.aliases[childInstance] = id;
      if (d.agentName) a.role = clip(d.agentName).slice(0,200);
      if (d.agentDisplayName) a.name = clip(d.agentDisplayName).slice(0,200);
      if (d.agentDescription) a.task = clip(d.agentDescription).slice(0,2000);
      if (d.model) a.model = clip(d.model).slice(0,200);
      if(d.executionMode)a.executionMode=d.executionMode;
      if (type === 'subagent.started') {
        a.startedAt = at; delete a.endedAt; delete a.durationMs; a.status = 'running'; a.activity = a.task || 'Starting delegated task';
        const parent = s.calls[d.toolCallId] || d.parentAgentId || d.parentId || (event.agentId && event.agentId !== id ? origin : null);
        const parentId = s.aliases[parent] || parent || 'root';
        if (parentId !== id && !s.edges.some(e => e.target === id)) s.edges.push({ id: 'spawn:' + id, source: parentId, target: id, kind: 'delegation', inferred: !parent, label: parent ? 'delegates' : 'parent unconfirmed' });
        agent(parentId);
        a.parentId = parentId;
        delegatedPrompt(s,a,d.toolCallId,at);
      }
      if (type === 'subagent.completed' || type === 'subagent.failed') {
        a.status = type.endsWith('failed') ? 'failed' : 'completed'; a.endedAt = at; a.activity = d.error ? clip(d.error) : 'Task complete';
        if (Number.isFinite(d.durationMs)) a.durationMs = d.durationMs;
        if (Number.isFinite(d.totalTokens)) a.tokens = d.totalTokens;
        const owner = s.agents[s.calls[d.toolCallId]];
        const delegation = owner?.tools[d.toolCallId];
        if (delegation?.status === 'running') { delegation.status = a.status; delegation.endedAt = at; }
        delete s.calls[d.toolCallId];
      }
    }
    const a = agent(id);
    if (!a) return s;
    if(type==='viewer.task_state'){
      a.runtimeConfirmedAt=at;
      if(a.runtimeTaskId===d.runtimeTaskId&&a.status===d.state&&(!d.name||a.name===d.name)&&(!d.model||a.model===d.model)&&a.stateEvidence==='Runtime task registry')return s;
    }
    a.lastActivity = at;
    if(['subagent.completed','subagent.failed'].includes(type)&&!d.toolCallId){a.status=type==='subagent.failed'?'failed':d.cancelled?'cancelled':'completed';a.endedAt=at;a.activity=d.error||'Task complete';}
    if(type==='viewer.task_state'){
      if(d.runtimeTaskId)a.runtimeTaskId=d.runtimeTaskId;
      if(d.name)a.name=clip(d.name).slice(0,200);
      if(d.model)a.model=clip(d.model).slice(0,200);
      if(['running','idle','completed','failed','cancelled'].includes(d.state)){a.status=d.state;a.stateEvidence='Runtime task registry';a.activity=d.reason||d.state;if(terminal(a.status)||a.status==='idle')a.endedAt=at;else delete a.endedAt;}
    }
    if (type === 'subagent.configured') { if (d.model) a.model = clip(d.model).slice(0,200); a.reasoningEffort = clip(d.reasoningEffort).slice(0,100); }
    if (type === 'session.start' && d.selectedModel) root.model = clip(d.selectedModel).slice(0,200);
    if (type === 'session.title_changed' && (d.title||d.name)) {s.name = clip(d.title||d.name);s.named=true;}
    if(type==='user.message'&&!s.named&&d.content){s.name=clip(d.content).replace(/\s+/g,' ').slice(0,100);s.named=true;}
    if (type === 'assistant.turn_start') { if (id === 'root') a.startedAt = at; a.status = 'running'; a.endedAt = undefined; a.turns++; s.status = 'connected'; }
    if (type === 'assistant.intent') a.activity = clip(d.intent);
    if (type === 'assistant.message_delta') { a.output = ((a.output || '') + (d.deltaContent || '')).slice(-4000); a.activity = 'Streaming response'; }
    if (type === 'assistant.message') { a.output = clip(d.content).slice(0,4000); a.activity = 'Response received'; }
    if (type === 'assistant.usage') { if (d.model) a.model = clip(d.model).slice(0,200); a.tokens += (d.inputTokens || 0) + (d.outputTokens || 0); a.modelMs += d.duration || 0; }
    if (type === 'session.model_change' && d.newModel) root.model = clip(d.newModel).slice(0,200);
    if (type === 'tool.execution_start') {
      if (Object.keys(a.tools).length >= RETENTION.toolCount && !a.tools[d.toolCallId]) {
        const old = Object.values(a.tools).find(t => t.status !== 'running');
        if (old) delete a.tools[old.id];
        else { a.droppedTools = (a.droppedTools || 0) + 1; a.activity = 'Tool visibility cap reached (24 active calls)'; return s; }
      }
      a.tools[d.toolCallId] = { id: d.toolCallId, name: clip(d.toolName || 'Tool').slice(0,200), startedAt: at, status: 'running', args: clip(d.arguments).slice(0,2000) };
      a.activity = 'Running ' + (d.toolName || 'tool');
      if (Object.keys(a.tools).length > RETENTION.toolCount) { const old = Object.values(a.tools).find(t => t.status !== 'running'); if (old) delete a.tools[old.id]; }
    }
    if (['tool.execution_partial_result', 'tool.execution_progress', 'tool.shell_output'].includes(type)) {
      const owner = s.agents[s.calls[d.toolCallId]] || s.agents[s.agents[s.aliases[d.toolCallId]]?.parentId] || a;
      const t = owner.tools[d.toolCallId];
      if (t) t.result = ((t.result || '') + clip(d.partialOutput || d.text || d.output || d.progressMessage || '')).slice(-4000);
    }
    if (type === 'tool.execution_complete') {
      const owner = s.agents[s.calls[d.toolCallId]] || s.agents[s.agents[s.aliases[d.toolCallId]]?.parentId] || a;
      const t = owner.tools[d.toolCallId];
      if (t) { t.endedAt = at; t.status = d.success === false ? 'failed' : 'completed'; t.result = clip(d.result ?? d.error).slice(0,4000); }
      const child=s.agents[s.aliases[d.toolCallId]];
      if(child && child.id!==owner.id && child.parentId===owner.id && d.result!==undefined)recordContext(s,{id:`result:${d.toolCallId}`,source:child.id,target:owner.id,kind:'result',label:'Returned result',payload:d.result,evidence:'runtime',scope:'Returned tool result only'},at);
      if(child && !terminal(child.status) && child.executionMode!=='background' && !child.runtimeTaskId){child.status=d.success===false?'failed':'completed';child.endedAt=at;child.activity='Delegating tool returned';child.stateEvidence='Synchronous delegation returned';observe(s,child,{type:'viewer.reconciled',data:{}},at);instrument(s,child,{type:'viewer.reconciled',data:{}},at);}
      delete s.calls[d.toolCallId];
      owner.activity = 'Tool finished';
    }
    if (type === 'assistant.turn_end') { a.status = id === 'root' ? 'idle' : a.status; a.activity = 'Turn complete'; }
    if (type === 'session.idle') { root.status = 'idle'; root.endedAt = at; root.activity = 'Waiting for your next prompt'; s.status = 'idle'; }
    // Explicit orchestration metadata, never inferred from transcript text.
    if (type === 'viewer.edge' && d.source && d.target && d.source !== d.target) {
      agent(d.source); agent(d.target);
      const edgeId = `${d.source}:${d.target}:${clip(d.kind || 'handoff').slice(0,100)}`;
      const previousEdge=s.edges.find(e=>e.id===edgeId);if(previousEdge){previousEdge.traversals=(previousEdge.traversals||1)+1;previousEdge.lastAt=at;}
      if (!previousEdge) s.edges.push({ id: edgeId, source: d.source, target: d.target, kind: clip(d.kind || 'handoff').slice(0,100), traversals:1,firstAt:at,lastAt:at,label: clip(d.label || 'handoff'), inferred: false });
      s.edges = s.edges.slice(-400);
    }
    if(type==='viewer.context_handoff' && d.source && d.target){
      const source=s.aliases[d.source]||d.source,target=s.aliases[d.target]||d.target;
      if(agent(source)&&agent(target)){recordContext(s,{...d,id:d.id||event.id,source,target,evidence:'orchestrator'},at);const edgeId='context:'+source+':'+target;
        if(!s.edges.some(e=>e.id===edgeId))s.edges.push({id:edgeId,source,target,kind:'context',label:'Context handoff',inferred:false});s.edges=s.edges.slice(-400);}
    }
    if(terminal(a.status))for(const t of Object.values(a.tools))if(t.status==='running'){t.status='unknown';t.endedAt=at;}
    observe(s,a,event,at);
    instrument(s,a,event,at);
    if (type === 'viewer.structure_change') { s.notices.unshift({ at, message: clip(d.message) }); s.notices = s.notices.slice(0, 12); }
    if (!['assistant.message_delta', 'assistant.reasoning_delta', 'assistant.reasoning'].includes(type)) {
      a.eventTotal=(a.eventTotal||a.events.length)+1;
      a.events.unshift({ at, type, text: clip((type==='skill.invoked'?d.name:null) || d.intent || d.content || d.error || d.toolName || d.agentDisplayName || d.model || d.name || d.reason || type).slice(0,1200) });
      a.events = a.events.slice(0, MAX_EVENTS);
    }
    s.lastWorkAt=now;s.detailDirty=true;compactMaps(s);s.sinceBudget=(s.sinceBudget||0)+1;if(s.sinceBudget>=64){s.sinceBudget=0;const bytes=budgetSession(s,now);this.retainedBytes=(this.retainedBytes||0)-(s.accountedBytes||0)+bytes;s.accountedBytes=bytes;if(this.retainedBytes>RETENTION.totalBytes)this.maintain(now,true);}
    return s;
  }
  maintain(now=Date.now(),force=false){if(!force&&this.lastMaintenance!==undefined&&now-this.lastMaintenance<5000)return false;this.lastMaintenance=now;return maintain(this,now);}
  clearDetails(id,now=Date.now()){const s=this.sessions.get(id);if(s){trimDetails(s,now,'Cleared by viewer');s.detailDirty=false;}return !!s;}
  clear(){this.sessions.clear();this.retainedBytes=0;}
  snapshot(now = Date.now()) {
    this.maintain(now);
    return [...this.sessions.values()].map(({ aliases, calls, pendingRequests, seen, ...s }) => { const status=s.restored||now-s.lastSeen>35_000?'disconnected':s.status;return {...s,status,agents:Object.values(s.agents).map(a=>status==='disconnected'?{...a,connectionLost:true}:a.status==='running'&&now-Math.max(a.lastActivity,a.runtimeConfirmedAt||0)>120000?{...a,status:'unknown',stale:true,reportedStatus:a.status,stateEvidence:'No agent activity for two minutes; runtime state unconfirmed',activity:'Activity stale · awaiting runtime confirmation',tools:Object.fromEntries(Object.entries(a.tools).map(([id,t])=>[id,t.status==='running'?{...t,status:'unknown'}:t]))}:a)}; });
  }
  liveView(selectedId,now=Date.now()) {
    const all=this.snapshot(now);
    const selected=all.find(s=>s.id===selectedId) || all.find(s=>s.source==='live' && s.status!=='disconnected') || all[0];
    if(selected){const live=this.sessions.get(selected.id);if(live)live.lastInspectedAt=now;}
    return {selectedSessionId:selected?.id || null,sessions:all.map(s=>{
      const summary={id:s.id,name:s.name,cwd:s.cwd,source:s.source,status:s.status,startedAt:s.startedAt,lastSeen:s.lastSeen,runningCount:s.status==='disconnected'?0:s.agents.filter(a=>a.status==='running').length,waitingCount:s.status==='disconnected'?0:s.agents.filter(a=>a.status==='waiting'||a.status==='blocked').length,nodeCount:s.agents.length,bridgeMetrics:s.bridgeMetrics,capabilities:s.capabilities};
      return s.id===selected?.id?{...s,...summary}:{...summary,agents:[],edges:[],contexts:[],timeline:[],loops:[],skillCatalog:[],agentCatalog:[],notices:[]};
    })};
  }

}
