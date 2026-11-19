import React from 'react';
import {BaseEdge,EdgeLabelRenderer,useStore} from '@xyflow/react';
import {feedbackRoute} from './feedback-route.mjs';
export default function FeedbackEdge(props){
 const {id,sourceX,sourceY,targetX,targetY,markerEnd,style,data,selected}=props;
 const rightBoundary=useStore(s=>Math.max(0,...[...s.nodeLookup.values()].map(n=>(n.internals?.positionAbsolute?.x??n.position.x)+(n.measured?.width||240))));
 const route=feedbackRoute({sourceX,sourceY,targetX,targetY,rightBoundary,lane:data.lane});
 return <><BaseEdge id={id} path={route.path} markerEnd={markerEnd} style={style} interactionWidth={28}/><EdgeLabelRenderer><button type="button" className={'feedback-route-label nodrag nopan '+(selected?'selected':'')} style={{transform:`translate(-50%, -50%) translate(${route.labelX}px,${route.labelY}px)`}} onClick={()=>data.onSelect(id)} aria-label={`Edit loop: ${data.sourceName} to ${data.targetName}`}><strong>↶ FAIL → {data.targetName}</strong><span>{data.maxRetries} returns max · {data.maxExecutions} executions / stage</span></button></EdgeLabelRenderer></>;
}
