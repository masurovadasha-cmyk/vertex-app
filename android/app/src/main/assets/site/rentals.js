(() => {
  const KEY = 'vertex-rentals-v1';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data = {favorites:[], listings:[], bookings:[]};
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && ['favorites','listings','bookings'].every(k => Array.isArray(saved[k]))) data = saved;
  } catch {}
  if (!Array.isArray(data.blocks)) data.blocks = [];

  // Persisted type/status values remain compatible with existing local data.
  const types = [['Квартира','Apartment'], ['Вилла','Villa'], ['Комната','Room']];
  const statuses = {'Запрос отправлен':'Request sent', 'Подтверждено':'Confirmed', 'Отклонено':'Declined', 'Отменено':'Cancelled'};
  const typeLabel = value => lang === 'en' ? (types.find(([ru]) => ru === value)?.[1] || value) : value;
  const statusLabel = value => lang === 'en' ? (statuses[value] || value) : value;
  const base = stays.map(s=>({...s,type:'Квартира',wifi:false,host:'Vertex · демо',hostEn:'Vertex · demo'}));
  data.listings=data.listings.map(s=>({...s,currency:s.currency||'USD'}));
  data.bookings=data.bookings.map(b=>({...b,currency:b.currency||'USD'}));
  const catalog = () => [...base,...data.listings];
  const find = id => catalog().find(s => s.id === id);
  const titleOf = s => (lang === 'en' ? s.en : s.ru) || s.ru || s.en;
  const bookingTitle = b => {
    const s = base.find(x => x.id === b.listingId && (b.title === x.ru || b.title === x.en));
    return s ? titleOf(s) : b.title;
  };
  const localDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today = () => localDate(new Date());
  const dateTime = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const time = Date.parse(value+'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value ? time : NaN;
  };
  const count = (a,b) => Math.round((dateTime(b)-dateTime(a))/86400000);
  const nextDate = value => Number.isFinite(dateTime(value)) ? new Date(dateTime(value)+86400000).toISOString().slice(0,10) : today();
  const active = b => b.status === 'Запрос отправлен' || b.status === 'Подтверждено';
  const available = (id,a,b) => !data.bookings.some(x => x.listingId === id && active(x) && a < x.departure && b > x.arrival)
    && !data.blocks.some(x => x.listingId === id && x.date >= a && x.date < b);
  if ($('arrival').value < today()) {
    const a = new Date(); a.setDate(a.getDate()+7); $('arrival').value = localDate(a);
    a.setDate(a.getDate()+3); $('departure').value = localDate(a);
  }
  $('arrival').min = today();

  function error(text) {
    let el = $('rentalError');
    if (!el) { el = document.createElement('p'); el.id = 'rentalError'; el.setAttribute('role','alert'); $('modalBody').prepend(el); }
    el.textContent = text;
  }
  function persist() {
    try { localStorage.setItem(KEY,JSON.stringify(data)); return true; }
    catch { error(tr('Не удалось сохранить данные. Освободите память устройства и попробуйте снова.','Could not save data. Free up device storage and try again.')); return false; }
  }
  const modalBase = modal;
  function show(name,html) { modalBase(name,html); $('modal').scrollTop = 0; }
  const typeOptions = () => types.map(([ru,en]) => `<option value="${ru}">${tr(ru,en)}</option>`).join('');
  const controls = document.createElement('section');
  controls.className = 'rent-controls';
  controls.innerHTML = '<div class="rent-links"><button id="favoriteList" class="outline"></button><button id="bookingsList" class="outline"></button><button id="hostPanel" class="dark"></button><button id="rentalCalendar" class="outline"></button></div><div class="rent-filters"><label><span id="priceCapLabel"></span><input id="priceCap" type="number" min="0"></label><label><span id="rentalTypeLabel"></span><select id="rentalType"><option value=""></option>'+typeOptions()+'</select></label><label><span id="rentalSortLabel"></span><select id="rentalSort"><option value="default"></option><option value="asc"></option><option value="desc"></option></select></label><label class="wifi-filter"><input type="checkbox" id="wifiOnly"> Wi-Fi</label></div>';
  document.querySelector('.content').insertBefore(controls,document.querySelector('.section-title'));
  controls.querySelectorAll('input,select').forEach(el => el.oninput = () => render());
  $('favoriteList').onclick = favorites;
  $('bookingsList').onclick = trips;
  $('hostPanel').onclick = host;
  $('rentalCalendar').onclick = () => calendar();
  function translateControls() {
    const labels = {
      favoriteList:['♡ Избранное','♡ Favorites'], bookingsList:['▤ Поездки','▤ Trips'],
      hostPanel:['⌂ Хозяин','⌂ Host'], rentalCalendar:['▦ Календарь','▦ Calendar'],
      priceCapLabel:['Цена до, сум/ночь','Maximum price, UZS/night'], rentalTypeLabel:['Тип жилья','Property type'], rentalSortLabel:['Сортировка','Sort by']
    };
    for (const [id,text] of Object.entries(labels)) $(id).textContent = tr(...text);
    $('priceCap').placeholder = tr('Любая','Any');
    Array.from($('rentalType').options).forEach(o => o.textContent = o.value ? typeLabel(o.value) : tr('Любой','Any'));
    const sortLabels = {default:['Рекомендуемые','Recommended'], asc:['Сначала дешевле','Price: low to high'], desc:['Сначала дороже','Price: high to low']};
    Array.from($('rentalSort').options).forEach(o => o.textContent = tr(...sortLabels[o.value]));
  }
  function card(s) {
    const favorite = data.favorites.includes(s.id);
    return `<article class="card rental-card"><div class="photo">${s.photo ? `<img src="${escape(s.photo)}" alt="${tr('Фото направления','Destination photo')} ${escape(s.city)}" loading="lazy">` : '<div class="rental-placeholder">⌂</div>'}<span class="badge">${tr('ДЕМО','DEMO')} · ${escape(s.city)}</span><button class="heart" aria-label="${favorite ? tr('Убрать из избранного','Remove from favorites') : tr('В избранное','Save to favorites')}" aria-pressed="${favorite}" data-heart="${escape(s.id)}">${favorite ? '♥' : '♡'}</button></div><h3>${escape(titleOf(s))}</h3><p>${escape(typeLabel(s.type))} · ${tr('до','up to')} ${s.capacity} ${tr('гостей','guests')}${s.wifi ? ' · Wi-Fi' : ''}</p><div class="price-row"><span><strong>${money(s.price,s.currency)}</strong> / ${tr('ночь','night')}</span><button data-rental="${escape(s.id)}">${tr('Подробнее','Details')}</button></div></article>`;
  }
  function bindCards(root,onFavorite) {
    root.querySelectorAll('[data-rental]').forEach(b => b.onclick = () => detail(b.dataset.rental));
    root.querySelectorAll('[data-heart]').forEach(b => b.onclick = () => {
      const id = b.dataset.heart, old = [...data.favorites];
      data.favorites = data.favorites.includes(id) ? data.favorites.filter(x => x !== id) : [...data.favorites,id];
      if (!persist()) { data.favorites = old; return; }
      onFavorite();
    });
  }
  function refreshTripSummary() {
    $('cartButton').textContent = tr('Поездки','Trips')+' · '+(cart.length+data.bookings.filter(active).length);
    $('totalLabel').textContent = tr('Корзина','Cart');
  }
  const priorTotal = updateTotal;
  updateTotal = function() { priorTotal(); refreshTripSummary(); };
  const priorRender = render;
  render = function() {
    priorRender(); translateControls(); refreshTripSummary(); controls.hidden = category !== 'stays';
    if (category !== 'stays') return;
    const limit = $('priceCap').value;
    const list = catalog().filter(s => (city === 'all' || s.city === city) && s.capacity >= Number($('guests').value)
      && (limit === '' || s.currency==='UZS'&&Number.isFinite(s.price)&&s.price <= Number(limit)) && (!$('rentalType').value || s.type === $('rentalType').value)
      && (!$('wifiOnly').checked || s.wifi) && available(s.id,$('arrival').value,$('departure').value));
    if ($('rentalSort').value !== 'default') list.sort((a,b) => $('rentalSort').value === 'asc' ? a.price-b.price : b.price-a.price);
    $('results').innerHTML = list.length ? list.map(card).join('') : `<p class="empty">${tr('Нет жилья по этим условиям. Измените даты, гостей или фильтры.','No stays match these conditions. Adjust your dates, guests or filters.')}</p>`;
    $('sectionDescription').textContent = list.length+tr(' вариантов · демо-каталог · цены уточняются',' stays · demo catalog · prices on request');
    bindCards($('results'),render);
  };
  function favorites() {
    show(tr('Избранное','Favorites'),`<p class="biz-caption">${tr('Сохранено на этом устройстве','Saved on this device')}</p><div class="cards">${catalog().filter(s => data.favorites.includes(s.id)).map(card).join('') || `<p class="notice">${tr('Нажмите ♡ на карточке жилья, чтобы сохранить его.','Tap ♡ on a property card to save it.')}</p>`}</div>`);
    bindCards($('modalBody'),() => { render(); favorites(); });
  }
  function validate(s,a,b,g) {
    const n = count(a,b);
    if (!Number.isFinite(n) || n < 1 || n > 365 || a < today()) return tr('Выберите даты от сегодняшнего дня: от 1 до 365 ночей.','Choose today or a later check-in date, for 1 to 365 nights.');
    if (!Number.isInteger(g) || g < 1 || g > s.capacity) return tr('Укажите число гостей в пределах вместимости объекта.','Choose a guest count within the property capacity.');
    if (!available(s.id,a,b)) return tr('Эти даты заняты демо-заявкой или закрыты хозяином. Выберите другие даты.','These dates have a demo request or are blocked by the host. Choose different dates.');
    return '';
  }
  function breakdown(s,a,b) {
    const n=count(a,b),subtotal=Number.isFinite(s.price)?n*s.price:null;
    return {n,subtotal,cleaning:null,fee:null,total:subtotal,currency:s.currency||'UZS'};
  }
  function detail(id) {
    const s = find(id); if (!s) return;
    show(titleOf(s),`${s.photo ? `<img class="detail-image" src="${escape(s.photo)}" alt="${tr('Иллюстрация направления','Destination illustration')}">` : ''}
      <p class="biz-caption">${tr('ДЕМО-КАРТОЧКА · фото и характеристики квартиры требуют подтверждения','DEMO CARD · property photos and details need confirmation')}</p>
      <p>${escape(s.city)} · ${escape(typeLabel(s.type))} · ${tr('до','up to')} ${s.capacity} ${tr('гостей','guests')}</p>
      <p>${escape(lang === 'en' ? (s.descriptionEn || s.description) : s.description)}</p>
      <div class="amenities"><span>${tr('Кухня','Kitchen')}</span><span>${tr('Ванная','Bathroom')}</span>${s.wifi ? '<span>Wi-Fi</span>' : ''}<span>${tr('Постельное бельё','Bed linen')}</span></div>
      <div class="place"><strong>${tr('Хозяин:','Host:')} ${escape(lang === 'en' ? (s.hostEn || s.host) : s.host)}</strong><p>${tr('Условный профиль для демонстрации','Illustrative demonstration profile')}</p><button id="contactHost" class="outline">${tr('Демонстрация чата','Chat demonstration')}</button></div>
      <details><summary>${tr('Отзывы · примеры','Reviews · examples')}</summary><p>${tr('★ 5.0 · «Уютно и удобно для прогулок» — тестовый отзыв.','★ 5.0 · “Cozy and convenient for walks” — sample review.')}</p></details>
      <p class="notice">${tr('Время заезда, выезда и условия уточняются у хозяина. Демо-запрос можно отменить без оплаты.','Confirm check-in, check-out and terms with the host. Demo requests can be cancelled without charge.')}</p>
      <form id="bookingForm" class="biz-form"><label>${tr('Имя гостя','Guest name')}<input name="guest" required maxlength="80" autocomplete="name" placeholder="${tr('Как к вам обращаться?','What should we call you?')}"></label>
      <div class="booking-dates"><label>${tr('Заезд','Check-in')}<input name="arrival" type="date" min="${today()}" value="${escape($('arrival').value)}" required></label><label>${tr('Выезд','Check-out')}<input name="departure" type="date" value="${escape($('departure').value)}" required></label></div>
      <label>${tr('Гости','Guests')}<input name="guests" type="number" min="1" max="${s.capacity}" value="${Math.min(s.capacity,Number($('guests').value))}" required></label><div id="priceBreakdown"></div>
      <label class="agree-label"><input name="agree" type="checkbox" required> ${tr('Я понимаю: это демо-запрос, без реального бронирования и оплаты.','I understand this is a demo request, without a real booking or payment.')}</label>
      <p id="rentalError" role="alert"></p><button type="submit" class="dark wide">${tr('Отправить демо-запрос','Send demo request')}</button></form>`);
    $('contactHost').onclick = () => document.querySelector('.business-entry [data-open="chat"]')?.click();
    const f = $('bookingForm');
    const quote = () => {
      const a = f.elements.arrival.value, b = f.elements.departure.value, q = breakdown(s,a,b);
      f.elements.departure.min = nextDate(a);
      $('priceBreakdown').innerHTML = Number.isFinite(q.n) && q.n > 0 && q.n <= 365
        ? `<div class="quote-row"><span>${money(s.price,s.currency)} × ${q.n} ${tr('ночей','nights')}</span><strong>${money(q.subtotal,s.currency)}</strong></div><div class="quote-row"><span>${tr('Уборка','Cleaning')}</span><strong>${money(q.cleaning)}</strong></div><div class="quote-row"><span>${tr('Сервисный сбор · уточнить','Service fee · enquire')}</span><strong>${money(q.fee)}</strong></div><div class="trip-total"><span>${tr('Всего · без списания','Total · no charge')}</span><strong>${money(q.total,s.currency)}</strong></div>`
        : `<p class="notice">${tr('Выберите корректные даты для расчёта.','Choose valid dates to see the estimate.')}</p>`;
    };
    f.elements.arrival.onchange = quote; f.elements.departure.onchange = quote; quote();
    f.onsubmit = e => {
      e.preventDefault();
      const a = f.elements.arrival.value, b = f.elements.departure.value, g = Number(f.elements.guests.value), guest = f.elements.guest.value.trim();
      const problem = validate(s,a,b,g);
      if (problem || !guest || !f.elements.agree.checked) { error(problem || (!guest ? tr('Введите имя гостя.','Enter the guest name.') : tr('Подтвердите условия демо-запроса.','Accept the demo request terms.'))); return; }
      const booking = {id:crypto.randomUUID(),listingId:s.id,title:s.ru,city:s.city,guest,arrival:a,departure:b,guests:g,...breakdown(s,a,b),status:'Запрос отправлен',created:new Date().toISOString()};
      data.bookings.push(booking); if (!persist()) { data.bookings.pop(); return; }
      window.dispatchEvent(new CustomEvent('vertex-booking',{detail:booking})); render();
      show(tr('Демо-запрос отправлен','Demo request sent'),`<div class="booking-success">✓</div><h3>${escape(titleOf(s))}</h3><p>${a} → ${b} · ${g} ${tr('гостей','guests')}</p><p>№ ${booking.id.slice(0,8).toUpperCase()} · ${money(booking.total,booking.currency)}</p><p class="notice">${tr('Запрос сохранён только на устройстве. Ничего не забронировано и не оплачено. Для показа перейдите в кабинет хозяина и подтвердите заявку.','The request is saved only on this device. Nothing has been booked or paid. To try the workflow, confirm the request in the host panel.')}</p><button id="openMyTrips" class="dark wide">${tr('Поездки','Trips')}</button>`);
      $('openMyTrips').onclick = trips;
    };
  }
  showStay = detail;
  function bookingRows(hostMode) {
    return data.bookings.slice().reverse().map(b => `<div class="booking-row"><span class="status-pill">${escape(statusLabel(b.status))}</span><h3>${escape(bookingTitle(b))}</h3><p>${escape(b.arrival)} → ${escape(b.departure)} · ${b.guests} ${tr('гостей','guests')}</p><p>${escape(b.guest)} · <strong>${money(b.total,b.currency)}</strong></p><small>${tr('Демо-заявка №','Demo request #')} ${escape(b.id.slice(0,8).toUpperCase())} · ${tr('без оплаты','no payment')}</small><div class="biz-actions">${hostMode && b.status === 'Запрос отправлен' ? `<button class="dark" data-status="Подтверждено" data-booking="${escape(b.id)}">${tr('Подтвердить','Confirm')}</button><button class="outline" data-status="Отклонено" data-booking="${escape(b.id)}">${tr('Отклонить','Decline')}</button>` : ''}${!hostMode && active(b) ? `<button class="outline" data-status="Отменено" data-booking="${escape(b.id)}">${tr('Отменить запрос','Cancel request')}</button>` : ''}</div></div>`).join('') || `<p class="notice">${tr('Заявок пока нет. Выберите жильё и отправьте демо-запрос.','No requests yet. Choose a stay and send a demo request.')}</p>`;
  }
  function bindBookings(hostMode) {
    $('modalBody').querySelectorAll('[data-booking]').forEach(btn => btn.onclick = () => {
      const b = data.bookings.find(x => x.id === btn.dataset.booking); if (!b) return;
      const next = btn.dataset.status;
      const apply = () => {
        const old = b.status; b.status = next;
        if (!persist()) { b.status = old; return; }
        render(); hostMode ? host() : trips();
      };
      if (next === 'Отменено') {
        show(tr('Отменить демо-запрос?','Cancel demo request?'),`<p>${escape(bookingTitle(b))} · ${escape(b.arrival)}</p><p>${tr('Запрос останется в истории, а даты снова станут доступны, если хозяин их не закрыл. Денежных операций нет.','The request will stay in your history. Dates become available again unless blocked by the host. No money is involved.')}</p><div class="biz-actions"><button class="dark" id="confirmCancel">${tr('Да, отменить','Yes, cancel')}</button><button class="outline" id="keepTrip">${tr('Оставить','Keep request')}</button></div>`);
        $('confirmCancel').onclick = apply; $('keepTrip').onclick = trips;
      } else apply();
    });
  }
  function trips() {
    // Housing requests have separate estimates and never add to the cart total.
    const cartTotal = cart.reduce((sum,item) => sum+(Number.isFinite(item.amount) ? item.amount : 0),0);
    show(tr('Поездки','Trips'),`<p class="biz-caption">${tr('Сохранено на этом устройстве · демонстрация без оплаты','Saved on this device · demonstration without payment')}</p>
      <section aria-labelledby="rentalTripsHeading"><h3 id="rentalTripsHeading">${tr('Заявки жилья','Stay requests')} · ${data.bookings.length}</h3><p class="notice">${tr('Демо-заявки и их статусы. Стоимость каждой заявки — отдельный расчёт; она не добавляется в корзину.','Demo requests and their statuses. Each request has its own estimate, which is not added to the cart.')}</p>${bookingRows(false)}</section>
      <section aria-labelledby="rentalCartHeading"><h3 id="rentalCartHeading">${tr('Демо-корзина','Demo cart')} · ${cart.length}</h3><p>${tr('Услуги и примеры жилья из корзины можно просмотреть и удалить. Это отдельный демонстрационный заказ.','Review and remove services and sample stays in the cart. This is a separate demo order.')}</p><div class="trip-total"><span>${tr('Итого в корзине · без списания','Cart total · no charge')}</span><strong>${money(cartTotal)}</strong></div><button id="rentalOpenCart" class="dark wide">${tr('Открыть и изменить корзину','Open and edit cart')}</button></section>`);
    bindBookings(false);
    $('rentalOpenCart').onclick = () => {
      showCart();
      const back = document.createElement('button'); back.className = 'outline wide'; back.id = 'rentalBackToTrips';
      back.textContent = tr('← Все поездки','← All trips'); back.onclick = trips; $('modalBody').prepend(back);
    };
  }
  window.VertexRentals = Object.freeze({showTrips:trips});
  $('cartButton').onclick = trips; $('viewTrip').onclick = trips;

  function host() {
    show(tr('Кабинет хозяина','Host panel'),`<p class="notice">${tr('Демо-роль: все заявки этого устройства доступны для показа. Авторизация не подключена.','Demo role: all requests on this device are available for demonstration. Authentication is not connected.')}</p><button id="newListing" class="dark wide">${tr('+ Добавить жильё','+ Add a property')}</button><button id="hostCalendar" class="outline wide" style="margin-top:12px">${tr('▦ Календарь и доступность','▦ Calendar and availability')}</button><h3>${tr('Мои объявления','My listings')} · ${data.listings.length}</h3>${data.listings.map(s => `<div class="line-item"><strong>${escape(titleOf(s))}</strong><span>${money(s.price,s.currency)} / ${tr('ночь','night')}</span></div>`).join('')}<h3>${tr('Заявки гостей','Guest requests')}</h3>${bookingRows(true)}`);
    $('newListing').onclick = newListing; $('hostCalendar').onclick = () => calendar(); bindBookings(true);
  }
  function newListing() {
    show(tr('Добавить демо-жильё','Add a demo property'),`<form id="listingForm" class="biz-form"><label>${tr('Название','Name')}<input name="name" required maxlength="80"></label><label>${tr('Город','City')}<select name="city">${window.VertexCatalog.cities.map(c=>`<option value="${escape(c.id)}">${escape(lang==='en'?c.en:c.ru)}</option>`).join('')}</select></label><label>${tr('Тип','Type')}<select name="type">${typeOptions()}</select></label><label>${tr('Цена за ночь, UZS','Nightly price, UZS')}<input name="price" type="number" min="1" max="100000000" step="1" required></label><label>${tr('Вместимость','Capacity')}<input name="capacity" type="number" min="1" max="20" value="2" required></label><label>${tr('Имя хозяина','Host name')}<input name="host" required maxlength="80"></label><label>${tr('Описание','Description')}<textarea name="description" required maxlength="1500" rows="3"></textarea></label><label class="agree-label"><input name="wifi" type="checkbox" checked> Wi-Fi</label><p class="notice">${tr('Объявление появится только в демо на этом устройстве. Фото направления подставляется автоматически; загрузка фотографий не подключена.','This listing will appear only in the demo on this device. A destination photo is added automatically; photo uploads are not connected.')}</p><p id="rentalError" role="alert"></p><button class="dark" type="submit">${tr('Добавить в каталог','Add to catalog')}</button></form>`);
    $('listingForm').onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target), name = String(f.get('name')).trim(), hostName = String(f.get('host')).trim(), description = String(f.get('description')).trim();
      if (!name || !hostName || !description) { error(tr('Заполните название, имя хозяина и описание.','Enter the property name, host name and description.')); return; }
      const price = Number(f.get('price')), capacity = Number(f.get('capacity'));
      if (!Number.isInteger(price) || price < 1 || price > 100000000 || !Number.isInteger(capacity) || capacity < 1 || capacity > 20) { error(tr('Укажите целую цену от 1 до 100 000 000 UZS и вместимость от 1 до 20 гостей.','Enter a whole-number price from 1 to 100,000,000 UZS and capacity from 1 to 20 guests.')); return; }
      const location = String(f.get('city'));
      const s = {id:crypto.randomUUID(),ru:name,en:name,city:location,type:String(f.get('type')),price,currency:'UZS',capacity,wifi:f.has('wifi'),host:hostName,description,photo:base.find(x => x.city === location)?.photo || null};
      data.listings.push(s); if (!persist()) { data.listings.pop(); return; }
      category = 'stays'; city = 'all'; $('destination').value = 'all'; $('priceCap').value = ''; $('rentalType').value = ''; $('wifiOnly').checked = false;
      render(); host();
    };
  }
  function calendar(listingId = catalog()[0].id,month = new Date().getMonth(),year = new Date().getFullYear()) {
    const s = find(listingId); if (!s) return;
    const first = new Date(year,month,1), offset = (first.getDay()+6)%7, length = new Date(year,month+1,0).getDate();
    let cells = '<span></span>'.repeat(offset);
    for (let day=1; day<=length; day++) {
      const date = localDate(new Date(year,month,day));
      const booking = data.bookings.find(b => b.listingId === listingId && active(b) && date >= b.arrival && date < b.departure);
      const blocked = data.blocks.some(b => b.listingId === listingId && b.date === date);
      const state = booking ? (booking.status === 'Подтверждено' ? 'confirmed' : 'pending') : blocked ? 'blocked' : 'free';
      const label = booking ? escape(booking.guest)+' · '+escape(statusLabel(booking.status)) : blocked ? tr('Закрыто хозяином','Blocked by host') : tr('Свободно','Available');
      cells += `<button type="button" class="cal-day ${state}" data-date="${date}" ${date < today() ? 'disabled' : ''} title="${date} · ${label}"><strong>${day}</strong><small>${booking ? tr('Заявка','Request') : blocked ? tr('Закрыто','Blocked') : money(s.price,s.currency)}</small></button>`;
    }
    const weekdays = lang === 'ru' ? ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    show(tr('Календарь хозяина','Host calendar'),`<p class="biz-caption">${tr('Управление доступностью · локальная демонстрация','Manage availability · local demonstration')}</p><select id="calendarListing" class="calendar-select" aria-label="${tr('Объект календаря','Calendar property')}">${catalog().map(x => `<option value="${escape(x.id)}" ${x.id === listingId ? 'selected' : ''}>${escape(titleOf(x))}</option>`).join('')}</select><div class="calendar-month"><button id="prevMonth" aria-label="${tr('Предыдущий месяц','Previous month')}">←</button><h3>${first.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US',{month:'long',year:'numeric'})}</h3><button id="nextMonth" aria-label="${tr('Следующий месяц','Next month')}">→</button></div><div class="calendar-grid week">${weekdays.map(d => `<span>${d}</span>`).join('')}</div><div class="calendar-grid">${cells}</div><div class="calendar-legend"><span>□ ${tr('Свободно','Available')}</span><span class="pending">● ${tr('Запрос','Requested')}</span><span class="confirmed">● ${tr('Подтверждено','Confirmed')}</span><span class="blocked">● ${tr('Закрыто','Blocked')}</span></div><p class="biz-caption">${tr('Нажмите на день или задайте диапазон. Обе даты диапазона включаются. Ночи с активными заявками нельзя закрыть вручную.','Select a day or enter a range. Both dates are included. Nights with active requests cannot be blocked manually.')}</p><form id="calendarForm" class="biz-form"><div class="booking-dates"><label>${tr('С даты','From date')}<input name="from" type="date" min="${today()}" required></label><label>${tr('По дату включительно','Through date (inclusive)')}<input name="to" type="date" min="${today()}" required></label></div><p id="calendarStatus" role="status"></p><div class="biz-actions"><button class="dark" type="submit" value="block">${tr('Закрыть даты','Block dates')}</button><button class="outline" type="submit" value="open">${tr('Открыть даты','Open dates')}</button></div></form><button id="calendarHost" class="outline wide">${tr('Заявки и объявления','Requests and listings')}</button>`);
    $('calendarListing').onchange = e => calendar(e.target.value,month,year);
    const move = step => { const d = new Date(year,month+step,1); calendar(listingId,d.getMonth(),d.getFullYear()); };
    $('prevMonth').onclick = () => move(-1); $('nextMonth').onclick = () => move(1); $('calendarHost').onclick = host;
    const form = $('calendarForm');
    $('modalBody').querySelectorAll('[data-date]').forEach(b => b.onclick = () => {
      form.elements.from.value = b.dataset.date; form.elements.to.value = b.dataset.date; $('calendarStatus').textContent = b.title;
    });
    form.onsubmit = e => {
      e.preventDefault();
      const a = form.elements.from.value, b = form.elements.to.value, n = count(a,b);
      if (!Number.isFinite(n) || n < 0 || n > 365 || a < today()) { $('calendarStatus').textContent = tr('Выберите диапазон до 366 дней, начиная с сегодняшнего дня.','Choose a range of up to 366 days, starting today or later.'); return; }
      const days = Array.from({length:n+1},(_,i) => new Date(dateTime(a)+i*86400000).toISOString().slice(0,10));
      const closing = e.submitter?.value !== 'open';
      if (closing && data.bookings.some(x => x.listingId === listingId && active(x) && days.some(d => d >= x.arrival && d < x.departure))) { $('calendarStatus').textContent = tr('В диапазоне есть активная заявка. Сначала отклоните или отмените её в списке заявок.','This range contains an active request. Decline or cancel it in the request list first.'); return; }
      const before = data.blocks;
      data.blocks = data.blocks.filter(x => x.listingId !== listingId || !days.includes(x.date));
      if (closing) data.blocks.push(...days.map(date => ({listingId,date})));
      if (!persist()) { data.blocks = before; return; }
      render(); calendar(listingId,month,year);
      $('calendarStatus').textContent = (closing ? tr('Даты закрыты: ','Dates blocked: ') : tr('Даты открыты: ','Dates opened: '))+a+' — '+b+(closing ? '' : tr('. Активные заявки сохраняют свои даты.','. Active requests retain their dates.'));
    };
  }
  render();
})();
