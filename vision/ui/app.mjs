const $=id=>document.getElementById(id);
const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function load(){
 $('modules').innerHTML='<div class="loading">Загрузка Module Registry…</div>';
 try{
  const [modulesResponse,healthResponse]=await Promise.all([
   fetch('/api/vision/v1/modules',{cache:'no-store',credentials:'omit'}),
   fetch('/healthz',{cache:'no-store',credentials:'omit'})
  ]);
  if(!modulesResponse.ok||!healthResponse.ok)throw new Error('unavailable');
  const registry=await modulesResponse.json(),health=await healthResponse.json();
  if(registry.platform!=='vertex-vision'||registry.activeModule!=='views'||!Array.isArray(registry.modules)||registry.modules.length!==19)throw new Error('invalid_registry');
  const active=registry.modules.filter(m=>m.status==='active');
  if(active.length!==1||active[0].id!=='views'||registry.modules.filter(m=>m.id!=='views').some(m=>m.status!=='coming-soon'))throw new Error('invalid_release_state');
  $('moduleCount').textContent=registry.modules.length+' модулей · 1 active';
  $('modules').replaceChildren();
  for(const module of registry.modules){
   const article=document.createElement('article');article.className='module';article.dataset.module=module.id;
   const activeModule=module.id==='views'&&module.status==='active';
   article.innerHTML='<div class="module-top"><span class="module-icon">'+E(module.icon||'◻')+'</span><span class="state '+(activeModule?'active':'')+'">'+(activeModule?'ACTIVE':'COMING SOON')+'</span></div><h3>'+E(module.name)+'</h3><p>'+E(module.description?.ru||'')+'</p>';
   if(activeModule){const link=document.createElement('a');link.href='/views';link.dataset.open='views';link.textContent='Открыть Views Operations';article.append(link);}
   else{const button=document.createElement('button');button.type='button';button.disabled=true;button.textContent='Будущая ветка';article.append(button);}
   $('modules').append(article);
  }
  $('healthState').textContent=health.configured?'Staging backend configured':'Staging shell ready';
  $('healthCopy').textContent=health.configured?'Supabase staging configuration detected. Cloud E2E must still pass before release.':'UI/Worker готовы. Supabase staging ещё не подключён — бизнес-API fail-closed.';
 }catch{
  $('modules').innerHTML='<div class="error">Module Registry недоступен. Приложение не будет подставлять фиктивные ветки.</div>';
  $('healthState').textContent='Staging unavailable';$('healthCopy').textContent='Проверка Hub/Worker не прошла.';
 }
}
load();
