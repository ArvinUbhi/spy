import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import {analyse} from '../shared/analysis.mjs';
import { arrange } from '../src/graph.mjs';
import { Store } from '../server/store.mjs';
import { createViewer } from '../server/index.mjs';
const percentile = (xs,p) => [...xs].sort((a,b)=>a-b)[Math.min(xs.length-1, Math.floor(xs.length*p))] || 0;
const round = n => Math.round(n*1000)/1000;
const envelope = (s,type,data,agentId) => ({ sessionId:s, event:{type,data,agentId} });
function workload(name, sessionCount, workers, eventCount, observations=false) {
  global.gc?.(); const heapBefore=process.memoryUsage().heapUsed;
  const store=new Store();
  for(let s=0;s<sessionCount;s++) for(let a=0;a<workers;a++) store.ingest(envelope('session-'+s,'subagent.started',{toolCallId:'a-'+a,agentId:'a-'+a,agentName:'Worker '+a,model:'synthetic-model'}));
  let extraEvents=0;
  const chunks=[],start=performance.now(); let chunkStart=start;
  for(let i=0;i<eventCount;i++) {
    const task=Math.floor(i/4),s=task%sessionCount,a=Math.floor(task/sessionCount)%workers,part=i%4,id='tool-'+task;
    const type=['assistant.intent','assistant.usage','tool.execution_start','tool.execution_complete'][part];
    const data=[{intent:'Inspecting source and verification criteria'}, {model:'synthetic-model',inputTokens:120,outputTokens:30,duration:25}, {toolCallId:id,toolName:'shell',arguments:{command:'npm test'}}, {toolCallId:id,success:true,result:'All tests passed'}][part];
    store.ingest(envelope('session-'+s,type,data,'a-'+a));
    if(observations && part===0 && task%10===0){store.ingest(envelope('session-'+s,'skill.invoked',{name:'verification-loop',description:'Check acceptance criteria',content:'Validate changes and return evidence. '.repeat(50)},'a-'+a));extraEvents++;}
    if(observations && part===0 && task%20===0){store.ingest(envelope('session-'+s,'viewer.context_handoff',{id:'transfer-'+task,source:'root',target:'a-'+a,mode:'isolated',payload:'Acceptance criterion with evidence. '.repeat(30)}));extraEvents++;}
    if(i%100===99){const end=performance.now();chunks.push(end-chunkStart);chunkStart=end;}
  }
  const ingestMs=performance.now()-start, snapshotTimes=[]; let bytes=0;
  const fullSnapshotBytes=Buffer.byteLength(JSON.stringify(store.snapshot()));
  for(let i=0;i<45;i++){const t=performance.now(),json=JSON.stringify(store.liveView('session-0')); const ms=performance.now()-t;bytes=Buffer.byteLength(json); if(i>=5)snapshotTimes.push(ms);}
  const selected = store.snapshot()[0], layoutTimes=[],analysisTimes=[];
  for(let i=0;i<45;i++){const t=performance.now();arrange(selected);if(i>=5)layoutTimes.push(performance.now()-t);}
  for(let i=0;i<45;i++){const t=performance.now();analyse(selected,Date.now());if(i>=5)analysisTimes.push(performance.now()-t);}
  global.gc?.(); const heapDelta=Math.max(0,process.memoryUsage().heapUsed-heapBefore);
  const result={name,sessions:sessionCount,workersPerSession:workers,events:eventCount+extraEvents,eventsPerSecond:Math.round((eventCount+extraEvents)/ingestMs*1000),ingestMs:round(ingestMs),batch100P95Ms:round(percentile(chunks,.95)),snapshotP50Ms:round(percentile(snapshotTimes,.5)),snapshotP95Ms:round(percentile(snapshotTimes,.95)),snapshotBytes:bytes,fullSnapshotBytes,payloadReductionPercent:round((1-bytes/fullSnapshotBytes)*100),graphLayoutP95Ms:round(percentile(layoutTimes,.95)),analysisP95Ms:round(percentile(analysisTimes,.95)),retainedHeapMiB:round(heapDelta/1024/1024)};
  result.passed=result.eventsPerSecond>=2000 && result.snapshotP95Ms<250 && result.graphLayoutP95Ms<25 && result.retainedHeapMiB<256 && result.analysisP95Ms<50;
  return result;
}
async function delivery() {
  const viewer=await createViewer({port:0,production:true,demo:false});
  const base=`http://127.0.0.1:${viewer.server.address().port}`, abort=new AbortController();
  let reader,buffer=''; const decoder=new TextDecoder();
  async function frame(){while(!buffer.includes('\n\n')){const r=await reader.read();if(r.done)throw Error('SSE closed');buffer+=decoder.decode(r.value,{stream:true});}const at=buffer.indexOf('\n\n'),line=buffer.slice(0,at);buffer=buffer.slice(at+2);return line;}
  try {
    const res=await fetch(base+'/api/stream',{signal:abort.signal});reader=res.body.getReader();await frame();
    const times=[];
    for(let i=0;i<20;i++){
      const start=performance.now(),marker='benchmark-marker-'+i;
      const r=await fetch(base+'/api/events',{method:'POST',headers:{'X-Agent-Viewer':'1','Content-Type':'application/json'},body:JSON.stringify(envelope('delivery','assistant.intent',{intent:marker}))});
      if(!r.ok)throw Error('ingestion failed');
      while(!(await frame()).includes(marker)){}
      times.push(performance.now()-start);
    }
    return {samples:times.length,p50Ms:round(percentile(times,.5)),p95Ms:round(percentile(times,.95)),p99Ms:round(percentile(times,.99)),passed:percentile(times,.95)<1000};
  } finally {await reader?.cancel();abort.abort();await viewer.close();}
}
async function idleFootprint(){
  const child=spawn(process.execPath,['server/index.mjs','--production','--port','0'],{stdio:['ignore','pipe','pipe']});
  try{
    const base=await new Promise((yes,no)=>{let out='';const timer=setTimeout(()=>no(Error('Idle process startup timeout')),8000);child.on('error',no);child.stdout.on('data',chunk=>{out+=chunk;const match=out.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);yes(match[0]);}});});
    await new Promise(r=>setTimeout(r,1200));
    const samples=[];
    for(let i=0;i<5;i++){await new Promise(r=>setTimeout(r,1000));samples.push(await(await fetch(base+'/api/metrics')).json());}
    const last=samples.at(-1);
    return {rssMiB:last.rssMiB,heapMiB:last.heapMiB,cpuPercent:round(samples.reduce((n,s)=>n+s.cpuPercent,0)/samples.length),cpuSamples:samples.map(s=>s.cpuPercent),scope:'Fresh production collector, 1.2-second warmup then five one-second CPU samples, no bridges or browser. Not total Spy plus browser usage.'};
  }finally{child.kill();await new Promise(r=>child.once('exit',r));}
}
const results={measuredAt:new Date().toISOString(),environment:{node:process.version,os:process.platform,arch:process.arch,cpu:cpus()[0]?.model,logicalCpus:cpus().length},scope:'Synthetic collector and localhost HTTP-to-SSE overhead; excludes browser paint, actual Copilot delivery, model inference and workflow quality.',thresholds:{minimumEventsPerSecond:2000,maximumSnapshotP95Ms:250,maximumRetainedHeapMiB:256,maximumGraphLayoutP95Ms:25,maximumDeliveryP95Ms:1000},workloads:[workload('Single active session',1,8,20000),workload('Ten concurrent sessions',10,16,40000),workload('Forty concurrent sessions',40,12,60000),workload('Skills and context handoffs',10,16,40000,true)],delivery:await delivery(),idleCollector:await idleFootprint()};
results.passed=results.workloads.every(x=>x.passed)&&results.delivery.passed;
const table=['| Workload | Sessions / workers each | Events/s | Snapshot p95 | Graph layout p95 | Diagnostics p95 | Live payload | Retained heap | Result |','|---|---:|---:|---:|---:|---:|---:|---:|---|',...results.workloads.map(x=>`| ${x.name} | ${x.sessions} / ${x.workersPerSession} | ${x.eventsPerSecond.toLocaleString('en-GB')} | ${x.snapshotP95Ms} ms | ${x.graphLayoutP95Ms} ms | ${x.analysisP95Ms} ms | ${(x.snapshotBytes/1024/1024).toFixed(2)} MiB | ${x.retainedHeapMiB} MiB | ${x.passed?'PASS':'FAIL'} |`)];
const markdown=`# Spy benchmark results\n\nMeasured: ${results.measuredAt}\n\nEnvironment: Node ${results.environment.node}, ${results.environment.os}/${results.environment.arch}, ${results.environment.cpu}; ${results.environment.logicalCpus} reported logical CPUs.\n\n${results.scope}\n\n${table.join('\n')}\n\nLocal HTTP ingestion → SSE delivery (${results.delivery.samples} sequential samples): p50 **${results.delivery.p50Ms} ms**, p95 **${results.delivery.p95Ms} ms**, p99 **${results.delivery.p99Ms} ms**. Includes the collector's 100 ms coalescing interval.\n\nFresh idle production collector: **${results.idleCollector.rssMiB} MiB RSS**, **${results.idleCollector.heapMiB} MiB JS heap**, **${results.idleCollector.cpuPercent}% CPU** averaged over five one-second samples after warmup. Excludes bridges, browser and Copilot.\n\nThe 40-session workload sends only the selected graph plus summaries, reducing its serialized live payload by **${results.workloads[2].payloadReductionPercent}%** compared with streaming every graph.\n\nRegression gates: ≥2,000 events/s per workload; snapshot serialization p95 <250 ms; selected-session graph layout p95 <25 ms; diagnostics p95 <50 ms; retained heap growth <256 MiB per workload; localhost delivery p95 <1,000 ms. Gates are intentionally generous for heterogeneous CI runners. Results vary by hardware; synthetic events do not establish live Copilot performance or model quality. Heap growth is measured after explicit GC when available and excludes the frontend/browser. Snapshot timings measure selected-session live projection and JSON serialization; byte measurement is outside the timer.\n\nOverall: **${results.passed?'PASS':'FAIL'}**. Run \`npm run benchmark\` to reproduce. Raw results: \`reports/benchmark.json\`. CI publishes reports and a job summary.\n`;
await mkdir('reports',{recursive:true});await writeFile('reports/benchmark.json',JSON.stringify(results,null,2)+'\n');await writeFile('reports/BENCHMARKS.md',markdown);console.log(markdown);
if(!results.passed)process.exitCode=1;
