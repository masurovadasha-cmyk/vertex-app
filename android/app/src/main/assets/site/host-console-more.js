/* Secondary host views. No fabricated earnings, guests, reviews or save actions. */
(function (w) {
  'use strict';
  const T = (ru, en) => document.documentElement.lang === 'en' ? en : ru;
  const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function open(id, context) {
    const {shell, row, state, properties} = context;
    const property = properties.find(item => item.id === state.id);
    const back = '<button class="vh-back" data-ha="menu" aria-label="' + T('Назад','Back') + '">←</button>';
    if (id === 'account') {
      const routes = [['personal','Личная информация','Personal information'],['security','Вход и безопасность','Login & security'],['privacy','Конфиденциальность','Privacy'],['notifications','Уведомления','Notifications'],['payments','Платежи и выплаты','Payments & payouts'],['translate','Язык','Language'],['access','Доступная среда','Accessibility'],['company','Сведения о компании','Company information'],['tax','Налоги','Taxes']];
      return shell(back + '<h2>' + T('Настройки аккаунта','Account settings') + '</h2>' + routes.map(item => row(item[0],'›',T(item[1],item[2]))).join(''), 'menu');
    }
    if (id === 'profile') return w.VertexProfileMenu.open('personal');
    if (id === 'photos') {
      const photos = [...new Set([...(property?.photos || []), property?.photo].filter(Boolean))];
      return shell('<button class="vh-back" data-ha="selected" aria-label="' + T('Назад','Back') + '">←</button><h2>' + T('Фототур','Photo tour') + '</h2><p class="notice">' + T('Просмотр фотографий каталога. Загрузка новых фотографий ещё не подключена.','View catalog photos. Uploading new photos is not connected yet.') + '</p><div class="vh-photos">' + photos.map((src,index) => '<figure><img src="' + E(src) + '" alt="' + E(property?.ru || '') + ' · ' + (index+1) + '"><figcaption>' + T('Фото ','Photo ') + (index+1) + '</figcaption></figure>').join('') + '</div>' + (!photos.length ? '<p>' + T('Фотографии ещё не добавлены.','No photos yet.') + '</p>' : ''), 'listings');
    }
    if (id === 'amenities') {
      const items = [['wifi','Wi-Fi','Wi-Fi'],['kitchen','Кухня','Kitchen'],['bathroom','Ванная','Bathroom'],['bedLinen','Постельное бельё','Bed linen']].filter(item => property?.[item[0]] === true);
      return shell('<button class="vh-back" data-ha="selected" aria-label="' + T('Назад','Back') + '">←</button><h2>' + T('Удобства','Amenities') + '</h2>' + (items.length ? items.map(item => '<p>' + T(item[1],item[2]) + '</p>').join('') : '<p class="notice">' + T('Удобства требуют подтверждения.','Amenities require confirmation.') + '</p>'), 'listings');
    }
    // Правила дома / House rules use the confirmed guest guide, not global fake toggles.
    if (['rules','help','resources'].includes(id)) return w.VertexGuestGuide?.open();
    if (id === 'team') return w.VertexGroup?.requests();
    if (['personal','security','privacy','notifications','payments','translate','access','company','tax'].includes(id)) return w.VertexProfileMenu?.open(id);
    // Редактор объявления / Listing editor is a use case in the rental module.
    if (id === 'edit') return w.VertexRentals.editListing(state.id);
    if (id === 'analytics') return w.VertexRentals.showOwnerReport(); // Аналитика / Analytics
    return shell(back + '<h2>Vertex · Views</h2><p class="notice">' + T('Эта функция ещё не подключена. Ничего не изменено и не сохранено.','This feature is not connected yet. Nothing was changed or saved.') + '</p>', 'menu');
  }
  w.VertexHostMore = Object.freeze({open});
})(window);
