'use strict';
// Preview-only utility. Does not deploy, use credentials, or change application files.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const crypto = require('node:crypto');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const site = path.join(root, 'vertex/dist');
const out = path.join(root, 'preview-output');
fs.mkdirSync(path.join(out, 'screens'), {recursive:true});
const catalogContext = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(site, 'views-catalog.js'), 'utf8'), catalogContext);
const owned = catalogContext.window.VertexOwnedStays;
const first = owned[0], second = owned[1];
const now = '2026-09-29T07:00:00+05:00';
function booking(id, listing, arrival, departure, status) {
  return {id,listingId:listing.id,title:listing.ru,city:listing.city,guest:'Демо-гость · пример',arrival,departure,guests:2,n:3,subtotal:null,cleaning:null,fee:null,total:null,currency:'USD',status,created:now};
}
const seed = {
  'vertex-uz-v1': {lang:'ru',currency:'UZS',catalogNoticeSeen:true,items:[]},
  'vertex-rentals-v1': {
    favorites:[first.id],listings:[],threads:[],
    bookings:[booking('00000000-0000-4000-8000-000000000001',first,'2026-10-12','2026-10-15','Подтверждено'),booking('00000000-0000-4000-8000-000000000002',second,'2026-10-16','2026-10-19','Запрос отправлен')],
    blocks:[{listingId:first.id,date:'2026-10-20'},{listingId:first.id,date:'2026-10-21'}]
  },
  'vertex-crm-v1': [
    {id:'preview-client-1',name:'Демо-гость · апартаменты',city:'Tashkent',phone:'',stage:'В работе',budget:null,currency:'UZS',note:'Пример для показа интерфейса. Не настоящий клиент.',messages:[],calls:[]},
    {id:'preview-client-2',name:'Демо-гость · трансфер',city:'Tashkent',phone:'',stage:'Новый',budget:null,currency:'UZS',note:'Пример для показа интерфейса. Не настоящий заказ.',messages:[],calls:[]}
  ],
  'vertex-unified-v1': {tasks:[
    {id:'preview-task-1',ru:'Подготовить бельё',en:'Prepare linen',department:'laundry',note:'Демо-заявка: подготовить бельё перед заселением.',status:'new',assignee:'',created:now},
    {id:'preview-task-2',ru:'Уборка апартаментов',en:'Apartment cleaning',department:'cleaning',note:'Демо-заявка: проверить готовность квартиры.',status:'progress',assignee:'Демо-сотрудник',created:now},
    {id:'preview-task-3',ru:'Трансфер из аэропорта',en:'Airport transfer',department:'mobility',note:'Пример заявки на автомобиль. Машина не заказана.',status:'new',assignee:'',created:now}
  ],packages:[]}
};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    const file=path.resolve(site,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found');}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(fs.readFileSync(file));
  } catch {res.writeHead(400);res.end('Bad request');}
});
const report={sourceCommit:'dbeb0a75aaa116e4543ccceb72307b921e3b1d9f',release:JSON.parse(fs.readFileSync(path.join(site,'release.json'),'utf8')),notice:'Real screenshots of the unmodified application source, rendered locally. Browser state contains illustrative demo bookings, guests and tasks only. No external orders or payments are made.',screens:[],errors:[]};
(async()=>{
  await new Promise(resolve=>server.listen(8765,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  async function shot(name,label,setup,desktop=false){
    const context=await browser.newContext({viewport:desktop?{width:1440,height:1040}:{width:430,height:932},deviceScaleFactor:2,isMobile:!desktop,hasTouch:!desktop,locale:'ru-RU',timezoneId:'Asia/Tashkent',reducedMotion:'reduce',serviceWorkers:'block'});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await context.addInitScript(({seed,now})=>{
      const NativeDate=Date;
      class PreviewDate extends NativeDate {constructor(...args){super(...(args.length?args:[now]));}static now(){return new NativeDate(now).getTime();}}
      window.Date=PreviewDate;
      for(const [key,value] of Object.entries(seed))localStorage.setItem(key,JSON.stringify(value));
    },{seed,now});
    // Avoid third-party calls during screenshots. This only affects the preview browser.
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(url.startsWith('http://127.0.0.1:8765/')||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
      return route.abort();
    });
    try {
      await page.goto('http://127.0.0.1:8765/',{waitUntil:'networkidle',timeout:30000});
      await page.locator('#arrival').fill('2026-10-12');
      await page.locator('#departure').fill('2026-10-15');
      if(setup)await setup(page);
      await page.waitForTimeout(500);
      await page.screenshot({path:path.join(out,'screens',name+'.png'),fullPage:false,animations:'disabled'});
      report.screens.push({name,label,desktop,errors});
    } catch(error){report.errors.push({name,error:error.message});}
    await context.close();
  }
  const close=async page=>page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  await shot('01-home-desktop','Главная — компьютер',null,true);
  await shot('02-home-mobile','Главная — телефон');
  await shot('03-catalog','Каталог апартаментов',async p=>{await p.locator('#sectionHeading').scrollIntoViewIfNeeded();await p.evaluate(()=>window.scrollBy(0,-24));});
  await shot('04-property','Карточка квартиры',async p=>{await p.locator('#results [data-rental]').first().click();});
  await shot('05-booking','Даты и демо-заявка',async p=>{await p.locator('#results [data-rental]').first().click();await p.locator('#bookingForm').evaluate(el=>el.scrollIntoView({block:'start'}));});
  await shot('06-calendar','Календарь хозяина',async p=>{await p.locator('#rentalCalendar').click();await p.locator('#nextMonth').click();});
  await shot('07-owner','Кабинет собственника',async p=>{await p.locator('#hostPanel').click();});
  await shot('08-owner-report','Отчёт собственника — демо',async p=>{await p.locator('#hostPanel').click();await p.locator('#hostReport').click();});
  await shot('09-crm','CRM',async p=>{await p.locator('.business-entry [data-open="crm"]').click();});
  await shot('10-staff','Задачи команды',async p=>{await p.evaluate(()=>window.VertexGroup.requests());await p.locator('#groupRole').selectOption('admin');});
  await shot('11-mobility','Расчёт трансфера',async p=>{await p.evaluate(()=>window.VertexMobility.openQuote());await p.locator('#mobilityKm').fill('20');});
  await shot('12-guide','Гид гостя',async p=>{await p.evaluate(()=>window.VertexGuestGuide.open());});
  await shot('13-trips','Поездки',async p=>{await p.locator('#cartButton').click();});
  await shot('14-discussion','Обсуждение объекта',async p=>{await p.locator('#results [data-rental]').first().click();await p.locator('#contactHost').click();await p.locator('#discussionForm [name="message"]').fill('Демо-вопрос: можно заказать трансфер?');await p.locator('#discussionForm button[type="submit"]').click();});
  await shot('15-packages','Конструктор путешествия',async p=>{await p.evaluate(()=>window.VertexGroup.builder());await p.locator('[name="groupOption"][value="transfer"]').check();});
  await shot('16-concierge','Демо-консьерж',async p=>{await p.evaluate(()=>window.VertexDemoConcierge.open());await p.locator('#conciergeQuestion').fill('Нужен трансфер и завтрак');await p.locator('#conciergeSend').click();});
  await shot('17-profile','Профиль',async p=>{await p.locator('#mobileNav [data-tab="profile"]').click();});
  await shot('18-map','Обзор мест',async p=>{await p.locator('#mobileNav [data-tab="explore"]').click();});
  await shot('19-services','Сервисы',async p=>{await p.locator('#mobileNav [data-tab="services"]').click();await p.locator('#sectionHeading').scrollIntoViewIfNeeded();});
  await shot('20-fleet-desktop','Раздел транспорта',async p=>{await p.locator('.mobility-entry').scrollIntoViewIfNeeded();},true);
  await browser.close();server.close();
  const manifest={};
  for(const name of fs.readdirSync(site)){const p=path.join(site,name);if(fs.statSync(p).isFile())manifest[name]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
  fs.writeFileSync(path.join(out,'source-manifest.json'),JSON.stringify(manifest,null,2));
  fs.writeFileSync(path.join(out,'preview-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({screens:report.screens.length,errors:report.errors}));
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
