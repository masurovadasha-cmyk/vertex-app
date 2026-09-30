'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {reply} = require('../dist/concierge-demo.js');

// A small DOM adapter exercises the actual modules and event/persistence boundary.
function environment(saved = {}) {
  const nodes = new Map(), created = [], listeners = new Map(), events = [];
  class Element {
    constructor() { this.value=''; this.options=[]; this.checked=false; this.open=false; this._html=''; this.cache=new Map(); this.dataset={}; this.children=[]; }
    set innerHTML(value) { this._html=value; this.cache.clear(); }
    get innerHTML() { return this._html; }
    querySelector(selector) { return get(selector); }
    querySelectorAll(selector) {
      if (this.cache.has(selector)) return this.cache.get(selector);
      const attr = /^\[data-([\w-]+)\]$/.exec(selector);
      if (!attr) return [];
      const list = [...this._html.matchAll(/<button\b[^>]*>/g)].filter(m=>m[0].includes('data-'+attr[1]+'=')).map(m=>{
        const element=new Element();
        for(const [,key,value] of m[0].matchAll(/data-([\w-]+)="([^"]*)"/g)) element.dataset[key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
        return element;
      });
      this.cache.set(selector,list); return list;
    }
    setAttribute() {} addEventListener() {} prepend(...values) { this.children.unshift(...values); }
    append(...values) { this.children.push(...values); } before() {} after(value) { this.afterElement=value; }
    insertBefore() {} showModal() { this.open=true; } close() { this.open=false; } contains() { return false; }
  }
  const get = key => { const id=key.startsWith('#')?key.slice(1):key; if(!nodes.has(id)) nodes.set(id,new Element()); return nodes.get(id); };
  get('arrival').value='2099-10-12'; get('departure').value='2099-10-15'; get('guests').value='2'; get('rentalSort').value='default';
  const storage=new Map(Object.entries(saved).map(([key,value])=>[key,JSON.stringify(value)]));
  const context={
    console, Intl, Date, Object, Array, Number, String, Map, Set, URL,
    crypto:require('node:crypto').webcrypto, setTimeout,clearTimeout,setInterval,clearInterval,
    lang:'ru',category:'care',city:'all',cart:[],services:[],cats:[],stays:[{id:'stay',ru:'Дом',en:'Stay',city:'Tashkent',currency:'UZS',price:100,capacity:4}],
    render(){},updateTotal(){},showMap(){},showStay(){},showCart(){},addService(){},
    tr:(ru,en)=>context.lang==='en'?en:ru,money:n=>n==null?'Уточнить':String(n),$:get,
    modal(title,html){ get('modalTitle').textContent=title; get('modalBody').innerHTML=html; get('modal').open=true; },
    localStorage:{getItem:key=>storage.get(key)||null,setItem(key,value){if(context.failStorage)throw Error('full');storage.set(key,value);}},
    document:{body:new Element(),documentElement:{lang:'ru'},createElement(){const e=new Element();created.push(e);return e;},getElementById:get,querySelector:get,querySelectorAll:()=>[]},
    CustomEvent:class {constructor(type,options={}){this.type=type;this.detail=options.detail;}},
    MutationObserver:class {observe(){}},
    addEventListener(type,callback){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(callback);},
    dispatchEvent(event){events.push(event);for(const callback of listeners.get(event.type)||[])callback(event);},
    VertexCatalog:{cities:[{id:'Tashkent',ru:'Ташкент',en:'Tashkent'}]},
    VertexRentalDomain:require('../dist/rental-domain.js')
  };
  context.window=context;
  vm.createContext(context);
  return {context,get,created,events,storage,load(name){vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',name),'utf8'),context,{filename:name});}};
}
const booking={id:'booking-1',listingId:'stay',title:'Дом',guest:'Guest',city:'Tashkent',arrival:'2099-10-12',departure:'2099-10-15',guests:2,total:300,currency:'UZS',status:'Запрос отправлен',referenceQuote:{total:300}};
const client={id:'client-1',bookingId:booking.id,name:'Guest',city:'Tashkent',phone:'',stage:'Новый',budget:300,currency:'UZS',note:'Keep my staff note',messages:[],calls:[]};
const env=environment({'vertex-rentals-v1':{favorites:[],listings:[],bookings:[booking],blocks:[]},'vertex-crm-v1':[client]});
env.load('business.js'); env.load('rentals.js');
const crm=()=>JSON.parse(env.storage.get('vertex-crm-v1'));
assert.equal(crm()[0].bookingStatus,'Запрос отправлен','ready event reconciles existing records');
const snapshot=env.context.VertexRentals.getSnapshot();
assert.ok(Object.isFrozen(snapshot)&&Object.isFrozen(snapshot.bookings)&&Object.isFrozen(snapshot.bookings[0]));
assert.equal(snapshot.bookings[0].referenceQuote,null,'restoration keeps canonical rental-domain normalization');
assert.throws(()=>{snapshot.bookings[0].status='Отменено';},TypeError);
assert.equal(env.context.VertexRentals.getSnapshot().bookings[0].status,'Запрос отправлен');
assert.ok(Object.isFrozen(env.context.VertexRentals.getSnapshot().properties[0]));
for(const name of ['showTrips','showFavorites','showHost','showCalendar','showDiscussion','showOwnerReport','createListing','editListing','getSnapshot']) assert.equal(typeof env.context.VertexRentals[name],'function','Host Studio API remains available: '+name);

// Actual host action emits only after persistence, preserving notes and mapping confirmation.
env.get('hostPanel').onclick();
env.get('modalBody').querySelectorAll('[data-booking]').find(b=>b.dataset.status==='Подтверждено').onclick();
assert.equal(crm()[0].bookingStatus,'Подтверждено');
assert.equal(crm()[0].stage,'В работе');
assert.equal(crm()[0].note,'Keep my staff note');
assert.ok(Object.isFrozen(env.events.find(e=>e.type==='vertex-booking-update').detail));

// Failed cancellation rolls back both the rental and CRM; retry succeeds.
env.context.VertexRentals.showTrips();
env.get('modalBody').querySelectorAll('[data-booking]')[0].onclick();
env.context.failStorage=true;
const before=env.events.filter(e=>e.type==='vertex-booking-update').length;
env.get('confirmCancel').onclick();
assert.equal(env.events.filter(e=>e.type==='vertex-booking-update').length,before);
assert.equal(env.context.VertexRentals.getSnapshot().bookings[0].status,'Подтверждено');
assert.equal(crm()[0].bookingStatus,'Подтверждено');
env.context.failStorage=false; env.get('confirmCancel').onclick();
assert.equal(crm()[0].bookingStatus,'Отменено');
assert.equal(crm()[0].stage,'В работе','cancelled request must not become a completed sale');
assert.equal(crm()[0].note,'Keep my staff note');
assert.equal(crm().length,1,'status updates must not duplicate clients');
const entry=env.created.find(e=>e.className==='business-entry');
entry.querySelectorAll('[data-open]').find(e=>e.dataset.open==='crm').onclick();
assert.match(env.get('clientList').innerHTML,/Демо-заявка: Отменено/);
assert.match(env.get('bizBody').innerHTML,/<strong>0<\/strong><span>Открытых сделок/);
env.context.lang='en'; env.context.render();
assert.match(env.get('clientList').innerHTML,/Demo request: Cancelled/);

const task={id:'task-1',ru:'Гид',en:'Guide',department:'travel',status:'new',note:'Guide request'};
const pkg={id:'package-1',city:'Tashkent',guests:2,start:'2099-10-12',end:'2099-10-15',lines:[{id:'guide',amount:100}],total:100};
const group=environment({'vertex-unified-v1':{tasks:[task],packages:[pkg]}}); group.load('group.js');
const groupSnapshot=group.context.VertexGroup.snapshot();
assert.ok(Object.isFrozen(groupSnapshot.tasks[0])&&Object.isFrozen(groupSnapshot.packages[0].lines[0]));
assert.throws(()=>groupSnapshot.packages[0].lines.push({id:'fake'}),{name:'TypeError'});
assert.equal(group.context.VertexGroup.snapshot().packages[0].lines.length,1);

// Guest cancellation refreshes listeners only after a successful persisted change.
group.context.VertexGroup.requests();
group.context.failStorage=true;
group.get('modalBody').querySelectorAll('[data-status]').find(b=>b.dataset.status==='cancelled').onclick();
assert.equal(group.events.filter(e=>e.type==='vertex-group-change').length,0);
assert.equal(group.context.VertexGroup.snapshot().tasks[0].status,'new');
group.context.failStorage=false;
group.get('modalBody').querySelectorAll('[data-status]').find(b=>b.dataset.status==='cancelled').onclick();
assert.equal(group.events.filter(e=>e.type==='vertex-group-change').length,1);
assert.equal(group.context.VertexGroup.snapshot().tasks[0].status,'cancelled');

// Journey reads the canonical 1.12 DTO while keeping the full Host Studio API.
const journeyEnv=environment({'vertex-rentals-v1':{favorites:[],listings:[],bookings:[booking],blocks:[]},'vertex-unified-v1':{tasks:[task],packages:[pkg]}});
journeyEnv.load('rentals.js');journeyEnv.load('group.js');
const hostMethods=Object.fromEntries(Object.entries(journeyEnv.context.VertexRentals).filter(([name])=>name!=='showTrips'));
journeyEnv.get('footerText').textContent='Existing release footer';
journeyEnv.load('journey.js');
for(const [name,method] of Object.entries(hostMethods)) assert.equal(journeyEnv.context.VertexRentals[name],method,'preserve Host Studio method '+name);
assert.equal(journeyEnv.get('footerText').textContent,'Existing release footer','Journey never downgrades release metadata');
assert.equal(journeyEnv.context.VertexJourney.summary().bookings,1);
assert.equal(journeyEnv.context.VertexJourney.summary().packages,1);
const journeyEntry=journeyEnv.created.find(e=>e.id==='journeyHome');
assert.match(journeyEntry.innerHTML,/2 заявок и пакетов/);
journeyEnv.context.VertexGroup.packages();
journeyEnv.get('modalBody').querySelectorAll('[data-cancel-package]')[0].onclick();
assert.match(journeyEntry.innerHTML,/1 заявок и пакетов/,'home count updates immediately after package removal');
journeyEnv.context.VertexRentals.showTrips();
assert.equal(journeyEnv.get('modalTitle').textContent,'Моя поездка');
assert.match(journeyEnv.get('modalBody').innerHTML,/Дом/,'canonical booking is visible inside Journey');

// Internal maps and concierge copy must not reintroduce external site navigation.
for(const language of ['ru','en']) {
  env.context.lang=language;
  env.context.showMap();
  assert.doesNotMatch(env.get('mapContent').innerHTML,/<a\b|href=|https?:/i);
  assert.match(env.get('mapContent').innerHTML,/Tashkent City/);
}
const mapCode=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').match(/function showMap\(\)\{[\s\S]*?(?=\$\('language'\)\.onclick=)/)[0];
vm.runInContext(mapCode,env.context);
env.context.showMap();
assert.doesNotMatch(env.get('modalBody').innerHTML,/<a\b|href=|https?:/i);
assert.match(env.get('modalBody').innerHTML,/Tashkent/);
const catalogReply=reply('Apartments',{lang:'en',catalog:{stays:[{en:'Views',city:'Tashkent',price:null}]}});
assert.doesNotMatch(catalogReply,/source link|external website/i);

for(const journey of [{bookings:1},{packages:1},{tasks:1},{care:1},{plannedStops:1}]){
  const ru=reply('Моя поездка',{journey});
  assert.match(ru,/В вашей поездке сохранено/); assert.doesNotMatch(ru,/пуста/);
  const en=reply('My trip budget',{lang:'en',journey});
  assert.match(en,/Your saved journey/); assert.doesNotMatch(en,/empty/);
}
assert.match(reply('My trip',{journey:{bookings:1},items:[{amount:300,currency:'UZS'}]}),/Separate cart: 1 items/);
assert.match(reply('My trip',{journey:{bookings:-1,packages:NaN,tasks:'9'}}),/cart is empty/);
console.log('PASS journey snapshots, booking lifecycle/rollback, CRM reconciliation/status/notes/totals, and RU/EN concierge journey checks');
