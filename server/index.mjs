import {VERSION,FEATURES} from './version.mjs';
import http from 'node:http';
import { spawn } from 'node:child_process';
const portFlag = process.argv.indexOf('--port');
const defaultPort = Number(process.env.PORT || (portFlag >= 0 ? process.argv[portFlag + 1] : 4317));
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMetrics } from './metrics.mjs';
import { Store } from './store.mjs';
import { startDemo } from './demo.mjs';
export async function createViewer({ port = defaultPort, production = process.argv.includes('--production'), demo = process.argv.includes('--demo') } = {}) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const store = new Store(), peers = new Set(), metrics=createMetrics(); metrics.sample();
  let dirty = false, stopDemo;
  const changed = () => { dirty = true; };
  const vite = production ? null : await (await import('vite')).createServer({ root, server: { middlewareMode: true, allowedHosts: true }, appType: 'spa' });
  const snapshot = res => { if (!res.destroyed) { if (res.writableLength > 2_000_000) return res.destroy(); res.write(`data: ${JSON.stringify(store.liveView(res.spySessionId))}\n\n`); } };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    // Loopback binding + exact host/origin checks block browser cross-origin reads and writes.
    const host = req.headers.host?.split(':')[0];
    const preview = process.env.SITES_MANAGED_LINUX_CONTAINER === '1';
    if (!preview && !['localhost', '127.0.0.1'].includes(host)) return json(403, { error: 'Localhost only' });
    if (url.pathname.startsWith('/api/')) {
      const origin = req.headers.origin;
      if (origin) { try { if (new URL(origin).host !== req.headers.host) return json(403, { error: 'Cross-origin request rejected' }); } catch { return json(403, { error: 'Invalid origin' }); } }
      if (url.pathname === '/api/stream' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.spySessionId=url.searchParams.get('session'); peers.add(res); snapshot(res); res.write(`event: metrics\ndata: ${JSON.stringify(metrics.get())}\n\n`); req.on('close', () => peers.delete(res)); return;
      }
      if (url.pathname === '/api/health') return json(200, { ok: true, service:'spy',protocol:1,version:VERSION,features:FEATURES,pid:process.pid,sessions:store.sessions.size,storage:'memory' });
      if (url.pathname === '/api/metrics' && req.method==='GET') return json(200,metrics.get());
      if (req.method !== 'POST') return json(405, { error: 'POST required' });
      if (req.headers['x-agent-viewer'] !== '1') return json(403, { error: 'Bridge header required' });
      if (url.pathname === '/api/demo/start') { if (!stopDemo) stopDemo = startDemo(store, changed); return json(200, { ok: true }); }
      if (url.pathname === '/api/demo/stop') { stopDemo?.(); stopDemo = undefined; return json(200, { ok: true }); }
      if (url.pathname !== '/api/events') return json(404, { error: 'Unknown endpoint' });
      try {
        let body = '', bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 512_000) { json(413, { error: 'Payload too large' }); return; } body += chunk; }
        const packets = JSON.parse(body), batch = Array.isArray(packets) ? packets : [packets];
        if (batch.length > 100) return json(400, { error: 'Maximum batch size is 100' });
        for (const packet of batch) store.ingest(packet);
        metrics.accepted(batch.length);
        changed(); json(200, { accepted: batch.length });
      } catch (error) { json(400, { error: error.message }); }
      return;
    }
    if (vite) return vite.middlewares(req, res);
    try {
      const path = resolve(root, 'dist', '.' + decodeURIComponent(url.pathname));
      if (!path.startsWith(resolve(root, 'dist') + '/')) throw Error('fallback');
      const data = await readFile(path);
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html' })[extname(path)] || 'application/octet-stream'); res.end(data);
    } catch { res.setHeader('Content-Type', 'text/html'); res.end(await readFile(resolve(root, 'dist/index.html'))); }
  });
  const timer = setInterval(() => { if (dirty) { dirty = false; for (const peer of peers) snapshot(peer); } }, 100);
  const resourceTimer=setInterval(()=>{const value=metrics.sample();for(const peer of peers)if(!peer.destroyed && peer.writableLength<2_000_000)peer.write(`event: metrics\ndata: ${JSON.stringify(value)}\n\n`);},1000);
  let autoTimer;
  const keepalive = setInterval(() => { for (const peer of peers) snapshot(peer); }, 10_000);
  if (demo) stopDemo = startDemo(store, changed);
  await new Promise((yes, no) => { server.once('error', no); server.listen(port, '127.0.0.1', yes); });
  const close=async () => { clearInterval(timer); clearInterval(keepalive);clearInterval(resourceTimer);clearInterval(autoTimer); stopDemo?.(); for (const peer of peers) peer.end(); await vite?.close(); await new Promise(r => server.close(r)); };
  if(process.argv.includes('--auto')) { const bootAt=Date.now();autoTimer=setInterval(()=>{const lastSeen=Math.max(bootAt,...[...store.sessions.values()].map(s=>s.lastSeen));if(!peers.size && Date.now()-lastSeen>120000)void close();},10000); }
  return {server,store,close};
}
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  const viewer = await createViewer();
  console.log(`\n  SPY\n  http://127.0.0.1:${viewer.server.address().port}\n  In-memory only. Click “Run demo” or install the bridge: npm run connect\n`);
  if (process.argv.includes('--open') && !process.argv.includes('--no-open')) {
    const url = `http://127.0.0.1:${viewer.server.address().port}`;
    const program = process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    const browser = spawn(program, args, { stdio: 'ignore', detached: true });
    browser.on('error', () => console.log(`Open ${url} in your browser.`)); browser.unref();
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await viewer.close(); process.exit(0); });
}
