// Drag the title/handle, or noninteractive content at the top, to dismiss a sheet.
export function installSheetDismiss(dialog){
 let drag=null;
 const reset=()=>{const id=drag?.id;drag=null;dialog.style.removeProperty('transform');dialog.classList.remove('sheet-dragging');if(id!=null&&dialog.hasPointerCapture?.(id))dialog.releasePointerCapture(id);};
 dialog.addEventListener('pointerdown',event=>{
  if(!dialog.open||event.button!==0||event.isPrimary===false||event.target.closest('button,a,input,textarea,select,summary,[contenteditable]'))return;
  const header=event.target.closest('.sheet-drag-zone,.sheet-header');
  if(!header&&(dialog.scrollTop>1||event.pointerType==='touch'))return;
  event.preventDefault();drag={id:event.pointerId,x:event.clientX,y:event.clientY,distance:0};dialog.setPointerCapture?.(event.pointerId);
 });
 dialog.addEventListener('pointermove',event=>{
  if(!drag||drag.id!==event.pointerId)return;
  const dy=event.clientY-drag.y,dx=Math.abs(event.clientX-drag.x);
  if(Math.abs(dy)<8&&dx<8)return;
  if(dy<=0||dx>Math.abs(dy)){reset();return;}if(dy<8)return;
  event.preventDefault();drag.distance=Math.min(280,dy*.8);dialog.classList.add('sheet-dragging');dialog.style.transform=`translateY(${drag.distance}px)`;
 });
 dialog.addEventListener('pointerup',event=>{if(!drag||drag.id!==event.pointerId)return;const dismiss=drag.distance>=90;reset();if(dismiss&&dialog.open)dialog.close();});
 for(const type of ['pointercancel','lostpointercapture','close'])dialog.addEventListener(type,reset);
 return reset;
}
