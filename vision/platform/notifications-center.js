/* VERTEX VISION Notification Center — Interface System 8.0.
 * User inbox + escalations, backed by server-authoritative feed and versioned commands.
 * Refresh is 30-second polling; event ingestion remains via durable outbox/inbox consumer foundation.
 */
(function(root){
  'use strict';
  if(!root.document||root.VertexVisionNotifications)return;
  const T=(ru,en)=>document.documentElement.lang==='en'?en:ru;
  const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const blank=()=>({generatedAt:null,notifications:[],escalations:[],counts:{unread:0,escalations:0}});
  const state={dialog:null,root:null,lastFocus:null,tab:'inbox',loading:false,mutating:false,error:null,feed:null,poller:null,lastRefreshAt:null};
  const tabs=()=>[['inbox',T('Входящие','Inbox')],['escalations',T('Эскалации','Escalations')]];
  function viewsStatus(){try{return root.VertexVisionViews?.status?.()||{configured:false};}catch{return {configured:false};}}
  function configured(){return viewsStatus().configured===true;}
  function connected(){return configured()&&!!state.feed&&!state.error;}
  function stopPolling(){if(state.poller){clearInterval(state.poller);state.poller=null;}}
  function startPolling(){
    stopPolling();
    if(!configured()||!state.dialog?.open)return;
    state.poller=setInterval(()=>{if(!document.hidden&&!state.loading&&!state.mutating)refresh({silent:true});},30000);
  }
  function ensure(){
    if(state.dialog?.isConnected)return;
    const dialog=document.createElement('dialog');dialog.id='visionNotifications';dialog.className='vvn-dialog';
    const shell=document.createElement('div');shell.className='vvn-shell';dialog.append(shell);
    dialog.addEventListener('close',()=>{stopPolling();if(state.lastFocus?.isConnected)state.lastFocus.focus({preventScroll:true});});
    dialog.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.vvnClose!==undefined){dialog.close();return;}
      if(button.dataset.vvnTab){state.tab=button.dataset.vvnTab;render();return;}
      if(button.dataset.vvnRefresh!==undefined){refresh();return;}
      if(button.dataset.vvnAction){runCommand(button);return;}
    });
    document.body.append(dialog);state.dialog=dialog;state.root=shell;
  }
  async function refresh(options={}){
    if(!configured()){state.feed=null;state.error=null;state.loading=false;render();return false;}
    if(!options.silent){state.loading=true;state.error=null;render();}
    try{
      const value=await root.VertexVisionViews.notificationFeed(50);
      if(!value||typeof value!=='object'||!value.counts)throw new Error('invalid_notification_feed');
      state.feed=value;state.error=null;state.lastRefreshAt=new Date().toISOString();return true;
    }catch(error){state.feed=null;state.error=error;return false;}
    finally{state.loading=false;render();syncHubBadge();}
  }
  async function runCommand(button){
    if(state.mutating||!configured())return;
    const type=button.dataset.vvnAction,id=button.dataset.itemId,version=Number(button.dataset.version);
    const fields={expected_version:version};
    if(type==='escalation_ack')fields.escalation_id=id;else fields.notification_id=id;
    state.mutating=true;state.error=null;render();
    try{
      await root.VertexVisionViews.notificationCommand(type,fields);
      await refresh({silent:true});
    }catch(error){state.error=error;}
    finally{state.mutating=false;render();syncHubBadge();}
  }
  const time=value=>value?new Date(value).toLocaleString(document.documentElement.lang==='en'?'en-US':'ru-RU'):'—';
  const icon=severity=>severity==='CRITICAL'?'!':severity==='WARNING'?'△':severity==='SUCCESS'?'✓':'•';
  const loading=()=>'<section class="vvn-loading" aria-busy="true"><span></span><span></span><span></span></section>';
  const disconnected=()=>'<section class="vvn-empty"><strong>'+T('Уведомления не подключены','Notifications are not connected')+'</strong><p>'+T('Публичный Preview не подставляет демо-уведомления. Нужны staging Auth session и backend.','The public Preview never substitutes demo notifications. A staging Auth session and backend are required.')+'</p><span>'+T('Источник данных не подключён','Data source not connected')+'</span></section>';
  const error=()=>'<section class="vvn-error"><strong>'+T('Notification Feed недоступен','Notification Feed is unavailable')+'</strong><p>'+T('Данные не заменяются фиктивными значениями.','Data is not replaced with fabricated values.')+'</p><button data-vvn-refresh>'+T('Повторить','Retry')+'</button></section>';
  function notificationRow(item){
    const actions=[];
    if(item.status==='UNREAD')actions.push(['notification_read',T('Прочитано','Mark read')]);
    if(item.status==='READ')actions.push(['notification_unread',T('Не прочитано','Mark unread')]);
    actions.push(['notification_dismiss',T('Скрыть','Dismiss')]);
    return '<article class="vvn-row '+(item.status==='UNREAD'?'is-unread':'')+'"><span class="vvn-icon vvn-'+E(item.severity.toLowerCase())+'">'+icon(item.severity)+'</span><div class="vvn-copy"><small>'+E(item.eventType)+'</small><strong>'+E(item.title)+'</strong>'+(item.body?'<p>'+E(item.body)+'</p>':'')+'<span>'+E(time(item.createdAt))+'</span><div class="vvn-actions">'+actions.map(([type,label])=>'<button data-vvn-action="'+type+'" data-item-id="'+E(item.id)+'" data-version="'+E(item.version)+'"'+(state.mutating?' disabled':'')+'>'+E(label)+'</button>').join('')+'</div></div><b>'+E(item.status)+'</b></article>';
  }
  function escalationRow(item){
    const ack=item.canAck&&item.status==='OPEN'?'<button data-vvn-action="escalation_ack" data-item-id="'+E(item.id)+'" data-version="'+E(item.version)+'"'+(state.mutating?' disabled':'')+'>'+T('Принять эскалацию','Acknowledge')+'</button>':'';
    return '<article class="vvn-row vvn-escalation"><span class="vvn-icon vvn-'+E(item.severity.toLowerCase())+'">'+icon(item.severity)+'</span><div class="vvn-copy"><small>'+E(item.ruleCode)+'</small><strong>'+E(item.title)+'</strong><span>'+T('Открыто: ','Opened: ')+E(time(item.openedAt))+'</span><div class="vvn-actions">'+ack+'</div></div><b>'+E(item.status)+'</b></article>';
  }
  function inbox(){
    if(state.loading)return loading();if(state.error)return error();if(!connected())return disconnected();
    const feed=state.feed||blank();
    return '<div class="vvn-section-title"><div><h3>'+T('Входящие','Inbox')+'</h3><p>'+T('События только из durable event pipeline.','Events only from the durable event pipeline.')+'</p></div><span>'+E(String(feed.counts.unread))+'</span></div>'+
      (feed.notifications.length?'<div class="vvn-list">'+feed.notifications.map(notificationRow).join('')+'</div>':'<section class="vvn-empty is-connected"><strong>'+T('Новых уведомлений нет','No notifications')+'</strong><p>'+T('Источник подключён, подтверждённых событий сейчас нет.','The source is connected; there are no confirmed events right now.')+'</p><span>'+T('Источник подключён','Source connected')+'</span></section>');
  }
  function escalations(){
    if(state.loading)return loading();if(state.error)return error();if(!connected())return disconnected();
    const feed=state.feed||blank();
    return '<div class="vvn-section-title"><div><h3>'+T('Эскалации','Escalations')+'</h3><p>'+T('SLA и operational blockers из подтверждённых правил.','SLA and operational blockers from confirmed rules.')+'</p></div><span>'+E(String(feed.counts.escalations))+'</span></div>'+
      (feed.escalations.length?'<div class="vvn-list">'+feed.escalations.map(escalationRow).join('')+'</div>':'<section class="vvn-empty is-connected"><strong>'+T('Открытых эскалаций нет','No open escalations')+'</strong><p>'+T('Scheduler не обнаружил подтверждённых активных нарушений.','The scheduler has no confirmed active breaches.')+'</p><span>'+T('Источник подключён','Source connected')+'</span></section>');
  }
  function render(){
    ensure();
    const workConnected=connected(),session=configured();
    const label=workConnected?T('INBOX · CONNECTED · 30S POLL','INBOX · CONNECTED · 30S POLL'):session?T('INBOX · LOADING / UNAVAILABLE','INBOX · LOADING / UNAVAILABLE'):T('INBOX · NOT CONNECTED','INBOX · NOT CONNECTED');
    state.root.innerHTML='<header class="vvn-head"><div><small>VERTEX VISION / NOTIFICATIONS</small><h2>'+T('Центр уведомлений','Notification Center')+'</h2><p>'+T('Уведомления, SLA и эскалации — без фиктивных событий','Notifications, SLA and escalations — no fabricated events')+'</p></div><div class="vvn-head-actions"><span class="vvn-connection '+(workConnected?'is-on':'')+'">'+label+'</span><button data-vvn-refresh aria-label="'+T('Обновить','Refresh')+'">↻</button><button data-vvn-close aria-label="'+T('Закрыть','Close')+'">×</button></div></header>'+
      '<nav class="vvn-tabs">'+tabs().map(([id,label])=>'<button data-vvn-tab="'+id+'" aria-current="'+(state.tab===id?'page':'false')+'">'+E(label)+'</button>').join('')+'</nav>'+
      '<main class="vvn-main">'+(state.tab==='escalations'?escalations():inbox())+'</main>';
  }
  function syncHubBadge(){
    const badge=document.getElementById('visionNotificationCount');if(!badge)return;
    badge.textContent=connected()?String(state.feed?.counts?.unread??0):'—';
    badge.dataset.connected=connected()?'true':'false';
  }
  function open(tab='inbox'){
    ensure();state.lastFocus=document.activeElement;state.tab=tabs().some(([id])=>id===tab)?tab:'inbox';
    if(!configured()){state.feed=null;state.error=null;state.loading=false;}
    render();if(!state.dialog.open)state.dialog.showModal();
    if(configured()&&!state.loading&&!state.feed)refresh();
    startPolling();syncHubBadge();return true;
  }
  function status(){
    return {
      open:!!state.dialog?.open,tab:state.tab,configured:configured(),connected:connected(),loading:state.loading,mutating:state.mutating,
      counts:state.feed?{...state.feed.counts}:{unread:null,escalations:null},refreshMode:'polling-30s',
      eventConsumerConnected:false,escalationSchedulerConnected:false,lastRefreshAt:state.lastRefreshAt
    };
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.dialog?.open&&configured()&&!state.loading&&!state.mutating)refresh({silent:true});});
  new MutationObserver(()=>{if(state.dialog?.open)render();}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  root.VertexVisionNotifications=Object.freeze({open,refresh,status});
})(window);
