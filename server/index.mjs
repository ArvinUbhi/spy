import {Archive} from './archive.mjs';
import {Commands} from './commands.mjs';
import {restoreHistory,saveHistory} from './history.mjs';
import {homedir} from 'node:os';
import {VERSION,FEATURES} from './version.mjs';
import http from 'node:http';
import { spawn } from 'node:child_process';
const portFlag = process.argv.indexOf('--port');
const defaultPort = Number(process.env.PORT || (portFlag >= 0 ? process.argv[portFlag + 1] : 4317));
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve, extname, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMetrics } from './metrics.mjs';
import { Store } from './store.mjs';
import { startDemo } from './demo.mjs';
export async function createViewer({ port = defaultPort, production = process.argv.includes('--production'), demo = process.argv.includes('--demo'), historyPath=null } = {}) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const store = new Store(), peers = new Set(), metrics=createMetrics(); metrics.sample();
  await restoreHistory(store,historyPath);
  const archive=new Archive(historyPath?historyPath+'.archive':null);await archive.init();
  // Upgrade existing snapshots without executing or replaying their events.
  for(const s of store.sessions.values())if(!archive.sessions.has(s.id))for(const a of Object.values(s.agents)){
    const capture=async(type,data,at,suffix)=>archive.append({sessionId:s.id,name:s.name,cwd:s.cwd,source:s.source,event:{id:`snapshot:${s.id}:${a.id}:${suffix}`,type,agentId:a.id,timestamp:new Date(at||s.lastSeen).toISOString(),data:{...data,snapshotRecovered:true}}},a.id,s);
    for(const [i,e]of [...a.events].reverse().entries())await capture(e.type,{content:e.text},e.at,'event:'+i);
    for(const t of Object.values(a.tools)){await capture('tool.execution_start',{toolCallId:t.id,toolName:t.name,arguments:t.args},t.startedAt,'tool:'+t.id);if(t.endedAt)await capture('tool.execution_complete',{toolCallId:t.id,result:t.result,success:t.status!=='failed'},t.endedAt,'result:'+t.id);}
    if(a.output)await capture('assistant.message',{content:a.output},a.lastActivity,'output');
  }
  await archive.flush();
  const delegatedPrompts=new Map();
  store.onEvent=(packet,owner,session)=>{
    void archive.append(packet,owner,session).catch(()=>{});
    const e=packet.event,d=e.data,key=packet.sessionId+':'+d.toolCallId;
    if(e.type==='tool.execution_start'){let args=d.arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{}if(typeof args?.prompt==='string'){delegatedPrompts.set(key,{content:args.prompt,source:owner,truncated:!!d.truncated});if(delegatedPrompts.size>128)delegatedPrompts.delete(delegatedPrompts.keys().next().value);}}
    if(e.type==='subagent.started'&&delegatedPrompts.has(key)){const prompt=delegatedPrompts.get(key);delegatedPrompts.delete(key);void archive.append({...packet,event:{id:'delegated:'+(e.id||d.toolCallId+':'+(e.timestamp||Date.now())),type:'viewer.delegated_prompt',agentId:owner,timestamp:e.timestamp,data:{...prompt,evidence:'Runtime task-tool prompt'}}},owner,session).catch(()=>{});}
    if(e.type==='tool.execution_complete')delegatedPrompts.delete(key);
  };
  const commands=new Commands();let historyDirty=false, saving;
  const persist=()=>saving ||= saveHistory(store,historyPath).catch(e=>console.error('[Spy] History save failed: '+e.message)).finally(()=>{saving=null;});
  let dirty = false, stopDemo, closing;
  const cache=new Map();const render=sessionId=>{const key=sessionId||'';if(!cache.has(key))cache.set(key,JSON.stringify(view(sessionId)));return cache.get(key);};
  function view(sessionId){const value=store.liveView(sessionId);const live=new Set(value.sessions.map(s=>s.id));for(const summary of archive.list())if(!live.has(summary.id))value.sessions.push({...summary,status:'disconnected',agents:[],edges:[],contexts:[],notices:[]});if(sessionId&&!live.has(sessionId)){const saved=archive.view(sessionId);if(saved){value.sessions=value.sessions.map(s=>s.id===sessionId?saved:s);value.selectedSessionId=sessionId;}}value.history=archive.info();return value;}
  const changed = () => {dirty=true;historyDirty=true;cache.clear();};
  const vite = production ? null : await (await import('vite')).createServer({ root, server: { middlewareMode: true, allowedHosts: true }, appType: 'spa' });
  const snapshot = res => { if (!res.destroyed&&!res.writableEnded) { if (res.writableLength > 2_000_000) return res.destroy(); res.write(`data: ${render(res.spySessionId)}\n\n`); } };
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
        if(peers.size>=8)return json(503,{error:'Maximum eight viewer connections'});
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.spySessionId=url.searchParams.get('session'); peers.add(res); snapshot(res); res.write(`event: metrics\ndata: ${JSON.stringify(metrics.get())}\n\n`); const detach=()=>{peers.delete(res);cache.clear();};res.once('close',detach);res.once('error',()=>{detach();res.destroy();}); return;
      }
      if (url.pathname === '/api/health') return json(200, { ok: true, service:'spy',protocol:1,version:VERSION,features:FEATURES,pid:process.pid,sessions:store.sessions.size,viewers:peers.size,retainedStateBytes:store.retainedBytes||0,storage:historyPath?'local-history':'memory' });
      if (url.pathname === '/api/metrics' && req.method==='GET') return json(200,metrics.get());
      if(url.pathname==='/api/commands'&&req.method==='GET')return json(200,commands.view(url.searchParams.get('session')));
      if(url.pathname==='/api/history'&&req.method==='GET'){
        try{return json(200,await archive.page(url.searchParams.get('session'),{agentId:url.searchParams.get('agent')||undefined,category:url.searchParams.get('category')||'all',q:url.searchParams.get('q')||'',before:url.searchParams.get('before')||Infinity,limit:url.searchParams.get('limit')||50,failures:url.searchParams.get('failures')==='true'}));}catch(e){return json(500,{error:'Could not read history: '+e.message});}
      }
      if(url.pathname==='/api/history/settings'&&req.method==='GET')return json(200,archive.info());
      if(url.pathname==='/api/history/export'&&req.method==='GET'){
        const id=url.searchParams.get('session');if(!archive.sessions.has(id))return json(404,{error:'Session not found'});
        const markdown=url.searchParams.get('format')==='markdown';res.writeHead(200,{'Content-Type':markdown?'text/markdown; charset=utf-8':'application/x-ndjson','Content-Disposition':`attachment; filename="spy-transcript.${markdown?'md':'jsonl'}"`,'Cache-Control':'no-store'});if(markdown)res.write('# Spy captured transcript\n\n');
        try{for await(const line of archive.export(id,url.searchParams.get('agent')||undefined)){if(res.destroyed)break;const r=markdown?JSON.parse(line):null;const output=markdown?`## ${r.event.type} · ${r.agentId}\n\n${new Date(r.at).toISOString()}\n\n${JSON.stringify(r.event.data,null,2).split('\n').map(s=>'    '+s).join('\n')}\n\n`:line;if(!res.write(output))await new Promise(resolve=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve();};res.once('drain',done);res.once('close',done);});}res.end();}catch{res.destroy();}return;
      }
      if (req.method !== 'POST') return json(405, { error: 'POST required' });
      if (req.headers['x-agent-viewer'] !== '1') return json(403, { error: 'Bridge header required' });
      if(url.pathname==='/api/history/settings'){
        try{let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2000)return json(413,{error:'Settings too large'});}const value=await archive.configure(JSON.parse(body));changed();return json(200,value);}catch(e){return json(400,{error:e.message});}
      }
      if (url.pathname === '/api/demo/start') { if (!stopDemo) stopDemo = startDemo(store, changed); return json(200, { ok: true }); }
      if (url.pathname === '/api/demo/stop') { stopDemo?.(); stopDemo = undefined; return json(200, { ok: true }); }
      if(url.pathname.startsWith('/api/clear/')){let id;try{id=decodeURIComponent(url.pathname.slice('/api/clear/'.length));}catch{return json(400,{error:'Invalid session ID'});}const ok=store.clearDetails(id);changed();return json(ok?200:404,{ok});}
      if(['/api/prompts','/api/commands/pull','/api/commands/ack'].includes(url.pathname)){
        try{let body='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>32000)return json(413,{error:'Payload too large'});body+=chunk;}const d=JSON.parse(body);
          if(url.pathname==='/api/prompts'){const c=commands.submit(store.sessions.get(d.sessionId),d.agentId,d.prompt);store.ingest({sessionId:d.sessionId,event:{id:'prompt:'+c.id,type:'viewer.prompt_queued',agentId:d.agentId,data:{content:c.prompt,commandId:c.id,status:'queued'}}});await archive.flush();return json(202,{id:c.id,status:c.status});}
          const s=store.sessions.get(d.sessionId);if(!s||!d.bridgeId||s.coverage?.bridgeId!==d.bridgeId)return json(403,{error:'Bridge identity mismatch'});
          if(url.pathname.endsWith('/pull'))return json(200,{commands:commands.pull(d.sessionId,d.bridgeId)});
          const c=commands.acknowledge(d.id,d.bridgeId,d.status,d.error);store.ingest({sessionId:d.sessionId,event:{id:'delivery:'+c.id,type:'viewer.prompt_delivery',agentId:c.agentId,data:{commandId:c.id,status:c.status,error:c.error}}});await archive.flush();return json(200,c);
        }catch(e){return json(400,{error:e.message});}
      }
      if (url.pathname !== '/api/events') return json(404, { error: 'Unknown endpoint' });
      let archiveStage=false;
      try {
        let body = '', bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 512_000) { json(413, { error: 'Payload too large' }); return; } body += chunk; }
        const packets = JSON.parse(body), batch = Array.isArray(packets) ? packets : [packets];
        if (batch.length > 100) return json(400, { error: 'Maximum batch size is 100' });
        for (const packet of batch) store.ingest(packet);
        archiveStage=true;await archive.flush();
        metrics.accepted(batch.length);
        changed(); json(200, { accepted: batch.length });
      } catch (error) { json(archiveStage?503:400, { error: error.message }); }
      return;
    }
    if (vite) return vite.middlewares(req, res);
    // Use native path operations: Windows uses backslashes, including after dist.
    const dist = resolve(root, 'dist');
    let path;
    try {
      path = resolve(dist, '.' + decodeURIComponent(url.pathname));
      const inside = relative(dist, path);
      if (isAbsolute(inside) || inside === '..' || inside.startsWith('../') || inside.startsWith('..\\')) return json(403, { error: 'Invalid asset path' });
    } catch { return json(400, { error: 'Invalid asset URL' }); }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const data = await readFile(path);
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html' })[extname(path)] || 'application/octet-stream'); res.end(data);
    } catch {
      // Missing module/assets must never masquerade as a successful HTML response.
      if (url.pathname.startsWith('/assets/') || extname(url.pathname)) return json(404, { error: 'Asset not found. Restart Spy and reload the page.' });
      res.setHeader('Content-Type', 'text/html'); res.end(await readFile(resolve(dist, 'index.html')));
    }
  });
  await new Promise((yes, no) => { server.once('error', no); server.listen(port, '127.0.0.1', yes); }).catch(async error=>{await vite?.close();throw error;});
  const timer = setInterval(() => { if (dirty) { dirty = false;cache.clear(); for (const peer of peers) snapshot(peer); } }, 100);
  const resourceTimer=setInterval(()=>{const value=metrics.sample();for(const peer of peers)if(!peer.destroyed && peer.writableLength<2_000_000)peer.write(`event: metrics\ndata: ${JSON.stringify(value)}\n\n`);},1000);
  const archiveTimer=setInterval(()=>{void archive.flush().then(changed).catch(e=>{console.error('[Spy] Archive: '+e.message);changed();});},60000);
  const historyTimer=setInterval(()=>{if(historyDirty&&!saving){historyDirty=false;void persist();}},2000);
  let autoTimer;
  const keepalive = setInterval(() => {cache.clear(); for (const peer of peers) snapshot(peer); }, 10_000);
  if (demo) stopDemo = startDemo(store, changed);

  const cleanup=setInterval(()=>{if(store.maintain(Date.now(),true))changed();},5000);
  const close=() => closing ||= (async () => { clearInterval(archiveTimer);clearInterval(historyTimer);await archive.flush().catch(e=>console.error('[Spy] History archive: '+e.message));await saving;await persist();clearInterval(timer); clearInterval(keepalive);clearInterval(resourceTimer);clearInterval(autoTimer);clearInterval(cleanup); stopDemo?.(); for (const peer of peers) peer.end();peers.clear();cache.clear();store.clear();await vite?.close();await new Promise(r=>{server.close(r);server.closeIdleConnections();});})();
  if(process.argv.includes('--auto')) { const bootAt=Date.now();autoTimer=setInterval(()=>{const lastSeen=Math.max(bootAt,...[...store.sessions.values()].map(s=>s.lastSeen));if(!peers.size && Date.now()-lastSeen>120000)void close();},10000); }
  return {server,store,archive,close};
}
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  const viewer = await createViewer({historyPath:process.env.SPY_HISTORY_PATH||resolve(homedir(),'.copilot','spy','history.json')});
  console.log(`\n  SPY\n  http://127.0.0.1:${viewer.server.address().port}\n  Searchable event history retained for 30 days by default. Click “Run demo” or install the bridge: npm run connect\n`);
  if (process.argv.includes('--open') && !process.argv.includes('--no-open')) {
    const url = `http://127.0.0.1:${viewer.server.address().port}`;
    const program = process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    const browser = spawn(program, args, { stdio: 'ignore', detached: true });
    browser.on('error', () => console.log(`Open ${url} in your browser.`)); browser.unref();
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await viewer.close(); process.exit(0); });
}
