/* VERTEX VISION Work Center — Interface System 5.0. Honest, role-aware shell; no fabricated work feed. */
(function(root){
  'use strict';
  if(!root.document||root.VertexVisionWorkCenter)return;
  const T=(ru,en)=>document.documentElement.lang==='en'?en:ru;
  const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const state={dialog:null,root:null,lastFocus:null,tab:'today'};
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
  function ensure(){
    if(state.dialog?.isConnected)return;
    const dialog=document.createElement('dialog');dialog.id='visionWorkCenter';dialog.className='vvw-dialog';
    const shell=document.createElement('div');shell.className='vvw-shell';dialog.append(shell);
    dialog.addEventListener('close',()=>{if(state.lastFocus?.isConnected)state.lastFocus.focus({preventScroll:true});});
    dialog.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.vvwClose!==undefined){dialog.close();return;}
      if(button.dataset.vvwTab){state.tab=button.dataset.vvwTab;render();return;}
      if(button.dataset.vvwViews){
        dialog.close();
        const target=button.dataset.vvwViews;
        if(target==='host')root.VertexVision?.navigate?.('views','host');
        else root.VertexVisionViews?.open?.(target);
      }
      if(button.dataset.vvwPalette!==undefined){dialog.close();root.VertexVision?.openPalette?.();}
    });
    document.body.append(dialog);state.dialog=dialog;state.root=shell;
  }
  const statusPill=(label,value,kind='neutral')=>'<article class="vvw-stat vvw-'+kind+'"><span>'+E(label)+'</span><strong>'+E(value)+'</strong></article>';
  const disconnected=(title,copy)=>'<section class="vvw-empty"><strong>'+E(title)+'</strong><p>'+E(copy)+'</p><span>'+E(T('Источник данных не подключён','Data source not connected'))+'</span></section>';
  function today(){
    const v=viewsStatus(),connected=v.configured===true;
    const summary='<div class="vvw-stats">'+
      statusPill(T('Смена','Shift'),'—')+
      statusPill(T('Задачи','Tasks'),'—')+
      statusPill(T('Согласования','Approvals'),'—')+
      statusPill(T('Views session','Views session'),connected?T('Подключено','Connected'):T('Не подключено','Not connected'),connected?'success':'neutral')+
    '</div>';
    const focus='<div class="vvw-grid">'+
      '<section class="vvw-panel"><div class="vvw-panel-head"><h3>'+T('Моя работа','My Work')+'</h3><span>'+T('Сегодня','Today')+'</span></div>'+
      disconnected(T('Рабочая очередь пока не подключена','Work queue is not connected yet'),T('Здесь появятся назначенные задачи, смена и SLA после подключения серверного Work Feed.','Assigned tasks, shift and SLA will appear here after the server Work Feed is connected.'))+'</section>'+
      '<section class="vvw-panel"><div class="vvw-panel-head"><h3>'+T('Требует внимания','Attention')+'</h3><span>'+T('Без догадок','No assumptions')+'</span></div>'+
      disconnected(T('Нет авторитетного alert feed','No authoritative alert feed'),T('VISION не создаёт искусственные тревоги. Attention заполняется только подтверждёнными серверными событиями.','VISION does not fabricate alerts. Attention is populated only by confirmed server events.'))+'</section>'+
    '</div>';
    return summary+focus+quickActions(v);
  }
  function tasks(){
    return disconnected(T('Задачи ещё не подключены','Tasks are not connected yet'),T('Целевой источник — VISION Tasks / Workflow. До подключения серверной очереди экран остаётся пустым.','Target source: VISION Tasks / Workflow. Until the server queue is connected, this screen stays empty.'))+quickActions(viewsStatus());
  }
  function approvals(){
    return disconnected(T('Approval Center не подключён','Approval Center is not connected'),T('Согласования бюджета, выплат, maintenance и других решений будут появляться только из авторитетных workflow.','Budget, payout, maintenance and other approvals will appear only from authoritative workflows.'));
  }
  function requests(){
    return disconnected(T('Единая очередь запросов не подключена','Unified request queue is not connected'),T('Guest Requests, support и cross-module Service Requests будут объединены здесь после подключения backend contracts.','Guest Requests, support and cross-module Service Requests will appear here after backend contracts are connected.'));
  }
  function operations(){
    const v=viewsStatus(),connected=v.configured===true;
    const counts=v.counts||{};
    const facts='<div class="vvw-stats">'+
      statusPill(T('Views units','Views units'),connected?String(counts.units??0):'—',connected?'success':'neutral')+
      statusPill(T('Bookings','Bookings'),connected?String(counts.bookings??0):'—',connected?'success':'neutral')+
      statusPill(T('Cleaning jobs','Cleaning jobs'),connected?String(counts.cleaning??0):'—',connected?'success':'neutral')+
      statusPill(T('Роли','Roles'),connected?(Array.isArray(v.roles)&&v.roles.length?String(v.roles.length):'0'):'—')+
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
      '<button data-vvw-palette><span>'+T('Найти направление','Find a module')+'</span><small>Ctrl/Cmd+K</small></button>'+
    '</div></section>';
  }
  function content(){return ({today,tasks,approvals,requests,operations}[state.tab]||today)();}
  function render(){
    ensure();
    const v=viewsStatus(),connected=v.configured===true;
    state.root.innerHTML='<header class="vvw-head"><div><small>VERTEX VISION / WORK CENTER</small><h2>'+T('Мой день','My Day')+'</h2><p>'+T('Работа, решения и операции — только из подтверждённых источников','Work, decisions and operations — only from confirmed sources')+'</p></div><div class="vvw-head-actions"><span class="vvw-connection '+(connected?'is-on':'')+'">'+(connected?T('VIEWS SESSION','VIEWS SESSION'):T('WORK FEED · NOT CONNECTED','WORK FEED · NOT CONNECTED'))+'</span><button data-vvw-close aria-label="'+T('Закрыть','Close')+'">×</button></div></header>'+
      '<nav class="vvw-tabs">'+tabs().map(([id,label])=>'<button data-vvw-tab="'+id+'" aria-current="'+(state.tab===id?'page':'false')+'">'+E(label)+'</button>').join('')+'</nav>'+
      '<main class="vvw-main">'+content()+'</main>';
  }
  function open(tab='today'){
    ensure();state.lastFocus=document.activeElement;state.tab=tabs().some(([id])=>id===tab)?tab:'today';render();if(!state.dialog.open)state.dialog.showModal();return true;
  }
  function status(){const v=viewsStatus();return {open:!!state.dialog?.open,tab:state.tab,viewsConfigured:v.configured===true,workFeedConnected:false,approvalFeedConnected:false,requestFeedConnected:false};}
  new MutationObserver(()=>{if(state.dialog?.open)render();}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  root.VertexVisionWorkCenter=Object.freeze({open,status});
})(window);
