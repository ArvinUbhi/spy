// These RPCs are optional: older Copilot hosts remain usable as observers.
export function capabilities(session){return {prompt:typeof session.send==='function',taskPrompt:typeof session.rpc?.tasks?.sendMessage==='function'};}
export async function sendPrompt(session,command){
  if(command.agentId==='root'){
    if(!capabilities(session).prompt)throw Error('Host does not expose session.send');
    await session.send({prompt:command.prompt,mode:'immediate'});
  }else{
    if(!command.runtimeTaskId||!capabilities(session).taskPrompt)throw Error('Host does not expose targeted task messaging');
    const result=await session.rpc.tasks.sendMessage({id:command.runtimeTaskId,message:command.prompt});
    if(!result?.sent)throw Error(result?.error||'Runtime did not deliver prompt');
  }
}
export async function observeRuntime(session,enqueue){
  await Promise.allSettled([
    Promise.resolve().then(()=>session.rpc.metadata.snapshot()).then(m=>enqueue({type:'viewer.metadata',data:{title:m.initialName||m.summary,capabilities:capabilities(session)}})),
    Promise.resolve().then(()=>session.rpc.tasks.list()).then(({tasks})=>{
      for(const t of tasks.filter(t=>t.type==='agent').slice(0,160))enqueue({type:'viewer.task_state',data:{agentId:t.id,runtimeTaskId:t.id,toolCallId:t.toolCallId,name:t.displayName||t.description,model:t.resolvedModel||t.model,state:t.status,reason:t.error||'Reconciled with runtime task registry'}});
    })
  ]);
}
