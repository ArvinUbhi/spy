import React from 'react';
const clock = at => new Date(at).toLocaleTimeString([], {hour12:false});
export function SkillsPanel({agent,session}) {
  return <><p className="panel-note">Invocations reported for this agent. Invocation does not imply the skill is still active.</p>
    {(agent.skills||[]).map(skill=><details className="observation-card" key={skill.name}><summary><strong>{skill.name}</strong><span>{skill.count}×</span></summary><div className="evidence runtime">Runtime event · last invoked {clock(skill.lastInvokedAt)}</div>{skill.description&&<p>{skill.description}</p>}{skill.path&&<code className="wrap-code">{skill.path}</code>}{skill.pluginName&&<p>Plugin: {skill.pluginName}</p>}{skill.arguments&&<><label>Invocation arguments</label><pre>{skill.arguments}</pre></>}{skill.content&&<><label>Skill content excerpt {skill.truncated?'(truncated)':''}</label><pre>{skill.content}</pre></>}</details>)}
    {!agent.skills?.length&&<p className="muted">No skill invocation observed for this agent.</p>}
    <h3 className="panel-subheading">Available skills · session catalog</h3><p className="panel-note">Availability is separate from invocation and context inheritance.</p>
    {session.skillCatalog?.map((skill,i)=><div className="catalog-row" key={skill.name+':'+i}><strong>{skill.name}</strong><span>{skill.enabled?'Available':'Disabled'}</span></div>)}
    {!session.skillCatalog?.length&&<p className="muted">{session.skillsReported?'Runtime returned an empty skill catalog.':'The runtime has not reported its skill catalog.'}</p>}
  </>;
}
export function Transfers({items,session}) {
  const name=id=>session.agents.find(a=>a.id===id)?.name||id;
  return <>{items.map(item=><details className="observation-card context-card" key={item.id} open><summary><strong>{item.label}</strong><span>{clock(item.at)}</span></summary><div className={'evidence '+item.evidence}>{item.evidence==='runtime'?'Runtime-observed payload':'Orchestrator-reported metadata'}</div><p className="transfer-route">{name(item.source)} → {name(item.target)}</p><div className="context-mode">Context relationship: <strong>{item.mode}</strong></div>{item.summary&&<p>{item.summary}</p>}<p className="panel-note">{item.scope}</p>{item.payload!==null?<><label>Recorded payload {item.truncated?'(truncated)':''}</label><pre>{item.payload}</pre></>:<p className="muted">Payload was not supplied. Sharing cannot be verified from this metadata.</p>}</details>)}</>;
}
export function ContextPanel({agent,session}) {
  const items=(session.contexts||[]).filter(c=>c.source===agent.id||c.target===agent.id);
  return <><div className="context-mode">Agent context mode: <strong>{agent.contextMode||'unknown'}</strong><small>{agent.contextEvidence?'Orchestrator-reported':'No context-isolation metadata supplied'}</small></div><p className="panel-note">A task prompt or returned result is a specific transfer, not evidence of full shared memory.</p><Transfers items={items} session={session}/>{!items.length&&<p className="muted">No context payload transfers observed for this agent.</p>}</>;
}
export function EdgeInspector({edge,session,onClose}) {
  const items=(session.contexts||[]).filter(c=>(c.source===edge.source&&c.target===edge.target)||(c.source===edge.target&&c.target===edge.source));
  return <aside className="inspector edge-inspector"><div className="inspector-heading"><span>CONNECTION INSPECTOR</span><button className="icon-button" aria-label="Close connection inspector" onClick={onClose}>×</button></div><div className="edge-heading"><h2>Context handoffs</h2><p>{edge.label||edge.kind}</p></div><div className="inspector-content"><Transfers items={items} session={session}/>{!items.length&&<p className="panel-note">This edge records delegation or control flow. No context-transfer payload was reported.</p>}</div></aside>;
}
export function CatalogPanel({session}) {
  return <details className="agent-catalog"><summary>Configured agents <span>{session.agentCatalog?.length||0}</span><small>Available definitions, separate from running instances</small></summary><div>{session.agentCatalog?.map((definition,i)=>{
    const instances=session.agents.filter(a=>a.role===definition.name);
    return <div className="catalog-agent" key={definition.id+':'+i}><strong>{definition.displayName}</strong><span>{instances.length?`${instances.length} invocation(s) observed`:'Not invoked in this live view'}</span><small>Configured model: {definition.model||'Runtime default'}</small></div>;
  })}{!session.agentCatalog?.length&&<p className="muted">{session.agentsReported?'Runtime returned an empty agent catalog.':'The runtime has not reported available agent definitions.'}</p>}</div></details>;
}
