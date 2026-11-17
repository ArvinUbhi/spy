import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/store.mjs';
import {projectEvent} from '../bridge/core.mjs';
const at=Date.parse('2026-11-17T20:00:00Z');
function setup(){const store=new Store();let seq=0;return {store,send(type,data={},agentId,offset=0){const event=projectEvent({id:'e'+seq++,type,data,agentId,timestamp:new Date(at+offset).toISOString()},()=>String(seq));assert.ok(event);store.ingest({sessionId:'s',event},at+offset);},view(){return store.snapshot(at)[0];}};}
test('native skill usage is agent-scoped and does not imply active or inherited skills',()=>{
 const t=setup();t.send('skill.invoked',{name:'review',path:'skills/review/SKILL.md',content:'Check acceptance criteria'},'reviewer');t.send('skill.invoked',{name:'review',content:'Check again'},'reviewer');
 assert.equal(t.view().agents.find(a=>a.id==='reviewer').skills[0].count,2);assert.equal(t.view().agents[0].skills.length,0);assert.equal(t.view().agents[1].skills[0].evidence,'runtime');assert.equal(t.view().agents[1].contextMode,'unknown');
});
test('catalogs describe available definitions without fabricating live invocations',()=>{
 const t=setup();t.send('session.skills_loaded',{skills:[{name:'tests',enabled:false,content:'not part of metadata'}]});t.send('session.custom_agents_updated',{agents:[{id:'a',name:'auditor',displayName:'Auditor',model:'configured-model',prompt:'never project raw agent prompts'}]});
 assert.equal(t.view().agents.length,1);assert.equal(t.view().agentCatalog[0].name,'auditor');assert.equal(t.view().skillCatalog[0].enabled,false);assert.equal(t.view().agentCatalog[0].prompt,undefined);
});
test('overlapping permission and input waits stay attributed through completion without agentId',()=>{
 const t=setup();t.send('assistant.turn_start',{turnId:'1'},'worker');t.send('permission.requested',{requestId:'p'},'worker',100);t.send('user_input.requested',{requestId:'u',question:'Choose a target'},'worker',200);t.send('assistant.message_delta',{deltaContent:'continuing output'},'worker',300);
 assert.equal(t.view().agents[1].status,'waiting');assert.equal(t.view().agents[1].activity,'Waiting for permission');
 t.send('permission.completed',{requestId:'p',result:{kind:'approved'}},undefined,400);assert.equal(t.view().agents[1].status,'waiting');assert.equal(t.view().agents[1].activity,'Choose a target');
 t.send('user_input.completed',{requestId:'u'},undefined,600);assert.equal(t.view().agents[1].status,'running');assert.equal(t.view().agents[1].waitMs,500);
});
test('denied permissions block until actual new execution; hook-resolved prompts do not wait',()=>{
 const t=setup();t.send('permission.requested',{requestId:'p',resolvedByHook:true},'worker');assert.notEqual(t.view().agents[1].status,'waiting');
 t.send('permission.requested',{requestId:'q'},'worker');t.send('permission.completed',{requestId:'q',result:{kind:'denied-interactively-by-user'}});assert.equal(t.view().agents[1].status,'blocked');
 t.send('assistant.intent',{intent:'Considering alternatives'},'worker');assert.equal(t.view().agents[1].status,'blocked');t.send('tool.execution_start',{toolCallId:'x',toolName:'view'},'worker');assert.equal(t.view().agents[1].status,'running');
});
test('subagents can be idle, waiting, cancelled and completed without late completions resurrecting them',()=>{
 const t=setup();t.send('subagent.started',{toolCallId:'child',agentId:'child'});t.send('assistant.turn_end',{},'child');assert.equal(t.view().agents[1].status,'idle');
 t.send('permission.requested',{requestId:'p'},'child');t.send('subagent.completed',{toolCallId:'child',cancelled:true},undefined,900);assert.equal(t.view().agents[1].status,'cancelled');t.send('permission.completed',{requestId:'p',result:{kind:'approved'}});assert.equal(t.view().agents[1].status,'cancelled');
});
test('native delegated prompts and returned results are inspectable without claiming shared memory',()=>{
 const t=setup();t.send('tool.execution_start',{toolCallId:'call',toolName:'task',arguments:{prompt:'Inspect auth.ts'}},'parent');t.send('subagent.started',{toolCallId:'call',agentId:'child',agentName:'review'});t.send('subagent.completed',{toolCallId:'call'});t.send('tool.execution_complete',{toolCallId:'call',success:true,result:'One race found'});
 const contexts=t.view().contexts;assert.equal(contexts.length,2);assert.equal(contexts[0].source,'child');assert.equal(contexts[0].target,'parent');assert.equal(contexts[1].payload,'Inspect auth.ts');assert.ok(contexts.every(c=>c.mode==='unknown'&&c.evidence==='runtime'));
});
test('explicit context metadata is labelled, clipped, bounded and never promoted to runtime evidence',()=>{
 const t=setup();for(let i=0;i<130;i++)t.send('viewer.context_handoff',{id:'c'+i,source:'one',target:'two',mode:'shared',payload:'x'.repeat(7000),evidence:'runtime'});
 assert.equal(t.view().contexts.length,120);assert.equal(t.view().contexts[0].payload.length,6000);assert.equal(t.view().contexts[0].truncated,true);assert.equal(t.view().contexts[0].evidence,'orchestrator');assert.equal(t.view().contexts[0].mode,'shared');assert.equal(t.view().edges.filter(e=>e.kind==='context').length,1);
});
test('missing context payload remains explicitly unknown and skill excerpts stay bounded',()=>{
 const t=setup();t.send('viewer.context_handoff',{source:'one',target:'two'});assert.equal(t.view().contexts[0].payload,null);assert.equal(t.view().contexts[0].mode,'unknown');
 for(let i=0;i<30;i++)t.send('skill.invoked',{name:'skill'+i,content:'x'.repeat(7000)},'one');const a=t.view().agents.find(a=>a.id==='one');assert.equal(a.skills.length,20);assert.equal(a.skills[0].content.length,2000);assert.equal(a.skills[0].truncated,true);
});
test('disconnection does not present stale agents as active and invalid catalog entries are tolerated',()=>{
 const t=setup();t.send('assistant.turn_start',{turnId:'1'});t.send('session.skills_loaded',{skills:[null,{name:'valid'}]});const snapshot=t.store.liveView('s',at+40000);assert.equal(snapshot.sessions[0].runningCount,0);assert.equal(snapshot.sessions[0].agents[0].connectionLost,true);assert.equal(snapshot.sessions[0].skillCatalog.length,1);
});
