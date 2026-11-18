export function arrange(session) {
  const agents = session.agents;
  const levels = Object.fromEntries(agents.map(a => [a.id, a.id === 'root' ? 0 : 1]));
  const handoffTargets = new Set(session.edges.filter(e => e.kind !== 'delegation' && e.kind !== 'feedback' && e.kind !== 'context').map(e => e.target));
  const edges = session.edges.filter(e => e.kind !== 'feedback' && e.kind !== 'context' && !(e.kind === 'delegation' && handoffTargets.has(e.target)));
  // Feedback is excluded from layout constraints. Cyclic unknown inputs are bounded.
  for (let i = 0; i < Math.min(agents.length, 7); i++) for (const e of edges) if (e.target !== 'root') levels[e.target] = Math.min(6, Math.max(levels[e.target] || 1, (levels[e.source] || 0) + 1));
  const groups = {};
  for (const a of agents) (groups[levels[a.id]] ||= []).push(a.id);
  const positions = {};
  for (const [level, ids] of Object.entries(groups)) ids.forEach((id, i) => { positions[id] = { x: 440 + (i - (ids.length - 1) / 2) * 320, y: 30 + Number(level) * 275 }; });
  return positions;
}
