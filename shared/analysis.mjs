const terminal=s=>['completed','failed','cancelled'].includes(s);
const endOf=(a,s,now)=>a.connectionLost||s.status==='disconnected'?Math.min(now,s.lastSeen||a.lastActivity):now;
export function stateTimes(a,s,now){const result={...(a.stateMs||{})};if(a.stateSince!==undefined){const end=Math.min(endOf(a,s,now),a.endedAt||Infinity);result[a.observedState]=(result[a.observedState]||0)+Math.max(0,end-a.stateSince);}return result;}
export function criticalPath(s,now=Date.now()){
  // Delegation is nested wall time, not sequential dependency. Context transfers
  // are data movement. Only explicit forward control handoffs establish a path.
  const agents=s.agents||[],ids=new Set(agents.map(a=>a.id)),edges=(s.edges||[]).filter(e=>!e.inferred&&['handoff','verify','review','dependency'].includes(e.kind)&&ids.has(e.source)&&ids.has(e.target));
  const incoming=new Map(agents.map(a=>[a.id,[]])),outgoing=new Map(agents.map(a=>[a.id,[]])),degree=new Map(agents.map(a=>[a.id,0]));
  for(const e of edges){incoming.get(e.target).push(e);outgoing.get(e.source).push(e);degree.set(e.target,degree.get(e.target)+1);}
  const queue=agents.filter(a=>!degree.get(a.id)).map(a=>a.id),order=[];for(let i=0;i<queue.length;i++){const id=queue[i];order.push(id);for(const e of outgoing.get(id)){degree.set(e.target,degree.get(e.target)-1);if(!degree.get(e.target))queue.push(e.target);}}
  if(order.length!==agents.length)return {nodes:[],edges:[],ms:0,reason:'Control-flow cycle: mark feedback edges or report explicit iterations.',provisional:true};
  const score=new Map(),path=new Map(),edgePath=new Map();let best=null;
  for(const id of order){const a=agents.find(a=>a.id===id),runs=a.runs||[];const own=runs.length?Math.max(0,(runs.at(-1).end||endOf(a,s,now))-runs.at(-1).start):Math.max(0,(a.endedAt||endOf(a,s,now))-a.startedAt);
    // Do not double-count overlapping agents even if a control edge was reported.
    const eligible=incoming.get(id).filter(e=>{const p=agents.find(a=>a.id===e.source);return p.endedAt!==undefined&&p.endedAt<=a.startedAt;});
    const previous=eligible.reduce((best,e)=>!best||(score.get(e.source)||0)>(score.get(best.source)||0)?e:best,null);
    score.set(id,own+(previous?score.get(previous.source):0));path.set(id,[...(previous?path.get(previous.source):[]),id]);edgePath.set(id,[...(previous?edgePath.get(previous.source):[]),...(previous?[previous.id]:[])]);
    const nested=(s.edges||[]).some(e=>e.kind==='delegation'&&e.source===id);const candidate=agents.length===1||(!nested&&id!=='root')||incoming.get(id).length||outgoing.get(id).length;if(candidate&&(best===null||score.get(id)>score.get(best)))best=id;
  }
  return {nodes:path.get(best)||[],edges:edgePath.get(best)||[],ms:score.get(best)||0,provisional:agents.some(a=>!terminal(a.status)),reason:edges.length?'Longest observed non-overlapping control path; nested delegation is excluded.':'No sequential dependencies reported; highlights the longest observed invocation.'};
}
export function parallelism(s,now=Date.now()){
  const agents=s.agents||[],workers=agents.filter(a=>a.id!=='root'),points=[];
  const intervals=(s.timeline||[]).filter(x=>x.state==='running'&&workers.some(a=>a.id===x.agentId));
  for(const a of workers)if(a.observedState==='running'&&a.stateSince!==undefined)intervals.push({start:a.stateSince,end:endOf(a,s,now)});
  for(const x of intervals)if(x.end>x.start){points.push([x.start,1],[x.end,-1]);}points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  let n=0,peak=0,busy=0,parallel=0,work=0,last=points[0]?.[0]||now;
  for(const [at,delta]of points){const span=at-last;if(n>0)busy+=span;if(n>1)parallel+=span;work+=n*span;n+=delta;peak=Math.max(peak,n);last=at;}
  return {peak,busyMs:busy,parallelMs:parallel,average:busy?work/busy:0,clipped:!!s.timelineClipped,rows:workers.map(a=>({id:a.id,name:a.name,status:a.status,times:stateTimes(a,s,now),runs:a.runs||[]}))};
}
export function loopHealth(s){
 const explicit=(s.loops||[]).map(l=>{const done=l.iterations.filter(i=>i.outcome!=='running'),tail=done.slice(-3);const repeating=tail.length===3&&tail.every(i=>i.outcome==='failed'&&i.progressKey&&i.progressKey===tail[0].progressKey);return {...l,repeating,failures:done.filter(i=>i.outcome==='failed').length,latest:l.iterations.at(-1),durations:done.map(i=>({iteration:i.iteration,ms:i.start===null?null:Math.max(0,i.at-i.start)})),evidence:'orchestrator'};});
 const feedback=(s.edges||[]).filter(e=>e.kind==='feedback').map(e=>({id:e.id,source:e.source,target:e.target,traversals:e.traversals||1,evidence:'control metadata'}));
 return {explicit,feedback};
}
export function contextDiagnostics(s){
 const items=s.contexts||[],seen=new Map(),issues=[];let bytes=0;
 for(const c of [...items].reverse()){
   if(c.payload===null){issues.push({id:c.id,kind:'missing',message:`${c.label}: payload unavailable; transfer cannot be inspected.`});continue;}
   const size=new TextEncoder().encode(c.payload).length;bytes+=size;
   if(size>=4000||c.truncated)issues.push({id:c.id,kind:'large',message:`${c.label}: ${size.toLocaleString()} recorded bytes${c.truncated?' (truncated)':''}.`});
   const key=c.source+'\0'+c.target+'\0'+c.payload;
   if(c.payload&&seen.has(key))issues.push({id:c.id,kind:'duplicate',message:`Repeated identical payload from ${c.source} to ${c.target}.`});seen.set(key,true);
   // Explicitly flagged as a content heuristic, never asserted as a requirement.
   if(c.kind==='prompt'&&!/acceptance|verify|test|criteria|expected/i.test(c.payload))issues.push({id:c.id,kind:'criteria',message:`${c.label}: no obvious verification criteria in recorded text (heuristic).`});
 }
 return {bytes,count:items.length,issues:issues.slice(0,60),clipped:items.length>=120};
}
export function usageRows(s){return (s.agents||[]).flatMap(a=>(a.usage||[]).map(r=>({...r,agentId:a.id,agent:a.name,role:a.role||a.kind,scope:a.id==='root'?'Coordinator':'Delegated'})));}
export function estimateCost(row,rate){if(!rate||row.incomplete||!row.inputReported||!row.outputReported||row.cacheRead||row.cacheWrite)return null;const input=Number(rate.input),output=Number(rate.output);return rate.input!==''&&rate.output!==''&&Number.isFinite(input)&&Number.isFinite(output)&&input>=0&&output>=0?(row.input*input+row.output*output)/1e6:null;}
export function analyse(s,now){return {critical:criticalPath(s,now),parallel:parallelism(s,now),loops:loopHealth(s),context:contextDiagnostics(s),usage:usageRows(s)};}
