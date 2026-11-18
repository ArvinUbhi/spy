import {randomUUID} from 'node:crypto';
export class Commands {
  items=new Map();
  prune(now=Date.now()){for(const [id,c]of this.items){if(['queued','dispatching'].includes(c.status)&&now-c.createdAt>30000){c.error=c.status==='queued'?'Bridge did not collect prompt within 30 seconds':'Delivery unconfirmed; check Copilot before resending';c.status='failed';}if(now-c.createdAt>300000)this.items.delete(id);}}
  submit(session,agentId,prompt,now=Date.now()){
    this.prune(now);
    if(!session||session.restored||session.status==='disconnected'||now-session.lastSeen>15000)throw Error('Session bridge is offline');
    const a=session.agents[agentId];if(!a)throw Error('Agent not found');
    if(typeof prompt!=='string'||!prompt.trim()||prompt.length>6000)throw Error('Prompt must contain 1–6000 characters');
    const caps=session.capabilities||{};
    if(agentId==='root'?!caps.prompt:!caps.taskPrompt||!a.runtimeTaskId)throw Error('This runtime does not support sending prompts to this target');
    if(agentId!=='root'&&['completed','failed','cancelled'].includes(a.status))throw Error('Target agent has finished');
    if(this.items.size>=100)throw Error('Prompt queue is full');
    const c={id:randomUUID(),sessionId:session.id,agentId,runtimeTaskId:a.runtimeTaskId,prompt:prompt.trim(),bridgeId:session.coverage?.bridgeId,createdAt:now,status:'queued'};
    this.items.set(c.id,c);return c;
  }
  pull(sessionId,bridgeId){this.prune();const result=[];for(const c of this.items.values())if(c.sessionId===sessionId&&c.bridgeId===bridgeId&&c.status==='queued'){c.status='dispatching';result.push(c);}return result;}
  acknowledge(id,bridgeId,status,error){const c=this.items.get(id);if(!c||c.bridgeId!==bridgeId)throw Error('Unknown dispatched prompt');if(c.status==='sent')return c;if(!['dispatching','failed'].includes(c.status))throw Error('Prompt was not dispatched');c.status=status==='sent'?'sent':'failed';c.error=String(error||'').slice(0,1000);return c;}
  view(sessionId){this.prune();return [...this.items.values()].filter(c=>c.sessionId===sessionId).map(({bridgeId,...c})=>c);}
}
