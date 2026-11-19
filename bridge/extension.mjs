// Runs inside Copilot CLI's extension environment. The CLI supplies this import.
import {capabilities,sendPrompt,observeRuntime} from './control.mjs';
import { joinSpySession } from './sdk.mjs';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureCollector, requestCollector } from './collector.mjs';
import { createBuffer, projectEvent, metadataEvent } from './core.mjs';
const endpoint = process.env.SPY_URL || 'http://127.0.0.1:4317';
if (!['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname)) throw new Error('Spy bridge accepts loopback destinations only');
const metadataTypes=['viewer.progress','viewer.iteration','viewer.context_handoff','viewer.context_mode','viewer.agent_state','viewer.structure_change'];
const session = await joinSpySession([{
  name:'spy_observe',
  description:'Record an explicitly observed context handoff, context-isolation mode, or agent state in the local Spy viewer. Supply real agent IDs and only the payload actually passed. Never infer shared context from delegation or token usage. This records metadata only; it does not control agents.',
  parameters:{type:'object',required:['type'],properties:{objective:{type:'string'},result:{type:'string'},nextStep:{type:'string'},loopId:{type:'string'},iteration:{type:'integer',minimum:1},outcome:{type:'string',enum:['running','passed','failed','cancelled']},progressKey:{type:'string',description:'Stable failure/check fingerprint for detecting repeated outcomes'},type:{type:'string',enum:metadataTypes},agentId:{type:'string'},source:{type:'string'},target:{type:'string'},payload:{type:'string'},summary:{type:'string'},label:{type:'string'},mode:{type:'string',enum:['shared','isolated','unknown']},state:{type:'string',enum:['running','idle','waiting','blocked','completed','failed','cancelled','unknown']},reason:{type:'string'},message:{type:'string'}}},
  handler:async args=>{try{enqueue(metadataEvent(args));return 'Spy queued orchestrator-reported metadata. Runtime state and permissions are unchanged.';}catch(error){return 'Spy rejected metadata: '+error.message;}}
}]);
const sessionId = session.sessionId || `bridge-${randomUUID()}`;
const queue = createBuffer();
const bridgeId=randomUUID();let sequence=0;
let busy = false, ready = false, connecting = false, lastConnect = 0, lastError = '';
async function connect() {
  if (connecting || Date.now()-lastConnect<2000) return;
  connecting=true;lastConnect=Date.now();
  try { await ensureCollector({endpoint,autoStart:false,requiredFeatures:['skill-events','context-transfers','agent-states','diagnostics','retention','skill-authoring','prompt-control','session-history','automatic-loops','event-archive','agent-workspace','workflow-studio','run-centre','mcp-console']}); ready=true;lastError=''; } catch(error) { ready=false;if(lastError!==error.message){lastError=error.message;console.error('[Spy] '+error.message);} } finally { connecting=false; }
}
void connect();
let previousCpu=process.cpuUsage(),previousAt=performance.now(),bridgeMetrics;
function enqueue(event) {
  const projected = projectEvent(event, randomUUID);
  if (projected) queue.push({ sessionId, name: basename(process.cwd()), cwd: process.cwd(), source: 'live', bridgeId, sequence:++sequence, bridgeMetrics, event: projected });
}
const unsubscribe=session.on(event=>{enqueue(event);if(event.type==='session.shutdown')void shutdown();});
enqueue({ type: 'viewer.metadata', data: { name: basename(process.cwd()), capabilities:capabilities(session) } });
// One read-only catalog snapshot on attachment; no session-history scan or polling.
Promise.allSettled([
  Promise.resolve().then(()=>session.rpc.skills.list()).then(result=>enqueue({type:'session.skills_loaded',data:{skills:result.skills}})),
  Promise.resolve().then(()=>session.rpc.agent.list({includeBuiltInAgents:true})).then(result=>enqueue({type:'session.custom_agents_updated',data:{agents:result.agents}}))
]).catch(()=>{});
let observing=false;
async function reconcile(){if(observing)return;observing=true;try{await observeRuntime(session,enqueue);}finally{observing=false;}}
void reconcile();
const heartbeat = setInterval(() => {
  const cpu=process.cpuUsage(),now=performance.now(),elapsed=Math.max(1,now-previousAt);
  bridgeMetrics={rssMiB:Math.round(process.memoryUsage().rss/1048576*10)/10,cpuPercent:Math.round(((cpu.user-previousCpu.user)+(cpu.system-previousCpu.system))/1000/elapsed*1000)/10};
  previousCpu=cpu;previousAt=now;
  enqueue({ type:'viewer.heartbeat', data:{} });void reconcile();
},5000);
async function flush() {
  if (!ready) { void connect(); return; }
  if (busy || !queue.size) return;
  busy = true;
  const batch = queue.take();
  try {
    const response = await requestCollector(endpoint + '/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Viewer': '1' }, body: JSON.stringify(batch), timeoutMs: 1500 });
    if (response.status === 400 || response.status === 413) {
      enqueue({ type: 'viewer.structure_change', data: { message: `Collector rejected ${batch.length} events (${response.status}); graph may be incomplete. Check CLI compatibility.` } });
      return;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`Collector returned ${response.status}`);
    const dropped = queue.drainDropped();
    if (dropped) enqueue({ type: 'viewer.structure_change', data: { message: `${dropped} events dropped while collector was unavailable. Graph may be incomplete; start a fresh session for full coverage.` } });
  } catch { queue.retry(batch); ready=false; }
  finally { busy = false;if(ready&&queue.size&&!shuttingDown)setImmediate(()=>void flush()); }
}
let controlling=false;
const completedCommands=new Map();
async function control(){
  if(!ready||controlling||shuttingDown)return;controlling=true;
  const request=async(path,data)=>{const r=await requestCollector(endpoint+path,{method:'POST',headers:{'Content-Type':'application/json','X-Agent-Viewer':'1'},body:JSON.stringify({sessionId,bridgeId,...data}),timeoutMs:1500});if(r.status!==200)throw Error('Command transport failed');return JSON.parse(r.body);};
  try{
    for(const [id,result] of completedCommands){await request('/api/commands/ack',{id,...result});completedCommands.delete(id);}
    const {commands=[]}=await request('/api/commands/pull',{});
    for(const command of commands){let result;try{await sendPrompt(session,command);result={status:'sent'};}catch(e){result={status:'failed',error:e.message};}completedCommands.set(command.id,result);await request('/api/commands/ack',{id:command.id,...result});completedCommands.delete(command.id);}
  }catch{}finally{controlling=false;}
}
const controller=setInterval(control,1000);
const flusher = setInterval(flush, 180);
let shuttingDown=false;
async function shutdown(){if(shuttingDown)return;shuttingDown=true;clearInterval(controller);clearInterval(heartbeat);clearInterval(flusher);if(typeof unsubscribe==='function')unsubscribe();enqueue({type:'viewer.disconnect',data:{}});const deadline=Date.now()+1800;while(busy&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));while(ready&&queue.size&&Date.now()<deadline)await flush();queue.clear();process.exit(0);}
for(const sig of ['SIGTERM','SIGINT'])process.once(sig,()=>void shutdown());
