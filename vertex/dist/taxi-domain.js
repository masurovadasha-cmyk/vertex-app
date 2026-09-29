/* Taxi business rules. No DOM, network, location access or production dispatch. */
(function (root, factory) {
  'use strict';
  const quote = typeof module === 'object' && module.exports ? require('./mobility.js').quoteTransfer : root.VertexMobility.quoteTransfer;
  const api = factory(quote);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VertexTaxiDomain = api;
})(typeof window === 'undefined' ? globalThis : window, function (quoteTransfer) {
  'use strict';
  const FLEET = Object.freeze(['C16-01','C16-02','C01-01','C01-02'].map(id => Object.freeze({id, model:id.slice(0,3)})));
  const NEXT = Object.freeze({saved:['assigned','cancelled'], assigned:['arriving','cancelled'], arriving:['on_trip','cancelled'], on_trip:['completed'], completed:[], cancelled:[]});
  Object.values(NEXT).forEach(Object.freeze);
  const active = status => ['assigned','arriving','on_trip'].includes(status);
  const copy = value => JSON.parse(JSON.stringify(value));
  function fail(code) { const error = new Error(code); error.code = code; throw error; }
  function text(value, min, max, code) {
    if (typeof value !== 'string') fail(code);
    const result = value.trim();
    if (result.length < min || result.length > max || /[\u0000-\u001f]/u.test(result)) fail(code);
    return result;
  }
  function timestamp(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)); }
  function schedule(value, now) {
    if (value === '') return '';
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) fail('schedule');
    const ms = Date.parse(value + ':00+05:00');
    if (!Number.isFinite(ms) || new Date(ms + 18000000).toISOString().slice(0,16) !== value || ms <= now || ms > now + 90*86400000) fail('schedule');
    return new Date(ms).toISOString();
  }
  function validateDraft(input, now=Date.now()) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('input');
    const from = text(input.from, 3, 160, 'route'), to = text(input.to, 3, 160, 'route');
    if (from.toLocaleLowerCase() === to.toLocaleLowerCase()) fail('same_route');
    if (!['C16','C01'].includes(input.model)) fail('model');
    if (!['now','scheduled'].includes(input.when)) fail('schedule');
    if (!['cash','card','later'].includes(input.payment)) fail('payment');
    const guests=Number(input.guests), km=Number(input.km);
    if (!['string','number'].includes(typeof input.guests) || !Number.isInteger(guests) || guests<1 || guests>8) fail('guests');
    if (!['string','number'].includes(typeof input.km) || !String(input.km).trim() || !Number.isFinite(km) || km<0.1 || km>1000 || Math.abs(km*10-Math.round(km*10))>0.000001) fail('distance');
    const estimateCents=Math.round(quoteTransfer(km)*100);
    const at=input.when==='now' ? '' : schedule(input.at,now);
    if(input.when==='scheduled' && !at) fail('schedule');
    return {from,to,model:input.model,km,guests,when:input.when,at,payment:input.payment,note:text(input.note||'',0,300,'note'),estimateCents,currency:'USD'};
  }
  function createOrder(input, id, now=Date.now()) {
    if (typeof id!=='string' || !/^taxi-[a-zA-Z0-9-]{8,80}$/.test(id)) fail('id');
    const d=validateDraft(input,now);
    return {...d,id,status:'saved',vehicleId:null,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()};
  }
  function empty() { return {version:1,revision:0,orders:[]}; }
  function validateState(value) {
    if (!value || value.version!==1 || !Number.isSafeInteger(value.revision) || value.revision<0 || !Array.isArray(value.orders) || value.orders.length>50) fail('corrupt');
    const ids=new Set(), reserved=new Set();
    for (const o of value.orders) {
      if (!o || typeof o!=='object' || !/^taxi-[a-zA-Z0-9-]{8,80}$/.test(o.id||'') || ids.has(o.id) || !Object.hasOwn(NEXT,o.status) || !timestamp(o.createdAt) || !timestamp(o.updatedAt) || o.currency!=='USD') fail('corrupt');
      const localAt=o.at ? new Date(Date.parse(o.at)+18000000).toISOString().slice(0,16) : '';
      const checked=validateDraft({...o,at:localAt},Date.parse(o.createdAt));
      if (o.at!==checked.at || o.estimateCents!==checked.estimateCents || o.guests!==checked.guests || o.km!==checked.km) fail('corrupt');
      if (o.vehicleId!==null && !FLEET.some(v=>v.id===o.vehicleId&&v.model===o.model)) fail('corrupt');
      if ((active(o.status)||o.status==='completed') && !o.vehicleId) fail('corrupt');
      if(o.status==='saved' && o.vehicleId!==null) fail('corrupt');
      if (active(o.status)) { if (reserved.has(o.vehicleId)) fail('corrupt'); reserved.add(o.vehicleId); }
      ids.add(o.id);
    }
    return copy(value);
  }
  function add(state, order) {
    const s=validateState(state);
    if(s.orders.length>=50) fail('limit');
    if(s.orders.some(o=>o.id===order.id)) fail('duplicate');
    return validateState({...s,revision:s.revision+1,orders:[order,...s.orders]});
  }
  function transition(state,id,status,vehicleId=null,now=Date.now()) {
    const s=validateState(state), o=s.orders.find(x=>x.id===id);
    if(!o) fail('missing');
    if(!NEXT[o.status].includes(status)) fail('transition');
    if(status==='assigned') {
      if(!FLEET.some(v=>v.id===vehicleId&&v.model===o.model)) fail('model');
      if(s.orders.some(x=>x.id!==id&&x.vehicleId===vehicleId&&active(x.status))) fail('busy');
      o.vehicleId=vehicleId;
    }
    o.status=status;o.updatedAt=new Date(now).toISOString();s.revision++;
    return validateState(s);
  }
  return Object.freeze({FLEET,NEXT,active,empty,validateDraft,createOrder,validateState,add,transition,quoteTransfer});
});
