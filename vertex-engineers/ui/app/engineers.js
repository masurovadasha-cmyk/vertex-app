import {prototypeSnapshot,handlePrototypeAction} from "./prototype.js";
import {createEngineersApi,loadEngineersOverview} from "./api-client.js";
import {readStagingScope} from "./scope.js";

const NAV=[
["dashboard","⌂","Dashboard"],["projects","▤","Projects"],["equipment","◫","Equipment"],
["service","⚙","Service"],["team","◎","Team"],["documents","▱","Documents"]
];
const TITLES=Object.fromEntries(NAV.map(([id,,label])=>[id,label]));
const q=s=>document.querySelector(s);
const nav=q("#nav"),content=q("#content"),title=q("#pageTitle"),dialog=q("#actionDialog");
const api=createEngineersApi({scopeProvider:async()=>readStagingScope()});
let liveState={mode:"preview",projects:[],assets:[],workOrders:[],error:null};
const primary=(label,action="new")=>'<button class="primary" data-action="'+action+'">'+label+"</button>";
const empty=(icon,heading,text,cta)=>'<div class="empty-state"><div class="empty-icon">'+icon+'</div><h3>'+heading+'</h3><p>'+text+'</p>'+(cta?primary(cta):"")+"</div>";

function metric(label,value,text){return '<article class="card"><span class="label">'+label+'</span><div class="metric '+(liveState.mode==="live"?"":"empty")+'">'+value+'</div><p>'+text+'</p></article>';}
function currentData(){const p=prototypeSnapshot();return {projects:liveState.mode==="live"?liveState.projects:p.projects,assets:liveState.mode==="live"?liveState.assets:p.assets,workOrders:liveState.mode==="live"?liveState.workOrders:p.workOrders};}
function banner(){return liveState.mode==="live"?"":'<div class="prototype-banner"><div><strong>WORKING PROTOTYPE</strong><small>Demo данные сохраняются только в этом браузере. Production/VISION не изменяются.</small></div><button class="secondary" data-action="reset-demo">Очистить demo</button></div>';}
function dashboard(){
 const stages=["Lead","Survey","Design","Estimate","Contract","Procurement","Installation","QA/QC","Commissioning","Handover","Warranty"]; const d=currentData();
 return banner()+'<div class="hero"><div class="hero-card"><span class="hero-tag">CONSTRUCTION • ELEVATORS • HVAC / MEP • SERVICE</span><h2>Инженерная компания в одном понятном рабочем пространстве.</h2><p>Проект → оборудование → сервис → специалист → документы и история. Без лишних разделов и дублирования.</p></div><div class="quick-card"><h3>Быстрые действия</h3><div class="quick-actions"><button class="quick-action" data-action="project">＋ Новый проект</button><button class="quick-action" data-action="equipment">＋ Добавить оборудование</button><button class="quick-action" data-action="service">＋ Создать сервисную заявку</button></div></div></div>'+
 '<div class="grid">'+metric("Projects",d.projects.length,liveState.mode==="live"?"Проекты из staging scope.":"Проекты появятся после verified staging identity.")+metric("Equipment",d.assets.length,liveState.mode==="live"?"Оборудование из staging scope.":"Лифты и HVAC используют одну карточку оборудования.")+metric("Service",d.workOrders.length,liveState.mode==="live"?"Сервисные заявки из staging scope.":"Плановые, аварийные и пусконаладочные работы.")+<article class="card wide"><h3>Проектный цикл</h3><p>Один последовательный процесс для строительных и инженерных проектов.</p><div class="steps">'+stages.map(x=>'<div class="step">'+x+"</div>").join("")+'</div></article><article class="card"><span class="label">Integration</span><div class="metric">0.2</div><p>VISION staging registered. Production не включён.</p></article></div>';
}
function rows(items,kind){
 if(!items.length)return "";
 return '<div class="list">'+items.map(item=>'<div class="list-row"><div><strong>'+escapeHtml(item.name||item.model||item.id)+'</strong><small>'+escapeHtml(item.site_address||item.site_location||item.type||kind)+'</small></div><span>'+escapeHtml(item.stage||item.category||item.priority||"—")+'</span><span>'+escapeHtml(item.status||"—")+'</span><span class="badge">STAGING</span></div>').join("")+'</div>';
}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
function projects(){const d=currentData();return banner()+'<div class="section-head"><div><p class="eyebrow">WORK</p><h2>Projects</h2><p>Все строительные и инженерные проекты в одном месте.</p></div>'+primary("+ Новый проект","project")+'</div><div class="notice">Проект содержит обзор, объект/клиента, этап, смету, оборудование, задачи, документы и историю.</div><div style="margin-top:18px">'+d.projects.length?rows(d.projects,"project"):empty("▤","Проектов пока нет","Создайте demo проект и проверьте рабочий сценарий.","Создать проект")+"</div>";}
function equipment(){const d=currentData();const filters=["Все","Лифты","Вентиляция","Отопление","Кондиционирование","Другое"];return banner()+'<div class="section-head"><div><p class="eyebrow">ASSETS</p><h2>Equipment</h2><p>Единый реестр инженерного оборудования.</p></div>'+primary("+ Оборудование","equipment")+'</div><div class="filter-row" style="margin-bottom:18px">'+filters.map((x,i)=>'<span class="chip '+(i===0?"active":"")+'">'+x+"</span>").join("")+'</div>'+(d.assets.length?rows(d.assets,"equipment"):empty("◫","Оборудование пока не добавлено",liveState.mode==="live"?"В текущем staging scope оборудования нет.":"Подключите verified staging identity, чтобы читать реальное оборудование.","Добавить оборудование"));}
function service(){const d=currentData();return banner()+'<div class="section-head"><div><p class="eyebrow">OPERATIONS</p><h2>Service</h2><p>Один сервисный центр для всего инженерного оборудования.</p></div>'+primary("+ Заявка","service")+'</div><div class="grid"><article class="card"><span class="label">Open</span><div class="metric empty">Нет заявок</div><p>Новые обращения и неисправности.</p></article><article class="card"><span class="label">In progress</span><div class="metric empty">Нет работ</div><p>Назначенные и выполняемые работы.</p></article><article class="card"><span class="label">Completed</span><div class="metric empty">Нет истории</div><p>Закрытые работы с инженером и результатом.</p></article></div><div style="margin-top:18px">'+d.workOrders.length?('<div class="list">'+d.workOrders.map(x=>'<div class="list-row"><div><strong>'+escapeHtml(x.type)+'</strong><small>'+escapeHtml(x.id)+'</small></div><span>'+escapeHtml(x.priority)+'</span><span>'+escapeHtml(x.status)+'</span><button class="row-action" data-action="advance:'+escapeHtml(x.id)+'">Следующий статус</button></div>').join("")+'</div>'):empty("⚙","Сервисных заявок нет","Создайте demo заявку и проведите её по статусам.","Создать заявку")+"</div>";}
function team(){return '<div class="section-head"><div><p class="eyebrow">PEOPLE</p><h2>Team</h2><p>Специалисты, направления и квалификационные документы.</p></div>'+primary("+ Специалист","team")+'</div>'+empty("◎","Команда пока не подключена","Один каталог специалистов: роль, специализации, лицензии/сертификаты, сроки действия и назначенные работы.","Добавить специалиста");}
function documents(){return '<div class="section-head"><div><p class="eyebrow">FILES & COMPLIANCE</p><h2>Documents</h2><p>Все документы проекта и оборудования в одном центре.</p></div>'+primary("+ Документ","document")+'</div><div class="list"><div class="list-row"><div><strong>Contracts</strong><small>Договоры и приложения</small></div><span>Project</span><span>—</span><span class="badge">EMPTY</span></div><div class="list-row"><div><strong>Estimates</strong><small>Сметы и версии</small></div><span>Project</span><span>—</span><span class="badge">EMPTY</span></div><div class="list-row"><div><strong>Design & Drawings</strong><small>Проекты, схемы и чертежи</small></div><span>Engineering</span><span>—</span><span class="badge">EMPTY</span></div><div class="list-row"><div><strong>Licenses & Certificates</strong><small>Документы компании и специалистов</small></div><span>Compliance</span><span>—</span><span class="badge">EMPTY</span></div><div class="list-row"><div><strong>Commissioning & Service</strong><small>Акты и сервисные отчёты</small></div><span>Equipment</span><span>—</span><span class="badge">EMPTY</span></div></div>';}
const renderers={dashboard,projects,equipment,service,team,documents};
function render(id){const page=renderers[id]?id:"dashboard";location.hash=page;title.textContent=TITLES[page];content.innerHTML=(liveState.error?'<div class="notice">Staging data недоступны: '+escapeHtml(liveState.error)+'</div>':"")+renderers[page]();nav.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));q(".sidebar").classList.remove("open");}
nav.innerHTML=NAV.map(([id,icon,label])=>'<button class="nav-item" data-page="'+id+'"><span class="nav-icon">'+icon+'</span><span>'+label+"</span></button>").join("");
nav.addEventListener("click",e=>{const b=e.target.closest("[data-page]");if(b)render(b.dataset.page);});
document.addEventListener("click",e=>{const b=e.target.closest("[data-action]");if(!b)return;const action=b.dataset.action;if(liveState.mode!=="live"&&["project","equipment","service","reset-demo"].some(x=>action===x||action.startsWith("advance:"))){handlePrototypeAction(action);return;}const copy={new:["Создать","Выберите нужный раздел: проект, оборудование или сервис."],project:["Новый проект","Форма будет подключена к POST /projects после staging identity/persistence adapter."],equipment:["Новое оборудование","Лифты и HVAC используют существующие asset endpoints. Реальные записи пока не создаются из этого preview."],service:["Новая заявка","Форма будет использовать POST /work-orders после staging подключения."],team:["Новый специалист","Team persistence/API ещё не активированы в runtime 0.2."],document:["Новый документ","Document storage ещё не активирован в runtime 0.2."]}[action]||["Действие","Функция готовится."];q("#dialogTitle").textContent=copy[0];q("#dialogText").textContent=copy[1];dialog.showModal();});
q("#menuButton").addEventListener("click",()=>q(".sidebar").classList.toggle("open"));
window.addEventListener("hashchange",()=>render(location.hash.slice(1)));
window.addEventListener("prototype-change",()=>render(location.hash.slice(1)||"dashboard"));
async function hydrate(){
 try{
   await api.health();
   const scope=readStagingScope();
   if(!scope){liveState={mode:"preview",projects:[],assets:[],workOrders:[],error:null};return;}
   const data=await loadEngineersOverview(api);
   liveState={mode:"live",...data,error:null};
 }catch(error){
   liveState={mode:"preview",projects:[],assets:[],workOrders:[],error:error?.message||"unknown error"};
 }
}
await hydrate();
render(location.hash.slice(1)||"dashboard");
