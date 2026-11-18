import {startBridge} from '../test/fixtures/bridge-process.mjs';
import {test,expect} from '@playwright/test';import {spawn} from 'node:child_process';import {once} from 'node:events';import {readFile,mkdir,writeFile} from 'node:fs/promises';
test('reports browser process and actual bridge overhead with synthetic SDK transport',async({page,browser})=>{
 test.setTimeout(60000);const bridges=[];const collector=spawn(process.execPath,['server/index.mjs','--production','--port','0'],{stdio:['ignore','pipe','pipe']});const collectorExit=once(collector,'exit');const base=await new Promise((yes,no)=>{let out='';collector.stdout.on('data',b=>{out+=b;const match=out.match(/http:\/\/127\.0\.0\.1:\d+/);if(match)yes(match[0]);});collector.on('error',no);setTimeout(()=>no(Error('Collector startup timeout')),8000).unref();});
 try{
 for(let i=0;i<5;i++){
  const bridge=await startBridge(base,'resource-'+i);bridges.push(bridge);const {child}=bridge;
  for(let j=0;j<8;j++)child.send({event:{type:'subagent.started',data:{toolCallId:'a-'+j,agentId:'a-'+j,agentDisplayName:'Worker '+j,model:'synthetic'}}});
 }
 await page.goto(base);await expect(page.locator('.react-flow__node')).toHaveCount(9);
 await new Promise(r=>setTimeout(r,2000));const cdp=await browser.newBrowserCDPSession();const before=await cdp.send('SystemInfo.getProcessInfo');const start=Date.now();
 for(let tick=0;tick<8;tick++){
  for(const {child}of bridges)for(let a=0;a<8;a++)child.send({event:{type:'assistant.intent',agentId:'a-'+a,data:{intent:'Synthetic work '+tick}}});
  await new Promise(r=>setTimeout(r,1000));
 }
 const after=await cdp.send('SystemInfo.getProcessInfo');const seconds=(Date.now()-start)/1000;let rss=0,readable=0;
 for(const p of after.processInfo){try{const status=await readFile(`/proc/${p.id}/status`,'utf8');rss+=Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1]||0)/1024;readable++;}catch{}}
 const cpu=after.processInfo.reduce((sum,p)=>{const prev=before.processInfo.find(x=>x.id===p.id);return sum+(prev?Math.max(0,p.cpuTime-prev.cpuTime):0);},0)/seconds*100;
 const response=await fetch(base+'/api/stream');const reader=response.body.getReader();let text='';const decoder=new TextDecoder();while(!text.includes('\n\n')){const chunk=await reader.read();if(chunk.done)throw Error('SSE closed');text+=decoder.decode(chunk.value,{stream:true});}await reader.cancel();const snapshot=JSON.parse(text.split('\n').find(s=>s.startsWith('data: ')).slice(6));const sessions=snapshot.sessions.filter(s=>s.id.startsWith('resource-'));const metrics=sessions.map(s=>s.bridgeMetrics).filter(Boolean);
 const result={measuredAt:new Date().toISOString(),scope:'5 bridges × 8 workers. Real bridge module, queue, HTTP and heartbeat; stub SDK transport replaces Copilot. One Chromium test browser/tab plus Playwright/DevTools overhead. Not a real Copilot acceptance test.',platform:process.platform,durationSeconds:seconds,browser:{cpuPercentOneCore:cpu,rssMiBSummed:readable?rss:null,processes:after.processInfo.length,readableMemoryProcesses:readable,note:'RSS sum can double-count shared pages; CPU excludes processes that exited during the sample.'},bridges:{count:metrics.length,rssMiBSummed:metrics.reduce((n,m)=>n+m.rssMiB,0),cpuPercentOneCoreSummed:metrics.reduce((n,m)=>n+m.cpuPercent,0),note:'Latest bridge self-reports, not a whole-window CPU average. Real SDK transport/authentication may add overhead.'},collector:await (await fetch(base+'/api/metrics')).json()};
 expect(metrics).toHaveLength(5);expect(Number.isFinite(cpu)).toBeTruthy();await mkdir('reports',{recursive:true});await writeFile('reports/resources.json',JSON.stringify(result,null,2)+'\n');console.log('Resource report:',JSON.stringify(result));await cdp.detach();
 }finally{for(const {child}of bridges)child.kill();await Promise.all(bridges.map(b=>b.exit));collector.kill();await collectorExit;}
});
