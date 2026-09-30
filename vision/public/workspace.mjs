import {createCloudClient} from '/cloud-client.mjs';
const $=id=>document.getElementById(id),message=text=>{$('message').textContent=text;};
const client=createCloudClient({storage:sessionStorage});
let nextCursor=null,feedVersion=0;
const states={NEW:'Новая',ACCEPTED:'Назначена',IN_PROGRESS:'В работе',QUALITY:'Контроль качества',COMPLETED:'Завершена',CANCELLED:'Отменена'};
function loggedOut(){ feedVersion++;nextCursor=null;$('more').hidden=true;$('account').hidden=true;$('login').hidden=false;$('orders').replaceChildren();$('name').textContent='';$('scope').textContent=''; }
async function refresh(append=false){
 const version=++feedVersion;
 try{const page=await client.orders(append?nextCursor:null);if(version!==feedVersion)return;
  const orders=page.orders;nextCursor=page.nextCursor;$('more').hidden=!nextCursor;if(!append)$('orders').replaceChildren();
  if(!orders.length){const p=document.createElement('p');p.textContent='Доступных заявок пока нет.';$('orders').append(p);}
  for(const order of orders){const row=document.createElement('div');row.className='order';const title=document.createElement('strong');title.textContent=order.public_no;const status=document.createElement('span');status.className='status';status.textContent=states[order.status]||order.status;row.append(title,status);$('orders').append(row);}
 }catch(e){if(!client.scope)loggedOut();throw e;}
}
$('login-form').addEventListener('submit',async e=>{
 e.preventDefault();$('sign-in').disabled=true;message('Проверяем вход…');
 try{const profile=await client.login($('email').value.trim(),$('password').value);$('login').hidden=true;$('account').hidden=false;$('name').textContent=profile.display_name;
  $('scope').textContent=profile.memberships.map(m=>m.name).join(' · ')||'Гостевой доступ';
  for(const [id,items,label] of [['request-context',profile.request_contexts,c=>c.customer_name+' / '+c.organization_name],['service',profile.services,s=>s.name]]){
   $(id).replaceChildren();items.forEach((item,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=label(item);$(id).append(option);});
  }
  $('request-form').hidden=!profile.request_contexts.length||!profile.services.length;
  await refresh();message('Вход выполнен. Доступ ограничен вашей ролью.');
 }catch(error){message(error.message);}finally{$('password').value='';$('sign-in').disabled=false;}
});
$('refresh').addEventListener('click',async()=>{ $('refresh').disabled=true;try{await refresh();message('Заявки обновлены.');}catch(e){message(e.message);}finally{$('refresh').disabled=false;} });
$('more').addEventListener('click',async()=>{$('more').disabled=true;try{await refresh(true);}catch(e){message(e.message);}finally{$('more').disabled=false;}});
$('sign-out').addEventListener('click',async()=>{loggedOut();await client.logout();message('Вы вышли из VISION.');});
$('request-form').addEventListener('submit',async e=>{e.preventDefault();$('create-request').disabled=true;
 try{const p=client.scope,context=p.request_contexts[Number($('request-context').value)],service=p.services[Number($('service').value)];
  if(!context||!service)throw new Error('Выберите гостя и услугу.');
  const result=await client.createRequest({customer_id:context.customer_id,requester_organization_id:context.requester_organization_id,service_id:service.id});
  await refresh();message('Заявка сохранена: '+result.order_id);$('create-request').textContent='Создать заявку';
 }catch(error){message(error.message);$('create-request').textContent='Повторить отправку';if(!client.scope)loggedOut();}finally{$('create-request').disabled=false;}
});
try{await client.configure();$('sign-in').disabled=false;message('Введите данные вашей учётной записи VISION.');}catch(e){message(e.message);}
