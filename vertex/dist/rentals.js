(() => {
  const KEY = 'vertex-rentals-v1';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data = {favorites:[], listings:[], bookings:[], threads:[]};
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && ['favorites','listings','bookings'].every(k => Array.isArray(saved[k]))) data = saved;
  } catch {}
  if (!Array.isArray(data.blocks)) data.blocks = [];
  if (!Array.isArray(data.threads)) data.threads = [];
  data.threads = data.threads.filter(thread => thread && typeof thread.listingId === 'string' && Array.isArray(thread.messages))
    .map(thread => ({listingId:thread.listingId,messages:thread.messages.filter(message => message && ['guest','host'].includes(message.side) && typeof message.text === 'string' && message.text.length <= 1000 && typeof message.at === 'string').slice(-60)}))
    .slice(0,100);

  // Persisted type/status values remain compatible with existing local data.
  const types = [['Квартира','Apartment'], ['Вилла','Villa'], ['Комната','Room']];
  const statuses = {'Запрос отправлен':'Request sent', 'Подтверждено':'Confirmed', 'Отклонено':'Declined', 'Отменено':'Cancelled'};
  const typeLabel = value => lang === 'en' ? (types.find(([ru]) => ru === value)?.[1] || value) : value;
  const statusLabel = value => lang === 'en' ? (statuses[value] || value) : value;
  const base = stays.map(s=>({type:'Квартира',wifi:null,host:s.ownerConfirmed?null:'Vertex · демо',hostEn:s.ownerConfirmed?null:'Vertex · demo',...s}));
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
  const hasCapacity = s => Number.isInteger(s.capacity) && s.capacity > 0;
  const capacityLabel = s => hasCapacity(s) ? `${tr('до','up to')} ${s.capacity} ${tr('гостей','guests')}` : tr('Вместимость уточняется','Capacity on request');
  const cityLabel = id => {
    const item = window.VertexCatalog?.cities?.find(item => item.id === id);
    return item ? (lang === 'en' ? item.en : item.ru) : id;
  };
  const hasNightlyPrice = s => Number.isFinite(s.price) && s.price >= 0;
  const hasUzsNightlyPrice = s => s.currency === 'UZS' && hasNightlyPrice(s);
  function compareNightly(a,b,direction) {
    if (hasUzsNightlyPrice(a) !== hasUzsNightlyPrice(b)) return hasUzsNightlyPrice(a) ? -1 : 1;
    return hasUzsNightlyPrice(a) ? (a.price-b.price) * (direction === 'desc' ? -1 : 1) : 0;
  }
  function referenceQuote(s) {
    const q = s.quote;
    if (!q || !Number.isFinite(dateTime(q.arrival)) || !Number.isFinite(dateTime(q.departure)) || count(q.arrival,q.departure) < 1 || !Number.isInteger(q.guests) || q.guests < 1 || !/^[A-Z]{3}$/.test(q.currency || '')) return null;
    const unavailable = q.unavailable === true || s.unavailable === true;
    if (!unavailable && !(Number.isFinite(q.total) && q.total >= 0)) return null;
    return {...q,unavailable};
  }
  const quoteMatches = (q,a,b,g) => !!q && q.arrival === a && q.departure === b && q.guests === Number(g);
  function quoteBlock(s,compact = false,a = $('arrival').value,b = $('departure').value,g = Number($('guests').value)) {
    const q = referenceQuote(s); if (!q) return '';
    const provider = s.sourceName || tr('источника','source');
    const value = q.unavailable ? tr('Нет доступности для этого запроса','Unavailable for this request') : `${new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-RU',{maximumFractionDigits:2}).format(q.total)} ${q.currency} ${tr('всего','total')}`;
    const checked = q.checkedAt ? `<span class="verified-date">${tr('Проверено','Checked')}: ${escape(String(q.checkedAt).slice(0,10))}</span>` : '';
    const current = quoteMatches(q,a,b,g);
    const dateFormat = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ru-RU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
    const dateLabel = dateFormat.formatRange(new Date(dateTime(q.arrival)),new Date(dateTime(q.departure)));
    return `<div class="reference-quote${compact ? ' reference-quote--compact' : ''}"><span class="quote-eyebrow">${tr('Справочный расчёт','Reference quote')} · ${escape(provider)}</span><strong class="quote-total">${value}</strong><p class="quote-meta">${escape(dateLabel)} · ${tr('гостей','guests')}: ${q.guests} · ${tr('ночей','nights')}: ${count(q.arrival,q.departure)}</p>${checked}${compact ? '' : `<p class="quote-context">${current ? tr('Параметры совпадают с вашим поиском. Финальную цену и доступность подтвердит команда Vertex.','These details match your search. The Vertex team will confirm final price and availability.') : tr('Это другие даты или число гостей. Для вашего запроса нужен новый расчёт.','These dates or guest count differ from your search. Your request needs a new quote.')}</p>`}<p class="quote-disclaimer">${compact ? tr('Датированный справочный пример, цена может измениться.','Dated reference example; price may change.') : tr('Справка по всей поездке, не постоянный тариф за ночь и не подтверждение бронирования.','A reference for the whole trip, not a fixed nightly rate or booking confirmation.')}</p></div>`;
  }
  function sourceLink(s) {
    return `<button class="source-link outline" type="button" data-rental-request="${escape(s.id)}">${tr('Оставить заявку в Vertex','Request in Vertex')}</button>`;
  }
  function photosOf(s) {
    return [...new Set([s.photo,...(Array.isArray(s.photos) ? s.photos : [])].filter(photo => typeof photo === 'string' && photo.trim()))];
  }
  function gallery(s) {
    const photos = photosOf(s); if (!photos.length) return '';
    return `<img id="rentalMainPhoto" class="detail-image gallery-main" src="${escape(photos[0])}" alt="${escape(titleOf(s))}">${photos.length > 1 ? `<p id="rentalPhotoCount" class="gallery-count">1 / ${photos.length}</p><div class="detail-gallery">${photos.map((photo,index) => `<button type="button" data-rental-photo="${index}" aria-pressed="${index === 0}" aria-label="${tr('Фото','Photo')} ${index+1}: ${escape(titleOf(s))}"><img src="${escape(photo)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}`;
  }
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
    const sortLabels = {default:['Рекомендуемые','Recommended'], asc:['Тариф UZS/ночь: дешевле','UZS/night: low to high'], desc:['Тариф UZS/ночь: дороже','UZS/night: high to low']};
    Array.from($('rentalSort').options).forEach(o => o.textContent = tr(...sortLabels[o.value]));
  }
  function card(s) {
    const favorite = data.favorites.includes(s.id);
    const photo = photosOf(s)[0];
    const badge = s.ownerConfirmed ? (s.sourceName || tr('Владелец','Owner')) : tr('ДЕМО','DEMO');
    const nightly = hasNightlyPrice(s) ? `<strong>${money(s.price,s.currency)}</strong> / ${tr('ночь','night')}` : tr('Цена на ваши даты — по запросу','Enquire for your dates');
    return `<article class="card rental-card"><div class="photo">${photo ? `<img src="${escape(photo)}" alt="${escape(titleOf(s))}" loading="lazy">` : '<div class="rental-placeholder">⌂</div>'}<span class="badge source-badge" data-source="${escape(s.ownerConfirmed ? String(s.sourceName || 'owner').toLowerCase() : 'demo')}">${escape(badge)} · ${escape(cityLabel(s.city))}</span><button class="heart" aria-label="${favorite ? tr('Убрать из избранного','Remove from favorites') : tr('В избранное','Save to favorites')}" aria-pressed="${favorite}" data-heart="${escape(s.id)}">${favorite ? '♥' : '♡'}</button></div><h3>${escape(titleOf(s))}</h3><p>${escape(typeLabel(s.type))} · ${capacityLabel(s)}${s.wifi === true ? ' · Wi-Fi' : ''}</p>${quoteBlock(s,true)}<div class="price-row"><span>${nightly}</span><button data-rental="${escape(s.id)}">${tr('Подробнее','Details')}</button></div>${sourceLink(s)}</article>`;
  }
  function focusRequest() {
    const form = $('bookingForm');
    if (form?.elements?.guest) {
      form.elements.guest.scrollIntoView({behavior:'smooth',block:'center'});
      form.elements.guest.focus();
    }
  }
  function bindCards(root,onFavorite) {
    root.querySelectorAll('[data-rental]').forEach(b => b.onclick = () => detail(b.dataset.rental));
    root.querySelectorAll('[data-rental-request]').forEach(b => b.onclick = () => { detail(b.dataset.rentalRequest); focusRequest(); });
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
    const list = catalog().filter(s => (city === 'all' || s.city === city) && (!hasCapacity(s) || s.capacity >= Number($('guests').value))
      && (limit === '' || hasUzsNightlyPrice(s) && s.price <= Number(limit)) && (!$('rentalType').value || s.type === $('rentalType').value)
      && (!$('wifiOnly').checked || s.wifi) && available(s.id,$('arrival').value,$('departure').value));
    if ($('rentalSort').value !== 'default') list.sort((a,b) => compareNightly(a,b,$('rentalSort').value));
    $('results').innerHTML = list.length ? list.map(card).join('') : `<p class="empty">${tr('Нет жилья по этим условиям. Измените даты, гостей или фильтры.','No stays match these conditions. Adjust your dates, guests or filters.')}</p>`;
    $('sectionDescription').textContent = list.length+tr(' вариантов · итоговые расчёты относятся только к указанным датам и гостям',' stays · total quotes apply only to their stated dates and guests')+(limit !== '' || $('rentalSort').value !== 'default' ? tr(' · фильтр и сортировка: только тарифы UZS/ночь',' · price filter and sorting: UZS nightly rates only') : '');
    bindCards($('results'),render);
  };
  function favorites() {
    show(tr('Избранное','Favorites'),`<p class="biz-caption">${tr('Сохранено на этом устройстве','Saved on this device')}</p><div class="cards">${catalog().filter(s => data.favorites.includes(s.id)).map(card).join('') || `<p class="notice">${tr('Нажмите ♡ на карточке жилья, чтобы сохранить его.','Tap ♡ on a property card to save it.')}</p>`}</div>`);
    bindCards($('modalBody'),() => { render(); favorites(); });
  }
  function validate(s,a,b,g) {
    const n = count(a,b);
    if (!Number.isFinite(n) || n < 1 || n > 365 || a < today()) return tr('Выберите даты от сегодняшнего дня: от 1 до 365 ночей.','Choose today or a later check-in date, for 1 to 365 nights.');
    if (!Number.isInteger(g) || g < 1 || g > 20 || hasCapacity(s) && g > s.capacity) return tr('Укажите число гостей в пределах вместимости объекта (до 20 в одном запросе).','Choose a guest count within the property capacity (up to 20 per request).');
    const quoted = referenceQuote(s);
    if (quoted?.unavailable && quoteMatches(quoted,a,b,g)) return tr('В справочной проверке этот запрос был недоступен. Выберите другие даты или оставьте заявку в Vertex для уточнения.','The reference check showed this request as unavailable. Choose different dates or send a Vertex request for confirmation.');
    if (!available(s.id,a,b)) return tr('Эти даты заняты демо-заявкой или закрыты хозяином. Выберите другие даты.','These dates have a demo request or are blocked by the host. Choose different dates.');
    return '';
  }
  function breakdown(s,a,b) {
    const n=count(a,b),subtotal=Number.isFinite(s.price)?n*s.price:null;
    return {n,subtotal,cleaning:null,fee:null,total:subtotal,currency:s.currency||'UZS'};
  }
  function detail(id) {
    const s = find(id); if (!s) return;
    const photos = photosOf(s);
    const amenities = [s.wifi === true ? 'Wi-Fi' : '',s.kitchen === true ? tr('Кухня','Kitchen') : '',s.bathroom === true ? tr('Ванная','Bathroom') : '',s.bedLinen === true ? tr('Постельное бельё','Bed linen') : ''].filter(Boolean);
    const description = lang === 'en' ? (s.descriptionEn || s.descEN || s.description || s.descRU) : (s.description || s.descRU || s.descriptionEn || s.descEN);
    const hostName = (lang === 'en' ? s.hostEn || s.host : s.host) || tr('Владелец объекта','Property owner');
    const initialGuests = Math.max(1,Math.min(hasCapacity(s) ? s.capacity : 20,Number($('guests').value) || 1));
    show(titleOf(s),`${gallery(s)}
      <p class="biz-caption">${s.ownerConfirmed ? `${escape(s.sourceName || tr('Владелец','Owner'))} · ${tr('Объект и фотографии подтверждены владельцем','Property and photos confirmed by the owner')}` : tr('ДЕМО-КАРТОЧКА · объект, фотографии и характеристики уточняются','DEMO CARD · property, photos and details need confirmation')}</p>
      <p>${escape(cityLabel(s.city))} · ${escape(typeLabel(s.type))} · ${capacityLabel(s)}</p>
      ${description ? `<p>${escape(description)}</p>` : ''}
      ${amenities.length ? `<div class="amenities">${amenities.map(item => `<span>${item}</span>`).join('')}</div>` : ''}
      <div id="rentalReferenceQuote">${quoteBlock(s,false,$('arrival').value,$('departure').value,initialGuests)}</div>
      <div id="rentalSourceLink">${sourceLink(s,$('arrival').value,$('departure').value,initialGuests)}</div>
      <div class="place"><strong>${tr('Хозяин:','Host:')} ${escape(hostName)}</strong><p>${s.ownerConfirmed ? tr('Актуальную цену, условия и наличие подтвердит команда Vertex после вашей заявки.','The Vertex team will confirm current price, terms and availability after your request.') : tr('Условный профиль для демонстрации','Illustrative demonstration profile')}</p><button id="contactHost" class="outline">${tr('Открыть обсуждение','Open discussion')}</button></div>
      <p class="notice">${tr('Ниже можно сохранить локальный демо-запрос. Он не отправляется хозяину, не бронирует квартиру и не списывает деньги.','You can save a local demo request below. It is not sent to the host, does not reserve the property and does not charge a payment.')}</p>
      <form id="bookingForm" class="biz-form"><label>${tr('Имя гостя','Guest name')}<input name="guest" required maxlength="80" autocomplete="name" placeholder="${tr('Как к вам обращаться?','What should we call you?')}"></label>
      <div class="booking-dates"><label>${tr('Заезд','Check-in')}<input name="arrival" type="date" min="${today()}" value="${escape($('arrival').value)}" required></label><label>${tr('Выезд','Check-out')}<input name="departure" type="date" value="${escape($('departure').value)}" required></label></div>
      <label>${tr('Гости','Guests')}<input name="guests" type="number" min="1" max="${hasCapacity(s) ? s.capacity : 20}" value="${initialGuests}" required></label><div id="priceBreakdown"></div>
      <label class="agree-label"><input name="agree" type="checkbox" required> ${tr('Я понимаю: это демо-запрос, без реального бронирования и оплаты.','I understand this is a demo request, without a real booking or payment.')}</label>
      <p id="rentalError" role="alert"></p><button type="submit" class="dark wide">${tr('Сохранить демо-запрос','Save demo request')}</button></form>`);
    $('modalBody').querySelectorAll('[data-rental-photo]').forEach(button => button.onclick = () => {
      const index = Number(button.dataset.rentalPhoto); if (!photos[index]) return;
      $('rentalMainPhoto').src = photos[index];
      $('rentalPhotoCount').textContent = `${index+1} / ${photos.length}`;
      $('modalBody').querySelectorAll('[data-rental-photo]').forEach(item => item.setAttribute('aria-pressed',String(item === button)));
    });
    $('contactHost').onclick = () => discussion(s.id);
    const f = $('bookingForm');
    const quote = () => {
      const a = f.elements.arrival.value, b = f.elements.departure.value, g = Number(f.elements.guests.value), q = breakdown(s,a,b);
      f.elements.departure.min = nextDate(a);
      $('rentalReferenceQuote').innerHTML = quoteBlock(s,false,a,b,g);
      $('rentalSourceLink').innerHTML = sourceLink(s);
      const internalRequest = $('rentalSourceLink').querySelector('[data-rental-request]');
      if (internalRequest) internalRequest.onclick = focusRequest;
      $('priceBreakdown').innerHTML = Number.isFinite(q.n) && q.n > 0 && q.n <= 365
        ? hasNightlyPrice(s)
          ? `<div class="quote-row"><span>${money(s.price,s.currency)} × ${q.n} ${tr('ночей','nights')}</span><strong>${money(q.subtotal,s.currency)}</strong></div><p class="notice">${tr('Уборку и сборы уточните у хозяина.','Confirm cleaning charges and fees with the host.')}</p><div class="trip-total"><span>${tr('Проживание · без списания','Accommodation · no charge')}</span><strong>${money(q.total,s.currency)}</strong></div>`
          : `<p class="notice">${tr('Стоимость для выбранных дат уточняется у хозяина. Справочный расчёт источника не переносится в сумму демо-заявки.','Ask the host for a price for your selected dates. The source reference quote is not used as the demo request amount.')}</p><div class="trip-total"><span>${tr('Сумма запроса','Request amount')}</span><strong>${money(null,s.currency)}</strong></div>`
        : `<p class="notice">${tr('Выберите корректные даты для расчёта.','Choose valid dates to see the estimate.')}</p>`;
    };
    f.elements.arrival.onchange = quote; f.elements.departure.onchange = quote; f.elements.guests.oninput = quote; quote();
    f.onsubmit = e => {
      e.preventDefault();
      const a = f.elements.arrival.value, b = f.elements.departure.value, g = Number(f.elements.guests.value), guest = f.elements.guest.value.trim();
      const problem = validate(s,a,b,g);
      if (problem || !guest || !f.elements.agree.checked) { error(problem || (!guest ? tr('Введите имя гостя.','Enter the guest name.') : tr('Подтвердите условия демо-запроса.','Accept the demo request terms.'))); return; }
      const booking = {id:crypto.randomUUID(),listingId:s.id,title:s.ru,city:s.city,guest,arrival:a,departure:b,guests:g,...breakdown(s,a,b),referenceQuote:referenceQuote(s),status:'Запрос отправлен',created:new Date().toISOString()};
      data.bookings.push(booking); if (!persist()) { data.bookings.pop(); return; }
      window.dispatchEvent(new CustomEvent('vertex-booking',{detail:booking})); render();
      show(tr('Демо-запрос сохранён','Demo request saved'),`<div class="booking-success">✓</div><h3>${escape(titleOf(s))}</h3><p>${a} → ${b} · ${tr('гостей','guests')}: ${g}</p><p>№ ${booking.id.slice(0,8).toUpperCase()} · ${money(booking.total,booking.currency)}</p><p class="notice">${tr('Запрос сохранён внутри Vertex. В демо он остаётся на этом устройстве; реальная отправка оператору будет подключена через сервер.','The request is saved inside Vertex. In this demo it stays on this device; real operator delivery will be connected through the server.')}</p><div class="biz-actions"><button id="openMyTrips" class="dark">${tr('Открыть поездки','Open trips')}</button><button id="continueDiscussion" class="outline">${tr('Обсуждение','Discussion')}</button></div>`);
      $('openMyTrips').onclick = trips;
      $('continueDiscussion').onclick = () => discussion(s.id);
    };
  }
  showStay = detail;
  function discussion(listingId) {
    const s = find(listingId); if (!s) return;
    let thread = data.threads.find(item => item.listingId === listingId);
    if (!thread) {
      thread = {listingId,messages:[]};
      data.threads.push(thread);
      data.threads = data.threads.slice(-100);
    }
    const draw = () => {
      const box = $('discussionMessages'); if (!box) return;
      box.innerHTML = thread.messages.length ? thread.messages.map(message => `<div class="discussion-bubble ${message.side}"><strong>${message.side === 'guest' ? tr('Вы','You') : tr('Views · демо','Views · demo')}</strong><p>${escape(message.text)}</p><small>${escape(new Date(message.at).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US'))}</small></div>`).join('') : `<p class="notice">${tr('Начните обсуждение по этому объекту. Сообщения сохраняются только на этом устройстве.','Start a discussion about this property. Messages are saved only on this device.')}</p>`;
      box.scrollTop = box.scrollHeight;
    };
    show(tr('Обсуждение по объекту','Property discussion'),`<h3>${escape(titleOf(s))}</h3><p class="notice">${tr('Демо-обсуждение: сообщения не отправляются хозяину или оператору. Реальный чат будет подключён через серверную систему.','Demo discussion: messages are not sent to a host or operator. Real messaging will be connected through the server system.')}</p><div id="discussionMessages" class="discussion-messages" role="log" aria-live="polite"></div><form id="discussionForm" class="chat-compose discussion-compose"><input name="message" maxlength="1000" autocomplete="off" required placeholder="${tr('Напишите сообщение…','Write a message…')}"><button class="dark" type="submit">${tr('Отправить','Send')}</button></form>`);
    draw();
    $('discussionForm').onsubmit = e => {
      e.preventDefault();
      const input = e.target.elements.message, value = input.value.trim(); if (!value) return;
      thread.messages.push({side:'guest',text:value,at:new Date().toISOString()});
      thread.messages.push({side:'host',text:tr('Сообщение сохранено в демо. Команда Views получит его после подключения реального чата.','Message saved in the demo. The Views team will receive it after real messaging is connected.'),at:new Date().toISOString()});
      thread.messages = thread.messages.slice(-60);
      if (!persist()) { thread.messages.splice(-2); return; }
      input.value = ''; draw(); input.focus();
    };
  }
  function bookingRows(hostMode) {
    return data.bookings.slice().reverse().map(b => `<div class="booking-row"><span class="status-pill">${escape(statusLabel(b.status))}</span><h3>${escape(bookingTitle(b))}</h3><p>${escape(b.arrival)} → ${escape(b.departure)} · ${b.guests} ${tr('гостей','guests')}</p><p>${escape(b.guest)} · <strong>${money(b.total,b.currency)}</strong></p><small>${tr('Демо-заявка №','Demo request #')} ${escape(b.id.slice(0,8).toUpperCase())} · ${tr('без оплаты','no payment')}</small><div class="biz-actions"><button class="outline" data-discuss="${escape(b.listingId)}">${tr('Обсуждение','Discussion')}</button>${hostMode && b.status === 'Запрос отправлен' ? `<button class="dark" data-status="Подтверждено" data-booking="${escape(b.id)}">${tr('Подтвердить','Confirm')}</button><button class="outline" data-status="Отклонено" data-booking="${escape(b.id)}">${tr('Отклонить','Decline')}</button>` : ''}${!hostMode && active(b) ? `<button class="outline" data-status="Отменено" data-booking="${escape(b.id)}">${tr('Отменить запрос','Cancel request')}</button>` : ''}</div></div>`).join('') || `<p class="notice">${tr('Заявок пока нет. Выберите жильё и отправьте демо-запрос.','No requests yet. Choose a stay and send a demo request.')}</p>`;
  }
  function bindBookings(hostMode) {
    $('modalBody').querySelectorAll('[data-discuss]').forEach(btn => btn.onclick = () => discussion(btn.dataset.discuss));
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
  window.VertexRentals = Object.freeze({showTrips:trips,showFavorites:favorites,showHost:host,showCalendar:()=>calendar(),showOwnerReport:ownerReport,createListing:newListing});
  $('cartButton').onclick = trips; $('viewTrip').onclick = trips;

  function hostMetrics() {
    const pending = data.bookings.filter(b => b.status === 'Запрос отправлен').length;
    const confirmed = data.bookings.filter(b => b.status === 'Подтверждено');
    const confirmedNights = confirmed.reduce((sum,b) => { const n = count(b.arrival,b.departure); return sum + (Number.isFinite(n) && n > 0 ? n : 0); },0);
    const totals = new Map();
    confirmed.forEach(b => { if (Number.isFinite(b.total)) totals.set(b.currency || 'UZS',(totals.get(b.currency || 'UZS') || 0)+b.total); });
    return {pending,confirmed:confirmed.length,confirmedNights,totals:[...totals]};
  }
  function ownerReport() {
    const metrics = hostMetrics();
    const total = metrics.totals.length ? metrics.totals.map(([currency,value]) => money(value,currency)).join(' / ') : tr('Уточнить','Enquire');
    show(tr('Отчёт собственника · демо','Owner report · demo'),`<p class="notice">${tr('Это локальный операционный отчёт по демо-заявкам. P&L, выплаты собственникам, налоги и банковские данные не подключены.','This is a local operational report for demo requests. P&L, owner payouts, taxes and banking data are not connected.')}</p><div class="owner-stats"><div><strong>${data.bookings.length}</strong><span>${tr('Все заявки','All requests')}</span></div><div><strong>${metrics.confirmed}</strong><span>${tr('Подтверждено','Confirmed')}</span></div><div><strong>${metrics.confirmedNights}</strong><span>${tr('Ночей подтверждено','Confirmed nights')}</span></div><div><strong>${total}</strong><span>${tr('Сумма подтверждённых демо-заявок','Confirmed demo-request value')}</span></div></div><h3>${tr('История заявок','Request history')}</h3>${bookingRows(true)}<button id="ownerBack" class="outline wide">${tr('← Кабинет хозяина','← Host panel')}</button>`);
    bindBookings(true); $('ownerBack').onclick = host;
  }
  function host() {
    const metrics = hostMetrics();
    show(tr('Кабинет хозяина','Host panel'),`<p class="notice">${tr('Демо-роль: данные этого устройства доступны для показа. Авторизация, реальные выплаты и P&L не подключены.','Demo role: data on this device is available for demonstration. Authentication, real payouts and P&L are not connected.')}</p><div class="owner-stats"><div><strong>${catalog().length}</strong><span>${tr('Объектов в каталоге','Catalog properties')}</span></div><div><strong>${metrics.pending}</strong><span>${tr('Новых заявок','New requests')}</span></div><div><strong>${metrics.confirmed}</strong><span>${tr('Подтверждено','Confirmed')}</span></div><div><strong>${metrics.confirmedNights}</strong><span>${tr('Ночей','Nights')}</span></div></div><div class="owner-actions"><button id="newListing" class="dark">${tr('+ Добавить жильё','+ Add a property')}</button><button id="hostCalendar" class="outline">${tr('▦ Календарь','▦ Calendar')}</button><button id="hostReport" class="outline">${tr('Отчёт','Report')}</button></div><h3>${tr('Мои объявления','My listings')} · ${catalog().length}</h3>${catalog().map(s => `<div class="line-item"><div><strong>${escape(titleOf(s))}</strong><p>${escape(cityLabel(s.city))} · ${escape(s.sourceName || tr('Локальное демо','Local demo'))}</p></div><span>${hasNightlyPrice(s) ? money(s.price,s.currency)+' / '+tr('ночь','night') : tr('Цена по запросу','Price on request')}</span></div>`).join('')}<h3>${tr('Заявки гостей','Guest requests')}</h3>${bookingRows(true)}`);
    $('newListing').onclick = newListing; $('hostCalendar').onclick = () => calendar(); $('hostReport').onclick = ownerReport; bindBookings(true);
  }
  function newListing() {
    show(tr('Добавить демо-жильё','Add a demo property'),`<form id="listingForm" class="biz-form"><label>${tr('Название','Name')}<input name="name" required maxlength="80"></label><label>${tr('Город','City')}<select name="city">${window.VertexCatalog.cities.map(c=>`<option value="${escape(c.id)}">${escape(lang==='en'?c.en:c.ru)}</option>`).join('')}</select></label><label>${tr('Тип','Type')}<select name="type">${typeOptions()}</select></label><label>${tr('Цена за ночь, UZS','Nightly price, UZS')}<input name="price" type="number" min="1" max="100000000" step="1" required></label><label>${tr('Вместимость','Capacity')}<input name="capacity" type="number" min="1" max="20" value="2" required></label><label>${tr('Имя хозяина','Host name')}<input name="host" required maxlength="80"></label><label>${tr('Описание','Description')}<textarea name="description" required maxlength="1500" rows="3"></textarea></label><label class="agree-label"><input name="wifi" type="checkbox" checked> Wi-Fi</label><p class="notice">${tr('Объявление появится только в демо на этом устройстве. Фотографии можно будет добавить после подключения загрузки.','This listing will appear only in the demo on this device. Photos can be added when uploads are connected.')}</p><p id="rentalError" role="alert"></p><button class="dark" type="submit">${tr('Добавить в каталог','Add to catalog')}</button></form>`);
    $('listingForm').onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target), name = String(f.get('name')).trim(), hostName = String(f.get('host')).trim(), description = String(f.get('description')).trim();
      if (!name || !hostName || !description) { error(tr('Заполните название, имя хозяина и описание.','Enter the property name, host name and description.')); return; }
      const price = Number(f.get('price')), capacity = Number(f.get('capacity'));
      if (!Number.isInteger(price) || price < 1 || price > 100000000 || !Number.isInteger(capacity) || capacity < 1 || capacity > 20) { error(tr('Укажите целую цену от 1 до 100 000 000 UZS и вместимость от 1 до 20 гостей.','Enter a whole-number price from 1 to 100,000,000 UZS and capacity from 1 to 20 guests.')); return; }
      const location = String(f.get('city'));
      const s = {id:crypto.randomUUID(),ru:name,en:name,city:location,type:String(f.get('type')),price,currency:'UZS',capacity,wifi:f.has('wifi'),host:hostName,description,photo:null};
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
