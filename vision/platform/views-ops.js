/* VERTEX VISION / Views Operations UI. Real data only; no demo fallback inside this workspace. */
(function(root){
  'use strict';
  if(!root.document||root.VertexVisionViews)return;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const icon=name=>root.VertexVisionDesign?.icon(name)||'';
  const T=(ru,en)=>document.documentElement.lang==='en'?en:ru;
  const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const money=(value,currency)=>{if(value===null||value===undefined||value===''||!Number.isFinite(Number(value))||typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency))return '—';try{return new Intl.NumberFormat(document.documentElement.lang==='en'?'en-US':'ru-RU',{style:'currency',currency,maximumFractionDigits:2}).format(Number(value));}catch{return '—';}};
  const state={tab:'dashboard',session:null,configured:false,loading:false,busy:false,error:null,
    data:{bookings:[],units:[],cleaning:[]},pages:{},pending:null,lastCommand:null,retryPersistence:true,
    dialog:null,root:null,lastFocus:null,createOpen:false,draft:{},formError:null};
  let tabStorage=null;try{tabStorage=root.sessionStorage;}catch{}
  const client=root.VertexViewsClient.create({storage:tabStorage,onChange:snapshot=>{
    state.session=snapshot.context;state.configured=snapshot.configured;state.data=snapshot.data;
    state.pages=snapshot.pages;state.loading=snapshot.loading;state.busy=snapshot.busy;
    state.error=snapshot.error;state.pending=snapshot.pending;state.lastCommand=snapshot.lastCommand;
    state.retryPersistence=snapshot.retryPersistence;state.loadingMore=snapshot.loadingMore;
    if(state.dialog?.open)render();
  }});
  function configured(){return state.configured;}
  function can(permission){return client.can(permission);}
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
  async function refresh(){return client.refresh();}
  async function command(type,fields){
    state.formError=null;
    try{
      const result=await client.execute(type,fields);
      if(result&&type==='create_booking'){state.createOpen=false;state.draft={};}
    }catch(error){state.formError=errorText(error.code,error.status);}
    if(state.dialog?.open)render();
  }
  function loadMore(resource){client.loadMore(resource).catch(()=>{});}


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
      if(button.dataset.vvoMore){loadMore(button.dataset.vvoMore);return;}
      if(button.dataset.vvoRetry!==undefined){client.retry().catch(()=>{});return;}
      if(button.dataset.vvoCreate!==undefined){state.createOpen=!state.createOpen;state.tab='bookings';state.formError=null;render();return;}
      if(button.dataset.vvoClear!==undefined){if(state.pending&&!confirm(T('Результат операции ещё неизвестен. Выйти? Перед новой бронью потребуется сверка.','The operation outcome is unknown. Sign out? Reconcile before creating a new booking.')))return;clearSession();return;}
      if(state.busy||state.pending)return;
      if(button.dataset.vvoDemo!==undefined){dialog.close();root.VertexHostConsole?.open?.('today');return;}
      if(button.dataset.vvoCommand){
        const payload={};
        if(button.dataset.bookingId){payload.booking_id=button.dataset.bookingId;payload.expected_version=Number(button.dataset.version);}
        if(button.dataset.cleaningId){payload.cleaning_job_id=button.dataset.cleaningId;payload.expected_version=Number(button.dataset.version);}
        command(button.dataset.vvoCommand,payload);
      }
    });
    dialog.addEventListener('input',event=>{
      if(event.target.closest('[data-vvo-create-form]'))state.draft[event.target.name]=event.target.value;
    });
    dialog.addEventListener('submit',event=>{
      if(!event.target.matches('[data-vvo-create-form]'))return;
      event.preventDefault();if(state.busy||state.pending||!can('views.booking.create'))return;
      const values=Object.fromEntries(new FormData(event.target));
      command('create_booking',{organization_id:state.session.organizationId,unit_id:values.unit_id,
        customer_id:values.customer_id,check_in:values.check_in,check_out:values.check_out,
        total:values.total,currency:values.currency,source:'direct'});
    });
    document.body.append(dialog);state.dialog=dialog;state.root=box;
  }

  function badge(status){return '<span class="vvo-status vvo-status-'+E(String(status).toLowerCase().replaceAll('_','-'))+'">'+E(status)+'</span>';}
  function empty(title,copy){return '<section class="vvo-empty"><strong>'+E(title)+'</strong><p>'+E(copy)+'</p></section>';}
  function loading(){return '<section class="vvo-loading" aria-busy="true"><span></span><span></span><span></span></section>';}
  function summary(){
    const d=state.data,date=today(),units=d.units;
    const count=(resource,value)=>state.pages[resource]?.loaded&&state.pages[resource]?.applicable?value:'—';
    const values=[
      [T('Апартаменты','Units'),count('units',units.length)],
      [T('Занято','Occupied'),count('units',units.filter(x=>x.status==='OCCUPIED').length)],
      [T('Готово','Ready'),count('units',units.filter(x=>x.status==='READY').length)],
      [T('Уборка','Cleaning'),count('units',units.filter(x=>x.status==='CLEANING').length)],
      [T('Заезды сегодня','Arrivals today'),count('bookings',d.bookings.filter(x=>x.check_in===date&&['CONFIRMED','CHECKED_IN'].includes(x.status)).length)],
      [T('Выезды сегодня','Departures today'),count('bookings',d.bookings.filter(x=>x.check_out===date&&['CHECKED_IN','CHECKED_OUT','COMPLETED'].includes(x.status)).length)]
    ];
    return '<div class="vvo-kpis">'+values.map(([label,value])=>'<article><span>'+E(label)+'</span><strong>'+E(value)+'</strong></article>').join('')+'</div>';
  }
  function dashboard(){
    const active=state.data.bookings.filter(x=>!['COMPLETED','CANCELLED','NO_SHOW'].includes(x.status)).slice(0,6);
    const clean=state.data.cleaning.filter(x=>x.status!=='VERIFIED').slice(0,6);
    return summary()+'<div class="vvo-columns"><section><div class="vvo-section-head"><h3>'+T('Активные бронирования','Active bookings')+'</h3></div>'+
      (active.length?active.map(bookingRow).join(''):empty(T('Нет активных среди загруженных','No active bookings in the loaded page'),T('Проверьте следующую страницу и фильтры перед выводом о доступности.','Check additional pages before concluding availability.')))+'</section>'+
      '<section><div class="vvo-section-head"><h3>'+T('Очередь уборки','Cleaning queue')+'</h3></div>'+
      (clean.length?clean.map(cleaningRow).join(''):empty(T('Нет задач среди загруженных','No jobs in the loaded page'),T('Это результат текущей выборки, а не гарантия отсутствия других задач.','This is the current query, not a guarantee that no other jobs exist.')))+'</section></div>';
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
    return (state.createOpen?createForm():'')+'<div class="vvo-section-head"><h3>'+T('Бронирования','Bookings')+'</h3><span>'+rows.length+'</span></div>'+
      (rows.length?rows.map(bookingRow).join(''):empty(T('Нет доступных записей','No accessible bookings'),T('В этой выборке нет доступных вам бронирований. Демо-данные не подставляются.','No bookings are accessible in this query. Demo data is never substituted.')));
  }
  function units(){
    const rows=[...state.data.units].sort((a,b)=>String(a.unit_number).localeCompare(String(b.unit_number),undefined,{numeric:true}));
    return '<div class="vvo-section-head"><h3>'+T('Апартаменты','Units')+'</h3><span>'+rows.length+'</span></div>'+
      (rows.length?'<div class="vvo-unit-grid">'+rows.map(item=>'<article><div><small>'+T('Апартамент','Unit')+'</small><strong>'+E(item.unit_number)+'</strong></div>'+badge(item.status)+'<p>'+E(item.unit_type||'—')+'</p></article>').join('')+'</div>':empty(T('Апартаменты не добавлены','No units'),T('Добавьте объекты в staging-базу Views.','Add Views units to the staging database.')));
  }
  function cleaningActions(item){
    const allowed=item.status==='INSPECTION'?can('views.cleaning.verify'):can('views.cleaning.execute');
    if(!allowed)return '';
    const actor=state.session?.actorId;
    if(item.status==='IN_PROGRESS'&&item.started_by!==actor)return '<small>'+T('Продолжает исполнитель','Only the executor may submit')+'</small>';
    if(item.status==='INSPECTION'&&(!item.submitted_by||item.started_by===actor||item.submitted_by===actor))return '<small>'+T('Нужен независимый проверяющий','An independent reviewer is required')+'</small>';
    const next={REQUIRED:['cleaning_start',T('Начать','Start')],IN_PROGRESS:['cleaning_submit',T('На проверку','Submit')],INSPECTION:['cleaning_verify',T('Подтвердить','Verify')]}[item.status];
    return next?'<button data-vvo-command="'+next[0]+'" data-cleaning-id="'+E(item.id)+'" data-version="'+E(item.version)+'">'+E(next[1])+'</button>':'';
  }
  function cleaningRow(item){
    const unit=state.data.units.find(x=>x.id===item.unit_id);
    return '<article class="vvo-row"><div><small>'+T('Уборка после выезда','Checkout cleaning')+'</small><strong>'+E(unit?.unit_number||item.unit_id)+'</strong><span>'+E(item.created_at?new Date(item.created_at).toLocaleString(undefined,{timeZone:'Asia/Tashkent'}): '')+'</span></div><div>'+badge(item.status)+'<div class="vvo-row-actions">'+cleaningActions(item)+'</div></div></article>';
  }
  function cleaning(){
    const rows=[...state.data.cleaning].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    return '<div class="vvo-section-head"><h3>'+T('Уборка','Cleaning')+'</h3><span>'+rows.length+'</span></div>'+
      (rows.length?rows.map(cleaningRow).join(''):empty(T('Задач нет','No cleaning jobs'),T('После check-out задача появится здесь автоматически.','A job appears here automatically after check-out.')));
  }
  function calendar(){
    const units=[...state.data.units].sort((a,b)=>String(a.unit_number).localeCompare(String(b.unit_number),undefined,{numeric:true}));
    if(!units.length)return empty(T('Календарь пуст','Calendar is empty'),T('Сначала добавьте апартаменты в staging.','Add units to staging first.'));
    return '<div class="vvo-section-head"><h3>'+T('Календарь размещения','Stay calendar')+'</h3><span>'+T('загруженные периоды','loaded date ranges')+'</span></div><div class="vvo-calendar">'+units.map(unit=>{
      const rows=state.data.bookings.filter(x=>x.unit_id===unit.id&&!['CANCELLED','NO_SHOW'].includes(x.status)).sort((a,b)=>a.check_in.localeCompare(b.check_in));
      return '<article><strong>'+E(unit.unit_number)+'</strong><div>'+(rows.length?rows.map(x=>'<span title="'+E(x.status)+'"><b>'+E(x.check_in.slice(5))+'</b> → <b>'+E(x.check_out.slice(5))+'</b> '+badge(x.status)+'</span>').join(''):'<em>'+T('Нет загруженных броней','No loaded bookings')+'</em>')+'</div></article>';
    }).join('')+'</div>';
  }
  function content(){
    if(!configured())return (state.error?'<p class="vvo-error">'+E(errorText(state.error.code,state.error.status))+'</p>':'')+'<div class="vs-unavailable-kpis" aria-label="'+T('Показатели ещё не загружены','Metrics are not loaded')+'">'+[T('Апартаменты','Units'),T('Заезды','Arrivals'),T('Задачи','Tasks')].map(label=>'<article><span>'+E(label)+'</span><b>—</b></article>').join('')+'</div><section class="vvo-connect"><strong>'+T('Рабочее подключение не настроено','Operational connection is not configured')+'</strong><p>'+T('Этот экран не подставляет демо-данные. Для реальной работы нужны staging Auth session и tenant ID.','This workspace never substitutes demo data. A staging Auth session and tenant ID are required for real operations.')+'</p><button data-vvo-demo>'+T('Открыть отдельный демо Host Studio','Open separate demo Host Studio')+'</button></section>';
    if(typeof navigator!=='undefined'&&navigator.onLine===false)return empty(T('Нет сети','Offline'),T('Критические операции отключены до восстановления соединения.','Critical actions are disabled until connectivity returns.'));
    if(state.loading||state.busy)return loading();
    if(state.error){
      const text=state.error.code==='network_error'?T('Нет соединения с backend Views.','Cannot reach the Views backend.'):state.error.code==='session_required'?T('Нужна рабочая сессия.','An operational session is required.'):errorText(state.error.code,state.error.status);
      return '<section class="vvo-error"><strong>'+E(text)+'</strong><button data-vvo-refresh>'+T('Повторить','Retry')+'</button></section>';
    }
    const resource=state.tab==='calendar'?'units':state.tab;
    if(resource!=='dashboard'&&!state.pages[resource]?.applicable)return empty(T('Раздел недоступен этой роли','This role cannot access this section'),T('Данные скрыты по правам доступа; это не означает, что записей нет.','Data is hidden by permissions; this does not mean records are absent.'));
    return ({dashboard,calendar,bookings,units,cleaning}[state.tab]||dashboard)()+pagination();
  }
  function createForm(){
    const field=(name,label,type,extra='')=>'<label>'+E(label)+'<input required name="'+name+'" type="'+type+'" value="'+E(state.draft[name]||'')+'" '+extra+'></label>';
    const options=state.data.units.map(unit=>'<option value="'+E(unit.id)+'" '+(state.draft.unit_id===unit.id?'selected':'')+'>'+E(unit.unit_number)+'</option>').join('');
    return '<form data-vvo-create-form class="vvo-create-form"><h3>'+T('Новая бронь','New booking')+'</h3><p>'+T('Для уже зарегистрированного гостя. Бронь создаётся в ожидании подтверждения; даты закрепляются сервером при подтверждении.','For an existing guest. A new booking is pending; dates are reserved by the server when confirmed.')+'</p>'+
      '<label>'+T('Апартамент из загруженных','Unit from loaded records')+'<select required name="unit_id"><option value="">'+T('Выберите','Select')+'</option>'+options+'</select></label>'+
      field('customer_id',T('ID зарегистрированного гостя','Existing guest ID'),'text','pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" autocomplete="off"')+
      field('check_in',T('Заезд','Check-in'),'date')+field('check_out',T('Выезд','Check-out'),'date')+
      field('total',T('Сумма проживания','Accommodation amount'),'text','inputmode="decimal" pattern="[0-9]+([.][0-9]{1,2})?"')+
      '<label>'+T('Валюта суммы','Amount currency')+'<select name="currency">'+['USD','UZS','EUR'].map(c=>'<option '+(state.draft.currency===c?'selected':'')+'>'+c+'</option>').join('')+'</select></label>'+
      '<button type="submit" '+(state.busy||state.pending?'disabled':'')+'>'+T('Создать бронь','Create booking')+'</button><button type="button" data-vvo-create>'+T('Закрыть форму','Close form')+'</button></form>';
  }
  function pagination(){
    const resources=state.tab==='dashboard'?['bookings','units','cleaning']:[state.tab==='calendar'?'bookings':state.tab];
    return '<div class="vvo-pagination">'+resources.filter(name=>state.pages[name]?.applicable).map(name=>{
      const meta=state.pages[name],label={bookings:T('Брони','Bookings'),units:T('Апартаменты','Units'),cleaning:T('Уборка','Cleaning')}[name];
      return '<section><span>'+label+': '+T('загружено ','loaded ')+state.data[name].length+' · '+(meta.nextCursor?T('есть ещё записи','more available'):T('конец текущей выборки','end of current query'))+'</span>'+
        (meta.nextCursor?'<button data-vvo-more="'+name+'" '+(state.loadingMore?.includes(name)?'disabled':'')+'>'+T('Показать ещё','Load more')+'</button>':'')+'</section>';
    }).join('')+'</div>';
  }
  function operationNotice(){
    if(state.pending)return '<section class="vvo-pending" role="status"><strong>'+T('Результат операции нужно подтвердить','Operation outcome needs confirmation')+'</strong><p>'+T('Повтор использует прежний ключ и не создаёт новую команду. Сначала завершите проверку этой операции.','Retry uses the original key; it does not create a new command. Resolve this operation before starting another.')+'</p>'+
      (!state.retryPersistence?'<p>'+T('Хранилище вкладки недоступно. Не закрывайте вкладку до сверки результата.','Tab storage is unavailable. Keep this tab open until the outcome is reconciled.')+'</p>':'')+
      '<button data-vvo-retry '+(state.busy?'disabled':'')+'>'+T('Проверить / повторить','Check / retry')+'</button></section>';
    if(state.lastCommand?.acknowledged)return '<p class="vvo-success" role="status">'+T('Операция подтверждена сервером.','The operation was acknowledged by the server.')+(state.error?' '+T('Обновить список пока не удалось — не повторяйте саму операцию.','The list could not be refreshed; do not recreate the operation.'):'')+'</p>';
    return '';
  }
  function render(){
    ensure();
    const tabs=[['dashboard',T('Главная','Dashboard')],['calendar',T('Календарь','Calendar')],['bookings',T('Брони','Bookings')],['units',T('Апартаменты','Units')],['cleaning',T('Уборка','Cleaning')]];
    state.root.innerHTML='<header class="vvo-head"><div><div class="vs-views-identity">'+icon('views')+'<div><small>VERTEX VISION / VIEWS</small><h2>Views</h2><span>Hotel &amp; Apartments</span></div></div><p>'+T('Реальные staging-данные · без фиктивных показателей','Real staging data · no fabricated metrics')+'</p></div><div class="vvo-head-actions"><span class="vvo-connection '+(configured()?'is-on':'')+'">'+(configured()?T('STAGING SESSION','STAGING SESSION'):T('НЕ ПОДКЛЮЧЕНО','NOT CONNECTED'))+'</span><button data-vvo-refresh aria-label="'+T('Обновить','Refresh')+'">↻</button><button data-vvo-close aria-label="'+T('Закрыть','Close')+'">×</button></div></header>'+
      '<section class="vs-views-hero"><div><strong>'+T('Гостеприимство в деталях.','Hospitality in the details.')+'</strong><p>'+T('Ташкент · Узбекистан','Tashkent · Uzbekistan')+'</p></div><span class="vs-hero-caption">'+T('Визуальный референс из каталога Views','Visual reference from the Views catalog')+'</span></section>'+
      '<nav class="vvo-tabs" aria-label="'+T('Разделы Views','Views sections')+'">'+tabs.map(([id,label])=>'<button data-vvo-tab="'+id+'" aria-current="'+(state.tab===id?'page':'false')+'">'+icon({dashboard:'home',calendar:'calendar',bookings:'bookings',units:'views',cleaning:'cleaning'}[id])+'<span>'+E(label)+'</span></button>').join('')+'</nav>'+
      '<main class="vvo-main">'+operationNotice()+(state.formError?'<p class="vvo-error">'+E(state.formError)+'</p>':'')+(configured()&&can('views.booking.create')&&!state.busy&&!state.pending?'<button class="vvo-new-booking" data-vvo-create>'+T('Новая бронь','New booking')+'</button>':'')+(configured()?'<p class="vs-data-note">'+T('Показаны загруженные записи. Это не итог по всему фонду.','Showing loaded records, not totals for the entire portfolio.')+'</p>':'')+content()+'</main>';
  }
  async function configure(session){
    state.createOpen=false;state.draft={};state.formError=null;
    const context=await client.configure(session);
    if(state.dialog?.open)await refresh();
    return {configured:true,...context};
  }
  function clearSession(){state.createOpen=false;state.draft={};client.clearSession();}
  function open(tab='dashboard'){
    ensure();state.lastFocus=document.activeElement;state.tab=['dashboard','calendar','bookings','units','cleaning'].includes(tab)?tab:'dashboard';
    render();if(!state.dialog.open)state.dialog.showModal();if(configured())refresh();
    return true;
  }
  function status(){return {configured:configured(),pending:!!state.pending,tenantId:state.session?.tenantId||null,organizationId:state.session?.organizationId||null,roles:[...(state.session?.roles||[])],permissions:[...(state.session?.permissions||[])],tab:state.tab,counts:{bookings:state.data.bookings.length,units:state.data.units.length,cleaning:state.data.cleaning.length}};}
  root.VertexVisionViews=Object.freeze({open,refresh,configure,clearSession,status});
  root.addEventListener('beforeunload',event=>{if(state.pending){event.preventDefault();event.returnValue='';}});
  root.addEventListener('offline',()=>{if(state.dialog?.open)render();});
  root.addEventListener('online',()=>{if(state.dialog?.open&&configured())refresh();});
})(window);
