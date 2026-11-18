import React from 'react';
export default function SessionStats({session,analysis}){
 if(!session)return <section className="stats-empty">Select a session to see its stats.</section>;
 const agents=session.agents,tools=agents.flatMap(a=>Object.values(a.tools));
 const calls=agents.reduce((n,a)=>n+(a.toolCalls??Object.keys(a.tools).length),0),failures=agents.reduce((n,a)=>n+(a.toolFailures??Object.values(a.tools).filter(t=>t.status==='failed').length),0);
 const rows=analysis.usage;const input=rows.reduce((n,r)=>n+r.input,0),output=rows.reduce((n,r)=>n+r.output,0);
 const values=[['Agents',agents.length],['Completed',agents.filter(a=>a.status==='completed').length],['Failed agents',agents.filter(a=>a.status==='failed').length],['Tool calls',calls],['Failed tools',failures],['Model calls',rows.reduce((n,r)=>n+r.calls,0)],['Input tokens',input.toLocaleString()],['Output tokens',output.toLocaleString()],['Possible loops',analysis.loops.suspected.length],['Peak workers',analysis.parallel.peak],['Context transfers',session.contexts?.length||0],['Retained tool records',tools.length]];
 return <section className="session-stats"><h2>{session.name} · Stats</h2><p>Observed since Spy attached. Tool counters survive detail trimming. Token reports can overlap between coordinator and workers; these are observation totals, not a bill.</p><div className="stats-grid">{values.map(([label,value])=><article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>{!rows.length&&<p>Token usage has not been reported by this runtime.</p>}</section>;
}
