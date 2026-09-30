/* VISION shell: navigation and metadata only. Existing stores remain owned by their modules. */
(function(root){
  'use strict';
  const core=root.VertexVisionCore;
  if(!core||!document.querySelector('main')||document.getElementById('visionHome'))return;
  const tx=(ru,en)=>document.documentElement.lang==='en'?en:ru;
  const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const button=(text,handler,className='vv-button')=>{const node=element('button',className,text);node.type='button';node.onclick=handler;return node;};
  const home=element('section','vv-home');home.id='visionHome';home.setAttribute('aria-label','VERTEX VISION');
  document.querySelector('main').prepend(home);
  const dialog=element('dialog','vv-dialog');dialog.id='visionModuleDialog';document.body.append(dialog);
  let lastFocus=null,query='',domain='',activeModule=null;
  const labels={catalog:['Каталог Views','Views catalog'],host:['Кабинет собственника','Host workspace'],trips:['Мои поездки','My trips'],journey:['План поездки','Journey plan'],packages:['Конструктор турпакета','Package builder'],taxi:['Открыть Vertex Taxi','Open Vertex Taxi'],transfer:['Рассчитать трансфер','Estimate a transfer'],concierge:['Консьерж · демо','Concierge · demo'],requests:['Заявки команды · демо','Team requests · demo'],'guest-guide':['Гид гостя','Guest guide'],'service-control':['Контроль сервиса · демо','Service control · demo'],'property-request':['Запрос по недвижимости','Property request'],'engineering-request':['Запрос мастеру','Maintenance request'],'ticket-request':['Запрос билетов','Ticket request'],'cleaning-request':['Запрос уборки','Cleaning request'],'laundry-request':['Запрос в прачечную','Laundry request'],'meal-request':['Запрос питания','Meal request'],'market-request':['Запрос в маркет','Market request'],'bar-request':['Запрос в бар','Bar request']};
  const groups={stays:['Проживание','Stays'],property:['Недвижимость','Property'],travel:['Путешествия','Travel'],mobility:['Транспорт','Mobility'],services:['Сервис','Services'],hospitality:['Питание и торговля','Food & retail'],technology:['Технологии','Technology'],capital:['Инвестиции','Investment'],education:['Обучение','Training']};
  const request=id=>{if(!root.VertexGroup?.request)throw new Error('module_unavailable');root.VertexGroup.request(id);};
  const call=(name,method,...args)=>{if(typeof root[name]?.[method]!=='function')throw new Error('module_unavailable');return root[name][method](...args);};
  const adapters={
    catalog:()=>{document.getElementById('search').scrollIntoView({block:'start',behavior:'auto'});document.getElementById('destination').focus({preventScroll:true});},
    host:()=>call('VertexHostConsole','open','today'),trips:()=>call('VertexRentals','showTrips'),
    journey:()=>call('VertexJourney','open'),packages:()=>call('VertexGroup','builder'),
    taxi:()=>{if(root.VertexTaxiIntegration?.open)return root.VertexTaxiIntegration.open();return call('VertexTaxi','open');},
    transfer:()=>call('VertexMobility','openQuote'),
    concierge:()=>call('VertexDemoConcierge','open'),requests:()=>call('VertexGroup','requests'),
    'guest-guide':()=>call('VertexGuestGuide','open'),'service-control':()=>call('VertexCare','dashboard'),
    'property-request':()=>request('propertyBuy'),'engineering-request':()=>request('electrician'),
    'ticket-request':()=>request('flight'),'cleaning-request':()=>request('cleaning'),'laundry-request':()=>request('laundry'),
    'meal-request':()=>request('meal'),'market-request':()=>request('market'),'bar-request':()=>request('bar')
  };
  function close(){dialog.close();activeModule=null;}
  dialog.addEventListener('close',()=>{if(dialog.open)return;activeModule=null;if(!document.querySelector('dialog[open]')&&lastFocus?.isConnected)lastFocus.focus({preventScroll:true});});
  function navigate(id,action){
    if(!core.canLaunch(id,action)||!adapters[action])return false;
    if(dialog.open)close();
    try{adapters[action]();root.dispatchEvent(new CustomEvent('vertex:vision-navigation',{detail:{module:id,action,demo:true}}));return true;}
    catch{document.getElementById('visionMessage').textContent=tx('Модуль не загрузился. Обновите страницу.','The module did not load. Reload the page.');return false;}
  }
  function details(id){
    const module=core.module(id);if(!module)return false;
    activeModule=id;if(!dialog.open)lastFocus=document.activeElement;
    dialog.replaceChildren();
    const top=element('div','vv-dialog-top');const title=element('h2','',module.name);title.id='visionModuleTitle';dialog.setAttribute('aria-labelledby',title.id);
    const dismiss=button('×',close,'vv-close');dismiss.setAttribute('aria-label',tx('Закрыть','Close'));top.append(title,dismiss);dialog.append(top);
    dialog.append(element('p','vv-path','VERTEX VISION / '+module.name),element('p','',tx(module.description.ru,module.description.en)));
    dialog.append(element('p','vv-disclosure',module.mode==='planned'?tx('Направление добавлено в архитектуру. Рабочие функции ещё не подключены.','This direction is registered in the architecture. Operational features are not connected yet.'):tx('Функции ниже работают в демо на этом устройстве. Заявки не отправляются сотрудникам и не синхронизируются с облаком.','The actions below run as a demo on this device. Requests are not delivered to staff or synchronized with the cloud.')));
    const meta=element('dl','vv-meta');
    for(const [label,value] of [[tx('Основа','Foundation'),'VISION Core '+core.coreVersion],[tx('Общие сервисы','Shared services'),tx('Клиенты · заказы · задачи · права · аудит','Customers · orders · tasks · permissions · audit')],[tx('Серверный процесс','Backend workflow'),module.backend==='local-tested'?tx('Views → Cleaning проверен локально; не запущен в облаке','Views → Cleaning tested locally; not running in the cloud'):tx('Планируется','Planned')],[tx('Общая база','Shared database'),tx('Целевая PostgreSQL / Supabase; не подключена','Target: PostgreSQL / Supabase; not connected')]]){meta.append(element('dt','',label),element('dd','',value));}
    dialog.append(meta);
    const actions=element('div','vv-actions');
    for(const action of module.actions){const label=labels[action];if(!label)continue;const node=button(tx(...label),()=>navigate(id,action));node.dataset.vvAction=action;actions.append(node);}
    dialog.append(actions);
    if(!dialog.open)dialog.showModal();dismiss.focus();return true;
  }
  function cards(){
    const box=document.getElementById('visionModules');if(!box)return;
    box.replaceChildren();
    const search=query.toLocaleLowerCase().trim();
    const items=core.list(domain).filter(m=>[m.id,m.name,m.description.ru,m.description.en].join(' ').toLocaleLowerCase().includes(search));
    for(const m of items){
      const card=button('',()=>details(m.id),'vv-card');card.dataset.vvOpen=m.id;
      const head=element('div','vv-card-top');head.append(element('span','vv-card-domain',tx(...groups[m.domain])),element('span','vv-tag '+(m.mode==='planned'?'vv-tag-planned':''),m.mode==='demo'?tx('Демо','Demo'):tx('В архитектуре','Registered')));
      card.append(head,element('h3','',m.name),element('p','',tx(m.description.ru,m.description.en)),element('span','vv-card-link',tx('Открыть направление →','Open module →')));box.append(card);
    }
    document.getElementById('visionCount').textContent=tx('В реестре: '+core.modules.length+' · показано: '+items.length,'Registered: '+core.modules.length+' · shown: '+items.length);
    if(!items.length)box.append(element('p','vv-empty',tx('Направлений по этому запросу нет.','No modules match this search.')));
  }
  function render(){
    home.replaceChildren();
    const hero=element('div','vv-hero');const copy=element('div','vv-hero-copy');
    copy.append(element('p','vv-kicker','VERTEX GROUP / VISION CORE'),element('h1','vv-title',tx('Одна платформа.\nВсе направления.','One platform.\nEvery direction.')),element('p','vv-lead',tx('VERTEX VISION — общая основа. Views и все направления группы — модули единой экосистемы.','VERTEX VISION is the shared foundation. Views and every group direction are modules of one ecosystem.')));
    const shortcuts=element('div','vv-actions');
    for(const [ru,en,id,action] of [['Открыть Views','Open Views','views','catalog'],['Моя поездка','My journey','travel','journey'],['Такси','Taxi','taxi','taxi'],['Заявки команды','Team requests','concierge','requests']]){const b=button(tx(ru,en),()=>navigate(id,action));b.dataset.vvShortcut=id;shortcuts.append(b);}copy.append(shortcuts);
    const foundation=element('div','vv-foundation');foundation.append(element('p','vv-kicker','VISION / CORE '+core.coreVersion),element('h2','',tx('Общее ядро','Shared foundation')));
    const shared=element('div','vv-services');for(const s of core.services)shared.append(element('span','',tx(s.ru,s.en)));foundation.append(shared,element('p','vv-foundation-note',tx('Модули взаимодействуют через ядро и события, а не через чужие таблицы.','Modules communicate through the core and events, not another module’s private tables.')));hero.append(copy,foundation);home.append(hero);
    home.append(element('p','vv-disclosure',tx('ДЕМО '+core.version+' · Облачная база и настоящий вход ещё не подключены. Не вводите реальные персональные данные.','DEMO '+core.version+' · Cloud database and real sign-in are not connected. Do not enter real personal data.')));
    const tools=element('div','vv-tools');const heading=element('div');heading.append(element('h2','',tx('Направления VISION','VISION modules')),element('p','vv-count'));heading.lastChild.id='visionCount';tools.append(heading);
    const filters=element('div','vv-filters');const label=element('label','',tx('Найти направление','Find a module'));const input=element('input');input.id='visionSearch';input.type='search';input.maxLength=120;input.value=query;input.placeholder=tx('Например, клининг','For example, cleaning');input.oninput=()=>{query=input.value;cards();};label.append(input);
    const selectLabel=element('label','',tx('Категория','Category'));const select=element('select');select.id='visionDomain';select.append(new Option(tx('Все направления','All modules'),''));for(const [id,label] of Object.entries(groups))select.append(new Option(tx(...label),id));select.value=domain;select.onchange=()=>{domain=select.value;cards();};selectLabel.append(select);filters.append(label,selectLabel);tools.append(filters);home.append(tools);
    const grid=element('div','vv-grid');grid.id='visionModules';home.append(grid);
    const footer=element('div','vv-map');footer.append(element('strong','','VERTEX VISION'),element('span','',tx('Общее ядро → модули → услуги → заявки → исполнение → качество','Shared core → modules → services → requests → execution → quality')),element('small','',tx('JARVIS — отдельный проект; в эту кодовую базу не включён.','JARVIS is a separate project; it is not included in this codebase.')));home.append(footer);
    const message=element('p','vv-message');message.id='visionMessage';message.setAttribute('role','status');home.append(message);
    cards();
    const brand=document.querySelector('header .brand');if(brand){brand.setAttribute('aria-label','VERTEX VISION');brand.replaceChildren(element('span','mark','v'),element('span','vv-wordmark','VERTEX VISION'));brand.onclick=e=>{e.preventDefault();home.scrollIntoView({block:'start',behavior:'auto'});};}
    const oldTitle=document.getElementById('visionViewsBoundary');if(!oldTitle){const boundary=element('div','vv-views-boundary',tx('VERTEX VISION / VIEWS · Проживание и поездки','VERTEX VISION / VIEWS · Stays & journeys'));boundary.id='visionViewsBoundary';home.after(boundary);}else oldTitle.textContent=tx('VERTEX VISION / VIEWS · Проживание и поездки','VERTEX VISION / VIEWS · Stays & journeys');
  }
  root.VertexVision=Object.freeze({core,navigate,details,home:()=>home.scrollIntoView({block:'start',behavior:'auto'}),adapters:Object.freeze(Object.keys(adapters))});
  render();new MutationObserver(()=>{const opened=dialog.open?activeModule:null;render();if(opened)details(opened);}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  document.documentElement.dataset.visionReady='true';
  root.dispatchEvent(new CustomEvent('vertex:vision-ready',{detail:{version:core.version}}));
})(window);
