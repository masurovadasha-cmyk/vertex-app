import {createPrototypeStore} from "./prototype-store.js";
const store=createPrototypeStore();
const q=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function option(items,label){return items.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name||x.model||x.id)+"</option>").join("");}
function modal(title,body,onSubmit){
 const d=document.createElement("dialog");d.innerHTML='<form method="dialog" class="dialog-card prototype-form"><div class="dialog-head"><div><p class="eyebrow">DEMO / LOCAL ONLY</p><h2>'+esc(title)+'</h2></div><button class="icon-button" value="cancel">×</button></div>'+body+'<div class="dialog-actions"><button value="cancel" class="secondary">Отмена</button><button value="default" class="primary">Сохранить demo</button></div></form>';document.body.append(d);
 d.addEventListener("close",()=>{if(d.returnValue==="default"){const form=d.querySelector("form");const values=Object.fromEntries(new FormData(form));try{onSubmit(values);window.dispatchEvent(new Event("prototype-change"));}catch(e){alert(e.message);}}d.remove();});d.showModal();
}
export function prototypeSnapshot(){return store.snapshot();}
export function handlePrototypeAction(action){
 const s=store.snapshot();
 if(action==="project")modal("Новый demo проект",'<label>Название<input name="name" required placeholder="Например: Монтаж лифтов"></label><label>Тип<select name="type"><option value="elevator">Лифты</option><option value="hvac">HVAC / MEP</option><option value="mixed">Комплексный</option></select></label><label>Объект<input name="site_address" placeholder="Demo объект"></label>',v=>store.createProject(v));
 else if(action==="equipment")modal("Добавить demo оборудование",'<label>Проект<select name="project_id" required><option value="">Выберите</option>'+option(s.projects,"project")+'</select></label><label>Категория<select name="category"><option value="elevator">Лифт</option><option value="ventilation_ahu">Вентиляция / AHU</option><option value="heating_heat_pump">Отопление</option><option value="hvac_vrf">Кондиционирование / VRF</option></select></label><label>Производитель<input name="manufacturer" placeholder="Demo / optional"></label><label>Модель<input name="model" placeholder="Demo / optional"></label>',v=>store.addEquipment(v));
 else if(action==="service")modal("Новая demo заявка",'<label>Оборудование<select name="asset_id" required><option value="">Выберите</option>'+option(s.assets,"asset")+'</select></label><label>Тип<select name="type"><option value="preventive">Плановое ТО</option><option value="corrective">Ремонт</option><option value="emergency">Аварийная</option><option value="inspection">Инспекция</option><option value="commissioning">Пусконаладка</option></select></label><label>Приоритет<select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label>',v=>store.createWorkOrder(v));
 else if(action==="reset-demo"){if(confirm("Очистить все demo данные?")){store.reset();window.dispatchEvent(new Event("prototype-change"));}}
 else if(action.startsWith("advance:")){store.advanceWorkOrder(action.slice(8));window.dispatchEvent(new Event("prototype-change"));}
}
