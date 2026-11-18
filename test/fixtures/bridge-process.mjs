// Execute the real bridge source with only SDK/local import URLs rewired.
// This avoids a Node loader worker inflating the process resource measurement.
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';
export async function startBridge(endpoint,sessionId,{proxyFetch=false}={}){
 const dir=await mkdtemp(join(tmpdir(),'spy-bridge-test-'));let source=await readFile(new URL('../../bridge/extension.mjs',import.meta.url),'utf8');
 for(const [specifier,url]of [['./sdk.mjs',new URL('./sdk-stub.mjs',import.meta.url)],['./collector.mjs',new URL('../../bridge/collector.mjs',import.meta.url)],['./core.mjs',new URL('../../bridge/core.mjs',import.meta.url)]])source=source.replace("'"+specifier+"'",JSON.stringify(url.href));
 if(proxyFetch)source="globalThis.fetch=async()=>new Response('<html>intercepted fetch failure</html>',{status:500,headers:{'content-type':'text/html'}});\n"+source;
 await writeFile(join(dir,'extension.mjs'),source);const child=spawn(process.execPath,[join(dir,'extension.mjs')],{env:{...process.env,SPY_URL:endpoint,SPY_TEST_SESSION:sessionId},stdio:['ignore','ignore','pipe','ipc']});let logs='';child.stderr.on('data',s=>logs+=s);const exit=once(child,'exit').then(async()=>{await rm(dir,{recursive:true,force:true});});
 try{const [ready]=await Promise.race([once(child,'message'),exit.then(()=>{throw Error('Bridge exited: '+logs);}),new Promise((_,no)=>setTimeout(()=>no(Error('Bridge startup timeout: '+logs)),8000).unref())]);return {child,exit,ready};}catch(e){child.kill();await exit;throw e;}
}
