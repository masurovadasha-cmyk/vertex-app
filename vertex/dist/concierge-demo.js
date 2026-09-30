/* Local demonstration only: no API calls, keys, bookings or messages to operators. */
(function(root){
  'use strict';
  function reply(question, context={}) {
    const q=String(question||'').trim().toLowerCase();
    const en=/[а-яё]/i.test(q)?false:context.lang?context.lang==='en':/[a-z]/i.test(q);
    const say=(ru,eng)=>en?eng:ru;
    const format=(value,currency='UZS')=>{
      if(value==null||!Number.isFinite(value))return say('Уточнить','Enquire');
      if(typeof context.money==='function')return context.money(value,currency);
      if(typeof money==='function')return money(value,currency);
      return new Intl.NumberFormat(en?'en-US':'ru-RU',{style:'currency',currency,maximumFractionDigits:currency==='UZS'?0:2}).format(value);
    };
    const catalog=context.catalog||root.VertexCatalog||{};
    const listings=context.stays||catalog.stays||catalog.listings||(typeof stays!=='undefined'?stays:[]);
    const cities=Array.isArray(catalog.cities)?catalog.cities:[];
    if(!q)return say('Напишите вопрос о поездке по Узбекистану.','Ask a question about your Uzbekistan trip.');
    if(/(?:код|парол|wi[ -]?fi|вай[ -]?фай|door|password|access code)/i.test(q))return say('Коды двери и пароли Wi-Fi предоставляет хозяин через защищённый канал. Не отправляйте сюда секретные коды.','Your host provides door codes and Wi-Fi passwords through a secure channel. Do not enter secret codes here.');
    if(/(?:экстренн|пожар|скорую|опасност|emergency|fire|ambulance)/i.test(q))return say('Если есть непосредственная опасность, обратитесь в местную экстренную службу. Этот демо-чат не вызывает помощь и не связывает с оператором.','If you are in immediate danger, contact local emergency services. This demo chat cannot dispatch help or contact an operator.');
    const normalized=q.replace(/[\p{P}\p{S}]/gu,' ').replace(/\s+/g,' ').trim();
    const learned=(Array.isArray(context.learned)?context.learned:[]).find(x=>typeof x.question==='string'&&typeof x.answer==='string'&&x.question.toLowerCase().replace(/[\p{P}\p{S}]/gu,' ').replace(/\s+/g,' ').trim()===normalized);
    if(learned)return say('Сохранённый вами ответ · актуальность цены уточните:\n','Your saved answer · please confirm any price is current:\n')+learned.answer;
    const answers=[];
    const serviceQuestions=[
      [/(?:такси|трансфер|аэропорт|taxi|transfer|airport)/i,'Трансфер и такси: стоимость уточняется у поставщика по маршруту и времени. Откройте «Транспорт» → «Уточнить». Водитель не вызывается автоматически.','Transfers and taxis: ask the provider for a price for your route and time. Open Transport → Enquire. No driver is dispatched automatically.'],
      [/(?:завтрак|питан|ресторан|еда|поесть|breakfast|restaurant|food|meal)/i,'Завтрак и ресторан: стоимость, меню, аллергены и время доставки уточняются у поставщика. Раздел «Еда и маркет».','Breakfast and restaurants: confirm prices, menus, allergens and delivery times with the provider. Open Food & market.'],
      [/(?:прач|стир|постирать|laundry|wash)/i,'Прачечная: стоимость, допустимый объём и сроки уточняются. Откройте «Сервисы».','Laundry: enquire about prices, load limits and turnaround times. Open Services.'],
      [/(?:магазин|маркет|продукт|grocer|market|\bbar\b|(?:^|\s)бар(?:е|а|у|ом)?(?:\s|[?.!,]|$)|коктейл|cocktail)/i,'Магазины и бар: состав заказа и стоимость уточняются у поставщика. Откройте «Еда и маркет».','Shops and bars: confirm the order and price with the provider. Open Food & market.'],
      [/(?:авиа|самолет|самолёт|перел[её]т|flight|air ticket|жд|ж\/д|железнодорож|rail|train|(?:^|\s)поезд(?:\s|$))/i,'Билеты: тарифы, расписание, багаж и наличие мест уточняются у перевозчика. Откройте «Билеты»; покупка автоматически не выполняется.','Tickets: confirm fares, schedules, baggage and availability with the carrier. Open Tickets; no purchase is made automatically.'],
      [/(?:аренд.*(?:авто|машин)|rent.*car|car rental)/i,'Аренда авто: стоимость, депозит, страховка и условия уточняются у поставщика. Откройте «Транспорт».','Car rental: confirm prices, deposit, insurance and terms with the provider. Open Transport.']
    ];
    let serviceMatch=false;
    serviceQuestions.forEach(([pattern,ru,english])=>{if(pattern.test(q)){serviceMatch=true;answers.push(say(ru,english));}});
    if(/(?:экскурс|гид|достопримеч|посмотреть|маршрут|tour|guide|sight|itinerary|visit)/i.test(q)){
      serviceMatch=true;
      answers.push(say('В «Обзоре» выберите город: Ташкент — Tashkent City, Самарканд — Регистан, Бухара — Ляби-Хауз, Хива — Ичан-Кала. Ссылки ищут место по названию. Стоимость гида и экскурсии, часы работы и билеты нужно уточнить.','In Explore, choose a city: Tashkent — Tashkent City, Samarkand — Registan, Bukhara — Lyabi-Hauz, Khiva — Itchan Kala. Links search by place name. Confirm guide and tour prices, opening hours and admission.'));
    }
    if(/(?:заезд|выезд|заселен|заселён|check.?in|check.?out|даты|dates)/i.test(q)){
      const {arrival,departure}=context.dates||{};
      const valid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'');
      answers.push(valid(arrival)&&valid(departure)?say('В поиске выбраны даты: '+arrival+' → '+departure+'. Время заезда, выезда и доступность подтвердите у хозяина.','Your search dates: '+arrival+' → '+departure+'. Confirm check-in, check-out and availability with the host.'):say('Выберите даты заезда и выезда в поиске. Точное время и доступность подтвердите у хозяина.','Choose check-in and check-out dates in search. Confirm times and availability with the host.'));
    }
    const cityPatterns={Tashkent:/ташкент|tashkent|toshkent/i,Samarkand:/самарканд|samarkand|samarqand/i,Bukhara:/бухар|bukhara|buxoro/i,Khiva:/хив|khiva|xiva/i};
    const matchedCity=Object.keys(cityPatterns).find(id=>cityPatterns[id].test(q));
    const propertyPatterns=[[/modern\s*design|модерн/i,'modern design'],[/urban\s*garden|урбан/i,'urban garden'],[/peach|персик|пич/i,'peach'],[/panoramic|панорам/i,'panoramic'],[/u\s*tower|ю\s*тауэр/i,'u tower'],[/nest\s*one|нест\s*уан/i,'nest one'],[/boulevard|бульвар/i,'boulevard'],[/gardens|гарденс/i,'gardens'],[/views|вьюс|firdavsiy|фирдавс/i,'views']];
    const property=propertyPatterns.find(([pattern])=>pattern.test(q));
    if(matchedCity||property||/(?:жиль|апартамент|квартир|stay|apartment|accommodation)/i.test(q)||(!serviceMatch&&/(?:цен|стоим|price|cost)/i.test(q))){
      const selected=listings.filter(stay=>(!matchedCity||stay.city===matchedCity)&&(!property||(String(stay.ru)+' '+String(stay.en)+' '+(property[1]==='views'?String(stay.host):'')).toLowerCase().includes(property[1])));
      const rows=selected.slice(0,8).map(stay=>{
        const city=cities.find(city=>city.id===stay.city);
        const cityName=city?(en?city.en:city.ru):stay.city;
        const source=stay.sourceName||say('источник уточняется','source to be confirmed');
        const capacity=Number.isInteger(stay.capacity)&&stay.capacity>0?say(' · вместимость: ',' · capacity: ')+stay.capacity:say(' · вместимость уточняется',' · capacity on request');
        const quote=stay.quote;
        const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T00:00:00Z'));
        if(quote&&validDate(quote.arrival)&&validDate(quote.departure)&&quote.departure>quote.arrival&&Number.isInteger(quote.guests)&&quote.guests>0&&(Number.isFinite(quote.total)||quote.unavailable===true||stay.unavailable===true)){
          const matches=quote.arrival===context.dates?.arrival&&quote.departure===context.dates?.departure&&quote.guests===Number(context.guests);
          const unavailable=quote.unavailable===true||stay.unavailable===true;
          const amount=unavailable?say('при проверке не было доступности','unavailable when checked'):new Intl.NumberFormat(en?'en-US':'ru-RU',{maximumFractionDigits:2}).format(quote.total)+' '+(quote.currency||'USD')+say(' всего',' total');
          const checked=quote.checkedAt?say(' · проверено ',' · checked ')+String(quote.checkedAt).slice(0,10):'';
          return (en?stay.en:stay.ru)+' · '+cityName+capacity+' — '+source+': '+amount+' · '+quote.arrival+' → '+quote.departure+say(' · гостей: ',' · guests: ')+quote.guests+checked+'. '+(matches?say('Параметры совпадают с поиском; актуальность уточните.','These details match your search; confirm they are still current.'):say('Это другие даты или число гостей; для вашего запроса нужен новый расчёт.','These dates or guest count differ from your search; your request needs a new quote.'))+' '+say('Справка только для указанной поездки, не тариф за ночь.','Reference for this trip only, not a nightly rate.');
        }
        const checked=stay.priceCheckedAt?say(' · проверено ',' · checked ')+String(stay.priceCheckedAt).slice(0,10):'';
        return (en?stay.en:stay.ru)+' · '+cityName+capacity+' — '+format(stay.price,stay.currency||'UZS')+' ('+source+checked+')';
      });
      answers.push(rows.length?rows.join('\n')+'\n'+say('Это сведения из текущего каталога. Откройте карточку апартаментов; цену на ваши даты и наличие подтвердите у хозяина.','These are entries from the current catalog. Open the apartment details; confirm the price for your dates and availability with the host.'):say('Для этого запроса пока нет подтверждённых объектов в каталоге. Выберите город в поиске; стоимость и доступность уточняются у хозяина.','There are no confirmed listings for this request yet. Choose a city in search; ask the host about prices and availability.'));
    }
    if(/(?:итог|корзин|бюджет|вся поездка|мо[яю] поездк|total|cart|budget|my trip)/i.test(q)){
      const items=Array.isArray(context.items)?context.items:[];
      const totals=new Map();
      items.forEach(item=>{if(Number.isFinite(item.amount))totals.set(item.currency||'UZS',(totals.get(item.currency||'UZS')||0)+item.amount);});
      const total=[...totals].map(([currency,value])=>format(value,currency)).join(' / ')||say('Уточнить','Enquire');
      const journey=context.journey||root.VertexJourney?.summary?.()||{};
      const count=key=>Number.isInteger(journey[key])&&journey[key]>=0?journey[key]:0;
      const hasJourney=['bookings','packages','tasks','care','plannedStops'].some(key=>count(key)>0);
      if(hasJourney){
        const summary=say('В вашей поездке сохранено: заявки жилья — '+count('bookings')+', турпакеты — '+count('packages')+', активные задачи — '+count('tasks')+', обращения — '+count('care')+', пункты маршрута — '+count('plannedStops')+'.','Your saved journey: stay requests — '+count('bookings')+', packages — '+count('packages')+', active tasks — '+count('tasks')+', care requests — '+count('care')+', itinerary stops — '+count('plannedStops')+'.');
        const cartSummary=items.length?say(' Отдельная корзина: '+items.length+' позиций, '+total+' по указанным ценам.',' Separate cart: '+items.length+' items, '+total+' at listed prices.'):'';
        answers.push(summary+cartSummary+say(' Откройте «Поездки», чтобы проверить маршрут, бюджет и заявки. Общая стоимость требует подтверждения; локальные заявки не являются бронированиями или оплатой.',' Open Trips to review your itinerary, budget and requests. Overall costs require confirmation; local requests are not bookings or payments.'));
      }else answers.push(items.length?say('В корзине '+items.length+' позиций. Сумма по указанным ценам: '+total+'. Откройте «Поездки», чтобы проверить состав. Ничего не забронировано и не оплачено.','Your cart has '+items.length+' items. Total for listed prices: '+total+'. Open Trips to review them. Nothing is booked or paid.'):say('Корзина пока пуста. Нажмите «Подобрать апартаменты», чтобы выбрать жильё в Ташкенте. Стоимость услуг уточняется отдельно.','Your cart is empty. Choose Find an apartment to explore stays in Tashkent. Enquire about service prices separately.'));
    }
    if(/(?:оплат|заброни|отмен|возврат|book|pay|cancel|refund)/i.test(q))answers.push(say('Приложение помогает выбрать объект и сохранить локальный запрос. Бронирование и цену подтверждает хозяин; списания денег и возврата в демо нет. Не вводите данные банковской карты.','The app helps you choose a listing and save a local request. The host confirms the booking and price; the demo does not charge or refund payments. Do not enter card details.'));
    if(answers.length)return answers.slice(0,4).join('\n\n');
    if(/(?:привет|здравств|hello|hi\b|hey)/i.test(q))return say('Здравствуйте! Я демо-консьерж Vertex по Узбекистану. Помогу найти апартаменты в Ташкенте и сориентироваться в Самарканде, Бухаре и Хиве. Спросите об объекте, датах или услугах.','Hello! I am the Vertex demo concierge for Uzbekistan. I can help with Tashkent apartments and exploring Samarkand, Bukhara and Khiva. Ask about a listing, dates or services.');
    if(/(?:спасибо|thank)/i.test(q))return say('Пожалуйста! Чем ещё помочь с поездкой по Узбекистану?','You are welcome! What else do you need for your Uzbekistan trip?');
    return say('Спросите об апартаментах Views, U Tower, Nest One, Boulevard или Gardens, городах Узбекистана, датах и услугах. Справочные суммы относятся только к указанной поездке; цену на ваши даты и услуги нужно уточнить. Это ответы по каталогу, без подключения OpenAI.','Ask about Views, U Tower, Nest One, Boulevard or Gardens apartments, Uzbekistan cities, dates or services. Reference totals apply only to the stated trip; ask for current prices for your dates and services. These are catalog-based replies without OpenAI.');
  }
  if(typeof module==='object'&&module.exports){module.exports={reply};return;}
  root.VertexDemoConcierge={reply};
  const ui=()=>typeof lang!=='undefined'&&lang==='en';
  const text=(ru,en)=>ui()?en:ru;
  const dialog=document.createElement('dialog');dialog.id='conciergeDemo';dialog.setAttribute('aria-labelledby','conciergeHeading');
  dialog.innerHTML='<div class="concierge-head"><div><small>VERTEX · DEMO</small><h2 id="conciergeHeading"></h2></div><button type="button" id="conciergeClose">✕</button></div><p id="conciergeDisclosure"></p><div id="conciergeMessages" role="log" aria-live="polite" aria-relevant="additions"></div><div id="conciergeSuggestions"></div><form id="conciergeForm"><label for="conciergeQuestion" id="conciergeLabel"></label><div class="concierge-compose"><input id="conciergeQuestion" required maxlength="1000" autocomplete="off"><button class="dark" id="conciergeSend" type="submit"></button></div></form>';
  document.body.append(dialog);
  const get=id=>dialog.querySelector('#'+id);
  const history=[];
  function add(side,value){history.push({side,value});if(history.length>60)history.shift();draw();}
  function draw(){const box=get('conciergeMessages');box.replaceChildren();history.forEach(m=>{const bubble=document.createElement('div');bubble.className='concierge-bubble '+m.side;const label=document.createElement('strong');label.textContent=m.side==='guest'?text('Вы','You'):text('Демо-консьерж','Demo concierge');const p=document.createElement('p');p.textContent=m.value;bubble.append(label,p);box.append(bubble);});box.scrollTop=box.scrollHeight;}
  function send(value){const question=String(value).trim().slice(0,1000);if(!question)return;add('guest',question);const answer=reply(question,{lang:ui()?'en':'ru',items:typeof cart!=='undefined'?cart:[],journey:root.VertexJourney?.summary?.(),learned:root.VertexConciergeLearning?.entries()||[],catalog:root.VertexCatalog,guests:Number(document.getElementById('guests')?.value),dates:{arrival:document.getElementById('arrival')?.value,departure:document.getElementById('departure')?.value}});add('assistant',answer);root.dispatchEvent(new CustomEvent('vertex-concierge-answer',{detail:{question,answer}}));get('conciergeQuestion').value='';get('conciergeQuestion').focus();}
  function open(){get('conciergeHeading').textContent=text('ИИ-консьерж · демо','AI concierge · demo');get('conciergeDisclosure').textContent=text('Готовые ответы по каталогу. Без OpenAI, оператора и реальных заказов. Переписка существует только до обновления страницы.','Catalog-based replies. No OpenAI, human operator or real orders. Conversation lasts until the page is refreshed.');get('conciergeClose').setAttribute('aria-label',text('Закрыть консьержа','Close concierge'));get('conciergeLabel').textContent=text('Ваш вопрос','Your question');get('conciergeQuestion').placeholder=text('Например: нужен трансфер и завтрак','For example: I need a transfer and breakfast');get('conciergeSend').textContent=text('Отправить','Send');const prompts=ui()?['Tashkent apartments','Airport transfer','My trip total','City tour']:['Апартаменты в Ташкенте','Уточнить трансфер','Итого в корзине','Экскурсия по городу'];get('conciergeSuggestions').replaceChildren(...prompts.map(p=>{const b=document.createElement('button');b.type='button';b.textContent=p;b.onclick=()=>send(p);return b;}));if(!history.length)add('assistant',reply(ui()?'Hello':'Здравствуйте'));else draw();if(!dialog.open)dialog.showModal();get('conciergeQuestion').focus();}
  get('conciergeClose').onclick=()=>dialog.close();get('conciergeForm').onsubmit=e=>{e.preventDefault();send(get('conciergeQuestion').value);};
  const launcher=document.createElement('button');launcher.id='conciergeLauncher';launcher.type='button';launcher.className='dark';launcher.onclick=open;
  document.querySelector('aside').prepend(launcher);
  const updateLabel=()=>{launcher.textContent=text('✧ Спросить ИИ-консьержа · демо','✧ Ask the AI concierge · demo');};updateLabel();
  document.getElementById('language').addEventListener('click',updateLabel);
  new MutationObserver(updateLabel).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  root.VertexDemoConcierge.open=open;
})(typeof window==='undefined'?globalThis:window);
