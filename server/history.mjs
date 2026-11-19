import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {dirname} from 'node:path';

// One bounded local snapshot. Pending commands are deliberately never persisted.
export async function restoreHistory(store,path) {
  if(!path)return;
  try {
    if((await stat(path)).size>20*1024*1024)throw Error('History exceeds 20 MiB');
    const saved=JSON.parse(await readFile(path,'utf8'));
    if(saved.version!==1||!Array.isArray(saved.sessions))throw Error('Unsupported history format');
    for(const s of saved.sessions.slice(-40)){
      if(typeof s.id!=='string'||!s.agents||s.source==='demo')continue;
      s.seen=new Set(s.seen||[]);s.status='disconnected';s.restored=true;
      for(const key of ['agents','aliases','calls','pendingRequests'])s[key]=Object.assign(Object.create(null),s[key]||{});
      for(const a of Object.values(s.agents)){a.tools=Object.assign(Object.create(null),a.tools||{});a.waits=Object.assign(Object.create(null),a.waits||{});}
      store.sessions.set(s.id,s);
    }
    store.maintain(Date.now(),true);
  }catch(e){if(e.code!=='ENOENT')console.error('[Spy] Could not restore history: '+e.message);}
}
export async function saveHistory(store,path){
  if(!path)return;
  const sessions=[...store.sessions.values()].filter(s=>s.source!=='demo');
  const body=JSON.stringify({version:1,sessions},(_k,v)=>v instanceof Set?[...v]:v);
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  await writeFile(path+'.tmp',body,{mode:0o600});await rename(path+'.tmp',path);
}
