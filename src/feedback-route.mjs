// Keep return connections outside every stage, including branches and dragged blocks.
export function feedbackRoute({sourceX,sourceY,targetX,targetY,rightBoundary,lane=0}) {
 const rail=Math.max(sourceX,targetX,rightBoundary)+140+lane*42;
 const direction=targetY>=sourceY?1:-1,r=Math.min(16,Math.abs(targetY-sourceY)/2);
 return {rail,labelX:rail,labelY:(sourceY+targetY)/2,path:`M ${sourceX} ${sourceY} L ${rail-r} ${sourceY} Q ${rail} ${sourceY} ${rail} ${sourceY+direction*r} L ${rail} ${targetY-direction*r} Q ${rail} ${targetY} ${rail-r} ${targetY} L ${targetX} ${targetY}`};
}
