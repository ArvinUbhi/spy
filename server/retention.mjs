// Budgets cover serialized retained state, not V8/process RSS. Cleanup runs even
// without browsers; short ingestion bursts are also bounded by per-field caps.
export const RETENTION=Object.freeze({sessionBytes:2*1024*1024,totalBytes:16*1024*1024,unusedDetailsMs:60000,idleDetailsMs:120000,disconnectedMs:120000,toolCount:24,eventCount:24,aliases:320,dedupe:512});
export const retainedBytes=s=>Buffer.byteLength(JSON.stringify(s,(_k,v)=>v instanceof Set?[...v]:v));
export function trimDetails(s,now,reason){
 const stale=reason==='Disconnected session';if(stale)s.pendingRequests=Object.create(null);
 for(const a of Object.values(s.agents)){
  if(stale&&!['completed','failed','cancelled'].includes(a.status)){const end=Math.max(a.stateSince||s.lastSeen,s.lastSeen);if(a.stateSince!==undefined){const span=Math.max(0,end-a.stateSince);a.stateMs||=Object.create(null);a.stateMs[a.observedState]=(a.stateMs[a.observedState]||0)+span;s.timeline||=[];s.timeline.push({agentId:a.id,state:a.observedState,start:a.stateSince,end});}a.status='unknown';a.endedAt=s.lastSeen;a.observedState='unknown';a.stateSince=end;a.waits=Object.create(null);for(const t of Object.values(a.tools))if(t.status==='running')t.status='unknown';}
  delete a.output;a.events=[];a.tools=Object.assign(Object.create(null),Object.fromEntries(Object.entries(a.tools).filter(([,t])=>t.status==='running').map(([id,t])=>[id,{id:t.id,name:t.name,startedAt:t.startedAt,status:t.status}])));
  a.skills=(a.skills||[]).map(({name,count,lastInvokedAt,evidence})=>({name,count,lastInvokedAt,evidence}));
  a.runs=a.runs?.slice(-8);a.task=a.task?.slice(0,1000);a.activity=a.activity?.slice(0,500);a.detailsClearedAt=now;
 }
 s.contexts=[];s.timeline=s.timeline?.slice(-160);s.timelineClipped=true;
 s.loops=(s.loops||[]).slice(-8).map(l=>({...l,iterations:l.iterations.slice(-6),clipped:true}));
 s.skillCatalog=(s.skillCatalog||[]).map(({name,enabled,source})=>({name,enabled,source}));
 s.agentCatalog=(s.agentCatalog||[]).map(({id,name,displayName,model,source})=>({id,name,displayName,model,source}));
 s.seen=new Set([...s.seen].slice(-128));
 s.retention={at:now,reason,clears:(s.retention?.clears||0)+1};s.lastTrimAt=now;
}
export function compactMaps(s){
 const trim=(map,max)=>{const keys=Object.keys(map);for(let i=0;i<keys.length-max;i++)delete map[keys[i]];};
 trim(s.aliases,RETENTION.aliases);trim(s.calls,320);
 for(const [key,id]of Object.entries(s.aliases))if(!s.agents[id])delete s.aliases[key];
 for(const [key,id]of Object.entries(s.pendingRequests))if(!s.agents[id])delete s.pendingRequests[key];
}
export function budgetSession(s,now){let bytes=retainedBytes(s);if(bytes>RETENTION.sessionBytes){trimDetails(s,now,'Session data budget');s.detailDirty=false;bytes=retainedBytes(s);}return bytes;}
export function maintain(store,now=Date.now()){
 let changed=false,total=0;const sizes=[];
 for(const [id,s] of store.sessions){
  if(now-s.lastSeen>=RETENTION.disconnectedMs){store.sessions.delete(id);changed=true;continue;}
  const idle=(s.status==='idle'||Object.values(s.agents).every(a=>!['running','waiting','blocked'].includes(a.status)&&Object.values(a.tools).every(t=>t.status!=='running')))&&now-(s.lastWorkAt||s.startedAt)>=RETENTION.idleDetailsMs;
  const unused=now-(s.lastInspectedAt||s.startedAt)>=RETENTION.unusedDetailsMs;
  const stale=s.status==='disconnected'||now-s.lastSeen>35000;
  if((idle||unused||stale)&&s.detailDirty){trimDetails(s,now,stale?'Disconnected session':idle?'Idle session':'Session not being inspected');s.detailDirty=false;changed=true;}
  compactMaps(s);let bytes=retainedBytes(s);
  if(bytes>RETENTION.sessionBytes){trimDetails(s,now,'Session data budget');s.detailDirty=false;bytes=retainedBytes(s);changed=true;}
  s.accountedBytes=bytes;total+=bytes;sizes.push({s,bytes});
 }
 // Reclaim uninspected/oldest detail first; never silently replace active nodes.
 sizes.sort((a,b)=>(a.s.lastInspectedAt||0)-(b.s.lastInspectedAt||0));
 for(const item of sizes){if(total<=RETENTION.totalBytes)break;trimDetails(item.s,now,'Total data budget');item.s.detailDirty=false;const next=retainedBytes(item.s);item.s.accountedBytes=next;total+=next-item.bytes;changed=true;}
 store.retainedBytes=total;return changed;
}
