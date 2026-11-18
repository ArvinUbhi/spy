// Runs inside Copilot CLI's extension environment. The CLI supplies this import.
import { joinSession } from '@github/copilot-sdk/extension';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureCollector } from './collector.mjs';
import { createBuffer, projectEvent, metadataEvent } from './core.mjs';
const endpoint = process.env.SPY_URL || 'http://127.0.0.1:4317';
if (!['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname)) throw new Error('Spy bridge accepts loopback destinations only');
const metadataTypes=['viewer.iteration','viewer.context_handoff','viewer.context_mode','viewer.agent_state','viewer.structure_change'];
const session = await joinSession({tools:[{
  name:'spy_observe',
  description:'Record an explicitly observed context handoff, context-isolation mode, or agent state in the local Spy viewer. Supply real agent IDs and only the payload actually passed. Never infer shared context from delegation or token usage. This records metadata only; it does not control agents.',
  parameters:{type:'object',required:['type'],properties:{loopId:{type:'string'},iteration:{type:'integer',minimum:1},outcome:{type:'string',enum:['running','passed','failed','cancelled']},progressKey:{type:'string',description:'Stable failure/check fingerprint for detecting repeated outcomes'},type:{type:'string',enum:metadataTypes},agentId:{type:'string'},source:{type:'string'},target:{type:'string'},payload:{type:'string'},summary:{type:'string'},label:{type:'string'},mode:{type:'string',enum:['shared','isolated','unknown']},state:{type:'string',enum:['running','idle','waiting','blocked','completed','failed','cancelled','unknown']},reason:{type:'string'},message:{type:'string'}}},
  handler:async args=>{try{enqueue(metadataEvent(args));return 'Spy queued orchestrator-reported metadata. Runtime state and permissions are unchanged.';}catch(error){return 'Spy rejected metadata: '+error.message;}}
}]});
const sessionId = session.sessionId || `bridge-${randomUUID()}`;
const queue = createBuffer();
const bridgeId=randomUUID();let sequence=0;
let busy = false, ready = false, connecting = false, lastConnect = 0;
async function connect() {
  if (connecting || Date.now()-lastConnect<2000) return;
  connecting=true;lastConnect=Date.now();
  try { await ensureCollector({endpoint,requiredFeatures:['skill-events','context-transfers','agent-states','diagnostics','retention','skill-authoring']}); ready=true; } catch(error) { ready=false;console.error('[Spy] '+error.message); } finally { connecting=false; }
}
void connect();
let previousCpu=process.cpuUsage(),previousAt=performance.now(),bridgeMetrics;
function enqueue(event) {
  const projected = projectEvent(event, randomUUID);
  if (projected) queue.push({ sessionId, name: basename(process.cwd()), cwd: process.cwd(), source: 'live', bridgeId, sequence:++sequence, bridgeMetrics, event: projected });
}
session.on(event => enqueue(event));
enqueue({ type: 'viewer.metadata', data: { name: basename(process.cwd()) } });
// One read-only catalog snapshot on attachment; no session-history scan or polling.
Promise.allSettled([
  Promise.resolve().then(()=>session.rpc.skills.list()).then(result=>enqueue({type:'session.skills_loaded',data:{skills:result.skills}})),
  Promise.resolve().then(()=>session.rpc.agent.list({includeBuiltInAgents:true})).then(result=>enqueue({type:'session.custom_agents_updated',data:{agents:result.agents}}))
]).catch(()=>{});
const heartbeat = setInterval(() => {
  const cpu=process.cpuUsage(),now=performance.now(),elapsed=Math.max(1,now-previousAt);
  bridgeMetrics={rssMiB:Math.round(process.memoryUsage().rss/1048576*10)/10,cpuPercent:Math.round(((cpu.user-previousCpu.user)+(cpu.system-previousCpu.system))/1000/elapsed*1000)/10};
  previousCpu=cpu;previousAt=now;
  enqueue({ type:'viewer.heartbeat', data:{} });
},5000);
async function flush() {
  if (!ready) { void connect(); return; }
  if (busy || !queue.size) return;
  busy = true;
  const batch = queue.take();
  try {
    const response = await fetch(endpoint + '/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Viewer': '1' }, body: JSON.stringify(batch), signal: AbortSignal.timeout(1500) });
    if (response.status === 400 || response.status === 413) {
      enqueue({ type: 'viewer.structure_change', data: { message: `Collector rejected ${batch.length} events (${response.status}); graph may be incomplete. Check CLI compatibility.` } });
      return;
    }
    if (!response.ok) throw new Error(`Collector returned ${response.status}`);
    const dropped = queue.drainDropped();
    if (dropped) enqueue({ type: 'viewer.structure_change', data: { message: `${dropped} events dropped while collector was unavailable. Graph may be incomplete; start a fresh session for full coverage.` } });
  } catch { queue.retry(batch); ready=false; }
  finally { busy = false; }
}
const flusher = setInterval(flush, 180);
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, async () => { clearInterval(heartbeat); clearInterval(flusher); enqueue({ type: 'viewer.disconnect', data: {} }); await flush(); process.exit(0); });
