/* Vertex Host Experience 1.13 — video-reference layout on top of validated rental logic. */
(function (w) {
  'use strict';
  if (!w.document || !w.VertexHostConsole || !w.VertexRentals) return;
  const legacy = w.VertexHostConsole;
  const T = (ru,en) => document.documentElement.lang === 'en' ? en : ru;
  const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = {tab:'today'};
  const snapshot = () => w.VertexRentals.getSnapshot();
  const active = b => w.VertexRentalDomain.active(b);
  const confirmed = b => b.status === 'Подтверждено';
  const money = (value,currency) => Number.isFinite(value) ? new Intl.NumberFormat(document.documentElement.lang === 'en' ? 'en-US':'ru-RU',{maximumFractionDigits:2}).format(value)+' '+currency : '—';
  const grouped = bookings => bookings.reduce((acc,b) => {
    if (!Number.isFinite(b.total) || !/^[A-Z]{3}$/.test(b.currency || '')) return acc;
    acc[b.currency]=(acc[b.currency]||0)+b.total; return acc;
  },{});
  const groupHtml = map => Object.entries(map).length ? Object.entries(map).map(([c,v])=>'<strong>'+E(money(v,c))+'</strong>').join('<br>') : '<strong>—</strong>';
  const row = (id,icon,ru,en,meta='') => '<button class="vhv-row" data-vh-action="'+E(id)+'"><span class="vhv-icon" aria-hidden="true">'+w.VertexHostIcons.render(id)+'</span><span><strong>'+E(T(ru,en))+'</strong>'+(meta?'<small>'+E(meta)+'</small>':'')+'</span><b aria-hidden="true">›</b></button>';
  const nav = tab => '<nav class="vhv-nav" aria-label="'+T('Кабинет хозяина','Host navigation')+'">'+[
    ['today','⌂','Сегодня','Today'],['calendar','▦','Календарь','Calendar'],['listings','▣','Объявления','Listings'],['messages','□','Сообщения','Messages'],['menu','☰','Меню','Menu']
  ].map(x=>'<button data-vh-tab="'+x[0]+'" '+(tab===x[0]?'aria-current="page"':'')+'><span>'+w.VertexHostIcons.render(x[0])+'</span><small>'+T(x[2],x[3])+'</small></button>').join('')+'</nav>';
  function shell(title,html,tab='menu') {
    state.tab=tab;
    modal('Vertex · Views','<div class="vhv-shell"><header class="vhv-head"><button class="vhv-back vh-close" data-vh-action="close" aria-label="'+T('Закрыть','Close')+'">←</button><h2>'+E(title)+'</h2><button class="vhv-avatar" data-vh-action="profile" aria-label="'+T('Профиль','Profile')+'">F</button></header><main>'+html+'</main>'+nav(tab)+'</div>');
    const dialog=document.getElementById('modal'); dialog.classList.add('vh-modal','vh-video-modal'); dialog.scrollTop=0;
    const body=document.getElementById('modalBody');
    body.querySelectorAll('[data-vh-tab]').forEach(b=>b.onclick=()=>open(b.dataset.vhTab));
    body.querySelectorAll('[data-vh-action]').forEach(b=>b.onclick=()=>act(b.dataset.vhAction));
  }
  function today() {
    const d=snapshot(), bookings=d.bookings.filter(active), upcoming=bookings.filter(b=>b.departure > w.VertexRentalDomain.localDate(new Date())).sort((a,b)=>a.arrival.localeCompare(b.arrival));
    const planned=grouped(bookings);
    shell(T('Сегодня','Today'),
      '<section class="vhv-dashboard">'+
      '<button class="vhv-stat v earnings" data-vh-action="earnings"><span>'+T('Заработок','Earnings')+'</span>'+groupHtml(planned)+'<small>'+T('локальные заявки · без выплат','local requests · no payouts')+'</small></button>'+
      '<button class="vhv-stat analytics" data-vh-action="performance"><span>'+T('Аналитика','Analytics')+'</span><strong>'+d.bookings.length+'</strong><small>'+T('заявок в демо','demo requests')+'</small><i style="--p:'+Math.min(100,d.bookings.length*14)+'%"></i></button>'+
      '</section>'+
      '<button class="vhv-place" data-vh-action="new"><span>🏡</span><div><strong>'+T('Разместите объявление','Create a listing')+'</strong><small>'+T('Добавьте новый локальный демо-объект','Add a local demo property')+'</small></div><b>›</b></button>'+
      '<section class="vhv-section"><h3>'+T('Ближайшие заезды','Upcoming arrivals')+'</h3>'+
      (upcoming.length?upcoming.slice(0,3).map(b=>'<button class="vhv-booking" data-vh-action="reservations"><span class="vhv-date">'+E(b.arrival.slice(5))+'</span><div><strong>'+E(b.guest)+'</strong><small>'+E(b.title)+'</small><small>'+E(b.arrival)+' → '+E(b.departure)+'</small></div><b>›</b></button>').join(''):'<div class="vhv-empty"><strong>'+T('Новых заездов пока нет','No upcoming arrivals')+'</strong><p>'+T('После создания демо-заявки она появится здесь.','A demo request will appear here after it is created.')+'</p></div>')+'</section>'+
      '<section class="vhv-section vvh-clean">'+row('account','⚙','Настройки аккаунта','Account settings')+row('resources','▤','Материалы для хозяев','Host resources')+row('help','?','Помощь','Help')+'</section>'+
      '<p class="vhv-boundary">'+T('Демо: нет реальных выплат, авторизации и синхронизации с Airbnb/Booking.','Demo: no real payouts, authentication or Airbnb/Booking synchronization.')+'</p>', 'today');
  }
  function menu() {
    const d=snapshot(), totals=grouped(d.bookings.filter(active));
    shell(T('Меню','Menu'),
      '<section class="vhv-dashboard">'+
      '<button class="vhv-stat earnings" data-vh-action="earnings"><span>'+T('Заработок','Earnings')+'</span>'+groupHtml(totals)+'<small>'+T('заявки без списаний','requests without charges')+'</small></button>'+
      '<button class="vhv-stat analytics" data-vh-action="performance"><span>'+T('Аналитика','Analytics')+'</span><strong>'+d.metrics.confirmed+'</strong><small>'+T('подтверждено','confirmed')+'</small><i style="--p:'+Math.min(100,d.metrics.confirmed*20)+'%"></i></button>'+
      '</section>'+
      '<button class="vhv-place" data-vh-action="new"><span>🏡</span><div><strong>'+T('Разместите объявление','Create a listing')+'</strong><small>'+T('Сдайте жильё через Vertex','Host through Vertex')+'</small></div><b>›</b></button>'+
      '<section class="vhv-section vvh-clean">'+
      row('account','⚙','Настройки аккаунта','Account settings')+
      row('payments','▣','Платежи и выплаты','Payments & payouts')+
      row('resources','▤','Материалы для хозяев','Host resources')+
      row('help','?','Помощь','Help')+
      row('company','▦','Сведения о компании','Company information')+
      row('legal','§','Юридический отдел','Legal')+
      row('team','♙','Команда и задачи','Team & tasks')+
      '</section><p class="vhv-version">Vertex 1.13 · video-reference host experience</p>', 'menu');
  }
  function earnings() {
    const d=snapshot(), planned=grouped(d.bookings.filter(active)), confirmedTotals=grouped(d.bookings.filter(confirmed));
    shell(T('Заработок','Earnings'),
      '<div class="vhv-payout-head"><span>'+T('Запланировано по локальным заявкам','Planned from local requests')+'</span>'+groupHtml(planned)+'</div>'+
      '<button class="vhv-wide" data-vh-action="reservations">'+T('Все заявки','All requests')+'</button>'+
      '<section class="vhv-section"><h3>'+T('Подтверждено в демо','Confirmed in demo')+'</h3><div class="vhv-money-card">'+groupHtml(confirmedTotals)+'<small>'+T('Это не выплаченные средства. Реальный финансовый контур не подключён.','These are not paid funds. The production finance layer is not connected.')+'</small></div></section>'+
      '<section class="vhv-section"><h3>'+T('По объявлениям','By listing')+'</h3>'+d.properties.map(p=>{const own=d.bookings.filter(b=>b.listingId===p.id&&active(b));return '<div class="vhv-property-money"><span>'+E(p.ru||p.en)+'</span>'+groupHtml(grouped(own))+'</div>';}).join('')+'</section>', 'menu');
  }
  function performance() {
    const d=snapshot();
    const months={}; d.bookings.forEach(b=>{const k=String(b.arrival||'').slice(0,7); if(k)months[k]=(months[k]||0)+1;});
    const keys=Object.keys(months).sort().slice(-6); const max=Math.max(1,...keys.map(k=>months[k]));
    shell(T('Производительность','Performance'),
      '<section class="vhv-chart-card"><h3>'+T('Заявки по месяцам','Requests by month')+'</h3><div class="vhv-chart">'+(keys.length?keys.map(k=>'<div><i style="height:'+Math.max(8,Math.round(months[k]/max*100))+'%"></i><small>'+E(k.slice(5))+'</small><b>'+months[k]+'</b></div>').join(''):'<p>'+T('Пока нет данных','No data yet')+'</p>')+'</div></section>'+
      '<section class="vhv-metric-grid"><article><span>'+T('Всего заявок','Total requests')+'</span><strong>'+d.bookings.length+'</strong></article><article><span>'+T('Подтверждено','Confirmed')+'</span><strong>'+d.metrics.confirmed+'</strong></article><article><span>'+T('Ожидают','Pending')+'</span><strong>'+d.metrics.pending+'</strong></article><article><span>'+T('Объектов','Properties')+'</span><strong>'+d.properties.length+'</strong></article></section>'+
      '<p class="vhv-boundary">'+T('График строится только из локальных демо-записей этого устройства.','The chart uses only local demo records on this device.')+'</p>', 'menu');
  }
  function legal() {
    shell(T('Юридический отдел','Legal'),
      '<section class="vhv-section vvh-clean">'+
      row('terms','§','Условия предоставления услуг','Terms of service')+
      row('privacy','◌','Политика конфиденциальности','Privacy policy')+
      row('licenses','▤','Лицензии ПО с открытым исходным кодом','Open-source software licenses')+
      '</section><div class="vhv-empty"><strong>Vertex Group</strong><p>'+T('Юридические документы для production будут публиковаться после утверждения финальных текстов.','Production legal documents will be published after final legal approval.')+'</p></div>', 'menu');
  }
  function info(title,copy) { shell(title,'<div class="vhv-empty"><strong>'+E(title)+'</strong><p>'+E(copy)+'</p></div>','menu'); }
  function act(id) {
    if(id==='close'){document.getElementById('modal')?.close();return;}
    if(id==='profile')return w.VertexProfileMenu?.open('profile');
    if(id==='earnings')return earnings();
    if(id==='performance')return performance();
    if(id==='account')return w.VertexProfileMenu?.open('account');
    if(id==='payments')return w.VertexProfileMenu?.open('payments');
    if(id==='company')return w.VertexProfileMenu?.open('company');
    if(id==='resources')return w.VertexGuestGuide?.open();
    if(id==='help')return w.VertexGuestGuide?.open();
    if(id==='team')return w.VertexGroup?.requests();
    if(id==='new')return w.VertexRentals?.createListing();
    if(id==='reservations')return w.VertexRentals?.showHost();
    if(id==='legal')return legal();
    if(id==='terms')return info(T('Условия предоставления услуг','Terms of service'),T('Демо-раздел. Финальный юридический текст ещё не опубликован.','Demo section. Final legal text has not been published yet.'));
    if(id==='privacy')return w.VertexProfileMenu?.open('privacy');
    if(id==='licenses')return info(T('Лицензии ПО','Software licenses'),T('Компоненты проекта проверяются в репозитории; отдельный production-реестр лицензий будет сформирован перед выпуском.','Project components are tracked in the repository; a production license register will be finalized before release.'));
  }
  function open(id='today') {
    if(id==='today')return today();
    if(id==='menu')return menu();
    if(id==='earnings')return earnings();
    if(id==='performance'||id==='analytics')return performance();
    if(id==='legal')return legal();
    return legacy.open(id);
  }
  w.VertexHostConsole=Object.freeze({open, listing:legacy.listing});
})(window);
