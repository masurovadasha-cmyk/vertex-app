// Access tokens live only in memory. Pending commands contain IDs, never Auth data.
export function createCloudClient({fetcher=fetch,storage,uuid=()=>crypto.randomUUID(),now=()=>Date.now()}){
 let config,token,expires=0,scope,busy=false,generation=0;
 const clear=()=>{generation++;token=undefined;scope=undefined;expires=0;};
 const current=g=>{if(g!==generation)throw new Error('Сеанс изменился. Войдите снова.');};
 async function read(response,g){const value=await response.json();current(g);return value;}
 const call=(url,options={})=>fetcher(url,{...options,cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)});
 async function api(path,options={}){
  if(!token||now()>=expires){clear();throw new Error('Сеанс завершён. Войдите снова.');}
  const activeToken=token,g=generation;
  const r=await call(path,{...options,headers:{...options.headers,authorization:'Bearer '+activeToken}});
  current(g);
  if(r.status===401){clear();throw new Error('Сеанс завершён. Войдите снова.');}
  return r;
 }
 return {
  get scope(){return scope;},
  async configure(){
   const r=await call('/auth/config');if(!r.ok)throw new Error('Вход временно недоступен.');
   const c=await r.json();
   if(!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(c.url)||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(c.publishable_key))throw new Error('Настройки входа недоступны.');
   config=c;
  },
  async login(email,password){
   clear();const g=generation;if(!config)throw new Error('Вход ещё не готов.');
   const r=await call(config.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.publishable_key,'content-type':'application/json'},body:JSON.stringify({email,password})});
   current(g);
   if(!r.ok)throw new Error(r.status===429?'Слишком много попыток. Попробуйте позже.':'Не удалось войти. Проверьте email и пароль.');
   const s=await read(r,g);
   if(typeof s.access_token!=='string'||!Number.isFinite(s.expires_in)||s.expires_in<=0)throw new Error('Вход не подтверждён.');
   token=s.access_token;expires=now()+Math.min(s.expires_in,3600)*1000;
   try{const response=await api('/api/session');if(!response.ok)throw new Error('Не удалось проверить права.');scope=await read(response,g);
    if(!scope?.user_id||!scope?.tenant_id){throw new Error('Учётная запись создана. Доступ к VISION ещё не назначен.');}
    return scope;
   }catch(e){if(g===generation)clear();throw e;}
  },
  async logout(){const t=token;clear();if(t&&config){try{await call(config.url+'/auth/v1/logout',{method:'POST',headers:{apikey:config.publishable_key,authorization:'Bearer '+t}});}catch{/* Local session is already closed; token is not retained. */}}},
  async orders(cursor){
   const g=generation;
   const r=await api('/api/orders?tenant_id='+encodeURIComponent(scope?.tenant_id||'')+(cursor?'&cursor='+encodeURIComponent(cursor):''));
   if(!r.ok)throw new Error('Не удалось загрузить заявки.');
   const orders=await read(r,g);if(!Array.isArray(orders))throw new Error('Некорректный ответ списка заявок.');
   return {orders,nextCursor:r.headers.get('x-vision-next-cursor')};
  },
  async createRequest(fields){
   if(!scope)throw new Error('Войдите в VISION.');if(busy)throw new Error('Заявка уже отправляется.');busy=true;
   const g=generation,key='vision.pending.'+scope.user_id+'.'+scope.tenant_id;
   try{
    let command;
    try{command=JSON.parse(storage.getItem(key)||'null');}catch{throw new Error('Не удалось прочитать предыдущую заявку. Нужна проверка перед повтором.');}
    if(command&&(command.type!=='create'||command.tenant_id!==scope.tenant_id||typeof command.idempotency_key!=='string'))throw new Error('Сохранённая заявка повреждена. Нужна проверка.');
    if(!command){command={...fields,type:'create',tenant_id:scope.tenant_id,idempotency_key:uuid()};storage.setItem(key,JSON.stringify(command));}
    const r=await api('/api/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)});
    if(!r.ok){
     if(r.status>=400&&r.status<500&&![408,409,429].includes(r.status))storage.removeItem(key);
     throw new Error('Заявка не подтверждена. Повторите отправку: номер операции сохранён.');
    }
    const result=await read(r,g);if(!result?.order_id||!Number.isInteger(Number(result.version)))throw new Error('Ответ не подтверждён. Повторите отправку.');
    storage.removeItem(key);return result;
   }finally{busy=false;}
  }
 };
}
