export function pullProgress(startY,currentY,threshold=72){
 const distance=Math.min(110,Math.max(0,(currentY-startY)*.55));
 return {distance,armed:distance>=threshold,progress:Math.min(1,distance/threshold)};
}
export function installPullRefresh({indicator,refresh,blocked=()=>false,target=document}){
 let start=null,pulling=false,busy=false;
 const reset=()=>{indicator.style.removeProperty('--pull-distance');indicator.classList.remove('pulling','armed');pulling=false;start=null;};
 target.addEventListener('touchstart',event=>{
  if(busy||blocked()||window.scrollY>1||event.touches.length!==1||event.target.closest('input,textarea,select,[contenteditable]'))return;
  start={y:event.touches[0].clientY,x:event.touches[0].clientX};
 },{passive:true});
 target.addEventListener('touchmove',event=>{
  if(!start||busy)return;const point=event.touches[0];if(!point||event.touches.length!==1||blocked()||window.scrollY>1){reset();return;}
  const dy=point.clientY-start.y;if(dy<=0||Math.abs(point.clientX-start.x)>Math.abs(dy)){reset();return;}
  if(dy<8)return;event.preventDefault();pulling=true;const state=pullProgress(start.y,point.clientY);
  indicator.style.setProperty('--pull-distance',state.distance+'px');indicator.classList.add('pulling');indicator.classList.toggle('armed',state.armed);
  indicator.querySelector('span').textContent=state.armed?'Release to refresh':'Pull to refresh';
 },{passive:false});
 target.addEventListener('touchend',async()=>{
  const armed=pulling&&indicator.classList.contains('armed');reset();if(!armed||busy)return;
  busy=true;indicator.classList.add('refreshing');indicator.querySelector('span').textContent='Refreshing…';
  try{await refresh();}finally{busy=false;indicator.classList.remove('refreshing');}
 },{passive:true});
 target.addEventListener('touchcancel',reset,{passive:true});
}
