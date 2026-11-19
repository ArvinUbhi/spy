import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/store.mjs';
import {createViewer} from '../server/index.mjs';
import {loopHealth} from '../shared/analysis.mjs';
import {sendPrompt,observeRuntime} from '../bridge/control.mjs';
import {projectEvent} from '../bridge/core.mjs';
const packet=(type,data={},agentId)=>({sessionId:'s',bridgeId:'b',sequence:1,event:{type,data,agentId}});
test('automatic loop checks detect exact retries and multi-tool cycles without metadata',()=>{
 const st=new Store();const base=Date.now();
 for(let i=0;i<6;i++){st.ingest(packet('tool.execution_start',{toolCallId:'t'+i,toolName:i%2?'edit':'test',arguments:{path:'a',command:i%2?'fix':'npm test'}}),base+i*2);st.ingest(packet('tool.execution_complete',{toolCallId:'t'+i,success:i%2===1}),base+i*2+1);}
 let s=st.snapshot(base+20)[0],loops=loopHealth(s);assert.equal(loops.suspected.length,1);assert.equal(loops.suspected[0].pattern,'test → edit');assert.equal(loops.suspected[0].failures,3);assert.equal(s.agents[0].toolCalls,6);assert.equal(s.agents[0].toolFailures,3);
 st.ingest(packet('tool.execution_start',{toolCallId:'unique',toolName:'test',arguments:{command:'different'}}),base+21);assert.equal(loopHealth(st.snapshot(base+22)[0]).suspected.length,0);
});
test('lifecycle completion by envelope and registry IDs reconcile one agent without phantom workers',()=>{
 const st=new Store(),now=Date.now();
 st.ingest(packet('tool.execution_start',{toolCallId:'call',toolName:'task'}),now);
 st.ingest(packet('subagent.started',{toolCallId:'call',agentId:'worker',executionMode:'background'}),now+1);
 st.ingest(packet('viewer.task_state',{toolCallId:'call',agentId:'task',runtimeTaskId:'task',state:'idle'}),now+2);
 assert.equal(st.sessions.get('s').agents.worker.runtimeTaskId,'task');assert.equal(st.sessions.get('s').agents.task,undefined);
 st.ingest(packet('subagent.completed',{},'worker'),now+3);assert.equal(st.sessions.get('s').agents.worker.status,'completed');
});
test('sync tool return closes missing lifecycle while background tasks remain independently active',()=>{
 const st=new Store(),now=Date.now();
 for(const [id,mode]of [['sync','sync'],['bg','background']]){st.ingest(packet('tool.execution_start',{toolCallId:id,toolName:'task'}),now);st.ingest(packet('subagent.started',{toolCallId:id,agentId:id+'-child',executionMode:mode}),now+1);st.ingest(packet('tool.execution_complete',{toolCallId:id,success:true}),now+2);}
 assert.equal(st.sessions.get('s').agents['sync-child'].status,'completed');assert.equal(st.sessions.get('s').agents['bg-child'].status,'running');
 st.ingest(packet('viewer.heartbeat'),now+130000);const a=st.snapshot(now+130001)[0].agents.find(a=>a.id==='bg-child');assert.equal(a.status,'unknown');assert.equal(a.stale,true);
});
test('runtime metadata and targeted messaging use separate SDK methods and reject refused delivery',async()=>{
 const received=[],events=[];const session={send:async p=>received.push(p),rpc:{metadata:{snapshot:async()=>({initialName:'My task'})},tasks:{list:async()=>({tasks:[{type:'agent',id:'t',toolCallId:'call',status:'completed',displayName:'Verifier'}]}),sendMessage:async p=>{received.push(p);return {sent:true};}}}};
 await sendPrompt(session,{agentId:'root',prompt:'Continue'});await sendPrompt(session,{agentId:'worker',runtimeTaskId:'t',prompt:'Check edge cases'});assert.deepEqual(received,[{prompt:'Continue',mode:'immediate'},{id:'t',message:'Check edge cases'}]);
 await observeRuntime(session,e=>events.push(projectEvent(e,()=>Math.random().toString())));assert.equal(events.find(e=>e.type==='viewer.metadata').data.title,'My task');assert.equal(events.find(e=>e.type==='viewer.task_state').data.runtimeTaskId,'t');
 session.rpc.tasks.sendMessage=async()=>({sent:false,error:'Agent finished'});await assert.rejects(sendPrompt(session,{agentId:'worker',runtimeTaskId:'t',prompt:'x'}),/Agent finished/);await assert.rejects(sendPrompt({}, {agentId:'root',prompt:'x'}),/does not expose/);
});
test('history survives server restart with names, details, counters and offline states',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'spy-history-'));const path=join(dir,'history.json');let viewer;
 try{viewer=await createViewer({port:0,production:true,historyPath:path});viewer.store.ingest(packet('session.title_changed',{title:'Investigate loops'}));viewer.store.ingest(packet('assistant.message',{content:'Retain me'}));await viewer.close();
  assert.match(await readFile(path,'utf8'),/Retain me/);viewer=await createViewer({port:0,production:true,historyPath:path});const s=viewer.store.snapshot()[0];assert.equal(s.name,'Investigate loops');assert.equal(s.agents[0].output,'Retain me');assert.equal(s.status,'disconnected');assert.equal(s.agents[0].connectionLost,true);
 }finally{await viewer?.close();await rm(dir,{recursive:true,force:true});}
});
test('prompt API queues once, validates bridge ownership and records runtime acknowledgement',async()=>{
 const viewer=await createViewer({port:0,production:true}),base='http://127.0.0.1:'+viewer.server.address().port;
 const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'X-Agent-Viewer':'1','Content-Type':'application/json'},body:JSON.stringify(data)});
 try{viewer.store.ingest(packet('viewer.metadata',{capabilities:{prompt:true,taskPrompt:true}}));
  let r=await post('/api/prompts',{sessionId:'s',agentId:'root',prompt:'Continue'});assert.equal(r.status,202);const {id}=await r.json();
  assert.equal((await post('/api/commands/pull',{sessionId:'s',bridgeId:'wrong'})).status,403);
  r=await post('/api/commands/pull',{sessionId:'s',bridgeId:'b'});assert.equal((await r.json()).commands[0].id,id);
  r=await post('/api/commands/pull',{sessionId:'s',bridgeId:'b'});assert.equal((await r.json()).commands.length,0);
  assert.equal((await post('/api/commands/ack',{sessionId:'s',bridgeId:'b',id,status:'sent'})).status,200);
  assert.equal((await post('/api/commands/ack',{sessionId:'s',bridgeId:'b',id,status:'sent'})).status,200);
  const items=await (await fetch(base+'/api/commands?session=s')).json();assert.equal(items[0].status,'sent');assert.equal(items[0].bridgeId,undefined);
  assert.equal((await post('/api/prompts',{sessionId:'s',agentId:'missing',prompt:'x'})).status,400);
 }finally{await viewer.close();}
});

test('unchanged registry confirmations do not bury activity history or become stale',()=>{
 const st=new Store(),now=Date.now();const state={agentId:'worker',runtimeTaskId:'worker',state:'running',name:'Worker'};
 st.ingest(packet('viewer.task_state',state),now);const before=st.sessions.get('s').agents.worker.events.length;
 for(let i=1;i<=40;i++)st.ingest(packet('viewer.task_state',state),now+i*5000);
 assert.equal(st.sessions.get('s').agents.worker.events.length,before);assert.equal(st.snapshot(now+200001)[0].agents.find(a=>a.id==='worker').status,'running');
});

test('registry-first attachment later correlates lifecycle events without duplicate nodes',()=>{
 const st=new Store(),now=Date.now();st.ingest(packet('viewer.task_state',{toolCallId:'call',agentId:'task',runtimeTaskId:'task',state:'running',name:'Verifier'}),now);
 st.ingest(packet('subagent.started',{toolCallId:'call',agentId:'trajectory',agentDisplayName:'Verifier'}),now+1);
 st.ingest(packet('subagent.completed',{},'trajectory'),now+2);
 const workers=Object.values(st.sessions.get('s').agents).filter(a=>a.id!=='root');assert.equal(workers.length,1);assert.equal(workers[0].id,'task');assert.equal(workers[0].status,'completed');
});
