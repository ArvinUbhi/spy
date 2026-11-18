import {Store} from '../server/store.mjs';import {RETENTION,retainedBytes} from '../server/retention.mjs';import {mkdir,writeFile} from 'node:fs/promises';
if(!global.gc)throw Error('Run with --expose-gc');const store=new Store(),samples=[];const start=Date.now(),payload='verification evidence '.repeat(180);let events=0,peakRetained=0;
for(let round=0;round<12;round++){
 const now=start+round*300000;
 for(let s=0;s<8;s++)for(let a=0;a<12;a++){
  const emit=(type,data)=>{store.ingest({sessionId:'s'+s,event:{id:'e'+events++,agentId:'a'+a,type,data}},now);};
  emit('subagent.started',{toolCallId:`run-${round}-${a}`,agentId:'a'+a});
  for(let j=0;j<16;j++){emit('tool.execution_start',{toolCallId:'t'+j,toolName:'shell',arguments:payload});emit('tool.execution_complete',{toolCallId:'t'+j,success:true,result:payload});emit('assistant.message',{content:payload});}
  emit('viewer.context_handoff',{source:'root',target:'a'+a,payload});emit('subagent.completed',{toolCallId:`run-${round}-${a}`});
 }
 store.maintain(now,true);const retained=[...store.sessions.values()].reduce((n,s)=>n+retainedBytes(s),0);peakRetained=Math.max(peakRetained,retained);if(retained>RETENTION.totalBytes)throw Error('Total retained-state budget exceeded');
 store.maintain(now+RETENTION.disconnectedMs+1,true);if(store.sessions.size)throw Error('Expired session state retained');global.gc();samples.push(process.memoryUsage().heapUsed/1048576);
}
store.clear();global.gc();const settled=samples.slice(2),growth=Math.max(...settled)-Math.min(...settled);const result={measuredAt:new Date().toISOString(),rounds:12,events,heapMiBAfterCleanup:samples,settledHeapRangeMiB:growth,peakSerializedStateMiB:peakRetained/1048576,sessionsAfterCleanup:store.sessions.size,passed:growth<16,scope:'Synthetic churn, bounded payload retention and forced-GC cleanup; does not prove absence of every leak. RSS is not expected to drop immediately after GC.'};await mkdir('reports',{recursive:true});await writeFile('reports/memory-soak.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
