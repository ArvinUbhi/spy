const text=value=>value==null?'':typeof value==='string'?value:JSON.stringify(value,null,2);
const eventText=e=>text(e.data.content??e.data.deltaContent??'');
export function conversationRows(items){const result=[];for(const r of [...items].sort((a,b)=>a.cursor-b.cursor)){
 const type=r.event.type,last=result.at(-1);if(type==='assistant.message_delta'){
  const key=r.event.data.messageId||r.event.data.turnId||'stream';if(last?.streamKey===key){last.body+=eventText(r.event);last.cursor=r.cursor;}else result.push({...r,body:eventText(r.event),streamKey:key,role:'assistant',partial:true});
 }else if(type==='assistant.message'){
  if(last?.partial&&(!r.event.data.messageId||last.streamKey==='stream'||last.streamKey===r.event.data.messageId||last.streamKey===r.event.data.turnId))result.pop();result.push({...r,body:eventText(r.event),role:'assistant'});
 }else if(type==='user.message'||type==='viewer.prompt_queued'||type==='viewer.delegated_prompt')result.push({...r,body:eventText(r.event),role:type==='user.message'?'user':type==='viewer.delegated_prompt'?'delegated task':'injected prompt'});
 else if(type==='viewer.prompt_delivery')result.push({...r,body:r.event.data.status==='sent'?'Prompt delivered to runtime':r.event.data.error||r.event.data.status,role:'delivery'});
 }return result;}
