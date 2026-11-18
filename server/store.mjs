import { transport, instrument } from './diagnostics.mjs';
import { observe, recordContext, delegatedPrompt } from './observability.mjs';
// Volatile current-session projection. No database, log file, or browser storage.
const MAX_SESSIONS = 40, MAX_AGENTS = 160, MAX_EVENTS = 60;
const terminal = s => ['completed', 'failed', 'cancelled'].includes(s);
const clip = value => (typeof value === 'string' ? value : JSON.stringify(value ?? '')).slice(0, 6000);
export class Store {
  sessions = new Map();
  ingest(packet, now = Date.now()) {
    if (!packet || typeof packet.sessionId !== 'string' || packet.sessionId.length > 200) throw new Error('sessionId required');
    const event = packet.event;
    if (!event || typeof event.type !== 'string' || event.type.length > 100 || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) throw new Error('event.type and event.data required');
    for (const id of [event.agentId, event.data.toolCallId, event.data.agentId, event.data.source, event.data.target, event.data.requestId, event.data.ownerAgentId]) if (id !== undefined && (typeof id !== 'string' || id.length > 200)) throw new Error('Invalid instance identifier');
    for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'duration', 'durationMs', 'cacheReadTokens', 'cacheWriteTokens']) if (event.data[key] !== undefined && (!Number.isFinite(event.data[key]) || event.data[key] < 0)) throw new Error('Invalid metric: ' + key);
    let s = this.sessions.get(packet.sessionId);
    if (!s) {
      if (this.sessions.size >= MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value);
      s = { id: packet.sessionId, name: clip(packet.name || 'Copilot session'), cwd: clip(packet.cwd || ''), source: packet.source === 'demo' ? 'demo' : 'live', startedAt: now, lastSeen: now, status: 'connected', agents: Object.create(null), edges: [], aliases: Object.create(null), calls: Object.create(null), pendingRequests: Object.create(null), contexts: [], skillCatalog: [], agentCatalog: [], seen: new Set(), notices: [] };
      this.sessions.set(s.id, s);
    }
    transport(s,packet);
    s.lastSeen = now;
    if(packet.bridgeMetrics && ['rssMiB','cpuPercent'].every(k=>Number.isFinite(packet.bridgeMetrics[k]) && packet.bridgeMetrics[k]>=0)) s.bridgeMetrics={rssMiB:packet.bridgeMetrics.rssMiB,cpuPercent:packet.bridgeMetrics.cpuPercent};
    if (event.id && s.seen.has(event.id)) return s;
    if (event.id) { s.seen.add(event.id); if (s.seen.size > 4000) s.seen.delete(s.seen.values().next().value); }
    const d = event.data, type = event.type;
    const parsed = Date.parse(event.timestamp);
    const at = Math.max(s.lastEventAt||0,Number.isFinite(parsed)?Math.min(parsed,now):now);
    s.lastEventAt=at;
    const agent = (id, name) => {
      if (!s.agents[id]) {
        if (Object.keys(s.agents).length >= MAX_AGENTS) {
          const old = Object.values(s.agents).find(a => terminal(a.status) && a.id !== 'root');
          if (!old) return null;
          delete s.agents[old.id];
          s.timeline=(s.timeline||[]).filter(t=>t.agentId!==old.id);
          s.edges = s.edges.filter(e => e.source !== old.id && e.target !== old.id);
          s.contexts=s.contexts.filter(c=>c.source!==old.id&&c.target!==old.id);
          for(const [key,owner] of Object.entries(s.pendingRequests))if(owner===old.id)delete s.pendingRequests[key];
          for (const [key, value] of Object.entries(s.aliases)) if (value === old.id) delete s.aliases[key];
        }
        s.agents[id] = { id, name: name || (id === 'root' ? 'Orchestrator' : 'Agent ' + id.slice(0, 8)), model: null, status: id==='root'?'idle':'unknown', startedAt: at, lastActivity: at, activity: 'Waiting for activity', tools: Object.create(null), events: [], tokens: 0, modelMs: 0, turns: 0, skills: [], contextMode: 'unknown', kind: id === 'root' ? 'coordinator' : 'worker' };
      }
      return s.agents[id];
    };
    const root = agent('root');
    if (type === 'viewer.heartbeat') { if (s.status === 'disconnected') s.status = 'connected'; return s; }
    if (type === 'viewer.disconnect' || type === 'session.shutdown') { s.status = 'disconnected'; return s; }
    if (type === 'viewer.metadata') { if (d.name) s.name = clip(d.name); return s; }
    const requestedOwner=s.pendingRequests[d.requestId] || d.ownerAgentId;
    const origin=requestedOwner?(s.aliases[requestedOwner]||requestedOwner):event.agentId?(s.aliases[event.agentId]||event.agentId):'root';
    if (type === 'tool.execution_start' && d.toolCallId) { s.calls[d.toolCallId] = origin; if (Object.keys(s.calls).length > 1000) delete s.calls[Object.keys(s.calls)[0]]; }
    let id = origin;
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
      if (d.agentName) a.role = clip(d.agentName);
      if (d.agentDisplayName) a.name = clip(d.agentDisplayName);
      if (d.agentDescription) a.task = clip(d.agentDescription);
      if (d.model) a.model = clip(d.model);
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
    a.lastActivity = at;
    if (type === 'subagent.configured') { if (d.model) a.model = clip(d.model); a.reasoningEffort = d.reasoningEffort; }
    if (type === 'session.start' && d.selectedModel) root.model = clip(d.selectedModel);
    if (type === 'session.title_changed' && d.title) s.name = clip(d.title);
    if (type === 'assistant.turn_start') { if (id === 'root') a.startedAt = at; a.status = 'running'; a.endedAt = undefined; a.turns++; s.status = 'connected'; }
    if (type === 'assistant.intent') a.activity = clip(d.intent);
    if (type === 'assistant.message_delta') { a.output = ((a.output || '') + (d.deltaContent || '')).slice(-10000); a.activity = 'Streaming response'; }
    if (type === 'assistant.message') { a.output = clip(d.content); a.activity = 'Response received'; }
    if (type === 'assistant.usage') { if (d.model) a.model = clip(d.model); a.tokens += (d.inputTokens || 0) + (d.outputTokens || 0); a.modelMs += d.duration || 0; }
    if (type === 'session.model_change' && d.newModel) root.model = clip(d.newModel);
    if (type === 'tool.execution_start') {
      if (Object.keys(a.tools).length >= 120 && !a.tools[d.toolCallId]) {
        const old = Object.values(a.tools).find(t => t.status !== 'running');
        if (old) delete a.tools[old.id];
        else { a.droppedTools = (a.droppedTools || 0) + 1; a.activity = 'Tool visibility cap reached (120 active calls)'; return s; }
      }
      a.tools[d.toolCallId] = { id: d.toolCallId, name: clip(d.toolName || 'Tool'), startedAt: at, status: 'running', args: clip(d.arguments) };
      a.activity = 'Running ' + (d.toolName || 'tool');
      if (Object.keys(a.tools).length > 120) { const old = Object.values(a.tools).find(t => t.status !== 'running'); if (old) delete a.tools[old.id]; }
    }
    if (['tool.execution_partial_result', 'tool.execution_progress', 'tool.shell_output'].includes(type)) {
      const owner = s.agents[s.calls[d.toolCallId]] || s.agents[s.agents[s.aliases[d.toolCallId]]?.parentId] || a;
      const t = owner.tools[d.toolCallId];
      if (t) t.result = ((t.result || '') + clip(d.partialOutput || d.text || d.output || d.progressMessage || '')).slice(-10000);
    }
    if (type === 'tool.execution_complete') {
      const owner = s.agents[s.calls[d.toolCallId]] || s.agents[s.agents[s.aliases[d.toolCallId]]?.parentId] || a;
      const t = owner.tools[d.toolCallId];
      if (t) { t.endedAt = at; t.status = d.success === false ? 'failed' : 'completed'; t.result = clip(d.result ?? d.error); }
      const child=s.agents[s.aliases[d.toolCallId]];
      if(child && child.id!==owner.id && child.parentId===owner.id && d.result!==undefined)recordContext(s,{id:`result:${d.toolCallId}`,source:child.id,target:owner.id,kind:'result',label:'Returned result',payload:d.result,evidence:'runtime',scope:'Returned tool result only'},at);
      delete s.calls[d.toolCallId];
      owner.activity = 'Tool finished';
    }
    if (type === 'assistant.turn_end') { a.status = id === 'root' ? 'idle' : a.status; a.activity = 'Turn complete'; }
    if (type === 'session.idle') { root.status = 'idle'; root.endedAt = at; root.activity = 'Waiting for your next prompt'; s.status = 'idle'; }
    // Explicit orchestration metadata, never inferred from transcript text.
    if (type === 'viewer.edge' && d.source && d.target && d.source !== d.target) {
      agent(d.source); agent(d.target);
      const edgeId = `${d.source}:${d.target}:${d.kind || 'handoff'}`;
      const previousEdge=s.edges.find(e=>e.id===edgeId);if(previousEdge){previousEdge.traversals=(previousEdge.traversals||1)+1;previousEdge.lastAt=at;}
      if (!previousEdge) s.edges.push({ id: edgeId, source: d.source, target: d.target, kind: d.kind || 'handoff', traversals:1,firstAt:at,lastAt:at,label: clip(d.label || 'handoff'), inferred: false });
      s.edges = s.edges.slice(-400);
    }
    if(type==='viewer.context_handoff' && d.source && d.target){
      const source=s.aliases[d.source]||d.source,target=s.aliases[d.target]||d.target;
      if(agent(source)&&agent(target)){recordContext(s,{...d,id:d.id||event.id,source,target,evidence:'orchestrator'},at);const edgeId='context:'+source+':'+target;
        if(!s.edges.some(e=>e.id===edgeId))s.edges.push({id:edgeId,source,target,kind:'context',label:'Context handoff',inferred:false});s.edges=s.edges.slice(-400);}
    }
    observe(s,a,event,at);
    instrument(s,a,event,at);
    if (type === 'viewer.structure_change') { s.notices.unshift({ at, message: clip(d.message) }); s.notices = s.notices.slice(0, 12); }
    if (!['assistant.message_delta', 'assistant.reasoning_delta', 'assistant.reasoning'].includes(type)) {
      a.events.unshift({ at, type, text: clip((type==='skill.invoked'?d.name:null) || d.intent || d.content || d.error || d.toolName || d.agentDisplayName || d.model || d.name || d.reason || type) });
      a.events = a.events.slice(0, MAX_EVENTS);
    }
    return s;
  }
  snapshot(now = Date.now()) {
    for (const [id, s] of this.sessions) if (now - s.lastSeen > 10 * 60_000) this.sessions.delete(id);
    return [...this.sessions.values()].map(({ aliases, calls, pendingRequests, seen, ...s }) => { const status=now-s.lastSeen>35_000?'disconnected':s.status;return {...s,status,agents:Object.values(s.agents).map(a=>status==='disconnected'?{...a,connectionLost:true}:a)}; });
  }
  liveView(selectedId,now=Date.now()) {
    const all=this.snapshot(now);
    const selected=all.find(s=>s.id===selectedId) || all.find(s=>s.source==='live' && s.status!=='disconnected') || all[0];
    return {selectedSessionId:selected?.id || null,sessions:all.map(s=>{
      const summary={id:s.id,name:s.name,cwd:s.cwd,source:s.source,status:s.status,startedAt:s.startedAt,lastSeen:s.lastSeen,runningCount:s.status==='disconnected'?0:s.agents.filter(a=>a.status==='running').length,waitingCount:s.status==='disconnected'?0:s.agents.filter(a=>a.status==='waiting'||a.status==='blocked').length,nodeCount:s.agents.length,bridgeMetrics:s.bridgeMetrics};
      return s.id===selected?.id?{...s,...summary}:{...summary,agents:[],edges:[],contexts:[],timeline:[],loops:[],skillCatalog:[],agentCatalog:[],notices:[]};
    })};
  }

}
