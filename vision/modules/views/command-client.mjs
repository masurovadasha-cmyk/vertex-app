// A retry keeps exactly the same command and key, including after a page reload.
// Storage contains synthetic dev IDs only; this is not an Auth/session store.
export function createCommandClient({storage,fetcher=fetch,uuid=()=>crypto.randomUUID()}){
  const key='vision.views.pending-command.v1';let pending;
  try{pending=JSON.parse(storage.getItem(key)||'null');}catch{throw new Error('Не удалось прочитать незавершённый запрос. Не создавайте повторный запрос до проверки.');}
  if(pending&&(pending.type!=='create'||typeof pending.idempotency_key!=='string'))throw new Error('Сохранённый запрос повреждён. Требуется проверка.');
  let busy=false;
  return {
    get pending(){return Boolean(pending);},
    async submit(fields){
      if(busy)throw new Error('Запрос уже отправляется');busy=true;
      try{
        if(!pending){
          const candidate={...fields,type:'create',idempotency_key:uuid()};
          // Do not send if persistence fails: a reload must not create a new key.
          storage.setItem(key,JSON.stringify(candidate));pending=candidate;
        }
        const response=await fetcher('/api/commands',{method:'POST',headers:{'content-type':'application/json','x-vision-profile':'views'},body:JSON.stringify(pending),signal:AbortSignal.timeout(10000)});
        if(!response.ok){
          if(response.status>=400&&response.status<500&&![408,409,429].includes(response.status)){storage.removeItem(key);pending=null;}
          throw new Error(response.status===403?'Нет доступа к этому запросу.':'Запрос не подтверждён. Повтор сохранит тот же номер операции.');
        }
        const result=await response.json();
        if(!result?.order_id||!Number.isInteger(Number(result.version)))throw new Error('Ответ не подтверждён. Повторите тот же запрос.');
        storage.removeItem(key);pending=null;return result;
      }finally{busy=false;}
    }
  };
}
