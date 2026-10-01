(()=>{
'use strict';

const state={config:null,token:null,user:null,contexts:[],context:null,data:{}};
const $=id=>document.getElementById(id);
const escapeText=value=>value===null||value===undefined?'—':String(value);
const short=value=>value?String(value).slice(0,8)+'…':'—';

function setMessage(value,error=false){
  const node=$('message');
  if(!node)return;
  node.textContent=value||'';
  node.classList.toggle('error',error);
}

async function readJSON(response){
  let body;
  try{body=await response.json();}catch{throw new Error('invalid_response');}
  if(!response.ok)throw new Error(body?.error||'request_failed');
  return body;
}

async function loadConfig(){
  const response=await fetch('/api/staging/config',{cache:'no-store',headers:{accept:'application/json'}});
  state.config=await readJSON(response);
  const badge=$('backendState');
  badge.textContent='Staging backend configured';
  badge.classList.add('ok');
  return state.config;
}

async function api(path,options={}){
  if(!state.token)throw new Error('not_authenticated');
  const headers={accept:'application/json',authorization:'Bearer '+state.token,...options.headers};
  if(options.body)headers['content-type']='application/json';
  const response=await fetch(path,{...options,headers,cache:'no-store'});
  if(response.status===401){clearSession();throw new Error('session_expired');}
  return readJSON(response);
}

async function signIn(email,password){
  if(!state.config)await loadConfig();
  const response=await fetch(state.config.supabaseUrl+'/auth/v1/token?grant_type=password',{
    method:'POST',
    headers:{apikey:state.config.publishableKey,'content-type':'application/json'},
    body:JSON.stringify({email,password}),
    cache:'no-store'
  });
  if(!response.ok)throw new Error('auth_failed');
  const session=await response.json();
  if(!session?.access_token||!session?.user?.id)throw new Error('auth_failed');
  state.token=session.access_token;
  state.user=session.user;
  await loadContexts();
}

async function loadContexts(){
  const rows=await api('/api/views/context');
  if(!Array.isArray(rows)||!rows.length)throw new Error('no_views_access');
  state.contexts=rows;
  state.context=rows[0];
  renderContextPicker();
  $('loginPanel').hidden=true;
  $('workspace').hidden=false;
  $('signOut').hidden=false;
  $('sessionLabel').textContent=state.user?.email||short(state.user?.id);
  await loadAll();
}

function renderContextPicker(){
  const select=$('organizationSelect');
  select.replaceChildren();
  state.contexts.forEach((item,index)=>{
    const option=new Option(item.organization_name||short(item.organization_id),String(index));
    select.add(option);
  });
  select.value=String(Math.max(0,state.contexts.indexOf(state.context)));
  $('workspaceTitle').textContent=(state.context.organization_name||'Views')+' · Operations';
  applyPermissionGates();
}

function setFormEnabled(id,enabled){
  const form=$(id);
  for(const control of form.elements)control.disabled=!enabled;
  form.hidden=!enabled;
}

function applyPermissionGates(){
  const c=state.context||{};
  setFormEnabled('unitForm',!!c.can_unit_manage);
  setFormEnabled('guestForm',!!c.can_guest_manage);
  setFormEnabled('bookingForm',!!c.can_booking_manage);
  setFormEnabled('maintenanceForm',!!c.can_maintenance_manage);
}

async function loadAll(){
  if(!state.context)return;
  setMessage('Обновление Views staging…');
  const org=encodeURIComponent(state.context.organization_id);
  try{
    const names=['dashboard','units','guests','bookings','calendar','maintenance','finance'];
    const values=await Promise.all(names.map(name=>api('/api/views/'+name+'?organization_id='+org)));
    state.data=Object.fromEntries(names.map((name,index)=>[name,values[index]]));
    renderAll();
    setMessage('Данные обновлены. RLS scope: '+state.context.organization_name);
  }catch(error){
    setMessage(humanError(error),true);
  }
}

function humanError(error){
  const map={
    auth_failed:'Не удалось войти в staging. Проверьте синтетический аккаунт.',
    no_views_access:'У аккаунта нет активного Views scope.',
    session_expired:'Сессия истекла. Выполните вход снова.',
    conflict:'Конфликт версии, idempotency или бронирования. Обновите данные.',
    forbidden:'Операция запрещена текущими правами.',
    invalid_command:'Команда не прошла серверную проверку.',
    backend_unavailable:'Staging backend временно недоступен.',
    backend_not_configured:'Staging backend ещё не настроен.',
    invalid_response:'Получен некорректный ответ staging.'
  };
  return map[error?.message]||'Операция не выполнена.';
}

function table(containerId,columns,rows,actions){
  const host=$(containerId);
  host.replaceChildren();
  if(!Array.isArray(rows)||!rows.length){
    const empty=document.createElement('p');empty.className='empty';empty.textContent='Нет записей в текущем RLS scope.';host.append(empty);return;
  }
  const table=document.createElement('table');
  const head=document.createElement('thead'),headRow=document.createElement('tr');
  columns.forEach(([label])=>{const th=document.createElement('th');th.textContent=label;headRow.append(th);});
  if(actions){const th=document.createElement('th');th.textContent='Actions';headRow.append(th);}
  head.append(headRow);table.append(head);
  const body=document.createElement('tbody');
  rows.forEach(row=>{
    const tr=document.createElement('tr');
    columns.forEach(([,getter])=>{const td=document.createElement('td');td.textContent=escapeText(typeof getter==='function'?getter(row):row[getter]);tr.append(td);});
    if(actions){const td=document.createElement('td');td.className='actions';actions(row,td);tr.append(td);}
    body.append(tr);
  });
  table.append(body);host.append(table);
}

function action(label,handler,kind=''){
  const button=document.createElement('button');
  button.type='button';button.className='button '+kind;button.textContent=label;button.onclick=handler;
  return button;
}

function renderDashboard(){
  const data=state.data.dashboard?.[0]||{};
  const metrics=[
    ['Active units',data.active_units||0],
    ['Occupied',data.occupied_units||0],
    ['Arrivals today',data.arrivals_today||0],
    ['Departures today',data.departures_today||0],
    ['Open maintenance',data.open_maintenance||0]
  ];
  const host=$('dashboardCards');host.replaceChildren();
  metrics.forEach(([label,value])=>{const card=document.createElement('div');card.className='metric';const strong=document.createElement('strong');strong.textContent=escapeText(value);const span=document.createElement('span');span.textContent=label;card.append(strong,span);host.append(card);});
}

function renderUnits(){
  table('unitsTable',[['Code','code'],['Name','name'],['Type','unit_type'],['Status','status'],['Capacity','max_guests'],['Version','version']],state.data.units);
}

function renderGuests(){
  table('guestsTable',[['Guest','display_name'],['Status','status'],['Guest ID',r=>short(r.guest_id)],['Customer ID',r=>short(r.customer_id)]],state.data.guests);
}

function renderBookings(){
  const canBooking=!!state.context.can_booking_manage,canStay=!!state.context.can_stay_manage;
  table('bookingsTable',[
    ['Booking',r=>short(r.id)],['Unit',r=>short(r.unit_id)],['Guest',r=>short(r.guest_id)],
    ['Arrival','arrival'],['Departure','departure'],['Status','status'],['Gross minor','total_minor'],['Currency','currency'],['Version','version']
  ],state.data.bookings,(row,host)=>{
    if(row.status==='DRAFT'&&canBooking){
      host.append(action('Confirm',()=>runCommand('booking.confirm',{booking_id:row.id,expected_version:row.version})));
      host.append(action('Cancel',()=>runCommand('booking.cancel',{booking_id:row.id,expected_version:row.version}),'button-danger'));
    }else if(row.status==='CONFIRMED'){
      if(canStay)host.append(action('Check-in',()=>runCommand('stay.check_in',{booking_id:row.id,expected_version:row.version})));
      if(canBooking)host.append(action('Cancel',()=>runCommand('booking.cancel',{booking_id:row.id,expected_version:row.version}),'button-danger'));
    }else if(row.status==='CHECKED_IN'&&canStay){
      host.append(action('Check-out',()=>runCommand('stay.check_out',{booking_id:row.id,expected_version:row.version})));
    }
  });
}

function renderCalendar(){
  table('calendarTable',[
    ['Unit','unit_code'],['Unit name','unit_name'],['Guest','guest_name'],['Arrival','arrival'],['Departure','departure'],
    ['Status','status'],['Adults','adults'],['Children','children'],['Source','source'],['Version','version']
  ],state.data.calendar);
}

function renderMaintenance(){
  const canManage=!!state.context.can_maintenance_manage;
  table('maintenanceTable',[
    ['Request',r=>short(r.id)],['Unit',r=>short(r.unit_id)],['Title','title'],['Category','category'],
    ['Priority','priority'],['Status','status'],['Assignee',r=>short(r.assigned_user_id)],['Version','version']
  ],state.data.maintenance,(row,host)=>{
    if(!canManage)return;
    if(['OPEN','ASSIGNED'].includes(row.status))host.append(action('Assign to me',()=>runCommand('maintenance.assign',{maintenance_id:row.id,assignee_user_id:state.context.user_id,expected_version:row.version})));
    if(row.status==='ASSIGNED')host.append(action('Start',()=>runCommand('maintenance.start',{maintenance_id:row.id,expected_version:row.version})));
    if(row.status==='IN_PROGRESS')host.append(action('Complete',()=>runCommand('maintenance.complete',{maintenance_id:row.id,expected_version:row.version})));
  });
}

function renderFinance(){
  table('financeTable',[
    ['Month','month'],['Currency','currency'],['Bookings','booking_count'],['Booking gross minor','booking_gross_minor'],['Unpriced','unpriced_booking_count']
  ],state.data.finance);
}

function fillSelects(){
  const units=Array.isArray(state.data.units)?state.data.units.filter(x=>x.status==='ACTIVE'):[];
  const guests=Array.isArray(state.data.guests)?state.data.guests.filter(x=>x.status==='ACTIVE'):[];
  for(const formId of ['bookingForm','maintenanceForm']){
    const select=$(formId).elements.unit_id;if(!select)continue;
    const current=select.value;select.replaceChildren();
    units.forEach(unit=>select.add(new Option(unit.code+' · '+unit.name,unit.id)));
    if([...select.options].some(o=>o.value===current))select.value=current;
  }
  const guestSelect=$('bookingForm').elements.guest_id;
  const current=guestSelect.value;guestSelect.replaceChildren();
  guests.forEach(guest=>guestSelect.add(new Option(guest.display_name,guest.guest_id)));
  if([...guestSelect.options].some(o=>o.value===current))guestSelect.value=current;
}

function renderAll(){
  renderDashboard();renderUnits();renderGuests();renderBookings();renderCalendar();renderMaintenance();renderFinance();fillSelects();
}

async function runCommand(type,payload){
  if(!state.context)return;
  setMessage('Выполняется '+type+'…');
  try{
    await api('/api/views/commands',{method:'POST',body:JSON.stringify({
      type,
      tenant_id:state.context.tenant_id,
      organization_id:state.context.organization_id,
      idempotency_key:crypto.randomUUID(),
      ...payload
    })});
    await loadAll();
  }catch(error){setMessage(humanError(error),true);}
}

function clearSession(){
  state.token=null;state.user=null;state.contexts=[];state.context=null;state.data={};
  $('workspace').hidden=true;$('loginPanel').hidden=false;$('signOut').hidden=true;$('sessionLabel').textContent='Не выполнен вход';
  $('password').value='';
}

async function signOut(){
  const token=state.token;
  if(token&&state.config){
    try{await fetch(state.config.supabaseUrl+'/auth/v1/logout',{method:'POST',headers:{apikey:state.config.publishableKey,authorization:'Bearer '+token}});}catch{}
  }
  clearSession();
}

$('loginForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const submit=event.submitter;submit.disabled=true;
  try{
    await signIn($('email').value.trim(),$('password').value);
    $('password').value='';
    setMessage('Аутентификация успешна.');
  }catch(error){
    clearSession();
    const node=document.createElement('p');node.className='message error';node.textContent=humanError(error);
    $('loginPanel').append(node);
  }finally{submit.disabled=false;}
});

$('organizationSelect').addEventListener('change',async event=>{
  state.context=state.contexts[Number(event.target.value)]||state.contexts[0];
  renderContextPicker();await loadAll();
});
$('refreshAll').addEventListener('click',loadAll);
$('signOut').addEventListener('click',signOut);

$('unitForm').addEventListener('submit',event=>{
  event.preventDefault();const data=new FormData(event.currentTarget);
  runCommand('unit.create',{code:String(data.get('code')||'').trim(),name:String(data.get('name')||'').trim(),unit_type:'APARTMENT',max_guests:Number(data.get('max_guests'))});
});
$('guestForm').addEventListener('submit',event=>{
  event.preventDefault();const data=new FormData(event.currentTarget);
  runCommand('guest.create',{display_name:String(data.get('display_name')||'').trim()});
});
$('bookingForm').addEventListener('submit',event=>{
  event.preventDefault();const data=new FormData(event.currentTarget);
  const payload={
    unit_id:data.get('unit_id'),guest_id:data.get('guest_id'),arrival:data.get('arrival'),departure:data.get('departure'),
    adults:Number(data.get('adults')),children:0,currency:String(data.get('currency')||'USD').toUpperCase(),source:'DIRECT'
  };
  const total=String(data.get('total_minor')||'').trim();if(total)payload.total_minor=Number(total);
  runCommand('booking.create',payload);
});
$('maintenanceForm').addEventListener('submit',event=>{
  event.preventDefault();const data=new FormData(event.currentTarget);
  runCommand('maintenance.create',{unit_id:data.get('unit_id'),title:String(data.get('title')||'').trim(),category:data.get('category'),priority:data.get('priority')});
});

loadConfig().catch(()=>{
  const badge=$('backendState');badge.textContent='Staging backend not configured';badge.classList.add('bad');
  $('loginForm').querySelector('button[type="submit"]').disabled=true;
});
})();
