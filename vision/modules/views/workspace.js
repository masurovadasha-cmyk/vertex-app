import {createCommandClient} from '/modules/views/command-client.mjs';
const $=id=>document.getElementById(id),statuses={NEW:'Ожидает назначения',ACCEPTED:'Сотрудник назначен',IN_PROGRESS:'В работе',QUALITY:'Проверка качества',COMPLETED:'Завершено',CANCELLED:'Отменено'};
let setup,client,refreshVersion=0;
async function get(path){const r=await fetch(path,{headers:{'x-vision-profile':'views'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Не удалось загрузить данные. Нажмите «Обновить».');return r.json();}
async function refresh(){
  if(!setup)throw new Error('Данные направления ещё загружаются.');
  const version=++refreshVersion;const orders=await get('/api/orders');if(version!==refreshVersion)return;
  const visible=orders.filter(o=>o.requester_organization_id===setup.demo.views_id);
  $('active').textContent=visible.filter(o=>['NEW','ACCEPTED','IN_PROGRESS'].includes(o.status)).length;
  $('quality').textContent=visible.filter(o=>o.status==='QUALITY').length;
  $('completed').textContent=visible.filter(o=>o.status==='COMPLETED').length;
  $('orders').replaceChildren();$('empty').hidden=visible.length>0;
  for(const o of visible){const row=document.createElement('article');row.className='order';const info=document.createElement('div');const title=document.createElement('strong');title.textContent='Уборка · '+o.public_no.slice(0,10);const detail=document.createElement('small');detail.textContent='Версия '+o.version+' · '+new Date(o.created_at).toLocaleString('ru-RU');info.append(title,detail);const status=document.createElement('span');status.className='status'+(o.status==='COMPLETED'?' done':'');status.textContent=statuses[o.status]||o.status;row.append(info,status);$('orders').append(row);}
}
function label(){$('create').textContent=client?.pending?'Повторить незавершённый запрос':'Создать тестовый запрос';}
$('refresh').onclick=async()=>{try{await refresh();$('message').textContent='Данные обновлены.';}catch(e){$('message').textContent=e.message;}};
$('create').onclick=async()=>{
  $('create').disabled=true;
  try{await client.submit({tenant_id:setup.demo.tenant_id,customer_id:setup.demo.customer_id,requester_organization_id:setup.demo.views_id,service_id:setup.demo.service_id});$('message').textContent='Запрос передан команде Cleaning.';await refresh();}
  catch(e){$('message').textContent=e.message;}
  finally{label();$('create').disabled=false;}
};
try{
  const [profiles,modules]=await Promise.all([get('/api/profiles'),get('/api/modules')]);setup=profiles;
  const views=modules.find(m=>m.id==='views');if(!views)throw new Error('Направление Views недоступно.');
  $('red-app').href=views.entrypoint.url;$('red-app').hidden=false;
  client=createCommandClient({storage:sessionStorage});label();await refresh();
  $('message').textContent=client.pending?'Есть неподтверждённый запрос. Повтор будет безопасным.':'';$('create').disabled=false;
}catch(e){$('message').textContent=e.message;}
