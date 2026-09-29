/* Host presentation layer. All records and operations belong to VertexRentals. */
(function (w) {
  'use strict';
  if (!w.document) return;
  const T = (ru, en) => document.documentElement.lang === 'en' ? en : ru;
  const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rental = () => w.VertexRentals;
  const icon = key => w.VertexHostIcons.render(key);
  const read = () => rental().getSnapshot();
  const name = property => T(property.ru, property.en || property.ru);
  const photo = property => (property.photos || [])[0] || property.photo || '';
  const state = {tab:'today', id:null}; // Navigation is ephemeral, not a second database.
  const notice = () => '<p class="notice">' + T('Демо · данные только этого устройства. Нет авторизации, реальных выплат или синхронизации с площадками.','Demo · data on this device only. No authentication, real payouts or channel synchronization.') + '</p>';
  const row = (id, icon, label) => '<button class="vh-row" data-ha="' + E(id) + '"><span aria-hidden="true">' + w.VertexHostIcons.render(id) + '</span><strong>' + E(label) + '</strong><b aria-hidden="true">›</b></button>';
  const head = title => '<header class="vh-head"><div><small>VERTEX · VIEWS</small><h2>' + E(title) + '</h2></div><button class="vh-avatar" data-ha="profile" aria-label="' + T('Профиль','Profile') + '">F</button></header>';
  function shell(html, tab = state.tab) {
    state.tab = tab;
    modal('Vertex · Views', '<div class="vh-shell"><button class="vh-close" aria-label="' + T('Закрыть кабинет','Close host console') + '">×</button><main>' + html + '</main><nav class="vh-nav" aria-label="' + T('Кабинет хозяина','Host navigation') + '">' + [['today','⌑','Сегодня','Today'],['calendar','▦','Календарь','Calendar'],['listings','▣','Объявления','Listings'],['messages','□','Сообщения','Messages'],['menu','☰','Меню','Menu']].map(item => '<button data-ht="' + item[0] + '" ' + (tab === item[0] ? 'aria-current="page"' : '') + '><span aria-hidden="true">' + icon(item[0]) + '</span><small>' + T(item[2],item[3]) + '</small></button>').join('') + '</nav></div>');
    $('modal').classList.add('vh-modal'); $('modal').scrollTop = 0;
    const body = $('modalBody');
    body.querySelector('.vh-close').onclick = () => $('modal').close();
    body.querySelectorAll('[data-ht]').forEach(button => button.onclick = () => w.VertexHostConsole.open(button.dataset.ht));
    body.querySelectorAll('[data-ha]').forEach(button => button.onclick = () => act(button.dataset.ha));
    body.querySelectorAll('[data-hl]').forEach(button => button.onclick = () => listing(button.dataset.hl));
    body.querySelectorAll('[data-thread]').forEach(button => button.onclick = () => rental().showDiscussion(button.dataset.thread));
  }
  function today() {
    const data = read(), date = w.VertexRentalDomain.localDate(new Date());
    const upcoming = data.bookings.filter(booking => w.VertexRentalDomain.active(booking) && booking.departure > date).sort((a,b) => a.arrival.localeCompare(b.arrival));
    shell(head(T('Сегодня','Today')) + notice() + '<div class="vh-kpis"><article><span>' + T('Новые заявки','New requests') + '</span><strong>' + data.metrics.pending + '</strong><small>' + T('сохранены локально','saved locally') + '</small></article><article><span>' + T('Предстоящие и текущие','Upcoming and current') + '</span><strong>' + upcoming.length + '</strong><small>' + T('активные демо-заявки','active demo requests') + '</small></article></div>' + (upcoming.length ? upcoming.slice(0,3).map(booking => '<section class="vh-card"><span class="vh-pill">' + E(booking.arrival) + ' → ' + E(booking.departure) + '</span><h3>' + E(booking.guest) + '</h3><p>' + E(booking.title) + '</p><p>' + E(booking.status) + '</p><button class="vh-primary" data-ha="reservations">' + T('Управлять заявками','Manage requests') + '</button></section>').join('') : '<section class="vh-card"><h3>' + T('Новых заездов пока нет','No upcoming arrivals') + '</h3><p>' + T('Здесь появятся заявки, созданные в демо на этом устройстве.','Requests created in the demo on this device will appear here.') + '</p></section>') + '<div class="vh-actions">' + row('calendar','▦',T('Календарь','Calendar')) + row('messages','□',T('Сообщения','Messages')) + row('listings','▣',T('Объявления','Listings')) + row('analytics','↗',T('Операционный отчёт','Operations report')) + '</div>', 'today');
  }
  // One calendar implementation: month navigation, blocks and overlaps share rental rules.
  function calendar() { return rental().showCalendar(state.id || undefined); }
  function listings() {
    const properties = read().properties;
    shell(head(T('Объявления','Listings')) + notice() + '<div class="vh-toolbar"><label class="vh-search">' + T('Поиск по названию','Search by name') + '<input id="hostListingSearch" type="search" maxlength="80"></label><button data-ha="new" aria-label="' + T('Добавить объявление','Add listing') + '">＋</button></div><div class="vh-listings">' + properties.map(property => '<button data-hl="' + E(property.id) + '" data-name="' + E(name(property).toLocaleLowerCase()) + '">' + (photo(property) ? '<img src="' + E(photo(property)) + '" alt="' + E(name(property)) + '">' : '<span class="vh-no-photo" aria-hidden="true">⌂</span>') + '<div><strong>' + E(name(property)) + '</strong><span>' + (property.ownerConfirmed ? T('Подтверждённый каталог · наличие уточняется','Confirmed catalog · availability on request') : T('Демо · только на устройстве','Demo · on this device only')) + '</span></div><b aria-hidden="true">›</b></button>').join('') + '</div><p id="hostSearchEmpty" class="notice" hidden>' + T('Объявления не найдены.','No listings found.') + '</p>', 'listings');
    $('hostListingSearch').oninput = event => {
      const query = event.target.value.trim().toLocaleLowerCase(); let visible = 0;
      $('modalBody').querySelectorAll('[data-hl]').forEach(button => { button.hidden = !button.dataset.name.includes(query); if (!button.hidden) visible++; });
      $('hostSearchEmpty').hidden = visible !== 0;
    };
  }
  function listing(id) {
    const property = read().properties.find(item => item.id === id);
    if (!property) return listings();
    state.id = property.id;
    shell('<button class="vh-back" data-ha="listings" aria-label="' + T('Назад','Back') + '">←</button>' + (photo(property) ? '<div class="vh-hero"><img src="' + E(photo(property)) + '" alt="' + E(name(property)) + '"></div>' : '') + '<h2>' + E(name(property)) + '</h2>' + notice() + '<p class="vh-muted">' + E(T(property.description || '',property.descriptionEn || property.description || '')) + '</p><div class="vh-property-actions"><button data-ha="photos">' + T('Фототур','Photo tour') + '</button><button data-ha="edit">' + T('Редактировать','Edit listing') + '</button></div><section class="vh-card">' + row('amenities','◇',T('Удобства','Amenities')) + row('rules','⌂',T('Правила дома','House rules')) + row('calendar','▦',T('Доступность','Availability')) + row('thread','□',T('Обсуждение объекта','Property discussion')) + '</section>', 'listings');
  }
  function messages() {
    const data = read();
    const threads = data.threads.filter(thread => thread.messages.length && data.properties.some(property => property.id === thread.listingId)).sort((a,b) => Date.parse(b.messages.at(-1).at) - Date.parse(a.messages.at(-1).at));
    shell(head(T('Сообщения','Messages')) + notice() + '<p class="vh-muted">' + T('Это локальные обсуждения объектов, а не входящие сообщения гостей.','These are local property discussions, not incoming guest messages.') + '</p><div class="vh-messages">' + (threads.length ? threads.map(thread => {
      const property = data.properties.find(item => item.id === thread.listingId), last = thread.messages.at(-1);
      return '<button data-thread="' + E(thread.listingId) + '"><i aria-hidden="true">□</i><div><strong>' + E(name(property)) + '</strong><p>' + E(last.text) + '</p></div><small>' + E(new Date(last.at).toLocaleDateString(T('ru-RU','en-US'))) + '</small></button>';
    }).join('') : '<p class="notice">' + T('Обсуждений пока нет. Откройте объект и выберите «Обсуждение объекта».','No discussions yet. Open a property and choose “Property discussion”.') + '</p>') + '</div>', 'messages');
  }
  function menu() {
    const data = read();
    shell(head(T('Меню','Menu')) + notice() + '<div class="vh-kpis"><article><span>' + T('Объектов','Properties') + '</span><strong>' + data.properties.length + '</strong></article><article><span>' + T('Подтверждено в демо','Confirmed in demo') + '</span><strong>' + data.metrics.confirmed + '</strong></article></div><div class="vh-menu">' + row('analytics','↗',T('Операционный отчёт','Operations report')) + row('account','⚙',T('Настройки аккаунта','Account settings')) + row('resources','▤',T('Материалы для хозяев','Host resources')) + row('help','?',T('Помощь','Help')) + row('new','＋',T('Создать демо-объявление','Create demo listing')) + row('team','♙',T('Демо-задачи команды','Demo team tasks')) + row('company','▦',T('Сведения о компании','Company information')) + row('tax','▥',T('Налоги','Taxes')) + '</div>', 'menu');
  }
  function open(id) {
    if (!rental()) { modal('Vertex', '<p class="notice">' + T('Модуль аренды недоступен. Обновите страницу.','The rental module is unavailable. Reload the page.') + '</p>'); return; }
    return ({today, calendar, listings, messages, menu}[id] || today)();
  }
  function act(id) {
    if (['today','calendar','listings','messages','menu'].includes(id)) return w.VertexHostConsole.open(id);
    if (id === 'selected') return listing(state.id);
    if (id === 'reservations' || id === 'guest' || id === 'manage') return rental().showHost();
    if (id === 'thread' || id === 'message-guest') return state.id ? rental().showDiscussion(state.id) : messages();
    if (id === 'analytics') return rental().showOwnerReport();
    if (id === 'new') return rental().createListing();
    if (id === 'edit') return rental().editListing(state.id);
    return w.VertexHostMore?.open(id, {shell, row, state, listing, properties:read().properties});
  }
  w.VertexHostConsole = Object.freeze({open, listing});
})(window);
