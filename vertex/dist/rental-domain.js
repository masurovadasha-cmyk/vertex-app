/* Pure rental-domain rules. No DOM, storage, network or mutable application globals. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VertexRentalDomain = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const STATUSES = Object.freeze(['Запрос отправлен', 'Подтверждено', 'Отклонено', 'Отменено']);
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const text = (value, max = 200) => typeof value === 'string' && value.length <= max;
  const id = value => text(value, 128) && /^[\w-]+$/.test(value);
  const currency = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
  const amount = value => value === null || (Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER);
  function dateTime(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const time = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
  }
  const nights = (start, end) => (dateTime(end) - dateTime(start)) / 86400000;
  const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const active = booking => !!booking && STATUSES.slice(0, 2).includes(booking.status);
  const validPeriod = (start, end, today, max = 365) => Number.isInteger(nights(start, end)) && nights(start, end) >= 1 && nights(start, end) <= max && Number.isFinite(dateTime(today)) && start >= today;
  const image = value => typeof value === 'string' && (value === '' || /^[\w.-]+\.(?:avif|png|jpe?g|webp|svg)$/i.test(value));

  /** Validate individual records, not just arrays. Never write repaired data implicitly. */
  function normalizeStore(raw, baseIds = []) {
    const data = {favorites: [], listings: [], bookings: [], blocks: [], threads: []};
    let rejected = 0;
    if (raw == null) return {data, rejected};
    if (!object(raw)) return {data, rejected: 1};
    function read(key, convert, uniqueKey) {
      if (raw[key] === undefined) return [];
      if (!Array.isArray(raw[key])) { rejected++; return []; }
      const seen = new Set();
      return raw[key].flatMap(value => {
        const result = convert(value);
        if (!result) { rejected++; return []; }
        const unique = uniqueKey(result);
        if (seen.has(unique)) { rejected++; return []; }
        seen.add(unique);
        return [result];
      });
    }
    data.listings = read('listings', value => {
      if (!object(value) || !id(value.id) || baseIds.includes(value.id) || !text(value.ru, 80) || !value.ru.trim() || !text(value.en ?? value.ru, 80) || !text(value.city, 80) || !text(value.type ?? 'Квартира', 80) || !amount(value.price) || !currency(value.currency ?? 'USD') || !Number.isInteger(value.capacity) || value.capacity < 1 || value.capacity > 20) return null;
      return {id: value.id, ru: value.ru, en: value.en || value.ru, city: value.city, type: value.type || 'Квартира', price: value.price, currency: value.currency ?? 'USD', capacity: value.capacity, wifi: value.wifi === true, host: text(value.host, 80) ? value.host : '', description: text(value.description, 1500) ? value.description : '', descriptionEn: text(value.descriptionEn, 1500) ? value.descriptionEn : '', photo: image(value.photo) ? value.photo : null, photos: Array.isArray(value.photos) ? value.photos.filter(image) : []};
    }, value => value.id);
    data.bookings = read('bookings', value => {
      if (!object(value) || !id(value.id) || !id(value.listingId) || !text(value.title) || !text(value.guest, 80) || !Number.isInteger(value.guests) || value.guests < 1 || value.guests > 20 || !STATUSES.includes(value.status) || !Number.isInteger(nights(value.arrival, value.departure)) || nights(value.arrival, value.departure) < 1 || nights(value.arrival, value.departure) > 365 || !amount(value.total) || !currency(value.currency ?? 'USD')) return null;
      return {id: value.id, listingId: value.listingId, title: value.title, guest: value.guest, guests: value.guests, city: text(value.city, 80) ? value.city : '', arrival: value.arrival, departure: value.departure, status: value.status, total: value.total, currency: value.currency ?? 'USD', n: nights(value.arrival, value.departure), subtotal: amount(value.subtotal) ? value.subtotal : null, cleaning: amount(value.cleaning) ? value.cleaning : null, fee: amount(value.fee) ? value.fee : null, created: text(value.created, 40) ? value.created : '', referenceQuote: null};
    }, value => value.id);
    data.favorites = read('favorites', value => id(value) ? value : null, value => value);
    data.blocks = read('blocks', value => object(value) && id(value.listingId) && Number.isFinite(dateTime(value.date)) ? {listingId: value.listingId, date: value.date} : null, value => value.listingId + ':' + value.date);
    data.threads = read('threads', value => {
      if (!object(value) || !id(value.listingId) || !Array.isArray(value.messages)) return null;
      const messages = value.messages.filter(message => {
        const valid = object(message) && ['guest', 'host'].includes(message.side) && text(message.text, 1000) && text(message.at, 40) && Number.isFinite(Date.parse(message.at));
        if (!valid) rejected++;
        return valid;
      }).map(message => ({side: message.side, text: message.text, at: message.at}));
      return {listingId: value.listingId, messages};
    }, value => value.listingId);
    return {data, rejected};
  }
  function metrics(bookings) {
    const confirmed = bookings.filter(value => value.status === 'Подтверждено');
    const totals = new Map();
    confirmed.forEach(value => { if (Number.isFinite(value.total)) totals.set(value.currency, (totals.get(value.currency) || 0) + value.total); });
    return {pending: bookings.filter(value => value.status === 'Запрос отправлен').length, confirmed: confirmed.length, confirmedNights: confirmed.reduce((total, value) => total + nights(value.arrival, value.departure), 0), totals: [...totals]};
  }
  function snapshot(data, properties) {
    const copy = JSON.parse(JSON.stringify({...data, properties, metrics: metrics(data.bookings)}));
    function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
    return freeze(copy);
  }
  return Object.freeze({STATUSES, dateTime, nights, localDate, active, validPeriod, normalizeStore, metrics, snapshot});
});
