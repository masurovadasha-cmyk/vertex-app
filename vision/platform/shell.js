/* VISION shell: navigation and metadata only. Existing stores remain owned by their modules. */
(function(root){
  'use strict';
  const core=root.VertexVisionCore;
  if(!core||!document.querySelector('main')||document.getElementById('visionHome'))return;
  const tx=(ru,en)=>document.documentElement.lang==='en'?en:ru;
  const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const button=(text,handler,className='vv-button')=>{const node=element('button',className,text);node.type='button';node.onclick=handler;return node;};
  const home=element('section','vv-home');home.id='visionHome';home.setAttribute('aria-label','VERTEX VISION');document.documentElement.dataset.visionUi='2.0';
  document.querySelector('main').prepend(home);
  const dialog=element('dialog','vv-dialog');dialog.id='visionModuleDialog';document.body.append(dialog);
  let lastFocus=null,query='',domain='',activeModule=null;
  const labels={operations:['Операционный центр Views','Views operations'],catalog:['Каталог Views','Views catalog'],host:['Кабинет собственника','Host workspace'],trips:['Мои поездки','My trips'],journey:['План поездки','Journey plan'],packages:['Конструктор турпакета','Package builder'],taxi:['Заказать такси · демо','Request a taxi · demo'],transfer:['Рассчитать трансфер','Estimate a transfer'],concierge:['Консьерж · демо','Concierge · demo'],requests:['Заявки команды · демо','Team requests · demo'],'guest-guide':['Гид гостя','Guest guide'],'service-control':['Контроль сервиса · демо','Service control · demo'],'property-request':['Запрос по недвижимости','Property request'],'engineering-request':['Запрос мастеру','Maintenance request'],'ticket-request':['Запрос билетов','Ticket request'],'cleaning-request':['Запрос уборки','Cleaning request'],'laundry-request':['Запрос в прачечную','Laundry request'],'meal-request':['Запрос питания','Meal request'],'market-request':['Запрос в маркет','Market request'],'bar-request':['Запрос в бар','Bar request']};
  const groups={stays:['Проживание','Stays'],property:['Недвижимость','Property'],travel:['Путешествия','Travel'],mobility:['Транспорт','Mobility'],services:['Сервис','Services'],hospitality:['Питание и торговля','Food & retail'],technology:['Технологии','Technology'],capital:['Инвестиции','Investment'],education:['Обучение','Training']};
  const categoryOrder=['hospitality-stays','property-engineering','travel-mobility','guest-services','technology-capital'];
  const categoryLabels={
    'hospitality-stays':['Гостеприимство и проживание','Hospitality & Stays'],
    'property-engineering':['Недвижимость и инженерия','Property & Engineering'],
    'travel-mobility':['Путешествия и мобильность','Travel & Mobility'],
    'guest-services':['Гостевые сервисы','Guest Services'],
    'technology-capital':['Технологии и капитал','Technology & Capital']
  };
  const categoryFor=domain=>domain==='stays'||domain==='hospitality'?'hospitality-stays':domain==='property'?'property-engineering':domain==='travel'||domain==='mobility'?'travel-mobility':domain==='services'?'guest-services':'technology-capital';
  const iconMarkup=id=>({
    views:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V8l8-5 8 5v13M8 21v-8h8v8M9 9h.01M12 9h.01M15 9h.01"/></svg>',
    managing:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 4l9 7M5 10v10h14V10M9 20v-6h6v6"/></svg>',
    'real-estate':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5h10v16M14 10h6v11M7 8h2M7 12h2M7 16h2M17 13h1M17 17h1"/></svg>',
    engineers:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 7 3-3 3 3-3 3M4 20l7-7M7 17l-3-3 7-7 3 3M13 11l7 7"/></svg>',
    'aura-design':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 18H3L12 3Zm0 6-4 8h8l-4-8Z"/></svg>',
    travel:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="6" width="14" height="15" rx="2"/><path d="M9 6V4h6v2M8 11h8M8 16h8"/></svg>',
    aviation:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 16 20-8-7 7-1 6-3-5-9 0Zm9 0 3-3"/></svg>',
    'rent-car':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17h14l-1-7H6l-1 7ZM7 10l2-4h6l2 4M7 17v2M17 17v2M8 14h.01M16 14h.01"/></svg>',
    taxi:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17h14l-1-7H6l-1 7ZM8 10l1-3h6l1 3M9 7V5h6v2M7 17v2M17 17v2"/></svg>',
    concierge:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16M6 18a6 6 0 0 1 12 0M12 9V6M10 6h4"/></svg>',
    cleaning:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6M10 4v4l-3 3v9h10v-9l-3-3V4M7 13h10"/></svg>',
    laundry:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14l-7 5-7-5Zm7 5v8M8 20h8"/></svg>',
    ditalia:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3v18M16 3c3 2 3 7 0 9"/></svg>',
    market:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h2l2 10h10l2-7H6M9 20h.01M17 20h.01"/></svg>',
    bar:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-8 8-8-8Zm8 8v6M8 21h8"/></svg>',
    technologies:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>',
    investment:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    ventures:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4c3 0 5-1 6-2 0 4-1 8-5 11l-4 3-3-3 3-4c1-2 2-4 3-5ZM8 14l-3 1-2 4 4-2 1-3ZM14 10h.01"/></svg>',
    training:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 8 9-5 9 5-9 5-9-5Zm4 3v5c3 3 7 3 10 0v-5"/></svg>'
  }[id]||'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>');
  const moduleExperience={
    views:{tagline:['Операционный центр проживания и гостевого сервиса','Hospitality operations and guest service'],capabilities:[['Календарь','Calendar'],['Бронирования','Bookings'],['Уборка','Cleaning'],['Готовность объектов','Unit readiness']]},
    managing:{tagline:['Управление собственниками, объектами и выплатами','Owner, property and payout management'],capabilities:[['Owner onboarding','Owner onboarding'],['Unit onboarding','Unit onboarding'],['Payouts','Payouts'],['Readiness','Readiness']]},
    'real-estate':{tagline:['Сделки, просмотры, предложения и closing','Deals, viewings, offers and closing'],capabilities:[['Listings','Listings'],['Viewings','Viewings'],['Deal room','Deal room'],['Closing','Closing']]},
    engineers:{tagline:['Проекты, чертежи, инспекции и handover','Projects, drawings, inspections and handover'],capabilities:[['Projects','Projects'],['Drawings','Drawings'],['Inspections','Inspections'],['Handover','Handover']]},
    travel:{tagline:['Маршруты, туры и единый journey','Routes, tours and unified journey'],capabilities:[['Trips','Trips'],['Packages','Packages'],['Itinerary','Itinerary'],['Support','Support']]},
    aviation:{tagline:['Авиа, железная дорога и автобусные билеты','Flight, rail and bus ticketing'],capabilities:[['Search','Search'],['Ticket request','Ticket request'],['Status','Status'],['Support','Support']]},
    'rent-car':{tagline:['Автомобили, тарифы и трансферы','Vehicles, rates and transfers'],capabilities:[['Fleet','Fleet'],['Quote','Quote'],['Availability','Availability'],['Transfer','Transfer']]},
    taxi:{tagline:['Поездки, диспетчеризация и собственный автопарк','Rides, dispatch and own fleet'],capabilities:[['Ride','Ride'],['Dispatch','Dispatch'],['Driver','Driver'],['Safety','Safety']]},
    concierge:{tagline:['Запросы гостя и персональная помощь','Guest requests and personal assistance'],capabilities:[['Requests','Requests'],['Local help','Local help'],['Status','Status'],['Escalation','Escalation']]},
    cleaning:{tagline:['Уборка, контроль качества и готовность','Cleaning, quality and readiness'],capabilities:[['Assignments','Assignments'],['Execution','Execution'],['Quality','Quality'],['Readiness','Readiness']]},
    laundry:{tagline:['Прачечная и логистика белья','Laundry and linen logistics'],capabilities:[['Pickup','Pickup'],['Processing','Processing'],['Delivery','Delivery'],['Quality','Quality']]},
    ditalia:{tagline:['Ресторан и сервис питания','Restaurant and food service'],capabilities:[['Menu','Menu'],['Reservations','Reservations'],['Room service','Room service'],['Guest add-ons','Guest add-ons']]},
    market:{tagline:['Мини-маркет и повседневные товары','Mini mart and daily essentials'],capabilities:[['Catalog','Catalog'],['Orders','Orders'],['Stock','Stock'],['Delivery','Delivery']]},
    bar:{tagline:['Бар, lounge и гостевой сервис','Bar, lounge and guest service'],capabilities:[['Menu','Menu'],['Reservations','Reservations'],['Orders','Orders'],['Events','Events']]},
    technologies:{tagline:['Платформа, интеграции и цифровые продукты','Platform, integrations and digital products'],capabilities:[['Platform','Platform'],['Integrations','Integrations'],['Observability','Observability'],['Security','Security']]},
    investment:{tagline:['Инвестиции, капитал и активы','Investments, capital and assets'],capabilities:[['Portfolio','Portfolio'],['Deal room','Deal room'],['Capital','Capital'],['Reporting','Reporting']]},
    ventures:{tagline:['Стартапы, партнёрства и venture pipeline','Startups, partnerships and venture pipeline'],capabilities:[['Pipeline','Pipeline'],['Screening','Screening'],['Due diligence','Due diligence'],['Portfolio','Portfolio']]},
    training:{tagline:['Обучение, SOP и стандарты качества','Training, SOPs and quality standards'],capabilities:[['Learning paths','Learning paths'],['SOPs','SOPs'],['Assessments','Assessments'],['Competency','Competency']]},
    'aura-design':{tagline:['Интерьеры, концепции и design coordination','Interiors, concepts and design coordination'],capabilities:[['Concepts','Concepts'],['Materials','Materials'],['Approvals','Approvals'],['Handover','Handover']]}
  };
  const request=id=>{if(!root.VertexGroup?.request)throw new Error('module_unavailable');root.VertexGroup.request(id);};
  const call=(name,method,...args)=>{if(typeof root[name]?.[method]!=='function')throw new Error('module_unavailable');return root[name][method](...args);};
  const adapters={
    operations:()=>call('VertexVisionViews','open'),
    catalog:()=>{document.getElementById('search').scrollIntoView({block:'start',behavior:'auto'});document.getElementById('destination').focus({preventScroll:true});},
    host:()=>call('VertexHostConsole','open','today'),trips:()=>call('VertexRentals','showTrips'),
    journey:()=>call('VertexJourney','open'),packages:()=>call('VertexGroup','builder'),
    taxi:()=>call('VertexTaxi','open'),transfer:()=>call('VertexMobility','openQuote'),
    concierge:()=>call('VertexDemoConcierge','open'),requests:()=>call('VertexGroup','requests'),
    'guest-guide':()=>call('VertexGuestGuide','open'),'service-control':()=>call('VertexCare','dashboard'),
    'property-request':()=>request('propertyBuy'),'engineering-request':()=>request('electrician'),
    'ticket-request':()=>request('flight'),'cleaning-request':()=>request('cleaning'),'laundry-request':()=>request('laundry'),
    'meal-request':()=>request('meal'),'market-request':()=>request('market'),'bar-request':()=>request('bar')
  };
  function close(){dialog.close();activeModule=null;}
  // Escape and native close() must clear state too; a queued close event must not reset a newly opened dialog.
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
    const experience=moduleExperience[module.id];
    if(experience){
      const preview=element('section','vv-module-preview');
      const previewHead=element('div','vv-module-preview-head');
      const previewIcon=element('span','vv-module-preview-icon');previewIcon.innerHTML=iconMarkup(module.id);
      const previewCopy=element('div');previewCopy.append(element('small','',module.status==='active'?tx('ACTIVE RC','ACTIVE RC'):tx('ARCHITECTURE READY · COMING SOON','ARCHITECTURE READY · COMING SOON')),element('strong','',tx(...experience.tagline)));
      previewHead.append(previewIcon,previewCopy);preview.append(previewHead);
      const caps=element('div','vv-capabilities');
      for(const pair of experience.capabilities){const cap=element('div','vv-capability');cap.append(element('span','',tx(...pair)),element('small','',module.status==='active'?tx('Доступность зависит от прав и данных','Subject to permissions & data'):tx('Не активировано','Not activated')));caps.append(cap);}
      preview.append(caps);dialog.append(preview);
    }
    dialog.append(element('p','vv-disclosure',module.status==='active'?tx('Views — активный модуль VERTEX VISION. Ниже доступны проверенные функции Views.','Views is the active VERTEX VISION module. Verified Views functions are available below.'):tx('Coming Soon · Направление уже зарегистрировано в архитектуре VERTEX VISION, но рабочие функции ещё не включены.','Coming Soon · This direction is registered in the VERTEX VISION architecture, but operational functions are not enabled yet.')));
    const meta=element('dl','vv-meta');
    for(const [label,value] of [[tx('Основа','Foundation'),'VISION Core '+core.coreVersion],[tx('Общие сервисы','Shared services'),tx('Клиенты · заказы · задачи · права · аудит','Customers · orders · tasks · permissions · audit')],[tx('Серверный процесс','Backend workflow'),module.backend==='local-tested'?tx('Views → Cleaning проверен локально; не запущен в облаке','Views → Cleaning tested locally; not running in the cloud'):tx('Планируется','Planned')],[tx('Общая база','Shared database'),tx('Целевая PostgreSQL / Supabase; не подключена','Target: PostgreSQL / Supabase; not connected')]]){meta.append(element('dt','',label),element('dd','',value));}
    dialog.append(meta);
    const actions=element('div','vv-actions');
    if(module.status==='active'){
      for(const action of module.actions){const label=labels[action];if(!label)continue;const node=button(tx(...label),()=>navigate(id,action));node.dataset.vvAction=action;actions.append(node);}
    }else actions.append(element('span','vv-coming-soon',tx('Будущая ветка · Coming Soon','Future branch · Coming Soon')));
    dialog.append(actions);
    if(!dialog.open)dialog.showModal();dismiss.focus();return true;
  }
  function cards(){
    const box=document.getElementById('visionModules');if(!box)return;
    box.replaceChildren();
    const search=query.toLocaleLowerCase().trim();
    const items=core.list(domain).filter(m=>[m.id,m.name,m.description.ru,m.description.en].join(' ').toLocaleLowerCase().includes(search));
    const buckets=new Map(categoryOrder.map(id=>[id,[]]));
    for(const item of items)buckets.get(categoryFor(item.domain))?.push(item);
    for(const categoryId of categoryOrder){
      const members=buckets.get(categoryId)||[];if(!members.length)continue;
      const section=element('section','vv-category');section.dataset.vvCategory=categoryId;
      const titleRow=element('div','vv-category-head');titleRow.append(element('h3','',tx(...categoryLabels[categoryId])),element('span','',tx(members.length+' направлений',members.length+' modules')));section.append(titleRow);
      const grid=element('div','vv-category-grid');
      for(const m of members){
        const card=button('',()=>details(m.id),'vv-card');card.dataset.vvOpen=m.id;
        const active=m.status==='active';card.dataset.vvStatus=m.status;if(active)card.classList.add('vv-card-active');
        const head=element('div','vv-card-top');const identity=element('div','vv-card-identity');
        const icon=element('span','vv-card-icon');icon.innerHTML=iconMarkup(m.id);
        identity.append(icon,element('span','vv-card-domain',tx(...groups[m.domain])));
        head.append(identity,element('span','vv-tag '+(active?'':'vv-tag-planned'),active?tx('ACTIVE RC','ACTIVE RC'):tx('ARCHITECTURE READY','ARCHITECTURE READY')));
        const experience=moduleExperience[m.id];
        card.append(head,element('h3','',m.name),element('p','',experience?tx(...experience.tagline):tx(m.description.ru,m.description.en)),element('span','vv-card-link',active?tx('Открыть рабочий модуль →','Open active module →'):tx('Просмотреть концепт →','Preview concept →')));
        grid.append(card);
      }
      section.append(grid);box.append(section);
    }
    document.getElementById('visionCount').textContent=tx('В реестре: '+core.modules.length+' · показано: '+items.length,'Registered: '+core.modules.length+' · shown: '+items.length);
    if(!items.length)box.append(element('p','vv-empty',tx('Направлений по этому запросу нет.','No modules match this search.')));
  }
  function render(){
    home.replaceChildren();
    const hero=element('div','vv-hero');const copy=element('div','vv-hero-copy');
    copy.append(element('p','vv-kicker','VERTEX GROUP / VISION CORE'),element('h1','vv-title',tx('Одна платформа.\nВсе направления.','One platform.\nEvery direction.')),element('p','vv-lead',tx('VERTEX VISION — общая основа. Views и все направления группы — модули единой экосистемы.','VERTEX VISION is the shared foundation. Views and every group direction are modules of one ecosystem.')));
    const shortcuts=element('div','vv-actions');
    for(const [ru,en,id,action] of [['Открыть Views','Open Views','views','operations']]){const b=button(tx(ru,en),()=>navigate(id,action));b.dataset.vvShortcut=id;shortcuts.append(b);}copy.append(shortcuts);
    const foundation=element('div','vv-foundation');foundation.append(element('p','vv-kicker','VISION / CORE '+core.coreVersion),element('h2','',tx('Общее ядро','Shared foundation')));
    const shared=element('div','vv-services');for(const s of core.services)shared.append(element('span','',tx(s.ru,s.en)));foundation.append(shared,element('p','vv-foundation-note',tx('Модули взаимодействуют через ядро и события, а не через чужие таблицы.','Modules communicate through the core and events, not another module’s private tables.')));hero.append(copy,foundation);home.append(hero);
    home.append(element('p','vv-disclosure',tx('RC '+core.version+' · Views активен. Остальные подразделения показаны только как будущие ветки. Облачная staging-база и настоящий вход ещё должны пройти отдельную проверку.','RC '+core.version+' · Views is active. All other divisions are shown only as future branches. Cloud staging and real sign-in still require separate verification.')));
    const statebar=element('div','vv-statebar');statebar.append(element('span','is-active',tx('Views · ACTIVE RC','Views · ACTIVE RC')),element('span','',tx('18 · Coming Soon','18 · Coming Soon')),element('span','',tx('Cloud data · Not connected','Cloud data · Not connected')),element('span','is-ui','Interface 2.0'));home.append(statebar);
    const tools=element('div','vv-tools');const heading=element('div');heading.append(element('h2','',tx('Направления VISION','VISION modules')),element('p','vv-count'));heading.lastChild.id='visionCount';tools.append(heading);
    const filters=element('div','vv-filters');const label=element('label','',tx('Найти направление','Find a module'));const input=element('input');input.id='visionSearch';input.type='search';input.maxLength=120;input.value=query;input.placeholder=tx('Например, клининг','For example, cleaning');input.oninput=()=>{query=input.value;cards();};label.append(input);
    const selectLabel=element('label','',tx('Категория','Category'));const select=element('select');select.id='visionDomain';select.append(new Option(tx('Все направления','All modules'),''));for(const [id,label] of Object.entries(groups))select.append(new Option(tx(...label),id));select.value=domain;select.onchange=()=>{domain=select.value;cards();};selectLabel.append(select);filters.append(label,selectLabel);tools.append(filters);home.append(tools);
    const workspace=element('div','vv-workspace');const content=element('div','vv-content');
    const grid=element('div','vv-grid');grid.id='visionModules';content.append(grid);
    const footer=element('div','vv-map');footer.append(element('strong','','VERTEX VISION'),element('span','',tx('Общее ядро → независимые модули → API и события → единый опыт','Shared core → independent modules → APIs & events → unified experience')),element('small','',tx('JARVIS — отдельный проект / API only. Views — единственный ACTIVE RC.','JARVIS is a separate project / API only. Views is the only ACTIVE RC.')));content.append(footer);
    const message=element('p','vv-message');message.id='visionMessage';message.setAttribute('role','status');content.append(message);
    const today=element('aside','vv-today');today.setAttribute('aria-label',tx('Сегодня','Today'));
    const todayHead=element('div','vv-today-head');todayHead.append(element('div','', ''),element('h2','',tx('Сегодня','Today')),element('p','',tx('Фокус на важном. Только реальные данные.','Stay focused. Real data only.')));today.append(todayHead);
    const todayItems=[
      [tx('Моя работа','My Work'),tx('Нет активных элементов —','No active items —')],
      [tx('Требует внимания','Attention'),tx('Нет подключённых сигналов —','No connected signals —')],
      [tx('Недавнее','Recent'),tx('Нет данных —','No data —')],
      [tx('Избранное','Favorites'),tx('Не выбрано —','Nothing saved —')]
    ];
    for(const pair of todayItems){const item=element('div','vv-today-item');item.append(element('strong','',pair[0]),element('span','',pair[1]));today.append(item);}
    const todayNote=element('div','vv-today-note');todayNote.append(element('strong','','VERTEX VISION'),element('p','',tx('Одна платформа. Независимые направления. Понятный статус каждого модуля.','One platform. Independent directions. Clear status for every module.')));today.append(todayNote);
    workspace.append(content,today);home.append(workspace);
    cards();
    const brand=document.querySelector('header .brand');if(brand){brand.setAttribute('aria-label','VERTEX VISION');brand.replaceChildren(element('span','mark','v'),element('span','vv-wordmark','VERTEX VISION'));brand.onclick=e=>{e.preventDefault();home.scrollIntoView({block:'start',behavior:'auto'});};}
    const oldTitle=document.getElementById('visionViewsBoundary');if(!oldTitle){const boundary=element('div','vv-views-boundary',tx('VERTEX VISION / VIEWS · Проживание и поездки','VERTEX VISION / VIEWS · Stays & journeys'));boundary.id='visionViewsBoundary';home.after(boundary);}else oldTitle.textContent=tx('VERTEX VISION / VIEWS · Проживание и поездки','VERTEX VISION / VIEWS · Stays & journeys');
  }
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&String(event.key).toLowerCase()==='k'){const search=document.getElementById('visionSearch');if(search&&!document.querySelector('dialog[open]')){event.preventDefault();search.focus({preventScroll:true});search.select();}}});
  root.VertexVision=Object.freeze({core,navigate,details,home:()=>home.scrollIntoView({block:'start',behavior:'auto'}),adapters:Object.freeze(Object.keys(adapters))});
  render();new MutationObserver(()=>{const opened=dialog.open?activeModule:null;render();if(opened)details(opened);}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  document.documentElement.dataset.visionReady='true';
  root.dispatchEvent(new CustomEvent('vertex:vision-ready',{detail:{version:core.version}}));
})(window);
