// Test transport only. Does not model Copilot internals or authenticate to GitHub.
export async function joinSession(config){
 let listener;process.on('message',async message=>{if(message.event)listener?.(message.event);if(message.tool){const tool=config.tools.find(t=>t.name===message.tool.name);process.send?.({result:await tool?.handler(message.tool.arguments)});}});
 return {sessionId:process.env.SPY_TEST_SESSION||'contract',on(fn){listener=fn;process.send?.({ready:true,tools:config.tools.map(t=>t.name)});},rpc:{skills:{list:async()=>({skills:[{name:'test-skill',enabled:true}]})},agent:{list:async()=>({agents:[{name:'verifier',displayName:'Verifier'}]})}}};
}
