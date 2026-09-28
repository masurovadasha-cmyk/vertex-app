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
