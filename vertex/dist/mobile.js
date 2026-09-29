// Shared mobile interactions used by the live prototype and Canva import.
const originalRender = render;
let activeTab = 'home';
let installPrompt = null;
let storageAvailable = true;
let catalogNoticeSeen = false;
let showCatalogNotice = false;
const loadLocal = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('vertex-uz-v1') || 'null');
    let legacy = null;
    try { legacy = JSON.parse(localStorage.getItem('vertex-demo-v2') || 'null'); } catch {}
    catalogNoticeSeen = saved?.catalogNoticeSeen === true;
    showCatalogNotice = !catalogNoticeSeen && Array.isArray(legacy?.items) && legacy.items.length > 0;
    if (!saved && legacy) lang = legacy.lang === 'en' ? 'en' : 'ru';
    if (!saved) return;
    lang = saved.lang === 'en' ? 'en' : 'ru';
    cart = (Array.isArray(saved.items) ? saved.items : []).flatMap(item => {
      const product = [...stays, ...services].find(x => x.id === item.id);
      if (!product || (item.currency || saved.currency) !== 'UZS' || !Number.isFinite(item.amount) || item.amount <= 0) return [];
      const datePattern = /^\d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}$/;
      return [{...product, amount:item.amount, currency:'UZS', ...(datePattern.test(item.dates || '') ? {dates:item.dates} : {})}];
    }).slice(0, 100);
  } catch { storageAvailable = false; }
};
function saveLocal() {
  try { localStorage.setItem('vertex-uz-v1', JSON.stringify({lang, currency:'UZS', catalogNoticeSeen, items:cart.map(({id,amount,dates})=>({id,amount,dates,currency:'UZS'}))})); }
  catch { storageAvailable = false; }
}
const originalTotal = updateTotal;
updateTotal = function(){originalTotal();saveLocal();};
function bottomNavigation() {
  const tabs = [['home','⌂','Главная','Home'],['explore','⌖','Обзор','Explore'],['trips','▤','Поездки','Trips'],['services','✧','Сервисы','Services'],['profile','○','Профиль','Profile']];
  $('mobileNav').innerHTML=tabs.map(([id,icon,ru,en])=>`<button data-tab="${id}" ${activeTab===id?'aria-current="page"':''}><span aria-hidden="true">${icon}</span>${tr(ru,en)}</button>`).join('');
  $('mobileNav').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    activeTab=b.dataset.tab;bottomNavigation();
    if(activeTab==='trips')return window.VertexRentals ? window.VertexRentals.showTrips() : showCart();
    if(activeTab==='explore')return showMap();
    if(activeTab==='profile')return showProfile();
    category=activeTab==='services'?'all':'stays';render();
    $('sectionHeading').scrollIntoView({behavior:'smooth',block:'start'});
  });
}
function allServiceCards(){
  $('sectionHeading').textContent=tr('Все сервисы','All services');
  $('results').innerHTML=services.map(x=>`<article class="card service-card"><span class="service-icon" aria-hidden="true">${x.icon}</span><h3>${title(x)}</h3><p>${lang==='ru'?x.descRu:x.descEn}</p><div class="price-row"><strong>${money(x.price,x.currency||'UZS')}</strong><button data-service="${x.id}">${Number.isFinite(x.price)?tr('Добавить +','Add +'):tr('Уточнить','Enquire')}</button></div></article>`).join('');
  $('results').querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>addService(b.dataset.service));
}
render=function(){
  if($('searchError').textContent) $('searchError').textContent='';
  const all=category==='all';if(all)category='care';originalRender();if(all){category='all';allServiceCards();}
  $('eyebrow').textContent=tr('VERTEX · ДЕМО-ПРИЛОЖЕНИЕ','VERTEX · DEMO APP');
  $('headline').textContent=tr('Вся поездка.\nВ одном месте.','Your whole journey.\nOne place.');
  $('mapButton').textContent=tr('⌖ Обзор мест','⌖ Explore places');
  $('allServices').onclick=()=>{activeTab='services';category='all';render();$('sectionHeading').scrollIntoView({behavior:'smooth'});};
  $('demoTrip').textContent=tr('Подобрать апартаменты','Find an apartment');
  $('installButton').textContent=tr('На телефон ↗','Get the app ↗');
  bottomNavigation();saveLocal();
};
function showProfile(){
  modal(tr('Профиль Vertex','Vertex profile'),`
    <p class="notice">${tr('Все основные действия доступны внутри Vertex. Демо-данные сохраняются только на этом устройстве.','All main actions are available inside Vertex. Demo data is saved only on this device.')}</p>
    <div class="profile-grid">
      <button class="outline" id="profileTrips"><span>▤</span><strong>${tr('Поездки','Trips')}</strong><small>${tr('Заявки и корзина','Requests & cart')}</small></button>
      <button class="outline" id="profileFavorites"><span>♡</span><strong>${tr('Избранное','Favorites')}</strong><small>${tr('Сохранённое жильё','Saved stays')}</small></button>
      <button class="outline" id="profileServices"><span>✧</span><strong>${tr('Сервисы','Services')}</strong><small>${tr('Трансфер, клининг и другое','Transfer, cleaning & more')}</small></button>
      <button class="outline" id="profileGuestGuide"><span>⌂</span><strong>${tr('Гид гостя','Guest guide')}</strong><small>${tr('Заселение и правила','Check-in & rules')}</small></button>
    </div>
    <div class="line-item"><strong>${tr('Язык','Language')}</strong><button class="outline" id="profileLanguage">${lang==='ru'?'English':'Русский'}</button></div>
    <button id="profileInstall" class="dark wide">${tr('Установка Vertex','Install Vertex')}</button>
    <p class="demo">${storageAvailable?tr('Локальные данные сохранены на устройстве.','Local data is saved on this device.'):tr('Сохранение недоступно в этом браузере.','Storage is unavailable in this browser.')}</p>`);
  $('profileLanguage').onclick=()=>{lang=lang==='ru'?'en':'ru';render();showProfile();};
  $('profileInstall').onclick=showInstall;
  $('profileTrips').onclick=()=>window.VertexRentals?.showTrips?.()||showCart();
  $('profileFavorites').onclick=()=>window.VertexRentals?.showFavorites?.();
  $('profileServices').onclick=()=>{$('modal').close();activeTab='services';category='all';render();$('sectionHeading').scrollIntoView({behavior:'smooth'});};
  $('profileGuestGuide').onclick=()=>window.VertexGuestGuide?.open();
}
async function showInstall(){
  if(installPrompt){const p=installPrompt;installPrompt=null;await p.prompt();await p.userChoice;return;}
  const installed=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  modal(tr('Vertex на телефоне','Vertex on your phone'),installed?`<p>${tr('Приложение уже открыто с главного экрана.','The app is already running from your home screen.')}</p>`:`<p>${tr('Откройте эту страницу в браузере телефона.','Open this page in your phone browser.')}</p><p class="notice">${tr('Для Android сейчас используйте установку из Chrome: меню ⋮ → «Добавить на главный экран» → «Установить». Подписанный APK 1.9 не публикуется, пока не восстановлен прежний ключ подписи.','For Android, install from Chrome: menu ⋮ → Add to Home screen → Install. A signed 1.9 APK is not published until the previous signing key is restored.')}</p><div class="place"><strong>iPhone · Safari</strong><p>${tr('Поделиться → На экран «Домой» → Добавить.','Share → Add to Home Screen → Add.')}</p></div><div class="place"><strong>Android · Chrome</strong><p>${tr('Меню ⋮ → Добавить на главный экран → Установить или Создать ярлык.','Menu ⋮ → Add to Home screen → Install or Create shortcut.')}</p></div><p class="notice">${tr('Это веб-приложение. Доступность установки зависит от браузера; бронирования и платежи демонстрационные.','This is a web app. Installation availability depends on your browser; bookings and payments are demonstrations.')}</p>`);
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
$('installButton').onclick=showInstall;
$('demoTrip').onclick=()=>{
  city='Tashkent';category='stays';activeTab='home';$('destination').value=city;render();
  const first=stays.find(stay=>stay.city===city);
  if(first)showStay(first.id);
  else $('sectionHeading').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
};
const oldSelect=selectCategory;
selectCategory=function(c){activeTab=c==='stays'?'home':'services';oldSelect(c);};
const oldDatesValid=datesValid;
datesValid=function(){if(!oldDatesValid())return false;const now=new Date();const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;if($('arrival').value<today){$('searchError').textContent=tr('Выберите заезд сегодня или позже.','Choose today or a later check-in date.');return false;}return true;};
$('search').onsubmit=e=>{e.preventDefault();if(!datesValid())return;city=$('destination').value;activeTab='home';category='stays';render();$('sectionHeading').scrollIntoView({behavior:'smooth'});};
loadLocal();render();
if(showCatalogNotice){
  const toast=$('toast');toast.textContent=tr('Каталог обновлён для Узбекистана. Прежняя корзина сохранена отдельно и не перенесена в суммы.','The catalog now covers Uzbekistan. Your previous cart is preserved separately and has not been converted to UZS.');
  toast.style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>toast.style.display='none',6500);
  catalogNoticeSeen=true;saveLocal();
}

