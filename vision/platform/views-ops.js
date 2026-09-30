/* VERTEX VISION / Views Operations UI. Real data only; no demo fallback inside this workspace. */
(function(root){
  'use strict';
  if(!root.document||root.VertexVisionViews)return;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const icon=name=>root.VertexVisionDesign?.icon(name)||'';
  const T=(ru,en)=>document.documentElement.lang==='en'?en:ru;
  const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const today=()=>new Date().toISOString().slice(0,10);
  const money=(value,currency='USD')=>new Intl.NumberFormat(document.documentElement.lang==='en'?'en-US':'ru-RU',{style:'currency',currency,maximumFractionDigits:2}).format(Number(value)||0);
  const state={tab:'dashboard',session:null,loading:false,error:null,data:{bookings:[],units:[],cleaning:[]},dialog:null,root:null,lastFocus:null};

  function configured(){return !!(state.session&&UUID.test(state.session.tenantId)&&UUID.test(state.session.organizationId)&&typeof state.session.token==='string'&&state.session.token.length>10);}
  function can(permission){return !!state.session?.permissions?.includes(permission);}
  function errorText(code,status){
    const map={
      unauthorized:T('Сессия недействительна. Выполните вход заново.','Session is invalid. Sign in again.'),
      forbidden:T('У вас нет доступа к этой операции.','You do not have permission for this action.'),
      conflict:T('Данные уже изменились или даты пересекаются. Обновите экран.','Data changed or dates overlap. Refresh the workspace.'),
      invalid_command:T('Операция недоступна для текущего состояния.','The action is not valid for the current state.'),
      backend_unavailable:T('Сервис Views временно недоступен.','Views service is temporarily unavailable.'),
      backend_not_configured:T('Staging backend ещё не настроен.','The staging backend is not configured yet.')
    };
    return map[code]||T('Не удалось выполнить запрос.','The request could not be completed.')+' ('+status+')';
  }
  async function api(path,options={}){
    if(!configured())throw Object.assign(new Error('session_required'),{code:'session_required',status:401});
    const headers={'authorization':'Bearer '+state.session.token,...options.headers};
    if(options.body)headers['content-type']='application/json';
    let response;
    try{response=await fetch(path,{...options,headers,cache:'no-store'});}
    catch{throw Object.assign(new Error('network_error'),{code:'network_error',status:0});}
    let body=null;try{body=await response.json();}catch{}
    if(!response.ok)throw Object.assign(new Error(body?.error||'request_failed'),{code:body?.error||'request_failed',status:response.status});
    return body;
  }
  async function read(path){
    const join=path.includes('?')?'&':'?';
    return api(path+join+'tenant_id='+encodeURIComponent(state.session.tenantId));
  }
  async function refresh(){
    if(!configured()){state.error=null;render();return;}
    state.loading=true;state.error=null;render();
    try{
      const [bookings,units,cleaning]=await Promise.all([
        read('/api/v1/views/bookings'),
        read('/api/v1/views/units'),
        read('/api/v1/views/cleaning')
      ]);
      state.data={bookings:Array.isArray(bookings)?bookings:[],units:Array.isArray(units)?units:[],cleaning:Array.isArray(cleaning)?cleaning:[]};
    }catch(error){state.error=error;}
    finally{state.loading=false;render();}
  }
  async function command(type,fields){
    if(!configured())return;
    state.loading=true;state.error=null;render();
    try{
      await api('/api/v1/views/commands',{method:'POST',body:JSON.stringify({
        type,tenant_id:state.session.tenantId,idempotency_key:crypto.randomUUID(),...fields
      })});
      await refresh();
    }catch(error){state.loading=false;state.error=error;render();}
  }

  function ensure(){
    if(state.dialog?.isConnected)return;
    const dialog=document.createElement('dialog');dialog.id='visionViewsOperations';dialog.className='vvo-dialog';
    const box=document.createElement('div');box.className='vvo-shell';dialog.append(box);
    dialog.addEventListener('close',()=>{if(state.lastFocus?.isConnected)state.lastFocus.focus({preventScroll:true});});
    dialog.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.vvoClose!==undefined){dialog.close();return;}
      if(button.dataset.vvoTab){state.tab=button.dataset.vvoTab;render();return;}
      if(button.dataset.vvoRefresh!==undefined){refresh();return;}
      if(button.dataset.vvoDemo!==undefined){dialog.close();root.VertexHostConsole?.open?.('today');return;}
      if(button.dataset.vvoCommand){
        const payload={};
        if(button.dataset.bookingId){payload.booking_id=button.dataset.bookingId;payload.expected_version=Number(button.dataset.version);}
        if(button.dataset.cleaningId){payload.cleaning_job_id=button.dataset.cleaningId;payload.expected_version=Number(button.dataset.version);}
        command(button.dataset.vvoCommand,payload);
      }
    });
    document.body.append(dialog);state.dialog=dialog;state.root=box;
  }

  function badge(status){return '<span class="vvo-status vvo-status-'+E(String(status).toLowerCase().replaceAll('_','-'))+'">'+E(status)+'</span>';}
  function empty(title,copy){return '<section class="vvo-empty"><strong>'+E(title)+'</strong><p>'+E(copy)+'</p></section>';}
  function loading(){return '<section class="vvo-loading" aria-busy="true"><span></span><span></span><span></span></section>';}
  function summary(){
    const d=state.data,date=today(),units=d.units;
    const values=[
      [T('Апартаменты','Units'),units.length],
      [T('Занято','Occupied'),units.filter(x=>x.status==='OCCUPIED').length],
      [T('Готово','Ready'),units.filter(x=>x.status==='READY').length],
      [T('Уборка','Cleaning'),units.filter(x=>x.status==='CLEANING').length],
      [T('Заезды сегодня','Arrivals today'),d.bookings.filter(x=>x.check_in===date&&['CONFIRMED','CHECKED_IN'].includes(x.status)).length],
      [T('Выезды сегодня','Departures today'),d.bookings.filter(x=>x.check_out===date&&['CHECKED_IN','CHECKED_OUT','COMPLETED'].includes(x.status)).length]
    ];
    return '<div class="vvo-kpis">'+values.map(([label,value])=>'<article><span>'+E(label)+'</span><strong>'+E(value)+'</strong></article>').join('')+'</div>';
  }
  function dashboard(){
    const active=state.data.bookings.filter(x=>!['COMPLETED','CANCELLED','NO_SHOW'].includes(x.status)).slice(0,6);
    const clean=state.data.cleaning.filter(x=>x.status!=='VERIFIED').slice(0,6);
    return summary()+'<div class="vvo-columns"><section><div class="vvo-section-head"><h3>'+T('Активные бронирования','Active bookings')+'</h3></div>'+
      (active.length?active.map(bookingRow).join(''):empty(T('Нет активных бронирований','No active bookings'),T('Рабочая база не содержит активных бронирований.','The operational database has no active bookings.')))+'</section>'+
      '<section><div class="vvo-section-head"><h3>'+T('Очередь уборки','Cleaning queue')+'</h3></div>'+
      (clean.length?clean.map(cleaningRow).join(''):empty(T('Очередь пуста','Queue is empty'),T('Нет незавершённых задач уборки.','There are no unfinished cleaning jobs.')))+'</section></div>';
  }
  function bookingActions(item){
    if(!can('views.booking.manage'))return '';
    const actions={PENDING:[['confirm_booking',T('Подтвердить','Confirm')],['cancel_booking',T('Отменить','Cancel')]],CONFIRMED:[['check_in',T('Check-in','Check in')],['cancel_booking',T('Отменить','Cancel')]],CHECKED_IN:[['check_out',T('Check-out','Check out')]]}[item.status]||[];
    return '<div class="vvo-row-actions">'+actions.map(([action,label])=>'<button data-vvo-command="'+action+'" data-booking-id="'+E(item.id)+'" data-version="'+E(item.version)+'">'+E(label)+'</button>').join('')+'</div>';
  }
  function bookingRow(item){
    const unit=state.data.units.find(x=>x.id===item.unit_id);
    return '<article class="vvo-row"><div><small>'+E(item.public_no||item.id)+'</small><strong>'+E(unit?.unit_number||T('Апартамент','Unit'))+'</strong><span>'+E(item.check_in)+' → '+E(item.check_out)+'</span></div><div>'+badge(item.status)+'<b>'+E(money(item.total,item.currency))+'</b>'+bookingActions(item)+'</div></article>';
  }
  function bookings(){
    const rows=[...state.data.bookings].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    return '<div class="vvo-section-head"><h3>'+T('Бронирования','Bookings')+'</h3><span>'+rows.length+'</span></div>'+
      (rows.length?rows.map(bookingRow).join(''):empty(T('Бронирований нет','No bookings'),T('Рабочая staging-база пока пуста. Демо-данные здесь не подставляются.','The staging database is empty. Demo data is never substituted here.')));
  }
  function units(){
    const rows=[...state.data.units].sort((a,b)=>String(a.unit_number).localeCompare(String(b.unit_number),undefined,{numeric:true}));
    return '<div class="vvo-section-head"><h3>'+T('Апартаменты','Units')+'</h3><span>'+rows.length+'</span></div>'+
      (rows.length?'<div class="vvo-unit-grid">'+rows.map(item=>'<article><div><small>'+T('Апартамент','Unit')+'</small><strong>'+E(item.unit_number)+'</strong></div>'+badge(item.status)+'<p>'+E(item.unit_type||'—')+'</p></article>').join('')+'</div>':empty(T('Апартаменты не добавлены','No units'),T('Добавьте объекты в staging-базу Views.','Add Views units to the staging database.')));
  }
  function cleaningActions(item){
    const allowed=item.status==='INSPECTION'?can('views.cleaning.verify'):can('views.cleaning.execute');
    if(!allowed)return '';
    const next={REQUIRED:['cleaning_start',T('Начать','Start')],IN_PROGRESS:['cleaning_submit',T('На проверку','Submit')],INSPECTION:['cleaning_verify',T('Подтвердить','Verify')]}[item.status];
    return next?'<button data-vvo-command="'+next[0]+'" data-cleaning-id="'+E(item.id)+'" data-version="'+E(item.version)+'">'+E(next[1])+'</button>':'';
  }
  function cleaningRow(item){
    const unit=state.data.units.find(x=>x.id===item.unit_id);
    return '<article class="vvo-row"><div><small>'+T('Уборка после выезда','Checkout cleaning')+'</small><strong>'+E(unit?.unit_number||item.unit_id)+'</strong><span>'+E(item.created_at?new Date(item.created_at).toLocaleString(): '')+'</span></div><div>'+badge(item.status)+'<div class="vvo-row-actions">'+cleaningActions(item)+'</div></div></article>';
  }
  function cleaning(){
    const rows=[...state.data.cleaning].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    return '<div class="vvo-section-head"><h3>'+T('Уборка','Cleaning')+'</h3><span>'+rows.length+'</span></div>'+
      (rows.length?rows.map(cleaningRow).join(''):empty(T('Задач нет','No cleaning jobs'),T('После check-out задача появится здесь автоматически.','A job appears here automatically after check-out.')));
  }
  function calendar(){
    const units=[...state.data.units].sort((a,b)=>String(a.unit_number).localeCompare(String(b.unit_number),undefined,{numeric:true}));
    if(!units.length)return empty(T('Календарь пуст','Calendar is empty'),T('Сначала добавьте апартаменты в staging.','Add units to staging first.'));
    return '<div class="vvo-section-head"><h3>'+T('Календарь размещения','Stay calendar')+'</h3><span>'+T('активные и будущие','active & upcoming')+'</span></div><div class="vvo-calendar">'+units.map(unit=>{
      const rows=state.data.bookings.filter(x=>x.unit_id===unit.id&&!['CANCELLED','NO_SHOW'].includes(x.status)).sort((a,b)=>a.check_in.localeCompare(b.check_in));
      return '<article><strong>'+E(unit.unit_number)+'</strong><div>'+(rows.length?rows.map(x=>'<span title="'+E(x.status)+'"><b>'+E(x.check_in.slice(5))+'</b> → <b>'+E(x.check_out.slice(5))+'</b> '+badge(x.status)+'</span>').join(''):'<em>'+T('Свободно','No bookings')+'</em>')+'</div></article>';
    }).join('')+'</div>';
  }
  function content(){
    if(!configured())return '<div class="vs-unavailable-kpis" aria-label="'+T('Показатели ещё не загружены','Metrics are not loaded')+'">'+[T('Апартаменты','Units'),T('Заезды','Arrivals'),T('Задачи','Tasks')].map(label=>'<article><span>'+E(label)+'</span><b>—</b></article>').join('')+'</div><section class="vvo-connect"><strong>'+T('Рабочее подключение не настроено','Operational connection is not configured')+'</strong><p>'+T('Этот экран не подставляет демо-данные. Для реальной работы нужны staging Auth session и tenant ID.','This workspace never substitutes demo data. A staging Auth session and tenant ID are required for real operations.')+'</p><button data-vvo-demo>'+T('Открыть отдельный демо Host Studio','Open separate demo Host Studio')+'</button></section>';
    if(typeof navigator!=='undefined'&&navigator.onLine===false)return empty(T('Нет сети','Offline'),T('Критические операции отключены до восстановления соединения.','Critical actions are disabled until connectivity returns.'));
    if(state.loading)return loading();
    if(state.error){
      const text=state.error.code==='network_error'?T('Нет соединения с backend Views.','Cannot reach the Views backend.'):state.error.code==='session_required'?T('Нужна рабочая сессия.','An operational session is required.'):errorText(state.error.code,state.error.status);
      return '<section class="vvo-error"><strong>'+E(text)+'</strong><button data-vvo-refresh>'+T('Повторить','Retry')+'</button></section>';
    }
    return ({dashboard,calendar,bookings,units,cleaning}[state.tab]||dashboard)();
  }
  function render(){
    ensure();
    const tabs=[['dashboard',T('Главная','Dashboard')],['calendar',T('Календарь','Calendar')],['bookings',T('Брони','Bookings')],['units',T('Апартаменты','Units')],['cleaning',T('Уборка','Cleaning')]];
    state.root.innerHTML='<header class="vvo-head"><div><div class="vs-views-identity">'+icon('views')+'<div><small>VERTEX VISION / VIEWS</small><h2>Views</h2><span>Hotel &amp; Apartments</span></div></div><p>'+T('Реальные staging-данные · без фиктивных показателей','Real staging data · no fabricated metrics')+'</p></div><div class="vvo-head-actions"><span class="vvo-connection '+(configured()?'is-on':'')+'">'+(configured()?T('STAGING SESSION','STAGING SESSION'):T('НЕ ПОДКЛЮЧЕНО','NOT CONNECTED'))+'</span><button data-vvo-refresh aria-label="'+T('Обновить','Refresh')+'">↻</button><button data-vvo-close aria-label="'+T('Закрыть','Close')+'">×</button></div></header>'+
      '<section class="vs-views-hero"><div><strong>'+T('Гостеприимство в деталях.','Hospitality in the details.')+'</strong><p>'+T('Ташкент · Узбекистан','Tashkent · Uzbekistan')+'</p></div><span class="vs-hero-caption">'+T('Визуальный референс из каталога Views','Visual reference from the Views catalog')+'</span></section>'+
      '<nav class="vvo-tabs" aria-label="'+T('Разделы Views','Views sections')+'">'+tabs.map(([id,label])=>'<button data-vvo-tab="'+id+'" aria-current="'+(state.tab===id?'page':'false')+'">'+icon({dashboard:'home',calendar:'calendar',bookings:'bookings',units:'views',cleaning:'cleaning'}[id])+'<span>'+E(label)+'</span></button>').join('')+'</nav>'+
      '<main class="vvo-main">'+(configured()?'<p class="vs-data-note">'+T('Показаны загруженные записи. Это не итог по всему фонду.','Showing loaded records, not totals for the entire portfolio.')+'</p>':'')+content()+'</main>';
  }
  async function configure(session){
    const tenantId=session?.tenantId||'',organizationId=session?.organizationId||'',token=session?.token||'';
    if(!UUID.test(tenantId)||!UUID.test(organizationId)||typeof token!=='string'||token.length<=10)throw new Error('invalid_views_session');
    state.session={tenantId,organizationId,token,permissions:[],roles:[],capabilities:{}};
    try{
      const context=await api('/api/v1/context?tenant_id='+encodeURIComponent(tenantId)+'&organization_id='+encodeURIComponent(organizationId));
      if(context.tenantId!==tenantId||context.organizationId!==organizationId||context.module!=='views'||context.moduleEnabled!==true)throw Object.assign(new Error('context_mismatch'),{code:'forbidden',status:403});
      state.session.permissions=Array.isArray(context.permissions)?[...context.permissions]:[];
      state.session.roles=Array.isArray(context.roles)?[...context.roles]:[];
      state.session.capabilities=context.capabilities&&typeof context.capabilities==='object'?{...context.capabilities}:{};
      if(state.dialog?.open)refresh();
      return {configured:true,tenantId,organizationId,permissions:[...state.session.permissions],roles:[...state.session.roles],capabilities:{...state.session.capabilities}};
    }catch(error){state.session=null;state.data={bookings:[],units:[],cleaning:[]};state.error=error;if(state.dialog?.open)render();throw error;}
  }
  function clearSession(){state.session=null;state.data={bookings:[],units:[],cleaning:[]};state.error=null;if(state.dialog?.open)render();}
  function open(tab='dashboard'){
    ensure();state.lastFocus=document.activeElement;state.tab=['dashboard','calendar','bookings','units','cleaning'].includes(tab)?tab:'dashboard';
    render();if(!state.dialog.open)state.dialog.showModal();if(configured())refresh();
    return true;
  }
  function status(){return {configured:configured(),tenantId:state.session?.tenantId||null,organizationId:state.session?.organizationId||null,roles:[...(state.session?.roles||[])],permissions:[...(state.session?.permissions||[])],tab:state.tab,counts:{bookings:state.data.bookings.length,units:state.data.units.length,cleaning:state.data.cleaning.length}};}
  root.VertexVisionViews=Object.freeze({open,refresh,configure,clearSession,status});
})(window);
