import {createClient,prepareCommand,bookingActions,cleaningActions,UUID} from './client.mjs';
import {createAuthClient} from './auth.mjs';
const $=id=>document.getElementById(id);
const element=(tag,text='',className='')=>{const node=document.createElement(tag);node.textContent=String(text);if(className)node.className=className;return node;};
const labels={confirm_booking:'Подтвердить',cancel_booking:'Отменить',check_in:'Заселить',check_out:'Оформить выезд',cleaning_start:'Начать уборку',cleaning_submit:'Передать на проверку',cleaning_verify:'Подтвердить качество'};
const states={READY:'Готова',OCCUPIED:'Занята',CLEANING:'Уборка',MAINTENANCE:'Ремонт',BLOCKED:'Заблокирована',INACTIVE:'Неактивна',PENDING:'Ожидает подтверждения',CONFIRMED:'Подтверждено',CHECKED_IN:'Гость проживает',CHECKED_OUT:'Гость выехал',COMPLETED:'Завершено',CANCELLED:'Отменено',NO_SHOW:'Неявка',REQUIRED:'Нужна уборка',IN_PROGRESS:'В работе',INSPECTION:'Проверка',VERIFIED:'Проверено'};
let session=null,authSession=null,authContext=null,data=null,pending=null,busy=false,revision=0,loadNumber=0,controller=null;
const client=createClient({getToken:()=>session?.token,getScope:()=>session?.scope});
const auth=createAuthClient();
function message(text){$('message').textContent=text;}
function day(value,delta){const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);}
const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
const part=t=>parts.find(p=>p.type===t).value;
$('from').value=`${part('year')}-${part('month')}-${part('day')}`;$('to').value=day($('from').value,30);
function controls(){
 document.querySelectorAll('[data-command],#bookingForm button').forEach(b=>b.disabled=busy||!!pending||navigator.onLine===false||!data);
 $('retry').disabled=busy||navigator.onLine===false;
 $('uncertain').hidden=!pending;$('network').hidden=navigator.onLine!==false;
 document.querySelector('#rangeForm button').disabled=busy;
 document.querySelector('#connectForm button').disabled=busy;
 document.querySelector('#scopeForm button').disabled=busy;
}
function tab(name){
 if(!['hub','dashboard','calendar','bookings','cleaning'].includes(name))name='hub';
 document.querySelectorAll('[data-panel]').forEach(n=>n.hidden=n.dataset.panel!==name);
 document.querySelectorAll('[data-tab]').forEach(n=>{if(n.dataset.tab===name)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
}
function empty(node,text){node.replaceChildren(element('p',text,'empty'));}
function clearData(){data=null;for(const name of ['modules','summary','calendar','bookings','cleaning'])$(name).replaceChildren();$('newBooking').hidden=true;$('updated').textContent='';$('truncated').hidden=true;}
function logout(){
 const previous=authSession;
 revision++;loadNumber++;controller?.abort();session=null;authSession=null;authContext=null;pending=null;busy=false;clearData();
 $('workspace').hidden=true;$('scope').hidden=true;$('connect').hidden=false;$('logout').hidden=true;$('connectForm').reset();$('scopeForm').reset();controls();
 message('Сеанс завершён. Токены и загруженные данные удалены из памяти.');
 if(previous)auth.signOut(previous).catch(()=>{});
}
function errorText(error){return ({invalid_credentials:'Неверный email или пароль staging.',auth_rate_limited:'Слишком много попыток входа. Повторите позже.',invalid_refresh_token:'Сеанс нельзя обновить. Выполните вход заново.',no_access:'У пользователя нет доступа к Views Operations.',unauthorized:'Тестовый сеанс истёк или недействителен. Подключитесь заново.',forbidden:'Нет разрешения для выбранной организации.',backend_not_configured:'Supabase staging ещё не настроен. Данные не подменяются демонстрационными.',auth_unavailable:'Сервис входа временно недоступен.',backend_unavailable:'Не удалось получить подтверждённый ответ сервера.',offline:'Нет подключения к сети.',network_error:'Нет ответа от сервера.',invalid_scope:'Проверьте UUID организации и tenant.',invalid_date_range:'Выберите период от 1 до 31 дня.',invalid_booking:'Проверьте клиента, даты и стоимость бронирования.',invalid_response:'Сервер вернул неожиданный ответ.',conflict:'Данные изменились или даты пересекаются. Обновите выборку.',invalid_command:'Сервер отклонил операцию. Проверьте статус и данные.'})[error.code]||'Операция не подтверждена. Обновите данные.';}
async function ensureFresh(){
 if(!authSession||!session)return;
 if(Date.now()+30000<authSession.expiresAt)return;
 const next=await auth.refresh(authSession.refreshToken);
 if(next.userId!==authSession.userId)throw Object.assign(new Error('unauthorized'),{code:'unauthorized',status:401});
 authSession=next;session={...session,token:next.accessToken,refreshToken:next.refreshToken,expiresAt:next.expiresAt};
}
async function load(){
 if(!session)return;const own=revision,number=++loadNumber;controller?.abort();controller=new AbortController();
 const from=$('from').value,to=$('to').value;busy=true;controls();message('Загрузка данных staging…');
 try{await ensureFresh();if(own!==revision||number!==loadNumber)return;const next=await client.load({from,to,signal:controller.signal});if(own!==revision||number!==loadNumber)return;data=next;render();$('workspace').hidden=false;$('connect').hidden=true;$('scope').hidden=true;$('logout').hidden=false;message('Данные получены от API. Изменения выполняются только на сервере.');}
 catch(error){if(own!==revision||number!==loadNumber)return;clearData();if(error.status===401||error.status===403){logout();}message(errorText(error));}
 finally{if(own===revision&&number===loadNumber){busy=false;controls();}}
}
function actions(node,record,kinds){const bar=element('div','','actions');for(const type of kinds){const b=element('button',labels[type]);b.type='button';b.dataset.command=type;b.addEventListener('click',()=>execute(type,record));bar.append(b);}node.append(bar);}
function render(){
 $('modules').replaceChildren();for(const m of data.modules){const card=element('article','','card');card.append(element('h3',m.name));const active=m.id==='views'&&m.state==='ACTIVE';card.append(element('p',active?'ACTIVE · операционная панель':'COMING SOON · будущая ветка'));const b=element('button',active?'Открыть Views':'Пока недоступно',active?'':'secondary');b.type='button';b.disabled=!active;if(active)b.onclick=()=>tab('dashboard');card.append(b);$('modules').append(card);}
 $('summary').replaceChildren();const counts=data.unit_status_counts||{};
 for(const [label,value] of [['Квартиры в организации',data.units.available?data.units.total:'Нет доступа'],['Готовы',data.units.available?counts.READY||0:'—'],['Заняты',data.units.available?counts.OCCUPIED||0:'—'],['На уборке',data.units.available?counts.CLEANING||0:'—'],['Брони за выбранный период',data.bookings.available?data.bookings.total:'Нет доступа'],['Незавершённые уборки',data.cleaning.available?data.cleaning.total:'Нет доступа']]){const c=element('article','','card');c.append(element('p',label),element('div',value,'metric'));$('summary').append(c);}
 $('updated').textContent='Снимок API: '+data.generated_at;
 $('truncated').hidden=!['units','bookings','cleaning'].some(k=>data[k].truncated);
 const unitName=id=>data.units.items.find(u=>u.id===id)?.unit_number||id;
 for(const [section,title,getActions] of [['bookings','Бронирований в выбранном периоде нет.',bookingActions],['cleaning','Незавершённых уборок нет.',cleaningActions]]){
  const box=$(section),items=data[section].items;box.replaceChildren();
  if(!data[section].available){empty(box,'Этот раздел недоступен для вашей роли.');continue;}if(!items.length){empty(box,title);continue;}
  for(const item of items){const c=element('article','','card');c.dataset.record=item.id;c.append(element('h3',(item.public_no||'Уборка')+' · '+unitName(item.unit_id)),element('p',states[item.status]||item.status));if(section==='bookings')c.append(element('p',item.check_in+' → '+item.check_out));actions(c,item,getActions(item.status,data.permissions));box.append(c);}
 }
 renderCalendar(unitName);
 const canCreate=data.permissions.includes('views.booking.create')&&data.units.available;$('newBooking').hidden=!canCreate;
 const select=$('bookingForm').elements.unit_id,previous=select.value;select.replaceChildren();for(const u of data.units.items){const o=element('option',u.unit_number);o.value=u.id;select.append(o);}if([...select.options].some(o=>o.value===previous))select.value=previous;
 $('bookingForm').elements.check_in.value=$('from').value;$('bookingForm').elements.check_out.value=day($('from').value,1);controls();
}
function renderCalendar(){
 const box=$('calendar');box.replaceChildren();if(!data.units.available||!data.bookings.available){empty(box,'Нет доступа к календарю.');return;}if(!data.units.items.length){empty(box,'Квартиры ещё не заведены в staging.');return;}
 const table=element('table'),caption=element('caption','Бронирования '+data.from+' → '+data.to+' (дата выезда не включается)'),head=element('tr');table.append(caption);head.append(element('th','Квартира'));const days=[];for(let d=data.from;d<data.to;d=day(d,1)){days.push(d);head.append(element('th',d.slice(5)));}const thead=element('thead');thead.append(head);table.append(thead);const tbody=element('tbody');
 for(const unit of data.units.items){const row=element('tr');const label=element('th',unit.unit_number);label.scope='row';row.append(label);for(const d of days){const cell=element('td');const bookings=data.bookings.items.filter(b=>b.unit_id===unit.id&&b.check_in<=d&&b.check_out>d&&!['CANCELLED','NO_SHOW'].includes(b.status));for(const booking of bookings){const b=element('button',booking.public_no);b.type='button';b.title=states[booking.status]||booking.status;b.onclick=()=>{tab('bookings');document.querySelector(`[data-record="${booking.id}"]`)?.scrollIntoView({block:'center'});};cell.append(b);cell.className=booking.status==='PENDING'?'pending':'busy';}if(!bookings.length)cell.textContent='—';row.append(cell);}tbody.append(row);}table.append(tbody);box.append(table);
}
async function execute(type,record=null,fields={}){
 if(!session||busy||pending||!data||navigator.onLine===false)return;
 if(type!=='create_booking'&&!window.confirm(labels[type]+'? Статус и связанные операции изменит сервер.'))return;
 let command;try{command=prepareCommand(type,record,session.scope,fields);}catch(error){message(errorText(error));return;}
 await send(command);
}
async function send(command){
 if(!session||busy)return;const own=revision;busy=true;controls();message('Ожидается подтверждение операции…');
 try{await ensureFresh();if(own!==revision)return;await client.send(command);if(own!==revision)return;pending=null;busy=false;await load();}
 catch(error){if(own!==revision)return;if(error.uncertain){pending=command;message('Ответ не получен. Операция могла выполниться. Сохранена исходная команда для безопасного повтора.');}else{pending=null;if(error.status===401||error.status===403){logout();}message(errorText(error));}}
 finally{if(own===revision){busy=false;controls();}}
}
function activateOrganization(organization){
 if(!authSession||!authContext||!organization)return;
 revision++;controller?.abort();clearData();pending=null;
 session={scope:{tenant:authContext.tenantId,organization:organization.id},token:authSession.accessToken,refreshToken:authSession.refreshToken,expiresAt:authSession.expiresAt,userId:authSession.userId};
 load();
}
$('connectForm').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;const f=event.currentTarget,email=f.elements.email.value.trim(),password=f.elements.password.value;f.elements.password.value='';
 busy=true;controls();message('Проверка Supabase staging…');
 try{
  const next=await auth.signIn(email,password),context=await auth.context(next);
  if(!context.organizations.length){await auth.signOut(next).catch(()=>{});throw Object.assign(new Error('no_access'),{code:'no_access'});}
  authSession=next;authContext=context;$('connect').hidden=true;$('logout').hidden=false;
  if(context.organizations.length===1){activateOrganization(context.organizations[0]);return;}
  const select=$('scopeForm').elements.organization;select.replaceChildren();
  for(const organization of context.organizations){const option=element('option',organization.name+' · '+organization.code);option.value=organization.id;select.append(option);}
  $('scope').hidden=false;message('Вход подтверждён. Выберите разрешённую организацию.');
 }catch(error){authSession=null;authContext=null;session=null;$('connect').hidden=false;$('scope').hidden=true;$('logout').hidden=true;message(errorText(error));}
 finally{busy=false;controls();}
});
$('scopeForm').addEventListener('submit',event=>{event.preventDefault();const id=event.currentTarget.elements.organization.value;const organization=authContext?.organizations.find(item=>item.id===id);if(!organization){message('Организация недоступна.');return;}activateOrganization(organization);});
$('rangeForm').addEventListener('submit',event=>{event.preventDefault();if(!busy)load();});
$('bookingForm').addEventListener('submit',event=>{event.preventDefault();execute('create_booking',null,Object.fromEntries(new FormData(event.currentTarget)));});
$('logout').addEventListener('click',logout);$('retry').addEventListener('click',()=>{if(pending&&!busy)send(pending);});
for(const b of document.querySelectorAll('[data-tab]'))b.addEventListener('click',()=>tab(b.dataset.tab));
window.addEventListener('offline',controls);window.addEventListener('online',controls);window.addEventListener('pagehide',()=>{revision++;controller?.abort();session=null;authSession=null;authContext=null;pending=null;clearData();});
controls();tab('hub');
