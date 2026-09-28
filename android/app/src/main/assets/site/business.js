(() => {
  const key = 'vertex-crm-v1';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const language = () => typeof lang === 'undefined' ? document.documentElement.lang : lang;
  const tx = (ru, en) => language() === 'en' ? en : ru;
  const locale = () => tx('ru-RU', 'en-US');
  const currencyOf = c => /^[A-Z]{3}$/.test(c?.currency || '') ? c.currency : 'USD';
  const amount = (value, currency = 'UZS') => value == null || value === '' || !Number.isFinite(Number(value)) ? tx('Уточнить','Enquire') : new Intl.NumberFormat(locale(), {style:'currency', currency, maximumFractionDigits:currency === 'UZS' ? 0 : 2}).format(Number(value));
  // Stored stages remain unchanged so existing CRM records keep their meaning.
  const stages = ['Новый', 'В работе', 'Предложение', 'Завершён'];
  const stageLabels = ['New', 'In progress', 'Proposal', 'Completed'];
  const stageLabel = stage => tx(stage, stageLabels[stages.indexOf(stage)] || stage);
  const demoReply = 'Спасибо! Пришлите, пожалуйста, детали предложения. [Демонстрационный ответ]';
  const demoReplyEnglish = 'Thank you! Please send the proposal details. [Demonstration reply]';
  const callLabels = {
    'Демо-звонок завершён':'Demo call ended',
    'Открыт набор номера (результат неизвестен)':'Dialer opened (outcome unknown)'
  };
  // Existing customer text is retained; only catalog city names are localized.
  function field(c, name) {
    const city = name === 'city' && window.VertexCatalog?.cities?.find(city => [city.id,city.ru,city.en].includes(c[name]));
    return city ? tx(city.ru,city.en) : c[name];
  }
  function messageText(c, m) {
    if (language() !== 'en' || m.side !== 'client') return m.text;
    if (m.text === demoReply) return demoReplyEnglish;
    return m.text;
  }
  let clients = [], current = null, timer = null, replyTimer = null;
  let screen = 'crm', view = 'crm', editing = null, callState = null, storageFailed = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(saved) && saved.every(c => c && c.id && typeof c.name === 'string' && Array.isArray(c.messages) && Array.isArray(c.calls))) clients = saved.map(c => ({...c,currency:currencyOf(c)}));
  } catch {}
  const time = () => new Date().toLocaleTimeString(locale(), {hour:'2-digit',minute:'2-digit',hour12:false});
  function save() {
    try { localStorage.setItem(key, JSON.stringify(clients)); storageFailed = false; }
    catch { storageFailed = true; }
    storageStatus();
  }
  function storageStatus() {
    const el = document.getElementById('crmStorage');
    if (el) el.textContent = storageFailed ? tx('Не удалось сохранить данные. Освободите память устройства.', 'Could not save your data. Free up storage on this device.') : '';
  }
  const dialog = document.createElement('dialog');
  dialog.id = 'businessDialog';
  dialog.setAttribute('aria-labelledby', 'bizTitle');
  dialog.innerHTML = '<div class="biz-head"><div><span class="biz-kicker"></span><h2 id="bizTitle">CRM</h2></div><button id="bizClose" type="button">✕</button></div><nav class="biz-tabs"><button data-screen="crm"></button><button data-screen="map"></button><button data-screen="chat"></button><button data-screen="calls"></button></nav><p id="crmStorage" role="status"></p><div id="bizBody"></div>';
  document.body.append(dialog);
  const body = dialog.querySelector('#bizBody');
  const client = () => clients.find(c => c.id === current);
  function stop() { if (timer) clearInterval(timer); timer = null; callState = null; }
  dialog.querySelector('#bizClose').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { stop(); clearTimeout(replyTimer); });
  dialog.querySelectorAll('[data-screen]').forEach(b => b.onclick = () => open(b.dataset.screen));
  const strip = document.createElement('section');
  strip.className = 'business-entry';
  strip.innerHTML = '<div><span class="biz-kicker">VERTEX BUSINESS</span><h2></h2><p></p></div><div><button class="dark" data-open="crm">▦ CRM</button><button class="outline" data-open="map"></button><button class="outline" data-open="chat"></button><button class="outline" data-open="calls"></button></div>';
  document.querySelector('main').prepend(strip);
  strip.querySelectorAll('[data-open]').forEach(b => b.onclick = () => open(b.dataset.open));
  showMap = () => open('map');
  document.getElementById('mapButton').onclick = showMap;
  function chrome() {
    dialog.querySelector('.biz-kicker').textContent = tx('VERTEX · РАБОЧЕЕ ПРОСТРАНСТВО', 'VERTEX · WORKSPACE');
    dialog.querySelector('#bizClose').setAttribute('aria-label', tx('Закрыть раздел', 'Close workspace'));
    dialog.querySelector('.biz-tabs').setAttribute('aria-label', tx('Разделы рабочего пространства', 'Workspace sections'));
    const tabs = {crm:tx('Клиенты','Clients'),map:tx('Карта','Map'),chat:tx('Чаты','Chats'),calls:tx('Звонки','Calls')};
    dialog.querySelectorAll('[data-screen]').forEach(b => {
      b.textContent = tabs[b.dataset.screen];
      b.setAttribute('aria-pressed', String(b.dataset.screen === screen));
    });
    dialog.querySelector('#bizTitle').textContent = {crm:tx('Клиенты и сделки','Clients & deals'),map:tx('Карта поездки','Trip map'),chat:tx('Сообщения','Messages'),calls:tx('Звонки','Calls')}[screen];
    strip.querySelector('h2').textContent = tx('Клиенты. Поездки. Общение.', 'Clients. Trips. Conversations.');
    strip.querySelector('p').textContent = tx('Управляйте запросами в одном месте', 'Manage requests in one place');
    strip.querySelector('[data-open="map"]').textContent = tx('⌖ Карта', '⌖ Map');
    strip.querySelector('[data-open="chat"]').textContent = tx('↗ Чат', '↗ Chat');
    strip.querySelector('[data-open="calls"]').textContent = tx('☎ Звонки', '☎ Calls');
    storageStatus();
  }
  function open(next) {
    stop(); clearTimeout(replyTimer); screen = next;
    chrome();
    ({crm, map, chat:chats, calls})[next]();
    if (!dialog.open) dialog.showModal();
  }
  function crm(state = {}) {
    view = 'crm';
    const openDeals = clients.filter(c => c.stage !== 'Завершён');
    const totals = new Map();
    openDeals.forEach(c => {if(c.budget != null && c.budget !== '' && Number.isFinite(Number(c.budget))) totals.set(currencyOf(c),(totals.get(currencyOf(c)) || 0) + Number(c.budget));});
    const totalLabel = [...totals].map(([currency,total]) => amount(total,currency)).join(' / ') || (openDeals.length ? tx('Уточнить','Enquire') : amount(0));
    body.innerHTML = `<p class="biz-caption">${tx('Демо-CRM · данные сохраняются только на этом устройстве. Прежние сделки сохраняют исходную валюту.','Demo CRM · data is saved only on this device. Existing deals retain their original currency.')}</p><div class="biz-stats"><div><strong>${clients.length}</strong><span>${tx('Клиентов','Clients')}</span></div><div><strong>${openDeals.length}</strong><span>${tx('Открытых сделок','Open deals')}</span></div><div><strong>${totalLabel}</strong><span>${tx('В работе · без конвертации','In progress · no conversion')}</span></div></div><div class="biz-toolbar"><input id="clientSearch" type="search" placeholder="${tx('Найти клиента или город','Find a client or city')}" aria-label="${tx('Поиск клиентов','Search clients')}"><button class="lime" id="newClient">${tx('+ Клиент','+ Client')}</button></div><select id="stageFilter" aria-label="${tx('Фильтр статуса','Filter by status')}"><option value="">${tx('Все статусы','All statuses')}</option>${stages.map(s => `<option value="${s}">${stageLabel(s)}</option>`).join('')}</select><div id="clientList"></div>`;
    body.querySelector('#clientSearch').value = state.query || '';
    body.querySelector('#stageFilter').value = state.stage || '';
    const list = () => {
      const q = body.querySelector('#clientSearch').value.toLocaleLowerCase(locale());
      const stage = body.querySelector('#stageFilter').value;
      const rows = clients.filter(c => `${c.name} ${c.city} ${field(c,'name')} ${field(c,'city')}`.toLocaleLowerCase(locale()).includes(q) && (!stage || stage === c.stage));
      body.querySelector('#clientList').innerHTML = rows.map(c => `<button class="client-row" data-client="${esc(c.id)}"><span class="avatar">${esc(field(c,'name').slice(0,1))}</span><span class="client-copy"><strong>${esc(field(c,'name'))}</strong><small>${esc(field(c,'city'))} · ${amount(c.budget,currencyOf(c))}</small></span><span class="status-pill">${esc(stageLabel(c.stage))}</span></button>`).join('') || `<p class="notice">${tx('Клиентов пока нет. Добавьте карточку или измените поиск.','No clients found. Add a client or change your search.')}</p>`;
      body.querySelectorAll('[data-client]').forEach(b => b.onclick = () => { current = b.dataset.client; detail(); });
    };
    body.querySelector('#clientSearch').oninput = list;
    body.querySelector('#stageFilter').onchange = list;
    body.querySelector('#newClient').onclick = () => edit(null);
    list();
  }
  function detail() {
    const c = client(); if (!c) return crm(); view = 'detail';
    body.innerHTML = `<button class="biz-back" id="backClients">${tx('← Все клиенты','← All clients')}</button><div class="client-heading"><span class="avatar large">${esc(field(c,'name')[0])}</span><div><h3>${esc(field(c,'name'))}</h3><p>${esc(field(c,'city'))} · ${esc(stageLabel(c.stage))}</p></div></div><div class="biz-actions"><button class="dark" id="clientChat">${tx('Написать','Message')}</button><button class="outline" id="clientCall">${tx('Позвонить','Call')}</button><button class="outline" id="clientEdit">${tx('Изменить','Edit')}</button></div><div class="place"><span class="biz-caption">${tx('СУММА СДЕЛКИ','DEAL VALUE')}</span><h2>${amount(c.budget,currencyOf(c))}</h2><p>${esc(c.phone || tx('Телефон не указан','No phone number'))}</p></div><h3>${tx('Заметки','Notes')}</h3><p class="notice prewrap">${esc(field(c,'note') || tx('Нет заметок','No notes'))}</p><h3>${tx('Активность','Activity')}</h3><p>${tx('Сообщений:','Messages:')} ${c.messages.length} · ${tx('Записей звонков:','Call records:')} ${c.calls.length}</p>`;
    body.querySelector('#backClients').onclick = () => crm();
    body.querySelector('#clientEdit').onclick = () => edit(c);
    body.querySelector('#clientChat').onclick = () => { open('chat'); conversation(); };
    body.querySelector('#clientCall').onclick = () => { open('calls'); callOptions(); };
  }
  function edit(c, draft) {
    view = 'edit'; editing = c;
    const values = draft || c || {};
    const currency = c ? currencyOf(c) : 'UZS';
    body.innerHTML = `<form id="clientForm" class="biz-form"><h3>${c ? tx('Редактирование','Edit client') : tx('Новый клиент','New client')}</h3><label>${tx('Имя','Name')}<input name="name" required maxlength="80" value="${esc(values.name || '')}"></label><label>${tx('Город','City')}<input name="city" maxlength="80" value="${esc(values.city || '')}"></label><label>${tx('Телефон для обычного звонка','Phone number for a regular call')}<input name="phone" type="tel" maxlength="24" placeholder="+998…" value="${esc(values.phone || '')}"></label><label>${tx('Статус','Status')}<select name="stage">${stages.map(s => `<option value="${s}" ${s === values.stage ? 'selected' : ''}>${stageLabel(s)}</option>`).join('')}</select></label><label>${tx('Сумма сделки','Deal value')}, ${currency}<input name="budget" type="number" min="0" max="100000000000" step="${currency === 'UZS' ? '1' : '0.01'}" placeholder="${tx('Уточнить','Enquire')}" value="${esc(values.budget ?? '')}"></label><label>${tx('Заметки','Notes')}<textarea name="note" rows="3" maxlength="2000">${esc(values.note || '')}</textarea></label><p id="formError" role="alert">${draft?.invalid ? formError() : ''}</p><div class="biz-actions"><button class="dark" type="submit">${tx('Сохранить','Save')}</button><button class="outline" type="button" id="cancelEdit">${tx('Отмена','Cancel')}</button></div></form>`;
    body.querySelector('#cancelEdit').onclick = () => c ? detail() : crm();
    body.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target), phone = String(f.get('phone')).trim(), name = String(f.get('name')).trim();
      if (!name || phone && !/^\+?[0-9 ()-]{5,24}$/.test(phone)) { body.querySelector('#formError').textContent = formError(); return; }
      const values = {name, phone, city:String(f.get('city')).trim(), stage:String(f.get('stage')), budget:String(f.get('budget')).trim() === '' ? null : Number(f.get('budget')), currency, note:String(f.get('note')).trim()};
      if (c) Object.assign(c, values);
      else { c = {id:crypto.randomUUID(), ...values, messages:[], calls:[]}; clients.unshift(c); }
      current = c.id; save(); detail();
    };
  }
  const formError = () => tx('Укажите имя и корректный телефон либо оставьте телефон пустым.', 'Enter a name and a valid phone number, or leave the phone number empty.');
  function choose(action) {
    body.innerHTML = `<p class="biz-caption">${tx('Выберите клиента','Choose a client')}</p>` + (clients.map(c => `<button class="client-row" data-client="${esc(c.id)}"><span class="avatar">${esc(field(c,'name')[0])}</span><span class="client-copy"><strong>${esc(field(c,'name'))}</strong><small>${esc(field(c,'city'))}</small></span><span>→</span></button>`).join('') || `<p class="notice">${tx('Добавьте клиента в CRM, чтобы начать.','Add a client in CRM to get started.')}</p>`);
    body.querySelectorAll('[data-client]').forEach(b => b.onclick = () => { current = b.dataset.client; action(); });
  }
  function chats() { view = 'chats'; choose(conversation); }
  function conversation(draft = '') {
    const c = client(); if (!c) return chats(); view = 'conversation';
    body.innerHTML = `<button class="biz-back" id="backChats">${tx('← Все чаты','← All chats')}</button><div class="client-heading"><span class="avatar">${esc(field(c,'name')[0])}</span><div><h3>${esc(field(c,'name'))}</h3><small>${tx('Демо-чат · без отправки клиенту','Demo chat · nothing is sent to the client')}</small></div><button class="outline" id="chatCall" aria-label="${tx('Позвонить клиенту','Call client')}">☎</button></div><div class="chat-messages" id="messages" aria-live="polite"></div><form class="chat-compose" id="messageForm"><input name="message" maxlength="1000" required autocomplete="off" placeholder="${tx('Ваше сообщение…','Your message…')}" aria-label="${tx('Сообщение','Message')}"><button class="dark">${tx('Отправить','Send')}</button></form><p class="biz-caption">${tx('Ответы клиента моделируются. Переписка хранится на устройстве.','Client replies are simulated. The conversation is saved on this device.')}</p>`;
    body.querySelector('[name="message"]').value = draft;
    const draw = () => {
      const box = body.querySelector('#messages'); if (!box) return;
      box.innerHTML = c.messages.map(m => `<div class="bubble ${m.side === 'agent' ? 'out' : 'in'}"><div>${esc(messageText(c,m))}</div><small>${esc(m.time)} · ${m.side === 'agent' ? tx('Сохранено локально','Saved locally') : tx('Демо-клиент','Demo client')}</small></div>`).join('') || `<p class="biz-caption">${tx('Начните демонстрационную переписку','Start a demo conversation')}</p>`;
      box.scrollTop = box.scrollHeight;
    };
    draw();
    body.querySelector('#backChats').onclick = () => { clearTimeout(replyTimer); chats(); };
    body.querySelector('#chatCall').onclick = () => { open('calls'); callOptions(); };
    body.querySelector('form').onsubmit = e => {
      e.preventDefault(); const input = e.target.elements.message, value = input.value.trim(); if (!value) return;
      c.messages.push({side:'agent',text:value,time:time()}); input.value = ''; save(); draw(); clearTimeout(replyTimer);
      replyTimer = setTimeout(() => {
        c.messages.push({side:'client',text:demoReply,time:time()}); save();
        if (client()?.id === c.id && view === 'conversation' && dialog.open) draw();
      },900);
    };
  }
  function calls() { view = 'calls'; choose(callOptions); }
  function callOptions() {
    const c = client(); if (!c) return calls(); view = 'callOptions';
    body.innerHTML = `<button class="biz-back" id="backCalls">${tx('← Все клиенты','← All clients')}</button><div class="client-heading"><span class="avatar large">${esc(field(c,'name')[0])}</span><div><h3>${esc(field(c,'name'))}</h3><p>${esc(c.phone || tx('Телефон не указан','No phone number'))}</p></div></div><button class="dark wide" id="demoCall">${tx('☎ Демонстрация звонка','☎ Demo call')}</button><p class="biz-caption">${tx('Симуляция экрана разговора, без передачи звука.','A simulated call screen. No audio is transmitted.')}</p>${c.phone ? `<a class="dial-link" id="dial" href="tel:${esc(c.phone.replace(/[^+0-9]/g,''))}">${tx('Открыть набор номера','Open phone dialer')}</a><p class="biz-caption">${tx('Обычный телефонный звонок: подтвердите его в приложении «Телефон».','For a regular phone call, confirm the call in your phone app.')}</p>` : `<button class="outline wide" id="addPhone">${tx('Добавить номер телефона','Add a phone number')}</button>`}<h3>${tx('История','History')}</h3>${c.calls.map(x => `<div class="call-log"><strong>${esc(tx(x.kind,callLabels[x.kind] || x.kind))}</strong><small>${esc(x.at)}${x.seconds !== undefined ? ` · ${esc(x.seconds)} ${tx('сек.','sec')}` : ''}</small></div>`).reverse().join('') || `<p class="biz-caption">${tx('Звонков пока нет','No calls yet')}</p>`}`;
    body.querySelector('#backCalls').onclick = calls;
    body.querySelector('#demoCall').onclick = demoCall;
    const add = body.querySelector('#addPhone'); if (add) add.onclick = () => edit(c);
    const dial = body.querySelector('#dial');
    if (dial) dial.onclick = () => { c.calls.push({kind:'Открыт набор номера (результат неизвестен)',at:new Date().toLocaleString(locale())}); save(); };
  }
  const callClock = () => String(Math.floor(callState.seconds / 60)).padStart(2,'0') + ':' + String(callState.seconds % 60).padStart(2,'0');
  function drawCall() {
    const c = client(); if (!c || !callState) return calls(); view = 'demoCall';
    body.innerHTML = `<div class="call-screen"><span class="status-pill">${tx('ДЕМОНСТРАЦИЯ · БЕЗ АУДИО','DEMO · NO AUDIO')}</span><span class="avatar call-avatar">${esc(field(c,'name')[0])}</span><h2>${esc(field(c,'name'))}</h2><p>${tx('Симуляция разговора','Simulated conversation')}</p><strong id="callClock">${callClock()}</strong><div class="biz-actions"><button class="outline ${callState.muteDemo ? 'lime' : ''}" id="muteDemo" aria-pressed="${callState.muteDemo}">${tx('Микрофон: демо','Microphone: demo')}</button><button class="outline ${callState.speakerDemo ? 'lime' : ''}" id="speakerDemo" aria-pressed="${callState.speakerDemo}">${tx('Динамик: демо','Speaker: demo')}</button></div><button class="end-call" id="hangup">${tx('Завершить','End call')}</button></div>`;
    ['muteDemo','speakerDemo'].forEach(id => body.querySelector('#' + id).onclick = e => {
      callState[id] = !callState[id]; e.currentTarget.setAttribute('aria-pressed', String(callState[id])); e.currentTarget.classList.toggle('lime', callState[id]);
    });
    body.querySelector('#hangup').onclick = () => {
      const seconds = callState.seconds; stop();
      c.calls.push({kind:'Демо-звонок завершён',at:new Date().toLocaleString(locale()),seconds}); save(); callOptions();
    };
  }
  function demoCall() {
    stop(); callState = {seconds:0,muteDemo:false,speakerDemo:false}; drawCall();
    timer = setInterval(() => { callState.seconds++; const clock = body.querySelector('#callClock'); if (clock) clock.textContent = callClock(); },1000);
  }
  window.addEventListener('vertex-booking', event => {
    const b = event.detail; if (clients.some(c => c.bookingId === b.id)) return;
    clients.unshift({id:crypto.randomUUID(),bookingId:b.id,name:b.guest,city:b.city,phone:'',stage:'Новый',budget:b.total,currency:b.currency || 'UZS',note:tx('Демо-заявка ','Demo request ') + b.id.slice(0,8) + ' · ' + b.title + ' · ' + b.arrival + ' → ' + b.departure,messages:[],calls:[]}); save();
  });
  const places = [
    {id:'Tashkent',ru:'Ташкент',en:'Tashkent',placeRu:'Tashkent City',placeEn:'Tashkent City',query:'Tashkent City, Tashkent, Uzbekistan'},
    {id:'Samarkand',ru:'Самарканд',en:'Samarkand',placeRu:'Регистан',placeEn:'Registan',query:'Registan, Samarkand, Uzbekistan'},
    {id:'Bukhara',ru:'Бухара',en:'Bukhara',placeRu:'Ляби-Хауз',placeEn:'Lyabi-Hauz',query:'Lyabi-Hauz, Bukhara, Uzbekistan'},
    {id:'Khiva',ru:'Хива',en:'Khiva',placeRu:'Ичан-Кала',placeEn:'Itchan Kala',query:'Itchan Kala, Khiva, Uzbekistan'}
  ];
  function map(selected) {
    view = 'map';
    const selectedCity = selected || document.getElementById('destination')?.value;
    const currentPlace = places.find(place => place.id === selectedCity) || places[0];
    body.innerHTML = '<p class="biz-caption">' + tx('Узбекистан · места для вашей поездки','Uzbekistan · places for your trip') + '</p><select id="mapPlace" aria-label="' + tx('Город на карте','City on the map') + '">' + places.map(place => '<option value="' + place.id + '">' + tx(place.ru,place.en) + '</option>').join('') + '</select><div id="mapContent"></div><p class="biz-caption">' + tx('Поиск по названию места, без неподтверждённых GPS-меток. Карта откроется в новой вкладке; нужен интернет.','Search by place name, without unverified GPS pins. The map opens in a new tab and requires internet.') + '</p><button class="outline" id="reloadMap">' + tx('Обновить ссылки','Refresh links') + '</button>';
    body.querySelector('#mapPlace').value = currentPlace.id;
    const draw = () => {
      const place = places.find(place => place.id === body.querySelector('#mapPlace').value) || places[0];
      const query = encodeURIComponent(place.query);
      const cityQuery = encodeURIComponent(place.en + ', Uzbekistan');
      body.querySelector('#mapContent').innerHTML = '<div class="place"><h3>' + tx(place.placeRu,place.placeEn) + '</h3><p>' + tx(place.ru,place.en) + '</p><a href="https://www.google.com/maps/search/?api=1&query=' + query + '" target="_blank" rel="noopener">' + tx('Найти место на карте ↗','Find this place on the map ↗') + '</a><p><a href="https://www.openstreetmap.org/search?query=' + cityQuery + '" target="_blank" rel="noopener">' + tx('Открыть карту города ↗','Open the city map ↗') + '</a></p></div>';
    };
    body.querySelector('#mapPlace').onchange = draw;
    body.querySelector('#reloadMap').onclick = draw;
    draw();
  }
  let lastLanguage = language();
  function refreshLanguage() {
    if (lastLanguage === language()) return;
    lastLanguage = language(); chrome();
    if (!dialog.open) return;
    const active = document.activeElement;
    const focus = body.contains(active) ? {id:active.id,name:active.getAttribute('name'),start:active.selectionStart,end:active.selectionEnd} : null;
    if (view === 'crm') crm({query:body.querySelector('#clientSearch').value,stage:body.querySelector('#stageFilter').value});
    else if (view === 'edit') edit(editing,{...Object.fromEntries(new FormData(body.querySelector('#clientForm'))),invalid:!!body.querySelector('#formError').textContent});
    else if (view === 'conversation') conversation(body.querySelector('[name="message"]').value);
    else if (view === 'map') map(body.querySelector('#mapPlace').value);
    else ({detail,chats,calls,callOptions,demoCall:drawCall})[view]?.();
    if (focus) {
      const element = focus.id ? document.getElementById(focus.id) : body.querySelector(`[name="${focus.name}"]`);
      element?.focus({preventScroll:true});
      if (focus.start !== null && typeof element?.setSelectionRange === 'function') try { element.setSelectionRange(focus.start,focus.end); } catch {}
    }
  }
  const previousRender = render;
  render = function(...args) { const result = previousRender.apply(this,args); refreshLanguage(); return result; };
  window.addEventListener('vertex-language-change', refreshLanguage);
  chrome();
})();
