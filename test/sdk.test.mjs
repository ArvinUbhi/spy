import test from 'node:test';import assert from 'node:assert/strict';import {joinSpySession} from '../bridge/sdk.mjs';
const tools=[{name:'spy_observe',handler:async()=>''}];
const unavailable=specifier=>Object.assign(Error(`Cannot find package '${specifier.split('/').slice(0,2).join('/')}'`),{code:'ERR_MODULE_NOT_FOUND'});
test('SDK v2 uses the Microsoft host import and nested tool definitions',async()=>{
 const requests=[];const session={on(){}};
 const result=await joinSpySession(tools,async name=>{requests.push(name);return {joinSession:async config=>{assert.deepEqual(config,{tools:{definitions:tools}});return session;}};});
 assert.equal(result,session);assert.deepEqual(requests,['@microsoft/copilot-sdk/extension']);
});
test('SDK v1 falls back to the GitHub host import with legacy tool definitions',async()=>{
 const requests=[];await joinSpySession(tools,async name=>{requests.push(name);if(name.startsWith('@microsoft/'))throw unavailable(name);return {joinSession:async config=>assert.deepEqual(config,{tools})};});
 assert.deepEqual(requests,['@microsoft/copilot-sdk/extension','@github/copilot-sdk/extension']);
});
test('SDK loader reports missing host and preserves dependency and join errors without retrying registration',async()=>{
 await assert.rejects(joinSpySession(tools,async name=>{throw unavailable(name);}),/did not provide/);
 const broken=Object.assign(Error("Cannot find package 'dependency'"),{code:'ERR_MODULE_NOT_FOUND'});
 await assert.rejects(joinSpySession(tools,async()=>{throw broken;}),e=>e===broken);
 const denied=Error('host denied join');let joins=0;
 await assert.rejects(joinSpySession(tools,async()=>({joinSession:async()=>{joins++;throw denied;}})),e=>e===denied);assert.equal(joins,1);
});
