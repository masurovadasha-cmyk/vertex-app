/* Canonical platform registry. Public product metadata only, never tenant data. */
(function(root,factory){
  const core=factory();
  if(typeof module==='object'&&module.exports)module.exports=core;
  if(root&&root.document)root.VertexVisionCore=core;
})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  const VERSION='1.15-demo', REVISION='vision-unified1', CORE_VERSION='1.0.0';
  const entries=[
    ['views','Views Hotel & Apartments','stays','Апартаменты, бронирования и кабинет собственника.','Apartments, reservations and host workspace.','demo','local-tested',['catalog','host','trips']],
    ['managing','Vertex Managing IO','property','Управление объектами и контроль сервиса.','Property operations and service oversight.','demo','planned',['host','service-control']],
    ['real-estate','Vertex Real Estate','property','Покупка, продажа и долгосрочная аренда.','Property purchase, sale and long-term rental.','demo','planned',['property-request']],
    ['engineers','VERTEX Engineers','engineering','Строительство, лифты, HVAC/MEP и инженерный сервис.','Construction, elevators, HVAC/MEP and engineering service.','demo','local-tested',['engineering-request'],'0.2.0'],
    ['aura-design','Aura Design Studio','property','Интерьеры, проектирование и дизайн.','Interiors, project planning and design.','planned','planned',[]],
    ['travel','Vertex Travel','travel','Турпакеты, экскурсии и единый план поездки.','Travel packages, excursions and journey planning.','demo','planned',['journey','packages']],
    ['aviation','Vertex Aviation / Авиакасса','travel','Запрос билетов: авиа, железная дорога и автобусы.','Ticket requests for flights, trains and buses.','demo','planned',['ticket-request']],
    ['rent-car','Vertex Rent Car','mobility','Аренда автомобилей и расчёт трансфера.','Car rental and transfer estimates.','demo','planned',['transfer']],
    ['taxi','Vertex Taxi','mobility','Заявки на собственный автопарк и диспетчерская демо.','Own-fleet requests and demonstration dispatch.','demo','planned',['taxi']],
    ['concierge','Concierge Service','services','Помощь гостю, заявки и гид перед заселением.','Guest assistance, requests and check-in guide.','demo','planned',['concierge','requests','guest-guide']],
    ['cleaning','Vertex Cleaning','services','Уборка, назначение сотрудника и контроль качества.','Cleaning, assignment and quality review.','demo','local-tested',['cleaning-request','requests']],
    ['laundry','Vertex Laundry','services','Прачечная и запросы гостей на обработку вещей.','Laundry and guest garment-care requests.','demo','planned',['laundry-request']],
    ['ditalia','D’italia Ristorante','hospitality','Ресторанное направление и демо-заявки на питание.','Restaurant direction and demonstration meal requests.','demo','planned',['meal-request']],
    ['market','V-Market / Mini Mart','hospitality','Мини-маркет в хабе и запросы на товары.','Hub mini-market and product requests.','demo','planned',['market-request']],
    ['bar','Vertex Bar & Lounge','hospitality','Бар, лаунж и обслуживание в хабе.','Bar, lounge and hub service.','demo','planned',['bar-request']],
    ['technologies','Vertex Technologies','technology','Разработка платформы, интеграции и цифровые продукты.','Platform engineering, integrations and digital products.','planned','planned',[]],
    ['investment','Vertex Investment','capital','Инвестиционные проекты и активы группы.','Group investment projects and assets.','planned','planned',[]],
    ['ventures','Vertex Ventures','capital','Стартапы, партнёрства и венчурное направление.','Startups, partnerships and venture development.','planned','planned',[]],
    ['training','Views Training Center','education','Обучение команды и стандарты качества.','Team training and service standards.','planned','planned',[]]
  ];
  const modules=entries.map(([id,name,domain,ru,en,mode,backend,actions,version='0.1.0'])=>({
    id,name,domain,description:{ru,en},parent:'vertex-vision',core:'1.x',version,
    dependencies:['vision-core'],mode,backend,cloudEnabled:false,actions,
    dataBoundary:{identity:'vision-core',organization:'vision-core',orders:'vision-core',tasks:'vision-core',audit:'vision-core',privateSchema:id.replaceAll('-','_')}
  }));
  function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
  function validate(items){
    if(!Array.isArray(items)||!items.length)throw new Error('module_registry_required');
    const ids=new Set();
    for(const item of items){
      if(!item||!/^([a-z][a-z0-9]*)(-[a-z0-9]+)*$/.test(item.id)||ids.has(item.id))throw new Error('invalid_or_duplicate_module');
      ids.add(item.id);
      if(item.parent!=='vertex-vision'||item.core!=='1.x')throw new Error('invalid_module_parent');
      if(!Array.isArray(item.dependencies)||item.dependencies.length!==1||item.dependencies[0]!=='vision-core')throw new Error('business_module_coupling_forbidden');
      if(!['demo','planned'].includes(item.mode)||!['planned','local-tested'].includes(item.backend)||item.cloudEnabled!==false)throw new Error('unverified_cloud_capability');
      if(!Array.isArray(item.actions)||item.actions.some(a=>!/^([a-z]+)(-[a-z]+)*$/.test(a))||new Set(item.actions).size!==item.actions.length)throw new Error('invalid_module_actions');
      if(item.mode==='planned'&&item.actions.length)throw new Error('planned_module_cannot_launch');
      if(typeof item.name!=='string'||!item.description?.ru||!item.description?.en)throw new Error('module_copy_required');
    }
    return true;
  }
  validate(modules);freeze(modules);
  const byId=new Map(modules.map(item=>[item.id,item]));
  const services=freeze([
    {id:'identity',ru:'Пользователи и права',en:'Identity & permissions'},
    {id:'organizations',ru:'Компании и объекты',en:'Organizations & properties'},
    {id:'customers',ru:'Клиенты и услуги',en:'Customers & services'},
    {id:'work',ru:'Заказы и задачи',en:'Orders & tasks'},
    {id:'events',ru:'События и интеграции',en:'Events & integrations'},
    {id:'audit',ru:'Аудит и качество',en:'Audit & quality'}
  ]);
  return freeze({
    id:'vertex-vision',name:'VERTEX VISION',group:'Vertex Group',version:VERSION,revision:REVISION,coreVersion:CORE_VERSION,
    modules,services,validate,
    module:id=>typeof id==='string'?byId.get(id)||null:null,
    list:domain=>modules.filter(m=>!domain||m.domain===domain),
    canLaunch:(id,action)=>!!byId.get(id)?.actions.includes(action),
    readiness:()=>({mode:'local-demo',sharedDatabase:'not-connected',authenticated:false,payments:false,notifications:false,productionReady:false,jarvis:'separate-project'})
  });
});
