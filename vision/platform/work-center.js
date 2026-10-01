/* VERTEX VISION Work Center — Interface System 6.0.
 * Unified read feed for Tasks / Approvals / Attention / Requests.
 * No mutation is exposed here; all source permissions remain server-authoritative.
 */
(function(root){
  'use strict';
  if(!root.document||root.VertexVisionWorkCenter)return;
  const T=(ru,en)=>document.documentElement.lang==='en'?en:ru;
  const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const blankFeed=()=>({generatedAt:null,tasks:[],approvals:[],attention:[],requests:[],counts:{tasks:0,approvals:0,attention:0,requests:0}});
  const state={dialog:null,root:null,lastFocus:null,tab:'today',loading:false,error:null,feed:null};
  const tabs=()=>[
    ['today',T('Сегодня','Today')],
    ['tasks',T('Задачи','Tasks')],
    ['approvals',T('Согласования','Approvals')],
    ['requests',T('Запросы','Requests')],
    ['operations',T('Операции','Operations')]
  ];
  function viewsStatus(){
    try{return root.VertexVisionViews?.status?.()||{configured:false,counts:{bookings:0,units:0,cleaning:0},roles:[],permissions:[]};}
    catch{return {configured:false,counts:{bookings:0,units:0,cleaning:0},roles:[],permissions:[]};}
  }
  function configured(){return viewsStatus().configured===true;}
  function feedConnected(){return configured()&&!!state.feed&&!state.error;}
  function ensure(){
    if(state.dialog?.isConnected)return;
    const dialog=document.createElement('dialog');dialog.id='visionWorkCenter';dialog.className='vvw-dialog';
    const shell=document.createElement('div');shell.className='vvw-shell';dialog.append(shell);
    dialog.addEventListener('close',()=>{if(state.lastFocus?.isConnected)state.lastFocus.focus({preventScroll:true});});
    dialog.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.vvwClose!==undefined){dialog.close();return;}
      if(button.dataset.vvwTab){state.tab=button.dataset.vvwTab;render();return;}
      if(button.dataset.vvwRefresh!==undefined){refreshFeed();return;}
      if(button.dataset.vvwViews){
        dialog.close();
        const target=button.dataset.vvwViews;
        if(target==='host')root.VertexVision?.navigate?.('views','host');
        else root.VertexVisionViews?.open?.(target);
        return;
      }
      if(button.dataset.vvwPalette!==undefined){dialog.close();root.VertexVision?.openPalette?.();}
    });
    document.body.append(dialog);state.dialog=dialog;state.root=shell;
  }
  async function refreshFeed(){
    if(!configured()){state.feed=null;state.error=null;state.loading=false;render();return false;}
    state.loading=true;state.error=null;render();
    try{
      const value=await root.VertexVisionViews.workFeed(50);
      if(!value||typeof value!=='object'||!value.counts)throw new Error('invalid_work_feed');
      state.feed=value;
      return true;
    }catch(error){
      state.feed=null;state.error=error;return false;
    }finally{state.loading=false;render();}
  }
  const statusPill=(label,value,kind='neutral')=>'<article class="vvw-stat vvw-'+kind+'"><span>'+E(label)+'</span><strong>'+E(value)+'</strong></article>';
  const disconnected=(title,copy)=>'<section class="vvw-empty"><strong>'+E(title)+'</strong><p>'+E(copy)+'</p><span>'+E(T('Источник данных не подключён','Data source not connected'))+'</span></section>';
  const loading=()=>'<section class="vvw-loading" aria-busy="true"><span></span><span></span><span></span></section>';
  const error=()=>'<section class="vvw-error"><strong>'+T('Work Feed временно недоступен','Work Feed is temporarily unavailable')+'</strong><p>'+T('Данные не заменяются демо-значениями. Повторите чтение после восстановления backend.','Data is not replaced with demo values. Retry after the backend is available.')+'</p><button data-vvw-refresh>'+T('Повторить','Retry')+'</button></section>';
  const when=value=>value?new Date(value).toLocaleString(document.documentElement.lang==='en'?'en-US':'ru-RU'):'—';
  function itemRow(item,mode){
    const reason=mode==='attention'&&item.reason?'<small class="vvw-reason">'+E(item.reason.replaceAll('_',' '))+'</small>':'';
    const due=item.dueAt?'<span>'+E(T('Срок: ','Due: ')+when(item.dueAt))+'</span>':'';
    return '<article class="vvw-row"><div><small>'+E(item.source||'VISION')+'</small><strong>'+E(item.title||'—')+'</strong>'+reason+due+'</div><div><span class="vvw-priority vvw-priority-'+E(String(item.priority||'NORMAL').toLowerCase())+'">'+E(item.priority||'NORMAL')+'</span><b>'+E(item.status||'—')+'</b></div></article>';
  }
  function list(items,mode,emptyTitle,emptyCopy){
    if(state.loading)return loading();
    if(state.error)return error();
    if(!feedConnected())return disconnected(emptyTitle,emptyCopy);
    if(!items.length)return '<section class="vvw-empty is-connected"><strong>'+E(emptyTitle)+'</strong><p>'+E(T('Подтверждённых элементов сейчас нет.','There are no confirmed items right now.'))+'</p><span>'+E(T('Источник подключён','Source connected'))+'</span></section>';
    return '<div class="vvw-list">'+items.map(item=>itemRow(item,mode)).join('')+'</div>';
  }
  function today(){
    const v=viewsStatus(),connected=feedConnected(),feed=state.feed||blankFeed();
    const summary='<div class="vvw-stats">'+
      statusPill(T('Смена','Shift'),'—')+
      statusPill(T('Задачи','Tasks'),connected?String(feed.counts.tasks):'—',connected?'success':'neutral')+
      statusPill(T('Согласования','Approvals'),connected?String(feed.counts.approvals):'—',connected?'success':'neutral')+
      statusPill(T('Views session','Views session'),v.configured?T('Подключено','Connected'):T('Не подключено','Not connected'),v.configured?'success':'neutral')+
    '</div>';
    const work=list(feed.tasks.slice(0,6),'tasks',T('Рабочая очередь пока не подключена','Work queue is not connected yet'),T('Назначенные задачи появятся здесь только из server-authoritative Work Feed.','Assigned work appears here only from the server-authoritative Work Feed.'));
    const attention=list(feed.attention.slice(0,6),'attention',T('Нет авторитетного Attention Feed','No authoritative Attention Feed'),T('VISION не создаёт искусственные тревоги. Attention строится только из подтверждённых задач, approvals и operational states.','VISION does not fabricate alerts. Attention is built only from confirmed tasks, approvals and operational states.'));
    return summary+'<div class="vvw-grid"><section class="vvw-panel"><div class="vvw-panel-head"><h3>'+T('Моя работа','My Work')+'</h3><span>'+(connected?T('Work Feed','Work Feed'):T('Not connected','Not connected'))+'</span></div>'+work+'</section><section class="vvw-panel"><div class="vvw-panel-head"><h3>'+T('Требует внимания','Attention')+'</h3><span>'+(connected?E(String(feed.counts.attention)): '—')+'</span></div>'+attention+'</section></div>'+quickActions(v);
  }
  function tasks(){
    const feed=state.feed||blankFeed();
    return '<div class="vvw-section-title"><div><h3>'+T('Задачи','Tasks')+'</h3><p>'+T('Назначенные core tasks и доступные Views cleaning jobs.','Assigned core tasks and accessible Views cleaning jobs.')+'</p></div><span>'+(feedConnected()?E(String(feed.counts.tasks)):'—')+'</span></div>'+list(feed.tasks,'tasks',T('Задачи не подключены','Tasks are not connected'),T('Требуется активная staging session и доступный Unified Work Feed.','An active staging session and Unified Work Feed are required.'));
  }
  function approvals(){
    const feed=state.feed||blankFeed();
    return '<div class="vvw-section-title"><div><h3>'+T('Согласования','Approvals')+'</h3><p>'+T('Read-only foundation. Решения пока не выполняются из Work Center.','Read-only foundation. Decisions are not executed from Work Center yet.')+'</p></div><span>'+(feedConnected()?E(String(feed.counts.approvals)):'—')+'</span></div>'+list(feed.approvals,'approvals',T('Approval Feed не подключён','Approval Feed is not connected'),T('После подключения backend здесь будут только разрешённые RLS approvals.','After backend connection, only RLS-authorized approvals appear here.'));
  }
  function requests(){
    const feed=state.feed||blankFeed();
    return '<div class="vvw-section-title"><div><h3>'+T('Запросы','Requests')+'</h3><p>'+T('Открытые VISION service orders в разрешённом organization scope.','Open VISION service orders in the authorized organization scope.')+'</p></div><span>'+(feedConnected()?E(String(feed.counts.requests)):'—')+'</span></div>'+list(feed.requests,'requests',T('Очередь запросов не подключена','Request queue is not connected'),T('Запросы появляются только из авторитетного server feed.','Requests appear only from the authoritative server feed.'));
  }
  function operations(){
    const v=viewsStatus(),connected=v.configured===true,counts=v.counts||{};
    const facts='<div class="vvw-stats">'+
      statusPill(T('Views units','Views units'),connected?String(counts.units??0):'—',connected?'success':'neutral')+
      statusPill(T('Bookings','Bookings'),connected?String(counts.bookings??0):'—',connected?'success':'neutral')+
      statusPill(T('Cleaning jobs','Cleaning jobs'),connected?String(counts.cleaning??0):'—',connected?'success':'neutral')+
      statusPill(T('Роли','Roles'),connected?(Array.isArray(v.roles)?String(v.roles.length):'0'):'—')+
    '</div>';
    return facts+(!connected?disconnected(T('Рабочая Views session не настроена','Views operational session is not configured'),T('Числа не подставляются из демо. Подключите staging Auth session и organization context.','Numbers are never filled from demo data. Connect a staging Auth session and organization context.')):'')+quickActions(v);
  }
  function quickActions(v){
    const connected=v.configured===true;
    const actions=[
      ['dashboard',T('Views Dashboard','Views Dashboard')],
      ['calendar',T('Календарь','Calendar')],
      ['bookings',T('Бронирования','Bookings')],
      ['units',T('Апартаменты','Units')],
      ['cleaning',T('Уборка','Cleaning')],
      ['host',T('Host Studio · demo','Host Studio · demo')]
    ];
    return '<section class="vvw-quick"><div class="vvw-panel-head"><h3>'+T('Быстрые действия','Quick Actions')+'</h3><span>'+(connected?T('Рабочая session','Operational session'):T('Часть действий откроется в disconnected state','Some actions open in disconnected state'))+'</span></div><div class="vvw-actions">'+
      actions.map(([id,label])=>'<button data-vvw-views="'+id+'"><span>'+E(label)+'</span><small>'+(id==='host'?T('Отдельный demo context','Separate demo context'):T('Views ACTIVE RC','Views ACTIVE RC'))+'</small></button>').join('')+
      '<button data-vvw-refresh><span>'+T('Обновить Work Feed','Refresh Work Feed')+'</span><small>'+T('Read-only','Read-only')+'</small></button>'+
      '<button data-vvw-palette><span>'+T('Найти направление','Find a module')+'</span><small>Ctrl/Cmd+K</small></button>'+
    '</div></section>';
  }
  function content(){return ({today,tasks,approvals,requests,operations}[state.tab]||today)();}
  function render(){
    ensure();
    const v=viewsStatus(),viewsConnected=v.configured===true,workConnected=feedConnected();
    state.root.innerHTML='<header class="vvw-head"><div><small>VERTEX VISION / WORK CENTER</small><h2>'+T('Мой день','My Day')+'</h2><p>'+T('Работа, решения и операции — только из подтверждённых источников','Work, decisions and operations — only from confirmed sources')+'</p></div><div class="vvw-head-actions"><span class="vvw-connection '+(workConnected?'is-on':'')+'">'+(workConnected?T('WORK FEED · CONNECTED','WORK FEED · CONNECTED'):viewsConnected?T('WORK FEED · LOADING / UNAVAILABLE','WORK FEED · LOADING / UNAVAILABLE'):T('WORK FEED · NOT CONNECTED','WORK FEED · NOT CONNECTED'))+'</span><button data-vvw-refresh aria-label="'+T('Обновить','Refresh')+'">↻</button><button data-vvw-close aria-label="'+T('Закрыть','Close')+'">×</button></div></header>'+
      '<nav class="vvw-tabs">'+tabs().map(([id,label])=>'<button data-vvw-tab="'+id+'" aria-current="'+(state.tab===id?'page':'false')+'">'+E(label)+'</button>').join('')+'</nav>'+
      '<main class="vvw-main">'+content()+'</main>';
  }
  function open(tab='today'){
    ensure();state.lastFocus=document.activeElement;state.tab=tabs().some(([id])=>id===tab)?tab:'today';
    if(!configured()){state.feed=null;state.error=null;state.loading=false;}
    render();if(!state.dialog.open)state.dialog.showModal();
    if(configured()&&!state.loading&&!state.feed)refreshFeed();
    return true;
  }
  function status(){
    const v=viewsStatus();
    return {
      open:!!state.dialog?.open,tab:state.tab,viewsConfigured:v.configured===true,
      workFeedConnected:feedConnected(),loading:state.loading,
      counts:state.feed?{...state.feed.counts}:{tasks:null,approvals:null,attention:null,requests:null},
      approvalDecisionsEnabled:false
    };
  }
  new MutationObserver(()=>{if(state.dialog?.open)render();}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  root.VertexVisionWorkCenter=Object.freeze({open,refresh:refreshFeed,status});
})(window);
