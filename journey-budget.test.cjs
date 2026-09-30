'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const budget = require('./vertex/dist/journey-budget.js');
const entry = (overrides = {}) => ({id: 'expense-1', title: 'Airport transfer', amount: 20.5, currency: 'USD', category: 'transport', type: 'planned', date: '2026-09-29', ...overrides});

test('amount parser accepts decimal inputs and rejects coercion, invalid precision and extreme values', () => {
  assert.equal(budget.amount('12,50'), 12.5);
  assert.equal(budget.amount(' 12.50 '), 12.5);
  assert.equal(budget.amount(0, true), 0);
  assert.equal(budget.amount(budget.MAX_AMOUNT), budget.MAX_AMOUNT);
  for (const input of ['', ' ', null, undefined, true, {}, [], NaN, Infinity, -1, 0, '1e3', '0x10', '1 000', '1.001', '1,000.00', budget.MAX_AMOUNT + 1]) assert.throws(() => budget.amount(input), String(input));
});

test('malformed, future-version, duplicate-id and invalid-date storage is not trusted', () => {
  assert.deepEqual(budget.decodeState(null), {state: budget.emptyState(), issue: null});
  for (const raw of ['{', 'null', '{}', JSON.stringify({...budget.emptyState(), version: 2}), JSON.stringify({...budget.emptyState(), expenses: [entry({date: '2026-02-30'})]}), JSON.stringify({...budget.emptyState(), expenses: [entry(), entry()]}), JSON.stringify({...budget.emptyState(), budgets: {UZS: 'NaN', USD: null}})]) {
    assert.equal(budget.decodeState(raw).issue, 'invalid');
    assert.deepEqual(budget.decodeState(raw).state, budget.emptyState());
  }
  assert.equal(budget.validDate('2024-02-29'), true);
  assert.equal(budget.validDate('2025-02-29'), false);
  assert.equal(budget.validDate('2026-9-29'), false);
  assert.equal(budget.validDate('2101-01-01'), false);
});

test('USD and UZS, actual and planned remain separate with exact decimal totals', () => {
  let state = budget.setBudget(budget.emptyState(), 'USD', 100);
  state = budget.setBudget(state, 'UZS', 1000000);
  state = budget.upsertExpense(state, entry({id: 'a', amount: 0.1, type: 'actual'}));
  state = budget.upsertExpense(state, entry({id: 'b', amount: 0.2, type: 'actual'}));
  state = budget.upsertExpense(state, entry({id: 'c', amount: 20, type: 'planned'}));
  state = budget.upsertExpense(state, entry({id: 'd', amount: 1200000, currency: 'UZS', type: 'actual'}));
  const result = budget.calculate(state);
  assert.equal(result.currencies.USD.actual, 0.3);
  assert.equal(result.currencies.USD.planned, 20);
  assert.equal(result.currencies.USD.remaining, 99.7);
  assert.equal(result.currencies.USD.afterPlanned, 79.7);
  assert.equal(result.currencies.UZS.actual, 1200000);
  assert.equal(result.currencies.UZS.remaining, -200000);
  assert.equal(result.count, 4);
  assert.equal(budget.calculate(budget.emptyState()).currencies.USD.remaining, null);
  assert.equal(budget.calculate(budget.setBudget(budget.emptyState(), 'USD', 0)).currencies.USD.remaining, 0);
});

test('add, edit planned to actual, currency change, delete and reload persist consistently', () => {
  const memory = new Map();
  const storage = {getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value)};
  let store = budget.createStore(storage);
  store.write(budget.upsertExpense(store.get(), entry()));
  store = budget.createStore(storage);
  assert.equal(store.get().expenses.length, 1);
  store.write(budget.upsertExpense(store.get(), entry({amount: 350000, currency: 'UZS', type: 'actual', title: 'Paid transfer'})));
  store = budget.createStore(storage);
  assert.equal(store.get().expenses.length, 1);
  assert.equal(budget.calculate(store.get()).currencies.USD.planned, 0);
  assert.equal(budget.calculate(store.get()).currencies.UZS.actual, 350000);
  const detached = store.get(); detached.expenses[0].amount = 99;
  assert.equal(store.get().expenses[0].amount, 350000);
  store.write(budget.removeExpense(store.get(), 'expense-1'));
  assert.deepEqual(budget.createStore(storage).get().expenses, []);
});

test('storage failures retain current session entries and disclose unavailable storage', () => {
  const store = budget.createStore({getItem() {throw Error('blocked');}, setItem() {throw Error('quota');}});
  assert.equal(store.status(), 'unavailable');
  store.write(budget.upsertExpense(store.get(), entry()));
  assert.equal(store.get().expenses.length, 1);
  assert.equal(store.status(), 'unavailable');
  assert.throws(() => store.write({version: 99}));
  assert.equal(store.get().expenses.length, 1);
});

test('offer comparison uses user-entered all-in totals and requires comparable dates and terms', () => {
  const input = {currency: 'USD', start: '2026-10-01', end: '2026-10-04', guests: 2, sameConditions: true, a: {base: 100, fees: 25, extras: 10}, b: {base: 120, fees: 0, extras: 0}};
  assert.deepEqual(budget.compareOffers(input), {a: 135, b: 120, difference: 15, lower: 'b', currency: 'USD', start: '2026-10-01', end: '2026-10-04', guests: 2});
  assert.equal(budget.compareOffers({...input, b: {base: 100, fees: 25, extras: 10}}).lower, null);
  assert.equal(budget.compareOffers({...input, a: {base: 0.1, fees: 0.2, extras: 0}, b: {base: 0.3, fees: 0, extras: 0}}).difference, 0);
  for (const patch of [{currency: 'EUR'}, {sameConditions: false}, {start: '2026-10-04'}, {end: '2026-09-30'}, {guests: 1.5}, {guests: 0}, {a: {base: 100, fees: '', extras: 0}}, {b: {base: -1, fees: 0, extras: 0}}]) assert.throws(() => budget.compareOffers({...input, ...patch}));
});

test('validation drops unrelated keys, rejects unknown currencies and guards expense limit', () => {
  const clean = budget.validateExpense({...entry(), cardNumber: 'not retained', bookingConfirmed: true});
  assert.equal('cardNumber' in clean, false);
  assert.equal('bookingConfirmed' in clean, false);
  assert.throws(() => budget.upsertExpense(budget.emptyState(), entry({currency: 'EUR'})));
  assert.throws(() => budget.upsertExpense(budget.emptyState(), entry({id: '<script>'})));
  const state = {...budget.emptyState(), expenses: Array.from({length: budget.MAX_EXPENSES}, (_, i) => entry({id: 'row-' + i}))};
  assert.throws(() => budget.upsertExpense(state, entry()), /limit/);
  assert.equal(budget.upsertExpense(state, entry({id: 'row-1', title: 'Updated'})).expenses.length, budget.MAX_EXPENSES);
});

const trip = (overrides = {}) => ({city: 'Tashkent', start: '2026-10-12', end: '2026-10-15', guests: 2, ...overrides});

test('scope keys use only validated city, dates and party size', () => {
  const first = budget.budgetScope(trip());
  assert.notEqual(first.key, budget.KEY);
  assert.deepEqual(first.context, trip());
  assert.equal(budget.budgetScope({...trip(), unused: 'ignored'}).key, first.key);
  for (const change of [{city: 'Samarkand'}, {start: '2026-10-11'}, {end: '2026-10-16'}, {guests: 3}]) assert.notEqual(budget.budgetScope(trip(change)).key, first.key);
  for (const invalid of [null, {}, trip({city: '<script>'}), trip({guests: '2'}), trip({guests: 21}), trip({end: '2026-10-12'}), trip({end: '2028-01-01'}), trip({start: '2026-02-30'})]) assert.deepEqual(budget.budgetScope(invalid), {key: budget.KEY, context: null});
});

test('switching journeys isolates limits, currencies, plans and edits, and survives reload', () => {
  const memory = new Map();
  const storage = {getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value)};
  let stores = budget.createScopedStores(storage);
  const a = trip(), b = trip({city: 'Samarkand'});
  const first = stores.forContext(a).store;
  first.write(budget.upsertExpense(budget.setBudget(first.get(), 'USD', 100), entry({type: 'actual'})));
  const second = stores.forContext(b).store;
  assert.equal(budget.calculate(second.get()).currencies.USD.actual, 0);
  assert.equal(budget.calculate(second.get()).currencies.USD.limit, null);
  second.write(budget.upsertExpense(budget.setBudget(second.get(), 'UZS', 900000), entry({currency: 'UZS', amount: 300000})));
  assert.equal(stores.forContext(a).store, first);
  first.write(budget.upsertExpense(first.get(), entry({type: 'actual', amount: 30})));
  assert.equal(budget.calculate(second.get()).currencies.UZS.planned, 300000);
  stores = budget.createScopedStores(storage);
  assert.equal(budget.calculate(stores.forContext(a).store.get()).currencies.USD.actual, 30);
  assert.equal(budget.calculate(stores.forContext(b).store.get()).currencies.UZS.afterPlanned, 600000);
  const restoredFirst = stores.forContext(a).store;
  restoredFirst.write(budget.removeExpense(restoredFirst.get(), 'expense-1'));
  assert.equal(stores.forContext(a).store.get().expenses.length, 0);
  assert.equal(stores.forContext(b).store.get().expenses.length, 1);
});

test('legacy unscoped data stays accessible without silent migration or duplicate journey expenses', () => {
  const original = JSON.stringify(budget.upsertExpense(budget.emptyState(), entry()));
  const memory = new Map([[budget.KEY, original]]);
  const storage = {getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value)};
  const stores = budget.createScopedStores(storage);
  assert.equal(stores.forContext(null).store.get().expenses.length, 1);
  for (const context of [trip(), trip({city: 'Bukhara'}), trip({guests: 4})]) {
    assert.deepEqual(stores.forContext(context).store.get(), budget.emptyState());
  }
  const active = stores.forContext(trip()).store;
  active.write(budget.setBudget(active.get(), 'USD', 500));
  assert.equal(memory.get(budget.KEY), original);
  assert.equal(stores.forContext(null).store.get().expenses.length, 1);
  assert.equal(stores.forContext(trip()).store.get().expenses.length, 0);
});

test('unavailable storage and malformed journey data do not leak between scoped session stores', () => {
  const a = trip(), b = trip({city: 'Khiva'});
  const stores = budget.createScopedStores({getItem() {throw Error('blocked');}, setItem() {throw Error('quota');}});
  const first = stores.forContext(a).store;
  first.write(budget.upsertExpense(first.get(), entry()));
  assert.equal(stores.forContext(b).store.get().expenses.length, 0);
  assert.equal(stores.forContext(null).store.get().expenses.length, 0);
  assert.equal(stores.forContext(a).store.get().expenses.length, 1);
  assert.equal(stores.forContext(a).store.status(), 'unavailable');
  const malformed = budget.createScopedStores({getItem: key => key === budget.budgetScope(a).key ? '{broken' : null, setItem() {}});
  assert.equal(malformed.forContext(a).store.status(), 'invalid');
  assert.equal(malformed.forContext(b).store.status(), null);
});

test('public summary resolves changed active journey context on every call', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const a = trip(), b = trip({city: 'Bukhara'});
  let context = a;
  const memory = new Map([
    [budget.budgetScope(a).key, JSON.stringify(budget.upsertExpense(budget.emptyState(), entry({type: 'actual', amount: 40})))],
    [budget.budgetScope(b).key, JSON.stringify(budget.setBudget(budget.emptyState(), 'USD', 700))],
    [budget.KEY, JSON.stringify(budget.upsertExpense(budget.emptyState(), entry({type: 'actual', amount: 99})))]
  ]);
  const browser = {
    document: {documentElement: {lang: 'en'}, getElementById: () => null},
    localStorage: {getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value)},
    window: {VertexJourney: {context: () => context}}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('./vertex/dist/journey-budget.js'), 'utf8'), browser);
  const api = browser.window.VertexBudget;
  assert.equal(api.summary().currencies.USD.actual, 40);
  assert.equal(api.summary().scope, 'journey');
  context = b;
  assert.equal(api.summary().currencies.USD.actual, 0);
  assert.equal(api.summary().currencies.USD.limit, 700);
  assert.equal(api.summary().context.city, 'Bukhara');
  context = null;
  assert.equal(api.summary().scope, 'device');
  assert.equal(api.summary().currencies.USD.actual, 99);
  context = a;
  assert.equal(api.summary().currencies.USD.actual, 40);
});
