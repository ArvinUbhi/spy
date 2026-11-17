// Runs inside Copilot CLI's extension environment. The CLI supplies this import.
import { joinSession } from '@github/copilot-sdk/extension';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createBuffer, projectEvent } from './core.mjs';
const endpoint = process.env.SPY_URL || 'http://127.0.0.1:4317';
if (!['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname)) throw new Error('Spy bridge accepts loopback destinations only');
const session = await joinSession({});
const sessionId = session.sessionId || `bridge-${randomUUID()}`;
const queue = createBuffer();
let busy = false;
function enqueue(event) {
  const projected = projectEvent(event, randomUUID);
  if (projected) queue.push({ sessionId, name: basename(process.cwd()), cwd: process.cwd(), source: 'live', event: projected });
}
session.on(event => enqueue(event));
enqueue({ type: 'viewer.metadata', data: { name: basename(process.cwd()) } });
const heartbeat = setInterval(() => enqueue({ type: 'viewer.heartbeat', data: {} }), 5000);
async function flush() {
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
  } catch { queue.retry(batch); }
  finally { busy = false; }
}
const flusher = setInterval(flush, 180);
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, async () => { clearInterval(heartbeat); clearInterval(flusher); enqueue({ type: 'viewer.disconnect', data: {} }); await flush(); process.exit(0); });
