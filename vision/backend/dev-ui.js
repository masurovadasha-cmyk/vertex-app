let config, orders=[];const profile=document.querySelector('#profile'),message=document.querySelector('#message');
async function api(path,command){const r=await fetch(path,{method:command?'POST':'GET',headers:{'x-vision-profile':profile.value,'content-type':'application/json'},body:command?JSON.stringify(command):undefined});const body=await r.json();if(!r.ok)throw new Error(body.error);return body;}
function cell(row,value){const td=document.createElement('td');td.textContent=value;row.append(td);return td;}
async function refresh(){
  const audit=profile.value==='audit';orders=await api(audit?'/api/audit':'/api/orders');
  document.querySelector('#title').textContent=audit?'Журнал аудита':'Заказы';
  document.querySelector('#columns').innerHTML=audit?'<tr><th>Событие</th><th>Заказ</th><th>Время</th></tr>':'<tr><th>Заказ</th><th>Статус</th><th>Версия</th><th>Действие</th></tr>';
  const rows=document.querySelector('#rows');rows.replaceChildren();document.querySelector('#empty').hidden=orders.length>0;
  document.querySelector('#create').hidden=!['guest','views'].includes(profile.value);
  for(const order of orders){const tr=document.createElement('tr');rows.append(tr);if(audit){cell(tr,order.action);cell(tr,order.entity_id.slice(0,8));cell(tr,new Date(order.created_at).toLocaleTimeString());continue;}
    cell(tr,order.public_no.slice(0,10));cell(tr,order.status);cell(tr,order.version);const actions=cell(tr,'');
    const buttons=profile.value==='dispatcher'&&order.status==='NEW'?[['assign','Назначить сотрудника']]:profile.value==='staff'&&order.status==='ACCEPTED'?[['start','Начать']]:profile.value==='staff'&&order.status==='IN_PROGRESS'?[['submit','На проверку']]:profile.value==='quality'&&order.status==='QUALITY'?[['pass','Принять'],['reject','На доработку']]:[];
    for(const [type,label] of buttons){const button=document.createElement('button');button.textContent=label;actions.append(button);button.onclick=()=>run({...base(type),order_id:order.id,expected_version:order.version,...(type==='assign'?{assignee_user_id:config.demo.staff_id}:{})});}
  }
}
function base(type){return {type,tenant_id:config.demo.tenant_id,idempotency_key:crypto.randomUUID()};}
async function run(command){document.querySelectorAll('button').forEach(b=>b.disabled=true);try{const result=await api('/api/commands',command);message.textContent='Сохранено: '+result.status;await refresh();}catch(e){message.textContent='Не выполнено: '+e.message;}finally{document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
profile.onchange=()=>{message.textContent='';refresh().catch(e=>message.textContent=e.message);};
document.querySelector('#refresh').onclick=()=>refresh().catch(e=>message.textContent=e.message);
document.querySelector('#create').onclick=()=>run({...base('create'),customer_id:config.demo.customer_id,requester_organization_id:config.demo.views_id,service_id:config.demo.service_id});
fetch('/api/profiles').then(r=>r.json()).then(async data=>{config=data;for(const p of data.profiles){const o=document.createElement('option');o.value=p.key;o.textContent=p.name;profile.append(o);}await refresh();}).catch(e=>message.textContent=e.message);
