// Owner profiles supplied by the owner; public listing details checked 29 September 2026.
// Quotes are dated Airbnb observations, not a tariff or a promise of availability.
(() => {
  const checkedAt = '2026-09-29';
  const airbnb = (room, total, unavailable = false) => ({
    total, currency: 'USD', arrival: '2026-10-12', departure: '2026-10-15',
    guests: 2, checkedAt, unavailable
  });
  const shared = {city:'Tashkent',price:null,currency:'UZS',ownerConfirmed:true,
    host:'Views Hotel & Apartments',hostEn:'Views Hotel & Apartments',wifi:true,checkedAt,
    type:'Квартира',bedrooms:1,bathrooms:1};
  window.VertexOwnedStays = [
    {...shared,id:'airbnb-1772624665100620734',ru:'Views · Modern Design',en:'Views · Modern Design',capacity:2,
      photo:'views-modern-1.avif',photos:['views-modern-1.avif','views-modern-2.avif','views-modern-3.avif'],
      sourceName:'Airbnb',quote:airbnb('1772624665100620734',268),
      description:'Современные апартаменты с окнами от пола до потолка и видом на Ташкент. Отдельная спальня, кухня, кондиционер, Wi-Fi и самостоятельное заселение.',
      descriptionEn:'Modern apartment with floor-to-ceiling windows and Tashkent views. A separate bedroom, kitchen, air conditioning, Wi-Fi and self check-in.'},
    {...shared,id:'airbnb-1771969006287092719',ru:'Views · Urban Garden',en:'Views · Urban Garden',capacity:4,
      photo:'views-garden-1.avif',photos:['views-garden-1.avif','views-garden-2.avif','views-garden-3.avif'],
      sourceName:'Airbnb',quote:airbnb('1771969006287092719',264),
      description:'Апартаменты с собственным балконом, деревянными деталями и зелёными акцентами. Кухня, Wi-Fi, кондиционер и самостоятельное заселение. Название Urban Garden не означает ЖК Gardens Residence.',
      descriptionEn:'An apartment with a private balcony, wood details and green accents. Kitchen, Wi-Fi, air conditioning and self check-in. The name Urban Garden does not identify it as Gardens Residence.'},
    {...shared,id:'airbnb-1769878950462437449',ru:'Views · Peach & Cream',en:'Views · Peach & Cream',capacity:3,
      photo:'views-peach-1.avif',photos:['views-peach-1.avif','views-peach-2.avif','views-peach-3.avif'],
      sourceName:'Airbnb',quote:airbnb('1769878950462437449',240),
      description:'Дизайнерские апартаменты в персиковых и кремовых тонах. Спальня и диван-кровать в гостиной, оборудованная кухня, Wi-Fi, стиральная и сушильная машины.',
      descriptionEn:'Designer interiors in peach and cream tones. A bedroom and a sofa bed in the living room, equipped kitchen, Wi-Fi, washer and dryer.'},
    {...shared,id:'airbnb-1768745438564501646',ru:'Views · Panoramic',en:'Views · Panoramic',capacity:4,
      photo:'views-panoramic-1.avif',photos:['views-panoramic-1.avif','views-panoramic-2.avif','views-panoramic-3.avif'],
      sourceName:'Airbnb',quote:airbnb('1768745438564501646',null,true),
      description:'Просторные апартаменты с панорамным видом, собственной кухней, спальней и балконом. Wi-Fi, рабочая зона, кондиционер и самостоятельное заселение.',
      descriptionEn:'A spacious apartment with panoramic views, a private kitchen, bedroom and balcony. Wi-Fi, workspace, air conditioning and self check-in.'},
    {...shared,id:'utower',buildingId:'utower',ru:'U Tower · рабочая зона и панорама',en:'U Tower · workspace & panorama',capacity:4,
      photo:'views-utower-2.jpg',photos:['views-utower-2.jpg','views-utower-1.jpg'],sourceName:'Instagram',
      description:'NRG U Tower: отдельная спальня, гостиная с диваном, кухня и рабочее место с монитором. Высокий этаж, панорамные окна, Wi-Fi и кондиционеры. Стоимость и доступность уточняются.',
      descriptionEn:'NRG U Tower: a separate bedroom, living room with a sofa, kitchen and workspace with a monitor. High floor, panoramic windows, Wi-Fi and air conditioning. Price and availability on request.'},
    {...shared,id:'nestone',buildingId:'nestone',ru:'Nest One · 20-й этаж',en:'Nest One · 20th floor',capacity:3,
      photo:'views-nestone-2.jpg',photos:['views-nestone-2.jpg','views-nestone-1.jpg'],sourceName:'Instagram',
      description:'Апартаменты на 20-м этаже Nest One: отдельная спальня, оборудованная кухня и панорамный вид на город. Wi-Fi, Smart TV, кондиционеры и стиральная машина. Стоимость и доступность уточняются.',
      descriptionEn:'An apartment on the 20th floor of Nest One: a separate bedroom, equipped kitchen and panoramic city views. Wi-Fi, Smart TV, air conditioning and a washer. Price and availability on request.'}
  ];
  window.VertexOwner = {name:'Views Hotel & Apartments',checkedAt};
})();
