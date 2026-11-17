// Volatile current-session projection. No database, log file, or browser storage.
const MAX_SESSIONS = 40, MAX_AGENTS = 160, MAX_EVENTS = 60;
const terminal = s => ['completed', 'failed'].includes(s);
const clip = value => (typeof value === 'string' ? value : JSON.stringify(value ?? '')).slice(0, 6000);
export class Store {
  sessions = new Map();
  ingest(packet, now = Date.now()) {
    if (!packet || typeof packet.sessionId !== 'string' || packet.sessionId.length > 200) throw new Error('sessionId required');
    const event = packet.event;
    if (!event || typeof event.type !== 'string' || !event.data || typeof event.data !== 'object') throw new Error('event.type and event.data required');
    let s = this.sessions.get(packet.sessionId);
    if (!s) {
      if (this.sessions.size >= MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value);
      s = { id: packet.sessionId, name: clip(packet.name || 'Copilot session'), cwd: clip(packet.cwd || ''), source: packet.source === 'demo' ? 'demo' : 'live', startedAt: now, lastSeen: now, status: 'connected', agents: Object.create(null), edges: [], aliases: Object.create(null), calls: Object.create(null), seen: new Set(), notices: [] };
      this.sessions.set(s.id, s);
    }
    s.lastSeen = now;
    if (event.id && s.seen.has(event.id)) return s;
    if (event.id) { s.seen.add(event.id); if (s.seen.size > 4000) s.seen.delete(s.seen.values().next().value); }
    const d = event.data, type = event.type;
    const parsed = Date.parse(event.timestamp);
    const at = Number.isFinite(parsed) ? Math.min(parsed, now + 2000) : now;
    const agent = (id, name) => {
      if (!s.agents[id]) {
        if (Object.keys(s.agents).length >= MAX_AGENTS) {
          const old = Object.values(s.agents).find(a => terminal(a.status) && a.id !== 'root');
          if (!old) return null;
          delete s.agents[old.id];
          s.edges = s.edges.filter(e => e.source !== old.id && e.target !== old.id);
          for (const [key, value] of Object.entries(s.aliases)) if (value === old.id) delete s.aliases[key];
        }
        s.agents[id] = { id, name: name || (id === 'root' ? 'Orchestrator' : 'Agent ' + id.slice(0, 8)), model: null, status: 'running', startedAt: at, lastActivity: at, activity: 'Waiting for activity', tools: Object.create(null), events: [], tokens: 0, modelMs: 0, turns: 0, kind: id === 'root' ? 'coordinator' : 'worker' };
      }
      return s.agents[id];
    };
    const root = agent('root');
    if (type === 'viewer.heartbeat') { if (s.status === 'disconnected') s.status = 'connected'; return s; }
    if (type === 'viewer.disconnect' || type === 'session.shutdown') { s.status = 'disconnected'; return s; }
    if (type === 'viewer.metadata') { if (d.name) s.name = clip(d.name); return s; }
    const origin = event.agentId ? (s.aliases[event.agentId] || event.agentId) : 'root';
    if (type === 'tool.execution_start' && d.toolCallId) { s.calls[d.toolCallId] = origin; if (Object.keys(s.calls).length > 1000) delete s.calls[Object.keys(s.calls)[0]]; }
    let id = origin;
    if (type.startsWith('subagent.') && d.toolCallId) {
      const caller = s.calls[d.toolCallId];
      const childInstance = d.agentId || (event.agentId && event.agentId !== caller ? event.agentId : null);
      id = s.aliases[d.toolCallId] || childInstance || d.toolCallId;
      // Correlate lifecycle IDs with their spawning tool. An envelope ID that
      // matches the known caller remains the parent; distinct IDs identify the child.
      s.aliases[d.toolCallId] = id;
      if (childInstance) s.aliases[childInstance] = id;
      const a = agent(id, d.agentDisplayName || d.agentName);
      if (!a) return s;
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
      a.tools[d.toolCallId] = { id: d.toolCallId, name: clip(d.toolName || 'Tool'), startedAt: at, status: 'running', args: clip(d.arguments) };
      a.activity = 'Running ' + (d.toolName || 'tool');
      if (Object.keys(a.tools).length > 120) { const old = Object.values(a.tools).find(t => t.status !== 'running'); if (old) delete a.tools[old.id]; }
    }
    if (['tool.execution_partial_result', 'tool.execution_progress', 'tool.shell_output'].includes(type)) {
      const owner = s.agents[s.calls[d.toolCallId]] || a;
      const t = owner.tools[d.toolCallId];
      if (t) t.result = ((t.result || '') + clip(d.partialOutput || d.text || d.output || d.progressMessage || '')).slice(-10000);
    }
    if (type === 'tool.execution_complete') {
      const owner = s.agents[s.calls[d.toolCallId]] || a;
      const t = owner.tools[d.toolCallId];
      if (t) { t.endedAt = at; t.status = d.success === false ? 'failed' : 'completed'; t.result = clip(d.result ?? d.error); }
      delete s.calls[d.toolCallId];
      owner.activity = 'Tool finished';
    }
    if (type === 'assistant.turn_end') { a.status = id === 'root' ? 'idle' : a.status; a.activity = 'Turn complete'; }
    if (type === 'session.idle') { root.status = 'idle'; root.endedAt = at; root.activity = 'Waiting for your next prompt'; s.status = 'idle'; }
    // Explicit orchestration metadata, never inferred from transcript text.
    if (type === 'viewer.edge' && d.source && d.target && d.source !== d.target) {
      agent(d.source); agent(d.target);
      const edgeId = `${d.source}:${d.target}:${d.kind || 'handoff'}`;
      if (!s.edges.some(e => e.id === edgeId)) s.edges.push({ id: edgeId, source: d.source, target: d.target, kind: d.kind || 'handoff', label: clip(d.label || 'handoff'), inferred: false });
      s.edges = s.edges.slice(-400);
    }
    if (type === 'viewer.structure_change') { s.notices.unshift({ at, message: clip(d.message) }); s.notices = s.notices.slice(0, 12); }
    if (!['assistant.message_delta', 'assistant.reasoning_delta', 'assistant.reasoning'].includes(type)) {
      a.events.unshift({ at, type, text: clip(d.intent || d.content || d.error || d.toolName || d.agentDisplayName || d.model || type) });
      a.events = a.events.slice(0, MAX_EVENTS);
    }
    return s;
  }
  snapshot(now = Date.now()) {
    for (const [id, s] of this.sessions) if (now - s.lastSeen > 10 * 60_000) this.sessions.delete(id);
    return [...this.sessions.values()].map(({ aliases, calls, seen, ...s }) => ({ ...s, status: now - s.lastSeen > 35_000 ? 'disconnected' : s.status, agents: Object.values(s.agents) }));
  }
}
