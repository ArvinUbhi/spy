import {startBridge} from './fixtures/bridge-process.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';import {createViewer} from '../server/index.mjs';
test('actual extension joins, forwards catalogs/events/metadata and reports process resources with SDK transport stub',async()=>{
 const viewer=await createViewer({port:0,production:true});const {child,exit,ready}=await startBridge(`http://127.0.0.1:${viewer.server.address().port}`,'contract');
 try{
  assert.ok(ready.tools.includes('spy_observe'));
  child.send({event:{id:'usage',type:'assistant.usage',agentId:'verifier',data:{model:'test-model',inputTokens:123,outputTokens:12}}});child.send({tool:{name:'spy_observe',arguments:{type:'viewer.iteration',loopId:'contract',iteration:1,outcome:'passed'}}});
  const until=Date.now()+8000;let s;while(Date.now()<until){s=viewer.store.snapshot()[0];if(s?.bridgeMetrics&&s.loops?.length&&s.agents.find(a=>a.id==='verifier')?.tokens===135)break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(s.agents.find(a=>a.id==='verifier').tokens,135);assert.equal(s.skillCatalog[0].name,'test-skill');assert.equal(s.loops[0].iterations[0].outcome,'passed');assert.ok(s.bridgeMetrics.rssMiB>0);assert.equal(s.coverage.missingEvents,0);
 }finally{child.kill();await exit;await viewer.close();}
});
