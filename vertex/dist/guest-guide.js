(function(root){
'use strict';
if(typeof module==='object'&&module.exports){
  module.exports={rules:{
    accessCode:'arrival-day-before-14:00',
    smoking:'balcony-only',
    quietWeekday:'23:00',
    quietWeekend:'22:00',
    pets:'approval-required',
    parking:['ground','underground']
  }};
  return;
}
if(!root.document)return;

const t=(ru,en)=>document.documentElement.lang==='en'?en:ru;
const entry=document.createElement('section');
entry.className='guest-guide-entry';
entry.innerHTML='<div><span class="eyebrow">VERTEX GUEST GUIDE</span><h2 id="guestGuideTitle"></h2><p id="guestGuideCopy"></p></div><button class="outline" id="guestGuideOpen"></button>';
document.querySelector('footer').before(entry);

function open(){
  modal(t('Гид гостя','Guest guide'),`
    <p class="notice">${t('Инструкция для демо Views Hotel & Apartments. Для конкретной квартиры итоговые детали подтверждаются в сообщении перед заселением.','Demo guidance for Views Hotel & Apartments. Final property-specific details are confirmed in the pre-arrival message.')}</p>
    <div class="guest-guide-grid">
      <article><strong>${t('Заселение','Check-in')}</strong><p>${t('Код доступа отправляется в день заселения до 14:00. Не передавайте код посторонним.','The access code is sent on the arrival day before 14:00. Do not share it with third parties.')}</p></article>
      <article><strong>${t('Шторы','Curtains')}</strong><p>${t('В апартаментах с электрошторами используйте пульт управления.','Use the remote control in apartments equipped with electric curtains.')}</p></article>
      <article><strong>${t('Курение','Smoking')}</strong><p>${t('Курение допускается только на балконе, если он предусмотрен объектом.','Smoking is allowed only on the balcony, when the property has one.')}</p></article>
      <article><strong>${t('Тишина','Quiet hours')}</strong><p>${t('Будни — после 23:00, выходные — после 22:00. Уважайте соседей и правила дома.','Weekdays — after 23:00, weekends — after 22:00. Please respect neighbours and building rules.')}</p></article>
      <article><strong>${t('Семья и дети','Families & children')}</strong><p>${t('Семейное размещение доступно. Дополнительная кровать — по предварительному запросу.','Family stays are welcome. An extra bed is available by advance request.')}</p></article>
      <article><strong>${t('Животные','Pets')}</strong><p>${t('Размещение с животными — только по предварительному согласованию.','Pets are accepted only with prior approval.')}</p></article>
      <article><strong>${t('Парковка','Parking')}</strong><p>${t('Наземная и подземная парковка зависят от объекта и доступности.','Ground and underground parking depend on the property and availability.')}</p></article>
      <article><strong>Wi-Fi</strong><p>${t('Данные Wi-Fi предоставляются вместе с инструкцией по заселению.','Wi-Fi details are provided with the check-in instructions.')}</p></article>
      <article><strong>24/7</strong><p>${t('Помощь гостям доступна круглосуточно через команду Views / Vertex.','Guest assistance is available 24/7 through the Views / Vertex team.')}</p></article>
    </div>
    <h3>${t('Нужна услуга?','Need a service?')}</h3>
    <div class="guest-guide-actions">
      <button class="outline" data-guide-service="cleaning">${t('Клининг','Cleaning')}</button>
      <button class="outline" data-guide-service="laundry">${t('Прачечная','Laundry')}</button>
      <button class="outline" data-guide-service="car">${t('Трансфер / авто','Transfer / car')}</button>
      <button class="outline" data-guide-service="concierge">${t('Консьерж / доп. кровать / животные','Concierge / extra bed / pets')}</button>
    </div>
  `);
  document.querySelectorAll('[data-guide-service]').forEach(button=>button.onclick=()=>{
    const id=button.dataset.guideService;
    document.getElementById('modal').close();
    if(window.VertexGroup?.request)window.VertexGroup.request(id);
  });
}
function refresh(){
  document.getElementById('guestGuideTitle').textContent=t('Всё важное перед заселением','Everything you need before check-in');
  document.getElementById('guestGuideCopy').textContent=t('Доступ, правила квартиры и быстрый запрос услуг в одном месте.','Access, house rules and quick service requests in one place.');
  document.getElementById('guestGuideOpen').textContent=t('Открыть гид гостя','Open guest guide');
}
document.getElementById('guestGuideOpen').onclick=open;
new MutationObserver(refresh).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
root.VertexGuestGuide={open};
refresh();
})(typeof window==='undefined'?globalThis:window);
