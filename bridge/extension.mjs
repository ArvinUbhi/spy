// Runs inside Copilot CLI's extension environment. The CLI supplies this import.
import { joinSession } from '@github/copilot-sdk/extension';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureCollector } from './collector.mjs';
import { createBuffer, projectEvent } from './core.mjs';
const endpoint = process.env.SPY_URL || 'http://127.0.0.1:4317';
if (!['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname)) throw new Error('Spy bridge accepts loopback destinations only');
const session = await joinSession({});
const sessionId = session.sessionId || `bridge-${randomUUID()}`;
const queue = createBuffer();
let busy = false, ready = false, connecting = false, lastConnect = 0;
async function connect() {
  if (connecting || Date.now()-lastConnect<2000) return;
  connecting=true;lastConnect=Date.now();
  try { await ensureCollector({endpoint}); ready=true; } catch(error) { ready=false;console.error('[Spy] '+error.message); } finally { connecting=false; }
}
void connect();
let previousCpu=process.cpuUsage(),previousAt=performance.now(),bridgeMetrics;
function enqueue(event) {
  const projected = projectEvent(event, randomUUID);
  if (projected) queue.push({ sessionId, name: basename(process.cwd()), cwd: process.cwd(), source: 'live', bridgeMetrics, event: projected });
}
session.on(event => enqueue(event));
enqueue({ type: 'viewer.metadata', data: { name: basename(process.cwd()) } });
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
