const ENTRY_IDS=Object.freeze(['guest','hotel-staff','admin','owner']);
const permissionMap=Object.freeze({
  'views.operations.read':'hotel-staff',
  'views.booking.manage':'hotel-staff',
  'views.cleaning.execute':'hotel-staff',
  'views.cleaning.verify':'hotel-staff',
  'vision.admin':'admin',
  'vision.owner':'owner'
});

export function deriveSessionEntries(context){
  if(!context||typeof context!=='object'||Array.isArray(context))throw new Error('invalid_session_context');
  const permissions=Array.isArray(context.permissions)?context.permissions:[];
  if(permissions.some(p=>typeof p!=='string'||p.length>120))throw new Error('invalid_session_context');
  const entries=new Set();
  if(context.guestLinked===true)entries.add('guest');
  for(const permission of permissions){const entry=permissionMap[permission];if(entry)entries.add(entry);}
  return Object.freeze(ENTRY_IDS.filter(id=>entries.has(id)));
}

export function assertRequestedEntry(available,requested){
  if(!Array.isArray(available)||!ENTRY_IDS.includes(requested)||!available.includes(requested))throw new Error('entry_forbidden');
  return requested;
}
