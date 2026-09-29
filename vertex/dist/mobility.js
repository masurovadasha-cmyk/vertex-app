(function(root){
'use strict';

function quoteTransfer(km){
  const distance=Number(km);
  if(!Number.isFinite(distance)||distance<=0||distance>1000)throw new Error('Invalid distance');
  if(distance<=5)return 5;
  if(distance<=10)return 10;
  return Math.round((10+(distance-10)*1.5)*100)/100;
}

if(typeof module==='object'&&module.exports){module.exports={quoteTransfer};return;}
if(!root.document)return;

const t=(ru,en)=>document.documentElement.lang==='en'?en:ru;
const entry=document.createElement('section');
entry.className='mobility-entry';
entry.innerHTML='<div class="mobility-head"><div><span class="eyebrow">VERTEX MOBILITY</span><h2 id="mobilityTitle"></h2><p id="mobilityCopy"></p></div><button class="dark" id="mobilityQuote"></button></div><div class="mobility-fleet"><article><span class="mobility-icon">◇</span><h3>Leapmotor C16</h3><p id="c16Copy"></p><strong id="c16Fleet"></strong></article><article><span class="mobility-icon">◇</span><h3>Leapmotor C01</h3><p id="c01Copy"></p><strong id="c01Fleet"></strong></article><article><span class="mobility-icon">↗</span><h3 id="transferCardTitle"></h3><p id="transferCardCopy"></p><strong id="transferRates"></strong></article></div>';
document.querySelector('footer').before(entry);

function refresh(){
  document.getElementById('mobilityTitle').textContent=t('Трансфер и авто — в одной поездке','Transfers and cars in one trip');
  document.getElementById('mobilityCopy').textContent=t('Флот Vertex для трансферов и аренды. Доступность подтверждает оператор.','Vertex fleet for transfers and car rental. Availability is confirmed by the operator.');
  document.getElementById('mobilityQuote').textContent=t('Рассчитать трансфер','Estimate transfer');
  document.getElementById('c16Copy').textContent=t('7-местный кроссовер · семейные и групповые поездки','7-seat crossover · family and group travel');
  document.getElementById('c16Fleet').textContent=t('2 автомобиля · по запросу','2 vehicles · on request');
  document.getElementById('c01Copy').textContent=t('Комфортный седан · город и бизнес-поездки','Comfort sedan · city and business travel');
  document.getElementById('c01Fleet').textContent=t('2 автомобиля · по запросу','2 vehicles · on request');
  document.getElementById('transferCardTitle').textContent=t('Тариф трансфера','Transfer tariff');
  document.getElementById('transferCardCopy').textContent=t('До 5 км — $5 · до 10 км — $10 · далее +$1.5/км','Up to 5 km — $5 · up to 10 km — $10 · then +$1.5/km');
  document.getElementById('transferRates').textContent=t('Финальную стоимость подтверждает оператор','Final price is confirmed by the operator');
}
function openQuote(){
  if(root.VertexTaxi)return root.VertexTaxi.open();
  modal(t('Vertex Mobility · расчёт','Vertex Mobility · estimate'),`<p class="notice">${t('Расчёт демонстрационный и не является подтверждением машины или заказа. Маршрут, ожидание, парковка и дополнительные условия подтверждаются оператором.','This is a demo estimate and does not confirm a vehicle or booking. Route, waiting time, parking and extra conditions are confirmed by the operator.')}</p><form id="mobilityForm" class="mobility-form"><label>${t('Расстояние, км','Distance, km')}<input id="mobilityKm" type="number" min="1" max="1000" step="0.1" value="10" required></label><label>${t('Автомобиль','Vehicle')}<select id="mobilityVehicle"><option value="C16">Leapmotor C16 · 7 seats</option><option value="C01">Leapmotor C01</option></select></label><div class="mobility-total"><span>${t('Ориентировочно','Estimated')}</span><strong id="mobilityTotal">$10</strong></div><p id="mobilityFormula" class="demo"></p><button class="dark wide" type="submit">${t('Создать демо-заявку','Create demo request')}</button></form>`);
  const form=document.getElementById('mobilityForm'), km=document.getElementById('mobilityKm');
  const update=()=>{
    try{
      const value=quoteTransfer(km.value);
      document.getElementById('mobilityTotal').textContent='$'+new Intl.NumberFormat(document.documentElement.lang==='en'?'en-US':'ru-RU',{maximumFractionDigits:2}).format(value);
      document.getElementById('mobilityFormula').textContent=Number(km.value)>10?t('$10 за первые 10 км + $1.5 за каждый следующий км.','$10 for the first 10 km + $1.5 for each additional km.'):Number(km.value)>5?t('Фиксированный ориентир до 10 км.','Fixed reference up to 10 km.'):t('Фиксированный ориентир до 5 км.','Fixed reference up to 5 km.');
    }catch{
      document.getElementById('mobilityTotal').textContent=t('Проверьте расстояние','Check distance');
      document.getElementById('mobilityFormula').textContent='';
    }
  };
  km.oninput=update; update();
  form.onsubmit=e=>{
    e.preventDefault();
    let value;try{value=quoteTransfer(km.value);}catch{return update();}
    const vehicle=document.getElementById('mobilityVehicle').value;
    const note=t('Трансфер','Transfer')+`: ${km.value} km · ${vehicle} · ~$${value}`;
    if(window.VertexGroup?.request){
      document.getElementById('modal').close();
      window.VertexGroup.request('car');
      const textarea=document.getElementById('groupNote');if(textarea)textarea.value=note;
    }else{
      modal(t('Демо-заявка','Demo request'),`<p>${note}</p><p class="notice">${t('Заявка не отправлена. Реальный модуль диспетчеризации будет подключён через backend.','The request was not sent. Real dispatch will be connected through the backend.')}</p>`);
    }
  };
}
document.getElementById('mobilityQuote').onclick=openQuote;
new MutationObserver(refresh).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
root.VertexMobility={quoteTransfer,openQuote};
refresh();
})(typeof window==='undefined'?globalThis:window);
