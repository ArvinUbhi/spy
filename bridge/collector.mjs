// Shared local collector, installed once. No gh executable or database required.
import { spawn } from 'node:child_process';
import { open, stat, unlink, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const delay = ms => new Promise(r=>setTimeout(r,ms));
export async function ensureCollector({ endpoint='http://127.0.0.1:4317', script=resolve(dirname(fileURLToPath(import.meta.url)),'runtime/server/index.mjs'), lockDirectory=resolve(dirname(script),'..'), timeoutMs=8000, spawnProcess=spawn,requiredFeatures=[],allowReplace=false }={}) {
  const url=new URL(endpoint);
  if(url.protocol!=='http:' || !['127.0.0.1','localhost'].includes(url.hostname)) throw Error('Spy requires a local HTTP collector');
  let replaced=false;
  const health=async()=>{
    let response;
    try { response=await fetch(new URL('/api/health',url),{signal:AbortSignal.timeout(300)}); } catch {return null;}
    let data;try{data=await response.json();}catch{throw Error('Spy port is occupied by another service');}
    if(!response.ok || data.service!=='spy' || data.protocol!==1)throw Error('Spy port is occupied by another service');
    if(!requiredFeatures.every(feature=>data.features?.includes(feature))){
      if(!allowReplace)throw Error('Spy collector is older than this bridge. Run the latest Spy startup script.');
      if(!replaced){if(!Number.isInteger(data.pid)||data.pid<=1||data.pid===process.pid)throw Error('Cannot safely identify the previous Spy collector');
        replaced=true;try{process.kill(data.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}
      }
      return null;
    }
    return data;
  };
  const ready=await health();if(ready)return {...ready,started:false};
  await mkdir(lockDirectory,{recursive:true});
  const lock=resolve(lockDirectory,`collector-${url.port||80}.lock`),deadline=Date.now()+timeoutMs;
  let handle;
  while(Date.now()<deadline){
    const existing=await health();if(existing)return {...existing,started:false};
    try {handle=await open(lock,'wx');break;}catch(error){
      if(error.code!=='EEXIST')throw error;
      try{if(Date.now()-(await stat(lock)).mtimeMs>15000)await unlink(lock);}catch(error){if(error.code!=='ENOENT')throw error;}
      await delay(120);
    }
  }
  if(!handle)throw Error('Spy collector startup timed out');
  try {
    const existing=await health();if(existing)return {...existing,started:false};
    const child=spawnProcess(process.execPath,[script,'--production','--auto','--port',url.port||'80'],{stdio:'ignore',detached:true,windowsHide:true,env:{...process.env,SITES_MANAGED_LINUX_CONTAINER:'0'}});
    let spawnError;child.on('error',error=>{spawnError=error;});child.unref();
    while(Date.now()<deadline){if(spawnError)throw spawnError;const ready=await health();if(ready)return {...ready,started:true};await delay(120);}
    throw Error('Spy collector startup timed out; check Node.js and the installed extension runtime');
  } finally {await handle.close();await unlink(lock).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
