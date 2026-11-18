import test from 'node:test';
import assert from 'node:assert/strict';
import { arrange } from '../src/graph.mjs';
const session={agents:['root','planner','builder','tester','reviewer'].map(id=>({id})),edges:[{source:'root',target:'planner',kind:'delegation'},{source:'root',target:'builder',kind:'delegation'},{source:'planner',target:'builder',kind:'handoff'},{source:'builder',target:'tester',kind:'handoff'},{source:'builder',target:'reviewer',kind:'handoff'}]};
test('graph respects handoff order and separates parallel verification branches',()=>{
  const p=arrange(session);assert.ok(p.root.y<p.planner.y);assert.ok(p.planner.y<p.builder.y);assert.ok(p.builder.y<p.tester.y);assert.equal(p.tester.y,p.reviewer.y);assert.notEqual(p.tester.x,p.reviewer.x);
});
test('feedback loops do not distort layout or create infinite recursion',()=>{
  const withFeedback={...session,edges:[...session.edges,{source:'tester',target:'builder',kind:'feedback'}]};assert.deepEqual(arrange(withFeedback),arrange(session));
});
test('unknown cycles and repeated graph updates stay finite and deterministic',()=>{
  const cyclic={...session,edges:[...session.edges,{source:'tester',target:'planner',kind:'handoff'}]};const p=arrange(cyclic);assert.deepEqual(p,arrange(cyclic));for(const v of Object.values(p)){assert.ok(Number.isFinite(v.x));assert.ok(v.y<=1680);}
});
