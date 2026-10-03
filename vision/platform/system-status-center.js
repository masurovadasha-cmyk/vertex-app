/* VERTEX VISION System Status Center — Interface System 10.0 */
(function(root){
  'use strict';
  if(!root.document||root.VertexVisionSystemStatus)return;
  const T=(ru,en)=>document.documentElement.lang==='en'?en:ru;
  const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const state={dialog:null,root:null,lastFocus:null,loading:false,error:null,data:null,lastRefreshAt:null};
  function ensure(){
    if(state.dialog?.isConnected)return;
    const dialog=document.createElement('dialog');dialog.id='visionSystemStatus';dialog.className='vvs-dialog';
    const shell=document.createElement('div');shell.className='vvs-shell';dialog.append(shell);
    dialog.addEventListener('close',()=>{if(state.lastFocus?.isConnected)state.lastFocus.focus({preventScroll:true});});
    dialog.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.vvsClose!==undefined){dialog.close();return;}
      if(button.dataset.vvsRefresh!==undefined){refresh();return;}
    });
    document.body.append(dialog);state.dialog=dialog;state.root=shell;
  }
  const badge=(label,value,stateClass='')=>'<div class="vvs-card '+stateClass+'"><span>'+E(label)+'</span><strong>'+E(value)+'</strong></div>';
  const yesNo=value=>value===true?T('ДА','YES'):value===false?T('НЕТ','NO'):'—';
  function content(){
    if(state.loading)return '<section class="vvs-loading"><span></span><span></span><span></span></section>';
    if(state.error)return '<section class="vvs-empty"><strong>'+T('System Status недоступен','System Status unavailable')+'</strong><p>'+T('VISION не подставляет фиктивное состояние.','VISION does not substitute fabricated state.')+'</p><button data-vvs-refresh>'+T('Повторить','Retry')+'</button></section>';
    if(!state.data)return '<section class="vvs-empty"><strong>'+T('Статус ещё не проверен','Status has not been checked yet')+'</strong></section>';
    const d=state.data;
    return '<section class="vvs-grid">'+
      badge(T('Backend настроен','Backend configured'),yesNo(d.backendConfigured),d.backendConfigured?'is-ok':'')+
      badge(T('Readiness проверен','Readiness checked'),yesNo(d.readinessChecked),d.readinessChecked?'is-ok':'')+
      badge(T('Database ready','Database ready'),yesNo(d.databaseReady),d.databaseReady===true?'is-ok':d.databaseReady===false?'is-bad':'')+
      badge(T('Views release active','Views release active'),yesNo(d.viewsReleaseActive),d.viewsReleaseActive===true?'is-ok':'')+
      badge(T('Notification consumer','Notification consumer'),d.backgroundConsumerConnected?T('ПОДКЛЮЧЕН','CONNECTED'):T('НЕ ПОДКЛЮЧЕН','NOT CONNECTED'),d.backgroundConsumerConnected?'is-ok':'')+
      badge(T('SLA scheduler','SLA scheduler'),d.escalationSchedulerConnected?T('ПОДКЛЮЧЕН','CONNECTED'):T('НЕ ПОДКЛЮЧЕН','NOT CONNECTED'),d.escalationSchedulerConnected?'is-ok':'')+
      '</section>'+
      '<section class="vvs-meta">'+
      '<div><span>'+T('Architecture','Architecture')+'</span><strong>'+E(d.architectureVersion||'—')+'</strong></div>'+
      '<div><span>'+T('Required migration','Required migration')+'</span><strong>'+E(d.requiredMigration||'—')+'</strong></div>'+
      '<div><span>'+T('Latest migration','Latest migration')+'</span><strong>'+E(d.latestMigration||'—')+'</strong></div>'+
      '<div><span>'+T('Migration count','Migration count')+'</span><strong>'+E(d.migrationCount??'—')+'</strong></div>'+
      '<div><span>'+T('Source commit','Source commit')+'</span><strong class="vvs-mono">'+E(d.sourceCommit||'—')+'</strong></div>'+
      '<div><span>'+T('Environment','Environment')+'</span><strong>'+E(d.environment||'—')+'</strong></div>'+
      '</section>'+
      '<p class="vvs-note">'+T('Показываются только фактические runtime-сигналы. Секреты, токены и строки подключения здесь никогда не отображаются.','Only factual runtime signals are shown. Secrets, tokens, and connection strings are never displayed here.')+'</p>';
  }
  function render(){
    ensure();
    state.root.innerHTML='<header class="vvs-head"><div><small>VERTEX VISION / SYSTEM</small><h2>'+T('Состояние системы','System Status')+'</h2><p>'+T('Runtime, database readiness и фоновые процессы','Runtime, database readiness, and background operations')+'</p></div><div class="vvs-actions"><button data-vvs-refresh aria-label="'+T('Обновить','Refresh')+'">↻</button><button data-vvs-close aria-label="'+T('Закрыть','Close')+'">×</button></div></header><main>'+content()+'</main>';
  }
  async function refresh(){
    state.loading=true;state.error=null;render();
    try{
      const response=await fetch('/system-status',{headers:{accept:'application/json'},cache:'no-store',credentials:'same-origin'});
      if(!response.ok)throw new Error('status_unavailable');
      const value=await response.json();
      if(!value||value.service!=='VERTEX VISION'||!['staging','public-demo'].includes(value.environment))throw new Error('invalid_status');
      state.data=value;state.lastRefreshAt=new Date().toISOString();return value;
    }catch(error){state.error=error;state.data=null;return null;}
    finally{state.loading=false;render();}
  }
  function open(){
    ensure();state.lastFocus=document.activeElement;render();if(!state.dialog.open)state.dialog.showModal();refresh();return true;
  }
  function mount(){
    const actions=document.querySelector('#visionHome .vv-actions');if(!actions||actions.querySelector('[data-vv-system-status]'))return;
    const button=document.createElement('button');button.type='button';button.className='vv-button';button.dataset.vvSystemStatus='hero';button.textContent=T('Система','System');button.addEventListener('click',open);actions.append(button);
  }
  root.VertexVisionSystemStatus=Object.freeze({open,refresh,status:()=>state.data?{...state.data}:null});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(window);
