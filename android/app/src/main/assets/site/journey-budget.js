/* Vertex journey budget. Amounts are user-entered; this module never books or pays. */
(() => {
  'use strict';
  const KEY = 'vertex-budget-v1';
  const CURRENCIES = ['UZS', 'USD'];
  const CATEGORIES = ['stay', 'transport', 'food', 'activities', 'care', 'other'];
  const MAX_AMOUNT = 1000000000;
  const MAX_EXPENSES = 500;
  const emptyState = () => ({version: 1, budgets: {UZS: null, USD: null}, expenses: []});
  const clone = value => JSON.parse(JSON.stringify(value));
  const toMinor = value => Math.round(value * 100);
  function amount(value, allowZero = false) {
    if (typeof value !== 'number' && typeof value !== 'string') throw Error('amount');
    const text = String(value).trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw Error('amount');
    const result = Number(text);
    if (!Number.isFinite(result) || result > MAX_AMOUNT || result < 0 || (!allowZero && result === 0)) throw Error('amount');
    return toMinor(result) / 100;
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2100-12-31') return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function validateExpense(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('expense');
    if (typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.id)) throw Error('id');
    if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 100) throw Error('title');
    if (!CURRENCIES.includes(value.currency)) throw Error('currency');
    if (!CATEGORIES.includes(value.category)) throw Error('category');
    if (!['planned', 'actual'].includes(value.type)) throw Error('type');
    if (!validDate(value.date)) throw Error('date');
    return {id: value.id, title: value.title.trim(), amount: amount(value.amount), currency: value.currency, category: value.category, type: value.type, date: value.date};
  }
  function validateState(value) {
    if (!value || typeof value !== 'object' || value.version !== 1 || !value.budgets || !Array.isArray(value.expenses) || value.expenses.length > MAX_EXPENSES) throw Error('state');
    const state = emptyState();
    for (const currency of CURRENCIES) state.budgets[currency] = value.budgets[currency] === null ? null : amount(value.budgets[currency], true);
    const ids = new Set();
    state.expenses = value.expenses.map(value => {
      const expense = validateExpense(value);
      if (ids.has(expense.id)) throw Error('duplicate');
      ids.add(expense.id);
      return expense;
    });
    return state;
  }
  function decodeState(raw) {
    if (raw === null || raw === undefined) return {state: emptyState(), issue: null};
    try { return {state: validateState(JSON.parse(raw)), issue: null}; }
    catch { return {state: emptyState(), issue: 'invalid'}; }
  }
  function calculate(state) {
    state = validateState(state);
    const currencies = {};
    for (const currency of CURRENCIES) {
      const rows = state.expenses.filter(row => row.currency === currency);
      const actualMinor = rows.filter(row => row.type === 'actual').reduce((total, row) => total + toMinor(row.amount), 0);
      const plannedMinor = rows.filter(row => row.type === 'planned').reduce((total, row) => total + toMinor(row.amount), 0);
      const limit = state.budgets[currency];
      currencies[currency] = {limit, actual: actualMinor / 100, planned: plannedMinor / 100,
        remaining: limit === null ? null : (toMinor(limit) - actualMinor) / 100,
        afterPlanned: limit === null ? null : (toMinor(limit) - actualMinor - plannedMinor) / 100,
        count: rows.length, categories: Object.fromEntries(CATEGORIES.map(category => [category, rows.filter(row => row.type === 'actual' && row.category === category).reduce((total, row) => total + toMinor(row.amount), 0) / 100]))};
    }
    return {currencies, count: state.expenses.length};
  }
  function upsertExpense(state, expense) {
    const next = validateState(state);
    const row = validateExpense(expense);
    const index = next.expenses.findIndex(item => item.id === row.id);
    if (index >= 0) next.expenses[index] = row;
    else {
      if (next.expenses.length >= MAX_EXPENSES) throw Error('limit');
      next.expenses.push(row);
    }
    return next;
  }
  function removeExpense(state, id) {
    const next = validateState(state);
    next.expenses = next.expenses.filter(row => row.id !== id);
    return next;
  }
  function setBudget(state, currency, value) {
    if (!CURRENCIES.includes(currency)) throw Error('currency');
    const next = validateState(state);
    next.budgets[currency] = value === null ? null : amount(value, true);
    return next;
  }
  function compareOffers(input) {
    if (!input || !CURRENCIES.includes(input.currency)) throw Error('currency');
    if (!validDate(input.start) || !validDate(input.end) || input.end <= input.start) throw Error('dates');
    if (!Number.isInteger(Number(input.guests)) || Number(input.guests) < 1 || Number(input.guests) > 99) throw Error('guests');
    if (input.sameConditions !== true) throw Error('conditions');
    const offer = data => {
      if (!data) throw Error('offer');
      return (toMinor(amount(data.base, true)) + toMinor(amount(data.fees, true)) + toMinor(amount(data.extras, true))) / 100;
    };
    const a = offer(input.a), b = offer(input.b);
    return {a, b, difference: Math.abs(toMinor(a) - toMinor(b)) / 100, lower: a === b ? null : a < b ? 'a' : 'b', currency: input.currency, start: input.start, end: input.end, guests: Number(input.guests)};
  }
  function budgetScope(value) {
    const valid = value && typeof value === 'object' && ['Tashkent', 'Samarkand', 'Bukhara', 'Khiva'].includes(value.city)
      && validDate(value.start) && validDate(value.end) && value.end > value.start
      && (Date.parse(value.end) - Date.parse(value.start)) / 86400000 <= 365
      && Number.isInteger(value.guests) && value.guests >= 1 && value.guests <= 20;
    if (!valid) return {key: KEY, context: null};
    const context = {city: value.city, start: value.start, end: value.end, guests: value.guests};
    return {key: KEY + '::trip:' + encodeURIComponent([context.city, context.start, context.end, context.guests].join('|')), context};
  }
  function createStore(storage, key = KEY) {
    let state = emptyState(), issue = null;
    try { const loaded = decodeState(storage.getItem(key)); state = loaded.state; issue = loaded.issue; }
    catch { issue = 'unavailable'; }
    return {
      get: () => clone(state), status: () => issue,
      write(next) {
        state = validateState(next);
        try { storage.setItem(key, JSON.stringify(state)); issue = null; }
        catch { issue = 'unavailable'; }
        return clone(state);
      }
    };
  }
  function createScopedStores(storage) {
    // Cache by validated identity so unavailable storage still preserves each trip in this session.
    const stores = new Map();
    return {
      forContext(value) {
        const scope = budgetScope(value);
        if (!stores.has(scope.key)) stores.set(scope.key, createStore(storage, scope.key));
        return {scope, store: stores.get(scope.key)};
      }
    };
  }
  const domain = {KEY, CURRENCIES, CATEGORIES, MAX_AMOUNT, MAX_EXPENSES, emptyState, amount, validDate, validateExpense, validateState, decodeState, calculate, upsertExpense, removeExpense, setBudget, compareOffers, budgetScope, createStore, createScopedStores};
  if (typeof module !== 'undefined' && module.exports) module.exports = domain;
  if (typeof document === 'undefined') return;

  const tx = (ru, en) => (typeof lang !== 'undefined' ? lang : document.documentElement.lang) === 'en' ? en : ru;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
  const byId = id => document.getElementById(id);
  const fmt = (value, currency) => new Intl.NumberFormat(tx('ru-RU', 'en-US'), {style: 'currency', currency, maximumFractionDigits: 2}).format(value);
  const today = () => {const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;};
  const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'expense-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
  const categoryLabel = category => ({stay: tx('Жильё', 'Stays'), transport: tx('Транспорт', 'Transport'), food: tx('Еда', 'Food'), activities: tx('Впечатления', 'Experiences'), care: tx('Сервис', 'Services'), other: tx('Другое', 'Other')})[category];
  const typeLabel = type => type === 'actual' ? tx('Потрачено', 'Spent') : tx('В планах', 'Planned');
  let storage;
  try { storage = localStorage; } catch { storage = null; }
  const scopedStores = createScopedStores(storage);
  let {store, scope: activeScope} = scopedStores.forContext(null);
  let generalView = false;
  let currency = 'UZS', tab = 'expenses', filter = 'all', editing = null, notice = '', undo = null;
  let compareDraft = null, compareResult = null, budgetEditor = false;
  const journeyContext = () => {try {return window.VertexJourney?.context?.() || null;} catch {return null;}};
  function describeStore(selected) {
    return {...calculate(selected.store.get()), storageAvailable: selected.store.status() === null,
      scope: selected.scope.context ? 'journey' : 'device', context: selected.scope.context};
  }
  // A summary always refers to the active journey, even while the separate legacy ledger is open.
  const summary = () => describeStore(scopedStores.forContext(journeyContext()));
  function activateStore() {
    const selected = scopedStores.forContext(generalView ? null : journeyContext());
    if (activeScope.key !== selected.scope.key) {
      editing = null; undo = null; notice = ''; budgetEditor = false; filter = 'all'; compareDraft = null; compareResult = null;
    }
    store = selected.store; activeScope = selected.scope;
  }
  function persist(next) {
    store.write(next);
    window.dispatchEvent(new CustomEvent('vertex:budget-change', {detail: describeStore({store, scope: activeScope})}));
  }
  function storageNote() {
    if (store.status() === 'unavailable') return tx('Память браузера недоступна: изменения сохраняются только до закрытия страницы.', 'Browser storage is unavailable: changes last only until this page closes.');
    if (store.status() === 'invalid') return tx('Сохранённые данные повреждены или имеют другую версию. Показан пустой бюджет; новая запись заменит старые данные.', 'Saved data is damaged or uses another version. An empty budget is shown; a new entry will replace the old data.');
    return tx('Только на этом устройстве · ваши суммы · без списаний. Не вводите данные карты.', 'This device only · your entered amounts · no charges. Do not enter card details.');
  }
  function option(value, label, selected) { return `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`; }
  function open() { generalView = false; tab = 'expenses'; editing = null; notice = ''; budgetEditor = false; undo = null; render(); }
  function contextHeader() {
    const context = activeScope.context;
    const legacy = scopedStores.forContext(null).store.get();
    const hasLegacy = legacy.expenses.length > 0 || CURRENCIES.some(code => legacy.budgets[code] !== null);
    const currentTrip = budgetScope(journeyContext()).context;
    if (!context) return `<div class="vb-trip-context"><div><b>${tx('Общий бюджет на устройстве', 'General budget on this device')}</b><span>${tx('Эти записи не привязаны к поездке и не входят в её бюджет.', 'These entries are not assigned to a journey and are excluded from its budget.')}</span></div>${generalView && currentTrip ? `<button type="button" id="vbCurrentTrip" class="vb-soft">${tx('К бюджету поездки', 'Back to trip budget')} →</button>` : ''}</div>`;
    const city = window.VertexCatalog?.cities?.find(item => item.id === context.city);
    const cityLabel = city ? tx(city.ru, city.en) : context.city;
    return `<div class="vb-trip-context"><div><b>${esc(cityLabel)}</b><span>${context.start} → ${context.end} · ${context.guests} ${tx('гостей', 'guests')}</span><small>${tx('Отдельный бюджет для этого города, дат и числа гостей.', 'A separate budget for this city, these dates and this party size.')}</small></div></div>${hasLegacy ? `<div class="vb-legacy"><span>${tx('Прежние общие записи сохранены отдельно; в эту поездку они не перенесены.', 'Your earlier general entries remain separate; they were not copied into this trip.')}</span><button type="button" id="vbGeneralBudget">${tx('Общий бюджет', 'General budget')} →</button></div>` : ''}`;
  }
  function render() {
    activateStore();
    const state = store.get(), selected = calculate(state).currencies[currency];
    const progress = selected.limit === null ? 0 : selected.limit === 0 ? (selected.actual > 0 ? 100 : 0) : Math.min(100, selected.actual / selected.limit * 100);
    const exceeded = selected.remaining !== null && selected.remaining < 0;
    const html = `<div class="vb-root">
      <div class="vb-lead"><span class="vb-kicker">${tx('СПОКОЙСТВИЕ В ЦИФРАХ', 'PEACE OF MIND, IN NUMBERS')}</span><h3>${tx('Путешествуйте в своём бюджете', 'Travel within your budget')}</h3><p>${tx('Планируйте заранее. Видьте реальные расходы. Решайте осознанно.', 'Plan ahead. See your actual spending. Make informed choices.')}</p></div>
      ${contextHeader()}
      <div class="vb-toolbar"><div class="vb-segment" role="group" aria-label="${tx('Валюта бюджета', 'Budget currency')}">${CURRENCIES.map(value => `<button type="button" data-vb-currency="${value}" aria-pressed="${currency === value}">${value}</button>`).join('')}</div><span class="vb-muted">${tx('Валюты считаются отдельно', 'Currencies are tracked separately')}</span></div>
      <section class="vb-summary" aria-label="${tx('Сводка бюджета', 'Budget summary')}"><div class="vb-summary-top"><div><span>${exceeded ? tx('Перерасход', 'Over budget') : tx('Осталось после трат', 'Left after spending')}</span><strong class="${exceeded ? 'vb-negative' : ''}">${selected.remaining === null ? tx('Лимит не задан', 'No limit set') : fmt(Math.abs(selected.remaining), currency)}</strong></div><button type="button" class="vb-light" id="vbSetLimit">${tx('Задать лимит', 'Set a limit')} ↗</button></div><div class="vb-progress" role="meter" aria-label="${tx('Использовано от лимита', 'Budget used')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><i style="width:${progress}%" class="${exceeded ? 'vb-over' : ''}"></i></div><div class="vb-metrics"><div><span>${tx('Лимит', 'Limit')}</span><b>${selected.limit === null ? '—' : fmt(selected.limit, currency)}</b></div><div><span>${tx('Потрачено', 'Spent')}</span><b>${fmt(selected.actual, currency)}</b></div><div><span>${tx('Ещё в планах', 'Still planned')}</span><b>${fmt(selected.planned, currency)}</b></div></div><p>${selected.afterPlanned === null ? tx('Установите лимит, чтобы видеть остаток.', 'Set a limit to see how much is left.') : tx('С учётом будущих планов: ', 'After future plans: ') + `<b>${fmt(selected.afterPlanned, currency)}</b>`}</p></section>
      ${budgetEditor ? limitForm(state) : ''}
      <div class="vb-tabs" role="group" aria-label="${tx('Инструменты бюджета', 'Budget tools')}"><button type="button" data-vb-tab="expenses" aria-pressed="${tab === 'expenses'}">${tx('Мои расходы', 'My expenses')}</button><button type="button" data-vb-tab="compare" aria-pressed="${tab === 'compare'}">${tx('Сравнить предложения', 'Compare offers')}</button></div>
      <div id="vbNotice" class="vb-notice" role="status" aria-live="polite"${!notice ? ' hidden' : ''}>${esc(notice)} ${undo ? `<button type="button" id="vbUndo">${tx('Вернуть', 'Undo')}</button>` : ''}</div>
      ${tab === 'expenses' ? expenseSection(state) : comparisonSection()}
      <p class="vb-storage ${store.status() ? 'vb-storage-warning' : ''}" role="status">${storageNote()}</p>
    </div>`;
    modal(activeScope.context ? tx('Бюджет поездки', 'Trip budget') : tx('Общий бюджет', 'General budget'), html);
    byId('modal').classList.add('vb-dialog');
    bind();
  }
  function limitForm(state) {
    return `<form id="vbLimitForm" class="vb-form vb-limit"><label>${activeScope.context ? tx('Лимит поездки', 'Trip limit') : tx('Общий лимит', 'General limit')} · ${currency}<input id="vbLimit" name="limit" type="text" inputmode="decimal" autocomplete="off" maxlength="20" placeholder="${tx('Например, 3000000', 'For example, 3000000')}" value="${state.budgets[currency] ?? ''}"><small>${tx('Пустое поле убирает лимит. До 1 000 000 000; максимум 2 знака после запятой.', 'Leave empty to remove the limit. Up to 1,000,000,000; at most 2 decimals.')}</small></label><div class="vb-actions"><button class="vb-primary" type="submit">${tx('Сохранить', 'Save')}</button><button type="button" id="vbCancelLimit">${tx('Отмена', 'Cancel')}</button></div><p class="vb-error" id="vbLimitError" role="alert"></p></form>`;
  }
  function expenseSection(state) {
    const rows = state.expenses.filter(row => row.currency === currency && (filter === 'all' || row.type === filter)).sort((a, b) => b.date.localeCompare(a.date));
    return `<section class="vb-expenses"><div class="vb-section-head"><div><h4>${tx('Деньги под контролем', 'Know where your money goes')}</h4><p>${tx('Планы и факт не смешиваются.', 'Plans and actual spending stay separate.')}</p></div><button type="button" id="vbAdd" class="vb-primary">+ ${tx('Расход', 'Expense')}</button></div>
      ${editing ? expenseForm(editing) : ''}
      <label class="vb-filter">${tx('Показать', 'Show')}<select id="vbFilter">${option('all', tx('Все записи', 'All entries'), filter)}${option('actual', tx('Потрачено', 'Spent'), filter)}${option('planned', tx('В планах', 'Planned'), filter)}</select></label>
      ${rows.length ? `<div class="vb-list">${rows.map(row => `<article class="vb-row"><span class="vb-category-icon" aria-hidden="true">${({stay: '⌂', transport: '↗', food: '◉', activities: '✧', care: '◇', other: '⋯'})[row.category]}</span><div class="vb-row-main"><strong>${esc(row.title)}</strong><span>${categoryLabel(row.category)} · <time datetime="${row.date}">${new Intl.DateTimeFormat(tx('ru-RU', 'en-US'), {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}).format(new Date(row.date + 'T00:00:00Z'))}</time></span><em class="vb-pill ${row.type === 'planned' ? 'vb-planned' : ''}">${typeLabel(row.type)}</em></div><div class="vb-row-end"><b>${fmt(row.amount, row.currency)}</b><div><button type="button" data-vb-edit="${row.id}" aria-label="${tx('Изменить', 'Edit')}: ${esc(row.title)}">${tx('Изменить', 'Edit')}</button><button type="button" data-vb-delete="${row.id}" aria-label="${tx('Удалить', 'Delete')}: ${esc(row.title)}">×</button></div></div></article>`).join('')}</div>` : `<div class="vb-empty"><span aria-hidden="true">↗</span><h4>${tx('Начните с одного расхода', 'Start with one expense')}</h4><p>${tx('Запишите известную сумму или будущий план. Заявки и неподтверждённые цены сюда не попадают.', 'Add a known amount or a future plan. Requests and unconfirmed prices are not added here.')}</p><button type="button" id="vbEmptyAdd" class="vb-soft">${tx('Добавить запись', 'Add an entry')}</button></div>`}
      <p class="vb-help">${tx('Оплатили запланированное? Откройте «Изменить» и выберите «Потрачено», чтобы не считать одну сумму дважды. Записи не подтверждают оплату.', 'Paid for a planned item? Choose Edit, then Spent, to avoid counting it twice. Entries are not proof of payment.')}</p></section>`;
  }
  function expenseForm(row) {
    return `<form id="vbExpenseForm" class="vb-form"><h4>${row.isNew ? tx('Новая запись', 'New entry') : tx('Изменить запись', 'Edit entry')}</h4><div class="vb-form-grid"><label class="vb-full">${tx('Название', 'Title')}<input name="title" required maxlength="100" value="${esc(row.title)}" placeholder="${tx('Например, трансфер из аэропорта', 'For example, airport transfer')}"></label><label>${tx('Сумма', 'Amount')}<input name="amount" required type="text" inputmode="decimal" autocomplete="off" maxlength="20" value="${row.amount ?? ''}" placeholder="0.00"><small>${tx('До 1 млрд · максимум 2 знака после запятой', 'Up to 1 billion · at most 2 decimals')}</small></label><label>${tx('Валюта', 'Currency')}<select name="currency">${CURRENCIES.map(value => option(value, value, row.currency)).join('')}</select></label><label>${tx('Категория', 'Category')}<select name="category">${CATEGORIES.map(value => option(value, categoryLabel(value), row.category)).join('')}</select></label><label>${tx('Тип записи', 'Entry type')}<select name="type">${['planned', 'actual'].map(value => option(value, typeLabel(value), row.type)).join('')}</select></label><label class="vb-full">${tx('Дата расхода', 'Expense date')}<input name="date" type="date" required min="1900-01-01" max="2100-12-31" value="${row.date}"></label></div><div class="vb-actions"><button class="vb-primary" type="submit">${tx('Сохранить запись', 'Save entry')}</button><button type="button" id="vbCancelExpense">${tx('Отмена', 'Cancel')}</button></div><p class="vb-error" id="vbExpenseError" role="alert"></p></form>`;
  }
  function comparisonSection() {
    const draft = compareDraft || {currency, start: activeScope.context?.start || '', end: activeScope.context?.end || '', guests: String(activeScope.context?.guests || 1), sameConditions: false, aBase: '', aFees: '', aExtras: '', bBase: '', bFees: '', bExtras: ''};
    const field = (name, label, type = 'text') => `<label>${label}<input name="${name}" type="${type}" ${type === 'text' ? 'inputmode="decimal" autocomplete="off" maxlength="20"' : 'min="1900-01-01" max="2100-12-31"'} required value="${esc(draft[name])}"></label>`;
    return `<section class="vb-compare"><h4>${tx('Сравните полную стоимость', 'Compare the full cost')}</h4><p class="vb-help">${tx('Введите два предложения самостоятельно: за весь период и всех гостей, с налогами и обязательными сборами. Цены здесь не проверяются.', 'Enter two offers yourself: for the entire period and all guests, including taxes and mandatory fees. Prices here are not verified.')}</p><form id="vbCompareForm"><div class="vb-form-grid vb-context">${field('start', tx('Заезд / начало', 'Check-in / start'), 'date')}${field('end', tx('Выезд / конец', 'Check-out / end'), 'date')}<label>${tx('Гостей', 'Guests')}<input name="guests" type="number" required min="1" max="99" step="1" value="${esc(draft.guests)}"></label><label>${tx('Единая валюта', 'Same currency')}<select name="currency">${CURRENCIES.map(value => option(value, value, draft.currency)).join('')}</select></label></div><div class="vb-offers">${['a', 'b'].map((prefix, index) => `<fieldset><legend>${tx('Предложение', 'Offer')} ${index + 1}</legend>${field(prefix + 'Base', tx('Базовая цена за всё', 'Full base price'))}${field(prefix + 'Fees', tx('Налоги и сборы', 'Taxes and fees'))}${field(prefix + 'Extras', tx('Обязательные доплаты', 'Mandatory extras'))}</fieldset>`).join('')}</div><p class="vb-help">${tx('Если сборов или доплат нет, укажите 0. Возвратный депозит сюда не включайте; условия депозита сравните отдельно.', 'Enter 0 when there are no fees or extras. Exclude refundable deposits; compare deposit terms separately.')}</p><label class="vb-check"><input type="checkbox" name="sameConditions" required${draft.sameConditions ? ' checked' : ''}><span>${tx('Одинаковые даты, гости, состав услуг и условия отмены. Все обязательные платежи учтены.', 'Same dates, guests, included services and cancellation terms. All mandatory charges are included.')}</span></label><button type="submit" class="vb-primary vb-wide">${tx('Рассчитать разницу', 'Calculate the difference')}</button><p class="vb-error" id="vbCompareError" role="alert"></p></form><div id="vbComparisonResult" role="status" aria-live="polite">${compareResult ? resultHtml(compareResult) : ''}</div><p class="vb-help">${tx('Это разница введённых сумм, а не подтверждённая экономия. Итоговую цену и условия подтверждает поставщик. Расчёт не добавляется в расходы.', 'This is the difference between entered amounts, not verified savings. The provider confirms the final price and terms. This calculation is not added to your expenses.')}</p></section>`;
  }
  function resultHtml(result) {
    return `<div class="vb-result"><span>${tx('ПО ВВЕДЁННЫМ ДАННЫМ', 'BASED ON YOUR INPUT')}</span><h4>${result.lower === null ? tx('Полная стоимость одинакова', 'The full costs are equal') : tx('Предложение ', 'Offer ') + (result.lower === 'a' ? '1' : '2') + tx(' дешевле на ', ' is lower by ') + fmt(result.difference, result.currency)}</h4><div><p>${tx('Предложение 1', 'Offer 1')}<b>${fmt(result.a, result.currency)}</b></p><p>${tx('Предложение 2', 'Offer 2')}<b>${fmt(result.b, result.currency)}</b></p></div><small>${result.start} → ${result.end} · ${tx('Гостей: ', 'Guests: ')}${result.guests}</small></div>`;
  }
  function beginExpense(row) {
    editing = row ? {...row, isNew: false} : {id: uid(), title: '', amount: '', category: 'other', currency, type: 'planned', date: today(), isNew: true};
    notice = ''; undo = null; render(); byId('vbExpenseForm').elements.title.focus();
  }
  function readComparison(form) {
    const data = Object.fromEntries(new FormData(form));
    return {...data, sameConditions: form.elements.sameConditions.checked};
  }
  function bind() {
    const root = document.querySelector('.vb-root');
    if (byId('vbGeneralBudget')) byId('vbGeneralBudget').onclick = () => {generalView = true; tab = 'expenses'; render();};
    if (byId('vbCurrentTrip')) byId('vbCurrentTrip').onclick = () => {generalView = false; tab = 'expenses'; render();};
    root.querySelectorAll('[data-vb-currency]').forEach(button => button.onclick = () => {currency = button.dataset.vbCurrency; editing = null; budgetEditor = false; notice = ''; undo = null; render();});
    root.querySelectorAll('[data-vb-tab]').forEach(button => button.onclick = () => {if (byId('vbCompareForm')) compareDraft = readComparison(byId('vbCompareForm')); tab = button.dataset.vbTab; editing = null; notice = ''; undo = null; render();});
    byId('vbSetLimit').onclick = () => {budgetEditor = !budgetEditor; render(); if (budgetEditor) byId('vbLimit').focus();};
    if (byId('vbCancelLimit')) byId('vbCancelLimit').onclick = () => {budgetEditor = false; render();};
    if (byId('vbLimitForm')) byId('vbLimitForm').onsubmit = event => {
      event.preventDefault();
      try {persist(setBudget(store.get(), currency, byId('vbLimit').value.trim() === '' ? null : byId('vbLimit').value)); budgetEditor = false; notice = tx('Лимит обновлён.', 'Limit updated.'); render();}
      catch {byId('vbLimitError').textContent = tx('Введите число от 0 до 1 000 000 000, максимум с 2 знаками после запятой.', 'Enter a number from 0 to 1,000,000,000 with at most 2 decimal places.');}
    };
    if (byId('vbFilter')) byId('vbFilter').onchange = event => {filter = event.target.value; editing = null; render();};
    if (byId('vbAdd')) byId('vbAdd').onclick = () => beginExpense();
    if (byId('vbEmptyAdd')) byId('vbEmptyAdd').onclick = () => beginExpense();
    if (byId('vbCancelExpense')) byId('vbCancelExpense').onclick = () => {editing = null; render();};
    root.querySelectorAll('[data-vb-edit]').forEach(button => button.onclick = () => beginExpense(store.get().expenses.find(row => row.id === button.dataset.vbEdit)));
    root.querySelectorAll('[data-vb-delete]').forEach(button => button.onclick = () => {
      const state = store.get(); undo = state.expenses.find(row => row.id === button.dataset.vbDelete);
      persist(removeExpense(state, button.dataset.vbDelete)); editing = null; notice = tx('Запись удалена.', 'Entry removed.'); render();
    });
    if (byId('vbUndo')) byId('vbUndo').onclick = () => {if (!undo) return; persist(upsertExpense(store.get(), undo)); undo = null; notice = tx('Запись восстановлена.', 'Entry restored.'); render();};
    if (byId('vbExpenseForm')) byId('vbExpenseForm').onsubmit = event => {
      event.preventDefault();
      try {
        const data = {...Object.fromEntries(new FormData(event.target)), id: editing.id};
        persist(upsertExpense(store.get(), data)); currency = data.currency; filter = 'all'; editing = null; undo = null; notice = tx('Запись сохранена.', 'Entry saved.'); render();
      } catch (error) {byId('vbExpenseError').textContent = error.message === 'limit' ? tx('Достигнут лимит: 500 записей. Удалите лишние.', 'The 500-entry limit has been reached. Remove unneeded entries.') : tx('Проверьте название, дату и положительную сумму до 1 млрд (максимум 2 знака после запятой).', 'Check the title, date and positive amount up to 1 billion (at most 2 decimals).');}
    };
    if (byId('vbCompareForm')) {
      byId('vbCompareForm').oninput = event => {compareDraft = readComparison(event.currentTarget); compareResult = null; byId('vbComparisonResult').innerHTML = '';};
      byId('vbCompareForm').onsubmit = event => {
        event.preventDefault(); compareDraft = readComparison(event.target);
        try {
          const draft = compareDraft;
          compareResult = compareOffers({currency: draft.currency, start: draft.start, end: draft.end, guests: draft.guests, sameConditions: draft.sameConditions, a: {base: draft.aBase, fees: draft.aFees, extras: draft.aExtras}, b: {base: draft.bBase, fees: draft.bFees, extras: draft.bExtras}});
          byId('vbCompareError').textContent = ''; byId('vbComparisonResult').innerHTML = resultHtml(compareResult);
        } catch {byId('vbCompareError').textContent = tx('Проверьте даты, число гостей, все шесть сумм и сопоставимость условий. Конец периода должен быть позже начала.', 'Check the dates, guest count, all six amounts and comparable terms. The end date must be after the start.');}
      };
    }
  }
  const sharedDialog = byId('modal');
  if (sharedDialog) {
    sharedDialog.addEventListener('close', () => sharedDialog.classList.remove('vb-dialog'));
    const body = byId('modalBody');
    if (body && typeof MutationObserver !== 'undefined') new MutationObserver(() => {if (!body.querySelector('.vb-root')) sharedDialog.classList.remove('vb-dialog');}).observe(body, {childList: true});
  }
  window.VertexBudget = {open, summary};
})();
