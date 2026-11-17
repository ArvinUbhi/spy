// Runs inside Copilot CLI's extension environment. The CLI supplies this import.
import { joinSession } from '@github/copilot-sdk/extension';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
const endpoint = process.env.SPY_URL || 'http://127.0.0.1:4317';
if (!['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname)) throw new Error('Spy bridge accepts loopback destinations only');
const session = await joinSession({});
const sessionId = session.sessionId || `bridge-${randomUUID()}`;
let queue = [], dropped = 0, busy = false;
const packet = event => ({ sessionId, name: basename(process.cwd()), cwd: process.cwd(), source: 'live', event });
function enqueue(event) {
  // Do not forward opaque/private reasoning. The viewer shows observed actions and outputs.
  if (/reasoning/.test(event.type)) return;
  const data = { ...(event.data || {}) };
  delete data.reasoningOpaque; delete data.reasoningText; delete data.encryptedContent;
  queue.push(packet({ id: event.id || randomUUID(), type: event.type, timestamp: event.timestamp || new Date().toISOString(), agentId: event.agentId, data }));
  if (queue.length > 300) { queue.shift(); dropped++; }
}
session.on(event => enqueue(event));
enqueue({ type: 'viewer.metadata', data: { name: basename(process.cwd()) } });
const heartbeat = setInterval(() => enqueue({ type: 'viewer.heartbeat', data: {} }), 5000);
async function flush() {
  if (busy || !queue.length) return;
  busy = true;
  const batch = queue.splice(0, 50);
  try {
    const response = await fetch(endpoint + '/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Viewer': '1' }, body: JSON.stringify(batch), signal: AbortSignal.timeout(1500) });
    if (!response.ok) throw new Error(`Collector returned ${response.status}`);
    if (dropped) { enqueue({ type: 'viewer.structure_change', data: { message: `${dropped} events dropped while collector was unavailable. Graph may be incomplete; start a fresh session for full coverage.` } }); dropped = 0; }
  } catch { queue = [...batch, ...queue].slice(-300); }
  finally { busy = false; }
}
const flusher = setInterval(flush, 180);
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, async () => { clearInterval(heartbeat); clearInterval(flusher); enqueue({ type: 'viewer.disconnect', data: {} }); await flush(); process.exit(0); });
