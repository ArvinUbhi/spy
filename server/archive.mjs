import {mkdir,readFile,writeFile,appendFile,rename,readdir,stat,unlink,truncate} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const MiB=1048576;
export const ARCHIVE_DEFAULTS=Object.freeze({days:30,totalMiB:512,sessionMiB:128});
const ignored=new Set(['viewer.heartbeat','viewer.task_state','viewer.metadata']);
const hash=id=>createHash('sha256').update(id).digest('hex').slice(0,32);
const kind=t=>t==='viewer.delegated_prompt'||t==='user.message'||t==='assistant.message'||t==='assistant.message_delta'||t.startsWith('viewer.prompt_')?'messages':t.startsWith('tool.')?'tools':/permission|user_input|elicitation/.test(t)?'requests':t.startsWith('subagent.')?'agents':'activity';
export function archiveOwner(store,packet){const s=store.sessions.get(packet.sessionId),e=packet.event,d=e.data||{};const resolve=id=>s?.aliases[id]||id;if(s?.pendingRequests[d.requestId])return s.pendingRequests[d.requestId];if(typeof e.type!=='string')return 'root';return e.type.startsWith('subagent.')?resolve(d.toolCallId)||resolve(d.agentId||e.agentId)||'root':e.type.startsWith('tool.')?(s?.calls[d.toolCallId]||resolve(e.agentId||d.agentId)||'root'):resolve(d.ownerAgentId||e.agentId||d.agentId||d.parentToolCallId)||'root';}
export class Archive {
 constructor(root=null,{segmentBytes=MiB,segmentEvents=250}={}){this.root=root;this.segmentBytes=segmentBytes;this.segmentEvents=segmentEvents;this.sessions=new Map();this.settings={...ARCHIVE_DEFAULTS};this.pending=Promise.resolve();this.failedWrites=new Set();this.error=null;this.dirty=false;this.recovered=0;this.readers=0;}
 async init(){
  if(!this.root)return;await mkdir(this.root,{recursive:true,mode:0o700});let known=new Map();
  try{const index=JSON.parse(await readFile(join(this.root,'index.json'),'utf8'));this.settings=this.validateSettings(index.settings);known=new Map((index.sessions||[]).map(s=>[s.id,s]));}catch(e){if(e.code!=='ENOENT')this.recovered++;}
  const files=(await readdir(this.root)).filter(n=>/^[a-f0-9]{32}-\d+\.jsonl$/.test(n));
  const indexed=new Map([...known.values()].flatMap(s=>(s.segments||[]).map(segment=>[segment.file,{session:s,segment}])));
  const last=new Map();for(const file of files){const key=file.split('-')[0],n=Number(file.split('-')[1].split('.')[0]);if(!last.has(key)||n>last.get(key).n)last.set(key,{file,n});}
  for(const file of files.sort((a,b)=>Number(a.split('-')[1].split('.')[0])-Number(b.split('-')[1].split('.')[0]))){
   const info=await stat(join(this.root,file)),entry=indexed.get(file);
   if(entry&&entry.segment.bytes===info.size&&last.get(file.split('-')[0]).file!==file){let s=this.sessions.get(entry.session.id);if(!s){s={...entry.session,segments:[],seen:new Set()};this.sessions.set(s.id,s);}s.segments.push(entry.segment);continue;}
   const buffer=await readFile(join(this.root,file));const end=buffer.lastIndexOf(10)+1;if(end<buffer.length){await truncate(join(this.root,file),end);this.recovered++;}
   const records=buffer.subarray(0,end).toString('utf8').split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{this.recovered++;return [];}});if(!records.length){await unlink(join(this.root,file));continue;}
   let s=this.sessions.get(records[0].sessionId);if(!s){const prior=known.get(records[0].sessionId);s=prior?{...prior,segments:[],seen:new Set()}:this.newSession(records[0]);this.sessions.set(s.id,s);}
   const seg={file,start:records[0].cursor,end:records.at(-1).cursor,bytes:end,count:records.length,agents:[...new Set(records.map(r=>r.agentId))],at:records.at(-1).at};s.segments.push(seg);s.name=records.at(-1).sessionName||s.name;s.cwd=records.at(-1).cwd||s.cwd;s.next=Math.max(s.next||1,seg.end+1);s.lastSeen=Math.max(s.lastSeen||0,seg.at);
   // Rebuild agent metadata only if the manifest was unavailable. Known counters
   // remain authoritative; journal pages are authoritative for the transcript.
   for(const r of records)if(!known.has(s.id)||r.cursor>=(known.get(s.id).next||1))this.summarize(s,r);
   for(const r of records)if(r.event.id)s.seen.add(r.event.id);
  }
  for(const s of this.sessions.values()){s.seen||=new Set();s.segments.sort((a,b)=>a.start-b.start);s.next=Math.max(s.next||1,...s.segments.map(x=>x.end+1));}
  await this.prune();await this.persist();
 }
 newSession(r){return {id:r.sessionId,name:r.sessionName||'Copilot session',cwd:r.cwd||'',source:r.source||'live',startedAt:r.at,lastSeen:r.at,next:1,agents:Object.create(null),segments:[],pruned:0,seen:new Set()};}
 validateSettings(value={}){const result={...ARCHIVE_DEFAULTS,...value};for(const [key,min,max]of [['days',1,365],['totalMiB',64,4096],['sessionMiB',16,1024]])if(!Number.isInteger(result[key])||result[key]<min||result[key]>max)throw Error(`${key} must be an integer from ${min} to ${max}`);if(result.sessionMiB>result.totalMiB)throw Error('Session budget cannot exceed the total budget');return result;}
 run(fn){const task=this.pending.then(fn);this.pending=task.catch(e=>{this.error=e.message;});return task;}
 append(packet,owner,session){
  if(ignored.has(packet.event.type)||/reasoning/.test(packet.event.type))return Promise.resolve();
  const key=packet.event.id||hash(JSON.stringify(packet.event));
  return this.run(async()=>{
   let s=this.sessions.get(packet.sessionId);const event=packet.event;
   if(s?.seen.has(event.id))return;
   const parsed=Date.parse(event.timestamp);const at=Math.min(Date.now(),Number.isFinite(parsed)?parsed:Date.now()),record={cursor:s?.next||1,at,sessionId:packet.sessionId,sessionName:session?.name||packet.name||'Copilot session',cwd:packet.cwd||session?.cwd||'',source:packet.source||session?.source||'live',agentId:owner||'root',event};
   if(!s){s=this.newSession(record);this.sessions.set(s.id,s);}
   record.cursor=s.next;const line=JSON.stringify(record)+'\n',bytes=Buffer.byteLength(line);if(bytes>512000)throw Error('Archive event exceeds 512 KB');
   let seg=s.segments.at(-1);if(!seg||seg.bytes+bytes>this.segmentBytes||seg.count>=this.segmentEvents){seg={file:hash(s.id)+'-'+s.next+'.jsonl',start:s.next,end:s.next,bytes:0,count:0,agents:[],at};s.segments.push(seg);}
   if(this.root&&record.source!=='demo')await appendFile(join(this.root,seg.file),line,{mode:0o600});else{seg.records||=[];seg.records.push(record);}
   seg.bytes+=bytes;seg.count++;seg.end=record.cursor;seg.at=at;if(!seg.agents.includes(record.agentId))seg.agents.push(record.agentId);
   s.next++;s.lastSeen=Math.max(s.lastSeen,at);s.name=record.sessionName;s.cwd=record.cwd;this.summarize(s,record,session);if(event.id){s.seen.add(event.id);if(s.seen.size>8192)s.seen.delete(s.seen.values().next().value);}
   this.dirty=true;this.error=null;
  }).then(value=>{this.failedWrites.delete(key);return value;},error=>{this.failedWrites.add(key);throw error;});
 }
 summarize(s,r,session){s.agents||=Object.create(null);const current=session?.agents?.[r.agentId],d=r.event.data||{},type=r.event.type;
  if(Object.getPrototypeOf(s.agents)!==null)s.agents=Object.assign(Object.create(null),s.agents);if(!Object.hasOwn(s.agents,r.agentId))s.agents[r.agentId]={id:r.agentId,name:current?.name||d.agentDisplayName||d.agentName||(r.agentId==='root'?'Orchestrator':r.agentId),startedAt:r.at,lastActivity:r.at,status:'unknown',tools:{},events:[],skills:[],turns:0,tokens:0};
  const a=s.agents[r.agentId];if(d.agentDisplayName)a.name=d.agentDisplayName;if(d.model)a.model=d.model;if(type==='subagent.completed')a.status='completed';if(type==='subagent.failed')a.status='failed';if(current)for(const key of ['name','model','parentId','status','runtimeTaskId','toolCalls','toolFailures','turns','tokens','task'])if(current[key]!==undefined)a[key]=current[key];a.lastActivity=r.at;a.messageCount=(a.messageCount||0)+Number(kind(type)==='messages');a.requestCount=(a.requestCount||0)+Number(/\.requested$/.test(type));a.eventTotal=(a.eventTotal||0)+1;
 }
 async persist(){if(!this.root)return;const sessions=[...this.sessions.values()].filter(s=>s.source!=='demo').map(({seen,...s})=>s);const data=JSON.stringify({version:1,settings:this.settings,sessions});await writeFile(join(this.root,'index.json.tmp'),data,{mode:0o600});await rename(join(this.root,'index.json.tmp'),join(this.root,'index.json'));this.dirty=false;}
 async prune(now=Date.now()){
  if(this.readers)return;
  const cutoff=now-this.settings.days*86400000;let total=0;const all=[];
  const remove=async(s,seg)=>{if(this.root&&!seg.records)await unlink(join(this.root,seg.file)).catch(e=>{if(e.code!=='ENOENT')throw e;});s.segments=s.segments.filter(x=>x!==seg);s.pruned=(s.pruned||0)+seg.count;this.dirty=true;};
  for(const s of this.sessions.values()){
   let bytes=s.segments.reduce((n,x)=>n+x.bytes,0);const sessionBudget=s.source==='demo'?2*MiB:this.settings.sessionMiB*MiB;
   for(const seg of [...s.segments])if(seg.at<cutoff||bytes>sessionBudget){await remove(s,seg);bytes-=seg.bytes;}
   total+=bytes;for(const seg of s.segments)all.push({s,seg});
  }
  all.sort((a,b)=>a.seg.at-b.seg.at);for(const {s,seg}of all){if(total<=this.settings.totalMiB*MiB)break;await remove(s,seg);total-=seg.bytes;}
  for(const [id,s]of this.sessions)if(!s.segments.length&&s.lastSeen<cutoff)this.sessions.delete(id);
 }
 async flush(){await this.pending;if(this.failedWrites.size)throw Error(this.error||'Events could not be archived');await this.run(async()=>{await this.prune();await this.persist();this.error=null;});}
 async configure(settings){const next=this.validateSettings(settings);await this.run(async()=>{this.settings=next;await this.prune();await this.persist();});return this.info();}
 info(){const sessions=[...this.sessions.values()];return {settings:this.settings,bytes:sessions.reduce((n,s)=>n+s.segments.reduce((n,x)=>n+x.bytes,0),0),events:sessions.reduce((n,s)=>n+s.segments.reduce((n,x)=>n+x.count,0),0),sessions:sessions.length,pruned:sessions.reduce((n,s)=>n+(s.pruned||0),0),error:this.error,recovered:this.recovered,persistent:!!this.root};}
 list(){return [...this.sessions.values()].filter(s=>s.source!=='demo').map(s=>({id:s.id,name:s.name,cwd:s.cwd,source:s.source,startedAt:s.startedAt,lastSeen:s.lastSeen,nodeCount:Object.keys(s.agents).length,eventCount:s.segments.reduce((n,x)=>n+x.count,0),pruned:s.pruned,archived:true})).sort((a,b)=>b.lastSeen-a.lastSeen);}
 view(id){const s=this.sessions.get(id);if(!s)return null;return {...this.list().find(x=>x.id===id),id:s.id,name:s.name,cwd:s.cwd,status:'disconnected',source:s.source,agents:Object.values(s.agents).slice(0,160).map(a=>({...a,connectionLost:true})),edges:Object.values(s.agents).filter(a=>a.parentId&&s.agents[a.parentId]).map(a=>({id:'archive:'+a.id,source:a.parentId,target:a.id,kind:'delegation',label:'delegated',inferred:false})),contexts:[],notices:[],loops:[],timeline:[],skillCatalog:[],agentCatalog:[],runningCount:0,archived:true};}
 page(id,options={}){return this.run(()=>this.readPage(id,options));}
 async readPage(id,{agentId,category='all',q='',before=Infinity,limit=50,failures=false}={}){
  const s=this.sessions.get(id);if(!s)return {items:[],next:null,total:0,pruned:0};limit=Math.min(100,Math.max(1,Number(limit)||50));before=Number(before)||Infinity;q=String(q).toLowerCase().slice(0,200);const items=[];let scanned=0,next=null;
  for(const seg of [...s.segments].reverse()){
   if(seg.start>=before||agentId&&!seg.agents.includes(agentId))continue;
   const records=seg.records||(await readFile(join(this.root,seg.file),'utf8')).trimEnd().split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
   for(const r of [...records].reverse()){
    if(r.cursor>=before)continue;scanned++;next=r.cursor;
    const d=r.event.data||{};if(agentId&&r.agentId!==agentId)continue;if(category!=='all'&&kind(r.event.type)!==category)continue;if(failures&&d.success!==false&&!/failed|error/.test(r.event.type)&&d.status!=='failed')continue;if(q&&!JSON.stringify(r.event).toLowerCase().includes(q))continue;
    items.push(r);if(items.length>=limit)return {items,next:r.cursor,total:s.next-1,pruned:s.pruned||0};
   }
   // Bound searches to 20 segments per page even with no matches.
   if(scanned>=5000)return {items,next,total:s.next-1,pruned:s.pruned||0};
  }
  return {items,next:null,total:s.next-1,pruned:s.pruned||0};
 }
 async *export(id,agentId){await this.pending;const s=this.sessions.get(id);if(!s)return;this.readers++;const end=s.next;try{for(const seg of [...s.segments]){const records=seg.records||(await readFile(join(this.root,seg.file),'utf8')).trimEnd().split('\n').filter(Boolean).flatMap(x=>{try{return [JSON.parse(x)];}catch{return [];}});for(const r of records)if(r.cursor<end&&(!agentId||r.agentId===agentId))yield JSON.stringify(r)+'\n';}}finally{this.readers--;}}
}
