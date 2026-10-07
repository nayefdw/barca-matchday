export function bounded(operation, milliseconds=10000, message='Setup took too long. Please try again.') {
  let timer;
  return Promise.race([Promise.resolve(operation),new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error(message)),milliseconds);
  })]).finally(()=>clearTimeout(timer));
}
// Invoke subscribe before any awaited work so the browser sees the user's tap.
// subscribe itself prompts for notification permission on supported browsers.
export function startPushSubscription(registration, publicKey, existing=null) {
  if(existing)return Promise.resolve(existing);
  if(!registration?.active||!registration.pushManager)throw new Error('Notification setup is still loading. Try again in a moment.');
  const key=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  return registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
}
export function notificationError(error, permission) {
  if(permission==='denied')return 'Notifications are blocked. Allow Barça Matchday in your device notification settings, then try again.';
  if(error?.name==='NotAllowedError')return 'Notifications were not allowed. On iPhone, open the installed Home Screen app and tap Enable again.';
  if(error?.name==='NotSupportedError')return 'This browser does not support match reminders. On iPhone, use Safari to add the app to your Home Screen.';
  return error?.message||'Reminders could not be enabled. Check your connection and try again.';
}
