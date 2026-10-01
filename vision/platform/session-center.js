/* VERTEX VISION Session Center — Interface System 11.0
 * Real Supabase staging sign-in. Password and bearer token are never persisted by VISION.
 */
(function(root){
  'use strict';
  if(!root.document||root.VertexVisionSessionCenter)return;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const T=(ru,en)=>document.documentElement.lang==='en'?en:ru;
  const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const state={dialog:null,root:null,lastFocus:null,loading:false,error:null,config:null,token:null,userId:null,scopes:[],activeScope:null,context:null};

  function ensure(){
    if(state.dialog?.isConnected)return;
    const dialog=document.createElement('dialog');dialog.id='visionSessionCenter';dialog.className='vvsn-dialog';
    const shell=document.createElement('div');shell.className='vvsn-shell';dialog.append(shell);
    dialog.addEventListener('close',()=>{if(state.lastFocus?.isConnected)state.lastFocus.focus({preventScroll:true});});
    dialog.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.vvsnClose!==undefined){dialog.close();return;}
      if(button.dataset.vvsnRetry!==undefined){state.error=null;render();return;}
      if(button.dataset.vvsnLogout!==undefined){signOut();return;}
      if(button.dataset.vvsnScope){activateScope(button.dataset.vvsnScope);return;}
    });
    dialog.addEventListener('submit',event=>{
      if(event.target.matches('[data-vvsn-login]')){
        event.preventDefault();
        const form=new FormData(event.target);
        signIn(String(form.get('email')||''),String(form.get('password')||''));
      }
    });
    document.body.append(dialog);state.dialog=dialog;state.root=shell;
  }

  function errorText(code){
    return ({
      auth_config_unavailable:T('Staging Auth ещё не подключён.','Staging Auth is not connected yet.'),
      invalid_credentials:T('Неверный email или пароль.','Invalid email or password.'),
      auth_unavailable:T('Supabase Auth временно недоступен.','Supabase Auth is temporarily unavailable.'),
      no_views_scope:T('Для этого аккаунта нет доступного Views workspace.','This account has no available Views workspace.'),
      scope_activation_failed:T('Не удалось активировать Views workspace.','Could not activate the Views workspace.')
    })[code]||T('Не удалось выполнить вход.','Sign-in failed.');
  }

  async function readAuthConfig(){
    const response=await fetch('/auth-config',{headers:{accept:'application/json'},cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw Object.assign(new Error('auth_config_unavailable'),{code:'auth_config_unavailable'});
    const value=await response.json();
    if(!value||value.provider!=='supabase'||value.environment!=='staging'||typeof value.url!=='string'||!value.url.startsWith('https://')||typeof value.publishableKey!=='string'||!value.publishableKey.startsWith('sb_publishable_')||value.persistence!=='memory-only'){
      throw Object.assign(new Error('auth_config_unavailable'),{code:'auth_config_unavailable'});
    }
    return Object.freeze({...value});
  }

  async function readScopes(token){
    const response=await fetch('/api/v1/session-scopes',{
      headers:{accept:'application/json',authorization:'Bearer '+token},
      cache:'no-store',credentials:'same-origin'
    });
    let body=null;try{body=await response.json();}catch{}
    if(!response.ok)throw Object.assign(new Error(response.status===401?'invalid_credentials':'auth_unavailable'),{code:response.status===401?'invalid_credentials':'auth_unavailable'});
    if(!body||body.module!=='views'||!UUID.test(body.actorId||'')||!Array.isArray(body.scopes))throw Object.assign(new Error('auth_unavailable'),{code:'auth_unavailable'});
    return body;
  }

  async function signIn(email,password){
    if(state.loading)return false;
    email=email.trim();
    if(!email.includes('@')||email.length>254||password.length<8||password.length>256){state.error='invalid_credentials';render();return false;}
    state.loading=true;state.error=null;render();
    try{
      const config=await readAuthConfig();
      const response=await fetch(config.url+'/auth/v1/token?grant_type=password',{
        method:'POST',
        headers:{apikey:config.publishableKey,'content-type':'application/json'},
        body:JSON.stringify({email,password}),redirect:'error',credentials:'omit'
      });
      let body=null;try{body=await response.json();}catch{}
      if(!response.ok)throw Object.assign(new Error(response.status===429||response.status>=500?'auth_unavailable':'invalid_credentials'),{code:response.status===429||response.status>=500?'auth_unavailable':'invalid_credentials'});
      if(!UUID.test(body?.user?.id||'')||typeof body?.access_token!=='string'||body.access_token.length<20)throw Object.assign(new Error('auth_unavailable'),{code:'auth_unavailable'});
      // Intentionally retain only access_token in memory. refresh_token/password/email are not stored.
      const scopes=await readScopes(body.access_token);
      if(!scopes.scopes.length)throw Object.assign(new Error('no_views_scope'),{code:'no_views_scope'});
      state.config=config;state.token=body.access_token;state.userId=scopes.actorId;state.scopes=scopes.scopes;state.activeScope=null;state.context=null;
      if(state.scopes.length===1)await activateScope(state.scopes[0].tenantId+':'+state.scopes[0].organizationId,false);
      return true;
    }catch(error){
      root.VertexVisionViews?.clearSession?.();
      state.config=null;state.token=null;state.userId=null;state.scopes=[];state.activeScope=null;state.context=null;
      state.error=error?.code||'auth_unavailable';
      return false;
    }finally{state.loading=false;render();}
  }

  async function activateScope(key,rerender=true){
    const scope=state.scopes.find(item=>item.tenantId+':'+item.organizationId===key);
    if(!scope||!state.token)return false;
    state.loading=true;state.error=null;if(rerender)render();
    try{
      const context=await root.VertexVisionViews.configure({
        tenantId:scope.tenantId,
        organizationId:scope.organizationId,
        token:state.token
      });
      state.activeScope=scope;state.context=context;return true;
    }catch{
      root.VertexVisionViews?.clearSession?.();
      state.activeScope=null;state.context=null;state.error='scope_activation_failed';return false;
    }finally{state.loading=false;if(rerender)render();}
  }

  async function signOut(){
    const config=state.config,token=state.token;
    root.VertexVisionViews?.clearSession?.();
    state.config=null;state.token=null;state.userId=null;state.scopes=[];state.activeScope=null;state.context=null;state.error=null;
    render();
    if(config&&token){
      try{await fetch(config.url+'/auth/v1/logout',{method:'POST',headers:{apikey:config.publishableKey,authorization:'Bearer '+token},credentials:'omit'});}catch{}
    }
    return true;
  }

  function login(){
    return '<section class="vvsn-login"><strong>'+T('Вход в VERTEX VISION','Sign in to VERTEX VISION')+'</strong><p>'+T('Только staging Supabase Auth. Пароль и токен не сохраняются VISION.','Staging Supabase Auth only. VISION does not persist your password or token.')+'</p>'+
      '<form data-vvsn-login><label>'+T('Email','Email')+'<input name="email" type="email" autocomplete="username" maxlength="254" required></label>'+
      '<label>'+T('Пароль','Password')+'<input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="256" required></label>'+
      '<button type="submit">'+T('Войти','Sign in')+'</button></form></section>';
  }

  function scopes(){
    const active=state.activeScope;
    return '<section class="vvsn-session"><div class="vvsn-session-head"><div><small>'+T('Проверенный Auth ID','Verified Auth ID')+'</small><strong class="vvsn-mono">'+E(state.userId)+'</strong></div><button data-vvsn-logout>'+T('Выйти','Sign out')+'</button></div>'+
      '<h3>'+T('Views workspace','Views workspace')+'</h3>'+
      '<div class="vvsn-scopes">'+state.scopes.map(scope=>{
        const key=scope.tenantId+':'+scope.organizationId,isActive=active&&active.tenantId===scope.tenantId&&active.organizationId===scope.organizationId;
        return '<button data-vvsn-scope="'+E(key)+'" class="'+(isActive?'is-active':'')+'"><strong>'+E(scope.organizationName)+'</strong><span>'+(scope.memberAuthorized?T('Команда','Team'):'')+(scope.memberAuthorized&&scope.guestLinked?' · ':'')+(scope.guestLinked?T('Гость','Guest'):'')+'</span><small>'+E(scope.organizationId)+'</small></button>';
      }).join('')+'</div>'+
      (active?'<div class="vvsn-active"><span>'+T('Активная рабочая сессия','Active operational session')+'</span><strong>'+E(active.organizationName)+'</strong><small>'+E((state.context?.roles||[]).join(', ')||T('Guest scope','Guest scope'))+'</small></div>':'')+
      '</section>';
  }

  function content(){
    if(state.loading)return '<section class="vvsn-loading"><span></span><span></span><span></span></section>';
    if(state.error)return '<section class="vvsn-error"><strong>'+E(errorText(state.error))+'</strong><p>'+T('Демо-вход не подставляется. Нужна настоящая staging-конфигурация и разрешённый Auth пользователь.','No demo sign-in is substituted. A real staging configuration and authorized Auth user are required.')+'</p><button data-vvsn-retry>'+T('Назад','Back')+'</button></section>';
    return state.token?scopes():login();
  }

  function render(){
    ensure();
    state.root.innerHTML='<header class="vvsn-head"><div><small>VERTEX VISION / AUTH</small><h2>'+T('Рабочая сессия','Operational Session')+'</h2><p>'+T('Supabase Auth → VISION RBAC → Views workspace','Supabase Auth → VISION RBAC → Views workspace')+'</p></div><button data-vvsn-close aria-label="'+T('Закрыть','Close')+'">×</button></header><main>'+content()+'</main>';
  }

  function open(){
    ensure();state.lastFocus=document.activeElement;state.error=null;render();if(!state.dialog.open)state.dialog.showModal();return true;
  }
  function mount(){
    const actions=document.querySelector('#visionHome .vv-actions');if(!actions||actions.querySelector('[data-vv-session-center]'))return;
    const button=document.createElement('button');button.type='button';button.className='vv-button';button.dataset.vvSessionCenter='hero';button.textContent=T('Войти','Sign in');button.addEventListener('click',open);actions.append(button);
  }
  root.VertexVisionSessionCenter=Object.freeze({
    open,signOut,
    status:()=>Object.freeze({signedIn:!!state.token,userId:state.userId,scopeCount:state.scopes.length,activeOrganizationId:state.activeScope?.organizationId||null,persistence:'memory-only'})
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(window);
