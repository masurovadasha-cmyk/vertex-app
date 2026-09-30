/* Sand Luxury / presentation only. No permissions, network calls or stored guest data. */
(function (root) {
  'use strict';
  const paths = {
    vision: '<path d="M4 5h5l7 17L8 10m0 0 8 12L28 4h-5L16 16"/>',
    views: '<path d="M5 26V12l6-4v18m0 0V6l6-3v23m0 0V11l6-4v19M2 29h27"/>',
    managing: '<rect x="5" y="6" width="21" height="23" rx="3"/><path d="M11 6V3h9v3M10 14l2 2 4-4m3 2h3M10 22l2 2 4-4m3 2h3"/>',
    'real-estate': '<path d="m3 15 13-11 13 11M7 13v16h18V13M13 29V19h6v10"/>',
    engineers: '<path d="M3 24h26M6 24v-5a10 10 0 0 1 20 0v5M13 20V7h6v13M9 28h14"/>',
    technologies: '<rect x="8" y="8" width="16" height="16" rx="3"/><rect x="12" y="12" width="8" height="8" rx="1"/><path d="M12 3v5m8-5v5m-8 16v5m8-5v5M3 12h5m-5 8h5m16-8h5m-5 8h5"/>',
    investment: '<path d="M4 28h25M7 25v-7h4v7m4 0V13h4v12m4 0V7h4v18M5 12l9-6 5 2 8-6"/>',
    ventures: '<path d="M7 25c-1-14 8-19 21-20-1 13-8 22-21 20Zm0 0L22 11M7 25l-3 4"/>',
    travel: '<circle cx="16" cy="16" r="12"/><path d="m21 10-3 9-9 3 3-9 9-3Z"/>',
    aviation: '<path d="m3 18 12-5 5-10 3 1-3 11 9 6-1 3-11-4-6 6-3-1 3-8-7 4-1-3Z"/>',
    'rent-car': '<path d="m6 14 3-8h14l3 8M4 23V14h24v9H4Zm2 0v4m20-4v4M8 18h4m8 0h4"/>',
    taxi: '<path d="m6 14 3-7h14l3 7M4 23V14h24v9H4Zm3 0v4m18-4v4M12 7V3h8v4M8 18h4m8 0h4"/>',
    concierge: '<path d="M4 24h24M6 21a10 10 0 0 1 20 0H6ZM16 11V7m-3 0h6M8 28h16"/>',
    cleaning: '<path d="m16 3 3 9 9 4-9 3-3 10-3-10-10-3 10-4 3-9Zm-11 0v6m-3-3h6m19 18v6m-3-3h6"/>',
    laundry: '<rect x="6" y="3" width="20" height="26" rx="3"/><circle cx="16" cy="19" r="6"/><path d="M6 10h20M10 7h1m4 0h6M11 19c4 3 5-3 10 0"/>',
    ditalia: '<path d="M8 3v10m-4-10v7a4 4 0 0 0 8 0V3M8 14v15M23 3c-6 6-6 13 0 13V3Zm0 13v13"/>',
    market: '<path d="M7 11h18l2 18H5l2-18ZM11 12V8a5 5 0 0 1 10 0v4"/>',
    bar: '<path d="M4 5h24L16 18 4 5Zm12 13v10m-7 1h14M9 10h14"/>',
    'aura-design': '<path d="M5 29V15a11 11 0 0 1 22 0v14M10 29V15a6 6 0 0 1 12 0v14M15 29V15a1 1 0 0 1 2 0v14"/>',
    training: '<path d="m2 11 14-7 14 7-14 7-14-7Zm6 3v9c5 4 11 4 16 0v-9M29 12v12"/>',
    home: '<path d="m3 15 13-11 13 11M7 13v16h18V13M13 29V19h6v10"/>',
    search: '<circle cx="14" cy="14" r="9"/><path d="m21 21 8 8"/>',
    grid: '<rect x="4" y="4" width="9" height="9" rx="2"/><rect x="19" y="4" width="9" height="9" rx="2"/><rect x="4" y="19" width="9" height="9" rx="2"/><rect x="19" y="19" width="9" height="9" rx="2"/>',
    arrow: '<path d="M5 16h22M19 8l8 8-8 8"/>',
    calendar: '<rect x="4" y="6" width="24" height="23" rx="3"/><path d="M10 3v6m12-6v6M4 13h24M10 19h3m6 0h3m-12 5h3"/>',
    bookings: '<rect x="7" y="5" width="18" height="24" rx="2"/><path d="M12 5V2h8v3M11 12h10m-10 5h10m-10 5h6"/>',
    info: '<circle cx="16" cy="16" r="12"/><path d="M16 14v10m0-17v2"/>',
    lock: '<rect x="7" y="13" width="18" height="16" rx="3"/><path d="M11 13V8a5 5 0 0 1 10 0v5m-5 6v4"/>'
  };
  const definitions = {
    views: ['champagne', ['Проживание', 'Заезды', 'Качество'], ['Stays', 'Arrivals', 'Quality']],
    managing: ['olive', ['Объекты', 'Задачи', 'Контроль'], ['Properties', 'Tasks', 'Oversight']],
    'real-estate': ['stone', ['Подбор', 'Показы', 'Сделки'], ['Listings', 'Viewings', 'Deals']],
    engineers: ['copper', ['Диагностика', 'Работы', 'Приёмка'], ['Inspection', 'Work', 'Acceptance']],
    'aura-design': ['rose', ['Бриф', 'Концепция', 'Проект'], ['Brief', 'Concept', 'Project']],
    travel: ['teal', ['Маршрут', 'Программа', 'Поездка'], ['Route', 'Itinerary', 'Journey']],
    aviation: ['sky', ['Поиск', 'Условия', 'Билеты'], ['Search', 'Fare rules', 'Tickets']],
    'rent-car': ['steel', ['Автомобиль', 'Период', 'Выдача'], ['Vehicle', 'Dates', 'Handover']],
    taxi: ['amber', ['Маршрут', 'Автомобиль', 'Поездка'], ['Route', 'Vehicle', 'Ride']],
    concierge: ['champagne', ['Запрос', 'Помощь', 'Результат'], ['Request', 'Assistance', 'Resolution']],
    cleaning: ['sage', ['Задание', 'Уборка', 'Проверка'], ['Assignment', 'Cleaning', 'Review']],
    laundry: ['sky', ['Приём', 'Обработка', 'Возврат'], ['Collection', 'Care', 'Return']],
    ditalia: ['terracotta', ['Меню', 'Столик', 'Сервис'], ['Menu', 'Table', 'Service']],
    market: ['olive', ['Товары', 'Корзина', 'Получение'], ['Products', 'Basket', 'Collection']],
    bar: ['plum', ['Меню', 'Лаунж', 'Заказ'], ['Menu', 'Lounge', 'Order']],
    technologies: ['steel', ['Продукты', 'Системы', 'Разработка'], ['Products', 'Systems', 'Engineering']],
    investment: ['bronze', ['Проекты', 'Анализ', 'Отчёты'], ['Projects', 'Analysis', 'Reports']],
    ventures: ['sage', ['Идеи', 'Проверка', 'Развитие'], ['Ideas', 'Validation', 'Growth']],
    training: ['rose', ['Программы', 'Обучение', 'Практика'], ['Programs', 'Learning', 'Practice']]
  };
  const modules = Object.freeze(Object.fromEntries(Object.entries(definitions).map(([id, [theme, ru, en]]) =>
    [id, Object.freeze({theme, ru: Object.freeze(ru), en: Object.freeze(en)})])));
  function icon(name) {
    const content = Object.hasOwn(paths, name) ? paths[name] : paths.grid;
    return '<svg class="vs-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + content + '</svg>';
  }
  root.VertexVisionDesign = Object.freeze({id: 'sand-luxury', version: '1.0.0', modules, icon});
  document.documentElement.dataset.visionDesign = 'sand-luxury';
})(window);
