// Only act on the PID advertised by a verified loopback Spy collector.
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export function collectorEndpoint(argv = process.argv.slice(2), env = process.env) {
  const flag = argv.indexOf('--port');
  const configured = env.SPY_URL || 'http://127.0.0.1:4317';
  const port = flag >= 0 ? argv[flag + 1] : env.PORT || new URL(configured).port || '4317';
  if (!/^\d+$/.test(port || '') || Number(port) < 1 || Number(port) > 65535) throw Error('Spy port must be between 1 and 65535');
  return `http://127.0.0.1:${Number(port)}`;
}
export async function inspectCollector(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw Error('Spy requires a local HTTP collector');
  let response;
  try { response = await fetch(new URL('/api/health', url), { signal: AbortSignal.timeout(800) }); }
  catch (error) {
    // A slow/non-responsive service is not evidence that the port is free.
    if (error.cause?.code === 'ECONNREFUSED') return null;
    throw Error('Cannot identify the service on the Spy port; it was left running');
  }
  let data; try { data = await response.json(); } catch { throw Error('Spy port is occupied by another service; it was left running'); }
  if (!response.ok || data.service !== 'spy' || data.protocol !== 1 || !Number.isInteger(data.pid) || data.pid <= 1 || data.pid === process.pid) throw Error('Cannot safely identify the previous Spy collector; it was left running');
  return data;
}
export async function stopCollector({ endpoint = 'http://127.0.0.1:4317', timeoutMs = 5000 } = {}) {
  const previous = await inspectCollector(endpoint);
  if (!previous) return null;
  try { process.kill(previous.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { process.kill(previous.pid, 0); }
    catch (error) { if (error.code === 'ESRCH') return previous.pid; throw error; }
    await delay(50);
  }
  throw Error(`Spy PID ${previous.pid} did not exit. Close its terminal or stop that PID in Task Manager, then retry. No unrelated processes were stopped.`);
}
