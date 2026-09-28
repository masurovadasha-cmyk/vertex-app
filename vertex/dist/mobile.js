// Shared mobile interactions used by the live prototype and Canva import.
const originalRender = render;
let activeTab = 'home';
let installPrompt = null;
let storageAvailable = true;
const loadLocal = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('vertex-demo-v2') || 'null');
    if (!saved) return;
    lang = saved.lang === 'en' ? 'en' : 'ru';
    cart = (Array.isArray(saved.items) ? saved.items : []).flatMap(item => {
      const product = [...stays, ...services].find(x => x.id === item.id);
      if (!product || !Number.isFinite(item.amount) || item.amount <= 0) return [];
      const datePattern = /^\d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}$/;
      return [{...product, amount:item.amount, ...(datePattern.test(item.dates || '') ? {dates:item.dates} : {})}];
    }).slice(0, 100);
  } catch { storageAvailable = false; }
};
function saveLocal() {
  try { localStorage.setItem('vertex-demo-v2', JSON.stringify({lang, items:cart.map(({id,amount,dates})=>({id,amount,dates}))})); }
  catch { storageAvailable = false; }
}
const originalTotal = updateTotal;
updateTotal = function(){originalTotal();saveLocal();};
function bottomNavigation() {
  const tabs = [['home','⌂','Главная','Home'],['explore','⌖','Обзор','Explore'],['trips','▤','Поездки','Trips'],['services','✧','Сервисы','Services'],['profile','○','Профиль','Profile']];
  $('mobileNav').innerHTML=tabs.map(([id,icon,ru,en])=>`<button data-tab="${id}" ${activeTab===id?'aria-current="page"':''}><span aria-hidden="true">${icon}</span>${tr(ru,en)}</button>`).join('');
  $('mobileNav').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    activeTab=b.dataset.tab;bottomNavigation();
    if(activeTab==='trips')return showCart();
    if(activeTab==='explore')return showMap();
    if(activeTab==='profile')return showProfile();
    category=activeTab==='services'?'all':'stays';render();
    $('sectionHeading').scrollIntoView({behavior:'smooth',block:'start'});
  });
}
function allServiceCards(){
  $('sectionHeading').textContent=tr('Все сервисы','All services');
  $('results').innerHTML=services.map(x=>`<article class="card service-card"><span class="service-icon" aria-hidden="true">${x.icon}</span><h3>${title(x)}</h3><p>${lang==='ru'?x.descRu:x.descEn}</p><div class="price-row"><strong>${money(x.price)}</strong><button data-service="${x.id}">${tr('Добавить +','Add +')}</button></div></article>`).join('');
  $('results').querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>addService(b.dataset.service));
}
render=function(){
  if($('searchError').textContent) $('searchError').textContent='';
  const all=category==='all';if(all)category='care';originalRender();if(all){category='all';allServiceCards();}
  $('eyebrow').textContent=tr('VERTEX · ДЕМО-ПРИЛОЖЕНИЕ','VERTEX · DEMO APP');
  $('headline').textContent=tr('Вся поездка.\nВ одном месте.','Your whole journey.\nOne place.');
  $('mapButton').textContent=tr('⌖ Обзор мест','⌖ Explore places');
  $('allServices').onclick=()=>{activeTab='services';category='all';render();$('sectionHeading').scrollIntoView({behavior:'smooth'});};
  $('demoTrip').textContent=tr('Попробовать поездку · $451','Try a trip · $451');
  $('installButton').textContent=tr('На телефон ↗','Get the app ↗');
  bottomNavigation();saveLocal();
};
function showProfile(){
  modal(tr('Профиль и приложение','Profile & app'),`<p class="notice">${tr('Гостевой демо-профиль. Поездка сохраняется только в этом браузере на этом устройстве.','Guest demo profile. Your trip is saved only in this browser on this device.')}</p><div class="line-item"><strong>${tr('Язык','Language')}</strong><button class="outline" id="profileLanguage">${lang==='ru'?'English':'Русский'}</button></div><button id="profileInstall" class="dark wide">${tr('Добавить Vertex на телефон','Add Vertex to your phone')}</button><p class="demo">${storageAvailable?tr('Демо-корзина сохранена на устройстве.','Demo trip saved on this device.'):tr('Сохранение недоступно в этом браузере.','Storage is unavailable in this browser.')}</p>`);
  $('profileLanguage').onclick=()=>{lang=lang==='ru'?'en':'ru';render();showProfile();};
  $('profileInstall').onclick=showInstall;
}
async function showInstall(){
  if(installPrompt){const p=installPrompt;installPrompt=null;await p.prompt();await p.userChoice;return;}
  const installed=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  modal(tr('Vertex на телефоне','Vertex on your phone'),installed?`<p>${tr('Приложение уже открыто с главного экрана.','The app is already running from your home screen.')}</p>`:`<p>${tr('Откройте эту страницу в браузере телефона. Для приватной версии войдите под аккаунтом владельца.','Open this page in your phone browser. Sign in as the owner to access this private version.')}</p><div class="place"><strong>iPhone · Safari</strong><p>${tr('Поделиться → На экран «Домой» → Добавить.','Share → Add to Home Screen → Add.')}</p></div><div class="place"><strong>Android · Chrome</strong><p>${tr('Меню ⋮ → Добавить на главный экран → Установить или Создать ярлык.','Menu ⋮ → Add to Home screen → Install or Create shortcut.')}</p></div><p class="notice">${tr('Это веб-приложение. Доступность установки зависит от браузера; бронирования и платежи демонстрационные.','This is a web app. Installation availability depends on your browser; bookings and payments are demonstrations.')}</p>`);
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
$('installButton').onclick=showInstall;
$('demoTrip').onclick=()=>{
  // Use the same prices and dates as the shared Canva demonstration.
  $('arrival').value='2026-10-12';$('departure').value='2026-10-15';$('guests').value='2';
  const itinerary=[{...stays[0],amount:360,dates:'2026-10-12 → 2026-10-15'},...['taxi','meal','laundry','tour'].map(id=>{const x=services.find(s=>s.id===id);return {...x,amount:x.price};})];
  if(cart.length){modal(tr('Открыть пример поездки?','Open the example trip?'),`<p>${tr('Текущая демо-корзина будет заменена примером из Canva: 5 позиций, 3 ночи, $451.','Your current demo cart will be replaced by the Canva example: 5 items, 3 nights, $451.')}</p><button class="dark wide" id="replaceDemo">${tr('Открыть пример','Open example')}</button>`);$('replaceDemo').onclick=()=>{cart=itinerary;updateTotal();showCart();};}else{cart=itinerary;updateTotal();showCart();}
};
const oldSelect=selectCategory;
selectCategory=function(c){activeTab=c==='stays'?'home':'services';oldSelect(c);};
const oldDatesValid=datesValid;
datesValid=function(){if(!oldDatesValid())return false;const now=new Date();const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;if($('arrival').value<today){$('searchError').textContent=tr('Выберите заезд сегодня или позже.','Choose today or a later check-in date.');return false;}return true;};
$('search').onsubmit=e=>{e.preventDefault();if(!datesValid())return;city=$('destination').value;activeTab='home';category='stays';render();$('sectionHeading').scrollIntoView({behavior:'smooth'});};
loadLocal();render();


// Vertex Group phone pack
const vgDepartments={taxi:'Vertex Mobility',comfort:'Vertex Mobility',car:'Vertex Rent Car',flight:'Vertex Travel · авиакасса',rail:'Vertex Travel · ЖД',bus:'Vertex Travel · автобусы',market:'V-Market',meal:'D’italia Ristorante',meals3:'D’italia Ristorante',bar:'Bar',laundry:'Vertex Laundry',cleaning:'Vertex Cleaning',concierge:'Concierge',electrician:'Vertex Engineers · электрик',plumber:'Vertex Engineers · сантехник',carpenter:'Vertex Engineers · плотник',tour:'Vertex Travel',guide:'Vertex Travel',museum:'Vertex Travel',resort:'Vertex Travel',propertyRent:'Vertex Real Estate',propertyBuy:'Vertex Real Estate',propertySell:'Vertex Real Estate'};
let vgRole='guest',vgRequests=[];
services.push(
{id:'bus',cat:'tickets',icon:'▣',ru:'Автобусные билеты',en:'Bus tickets',price:12,descRu:'Демо-маршрут по Узбекистану · от $12',descEn:'Uzbekistan demo route · from $12'},
{id:'meals3',cat:'food',icon:'◉',ru:'Питание 3 раза в день',en:'3 meals a day',price:35,descRu:'Демо-пакет питания на гостя в день',descEn:'Demo meal package per guest/day'},
{id:'cleaning',cat:'care',icon:'✧',ru:'Клининг',en:'Cleaning',price:20,descRu:'Уборка апартамента по заявке гостя',descEn:'Apartment cleaning on request'},
{id:'electrician',cat:'care',icon:'⚡',ru:'Электрик',en:'Electrician',price:0,descRu:'Заявка техслужбе · цена после диагностики',descEn:'Maintenance request · quote after diagnosis'},
{id:'plumber',cat:'care',icon:'◌',ru:'Сантехник',en:'Plumber',price:0,descRu:'Заявка техслужбе · цена после диагностики',descEn:'Maintenance request · quote after diagnosis'},
{id:'carpenter',cat:'care',icon:'▱',ru:'Плотник / мастер',en:'Carpenter / handyman',price:0,descRu:'Заявка мастеру · цена после диагностики',descEn:'Handyman request · quote after diagnosis'},
{id:'museum',cat:'explore',icon:'▤',ru:'Музеи и достопримечательности',en:'Museums & attractions',price:8,descRu:'Демо-билет · live-цены подключим через API',descEn:'Demo admission · live API pricing later'},
{id:'resort',cat:'explore',icon:'△',ru:'Горный отдых Узбекистана',en:'Uzbekistan mountain escapes',price:75,descRu:'Амирсой · Чимган · Чарвак · демо-пакет',descEn:'Amirsoy · Chimgan · Charvak · demo package'},
{id:'propertyRent',cat:'property',icon:'⌂',ru:'Арендовать недвижимость',en:'Rent property',price:0,descRu:'Апартаменты Vertex и партнёрские объекты',descEn:'Vertex apartments and partner listings'},
{id:'propertyBuy',cat:'property',icon:'◇',ru:'Купить недвижимость',en:'Buy property',price:0,descRu:'Подбор объекта и сопровождение сделки',descEn:'Property search and transaction support'},
{id:'propertySell',cat:'property',icon:'↗',ru:'Продать недвижимость',en:'Sell property',price:0,descRu:'Заявка в Vertex Real Estate',descEn:'Request to Vertex Real Estate'}
);
if(!cats.some(c=>c[0]==='property'))cats.push(['property','⌂','Недвижимость','Real estate']);
if(!stays.some(s=>s.id==='utower'))stays.push({id:'utower',city:'Tashkent',ru:'NRG U-Tower · Views',en:'NRG U-Tower · Views',price:120,photo:null,capacity:4},{id:'nestone',city:'Tashkent',ru:'Nest One · Views',en:'Nest One · Views',price:135,photo:null,capacity:4});
function vgSave(){try{localStorage.setItem('vertex-group-phone-v1',JSON.stringify({role:vgRole,requests:vgRequests}))}catch{}}
function vgLoad(){try{const x=JSON.parse(localStorage.getItem('vertex-group-phone-v1')||'null');if(x){vgRole=['guest','staff','admin'].includes(x.role)?x.role:'guest';vgRequests=Array.isArray(x.requests)?x.requests.slice(0,50):[]}}catch{}}
vgLoad();
function vgRequest(id){const x=services.find(s=>s.id===id);if(!x)return;const dep=vgDepartments[id]||'Concierge';modal(title(x),'<p>'+(lang==='ru'?x.descRu:x.descEn)+'</p><div class="route-box"><span>'+tr('Будет направлено','Routed to')+'</span><strong>'+dep+'</strong></div><label class="field"><span>'+tr('Комментарий','Comment')+'</span><textarea id="vgNote" rows="4"></textarea></label><button class="dark wide" id="vgSend">'+tr('Отправить заявку','Send request')+'</button>');$('vgSend').onclick=()=>{vgRequests.unshift({id:String(Date.now()),service:id,title:title(x),department:dep,note:$('vgNote').value.trim(),status:'new',created:new Date().toLocaleString(lang==='ru'?'ru-RU':'en-US')});vgSave();$('modal').close();notify()}}
function vgShowRequests(){const sn=s=>s==='done'?tr('Выполнено','Done'):s==='progress'?tr('В работе','In progress'):tr('Новая','New');modal(tr('Мои заявки','My requests'),vgRequests.length?vgRequests.map(r=>'<div class="request-card"><strong>'+r.title+'</strong><p>'+r.department+'</p><small>'+r.created+'</small>'+(r.note?'<p>'+r.note+'</p>':'')+'<span class="status '+r.status+'">'+sn(r.status)+'</span>'+(vgRole!=='guest'?'<div class="request-actions"><button data-vgp="'+r.id+'">'+tr('В работу','Start')+'</button><button data-vgd="'+r.id+'">'+tr('Готово','Done')+'</button></div>':'')+'</div>').join(''):'<p>'+tr('Заявок пока нет.','No requests yet.')+'</p>');$('modalBody').querySelectorAll('[data-vgp]').forEach(b=>b.onclick=()=>{const r=vgRequests.find(x=>x.id===b.dataset.vgp);if(r)r.status='progress';vgSave();vgShowRequests()});$('modalBody').querySelectorAll('[data-vgd]').forEach(b=>b.onclick=()=>{const r=vgRequests.find(x=>x.id===b.dataset.vgd);if(r)r.status='done';vgSave();vgShowRequests()})}
function vgPackage(){const o=[['rail',35,'ЖД билет','Rail ticket'],['bus',12,'Автобус','Bus'],['taxi',18,'Трансфер','Transfer'],['meals3',35,'3-разовое питание','3 meals/day'],['guide',90,'Личный гид','Private guide'],['museum',8,'Музеи','Museums'],['resort',75,'Горный отдых','Mountain escape']];modal(tr('Конструктор турпакета','Travel package builder'),'<p class="notice">'+tr('Демо-пакет по Узбекистану. Live-цены и реальная покупка будут подключены через API провайдеров.','Uzbekistan demo package. Live prices and real ticketing will use provider APIs.')+'</p><div class="package-grid"><label><span>'+tr('Город','City')+'</span><select id="vgCity"><option>Ташкент</option><option>Самарканд</option><option>Бухара</option><option>Хива</option></select></label><label><span>'+tr('Гостей','Guests')+'</span><input id="vgGuests" type="number" min="1" max="20" value="2"></label></div><div class="package-options">'+o.map(x=>'<label><input type="checkbox" data-vgo data-price="'+x[1]+'" checked><span>'+(lang==='ru'?x[2]:x[3])+'</span><strong>'+money(x[1])+'</strong></label>').join('')+'</div><div class="trip-total"><span>'+tr('Итого от','Total from')+'</span><strong id="vgPkgTotal"></strong></div><button class="dark wide" id="vgAddPkg">'+tr('Добавить пакет в поездку','Add package to trip')+'</button>');const calc=()=>{const g=Math.max(1,Number($('vgGuests').value)||1),sum=[...$('modalBody').querySelectorAll('[data-vgo]:checked')].reduce((s,e)=>s+Number(e.dataset.price),0)*g;$('vgPkgTotal').textContent=money(sum);return sum};$('modalBody').querySelectorAll('[data-vgo]').forEach(e=>e.onchange=calc);$('vgGuests').oninput=calc;calc();$('vgAddPkg').onclick=()=>{const amount=calc(),c=$('vgCity').value;cart.push({id:'vg-package',ru:'Турпакет · '+c,en:'Travel package · '+c,amount});updateTotal();$('modal').close();notify()}}
function vgCalendar(){const rows=[['29.09','№49','Выезд 12:00'],['29.09','№131','Заезд 14:00'],['30.09','NRG U-Tower','Клининг 12:30'],['01.10','Nest One','Заезд 14:00']];modal(tr('Календарь операций','Operations calendar'),'<p class="notice">'+tr('Демо-календарь. Далее синхронизация Airbnb, Booking и собственного канала.','Demo calendar. Next: Airbnb, Booking and direct-channel sync.')+'</p><div class="calendar-list">'+rows.map(r=>'<div><strong>'+r[0]+'</strong><span>'+r[1]+'</span><b>'+r[2]+'</b></div>').join('')+'</div>')}
function vgTeam(){const teams=['Concierge','D’italia Ristorante','Bar','Vertex Engineers · электрик','Vertex Engineers · сантехник','Vertex Engineers · плотник','Vertex Cleaning','Vertex Laundry','Vertex Travel · авиакасса','Vertex Travel · ЖД','Vertex Travel · автобусы','Vertex Real Estate'];const count={};vgRequests.forEach(r=>count[r.department]=(count[r.department]||0)+1);modal(tr('Команда Vertex','Vertex team'),'<div class="role-switch"><button data-vgr="guest">'+tr('Клиент','Guest')+'</button><button data-vgr="staff">'+tr('Персонал','Staff')+'</button><button data-vgr="admin">'+tr('Админ','Admin')+'</button></div>'+(vgRole==='guest'?'<button class="dark wide" id="vgMyReq">'+tr('Мои заявки','My requests')+'</button>':'<div class="team-grid">'+teams.map(t=>'<div class="team-card"><strong>'+t+'</strong><span>'+(count[t]||0)+' '+tr('задач','tasks')+'</span></div>').join('')+'</div><button class="dark wide" id="vgQueue">'+tr('Очередь задач','Task queue')+'</button><button class="outline wide" id="vgCal">'+tr('Календарь заездов / выездов','Check-in / check-out calendar')+'</button>'));$('modalBody').querySelectorAll('[data-vgr]').forEach(b=>b.onclick=()=>{vgRole=b.dataset.vgr;vgSave();vgTeam()});if($('vgMyReq'))$('vgMyReq').onclick=vgShowRequests;if($('vgQueue'))$('vgQueue').onclick=vgShowRequests;if($('vgCal'))$('vgCal').onclick=vgCalendar}
const vgBaseRender=render;
render=function(){vgBaseRender();$('eyebrow').textContent=tr('VERTEX GROUP · ТАШКЕНТ · ДЕМО','VERTEX GROUP · TASHKENT · DEMO');$('headline').textContent=tr('Жить. Ехать. Есть. Решать.\\nВ одном приложении.','Stay. Move. Dine. Solve.\\nOne app.');$('subhead').textContent=tr('Views Hotel & Apartments, сервисы Vertex Group, туры, транспорт, недвижимость и задачи персонала.','Views Hotel & Apartments, Vertex Group services, travel, mobility, real estate and staff tasks.');$('demoTrip').textContent=tr('Собрать турпакет ↗','Build a travel package ↗');$('demoTrip').onclick=vgPackage;const tabs=[['home','⌂','Главная','Home'],['package','＋','Пакет','Package'],['requests','✓','Заявки','Requests'],['team','▦','Команда','Team'],['profile','○','Профиль','Profile']];$('mobileNav').innerHTML=tabs.map(([id,ic,ru,en])=>'<button data-vgtab="'+id+'"><span>'+ic+'</span>'+tr(ru,en)+'</button>').join('');$('mobileNav').querySelectorAll('[data-vgtab]').forEach(b=>b.onclick=()=>{const t=b.dataset.vgtab;if(t==='package')return vgPackage();if(t==='requests')return vgShowRequests();if(t==='team')return vgTeam();if(t==='profile')return showProfile();category='stays';render();window.scrollTo({top:0,behavior:'smooth'})});};
const vgOldAll=allServiceCards;
allServiceCards=function(){vgOldAll();$('results').querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>vgRequest(b.dataset.service))};
render();
