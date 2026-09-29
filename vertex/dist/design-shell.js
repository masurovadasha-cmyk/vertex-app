/* Presentation only: existing booking, CRM and storage behavior stays in its modules. */
(() => {
  const catalog = () => window.VertexCatalog || {};
  const destinationCities = () => catalog().cities || [
    {id:'Tashkent',ru:'Ташкент',en:'Tashkent'},
    {id:'Samarkand',ru:'Самарканд',en:'Samarkand'},
    {id:'Bukhara',ru:'Бухара',en:'Bukhara'},
    {id:'Khiva',ru:'Хива',en:'Khiva'}
  ];
  const catalogStays = () => catalog().listings || catalog().stays || (typeof stays !== 'undefined' ? stays : []);
  const photoOf = stay => {
    if (typeof stay?.photo === 'string' && stay.photo) return stay.photo;
    const first = stay?.photos?.[0];
    return typeof first === 'string' ? first : (typeof first?.src === 'string' ? first.src : '');
  };
  const featuredStay = () => catalogStays().find(stay => stay.ownerConfirmed && photoOf(stay)) || catalogStays().find(stay => photoOf(stay)) || catalogStays()[0];
  const cityName = id => {
    const destination = destinationCities().find(item => item.id === id);
    return destination ? tr(destination.ru, destination.en) : id;
  };
  const hero = document.createElement('section');
  hero.className = 'hero';
  hero.setAttribute('aria-labelledby', 'headline');
  const copy = document.createElement('div');
  copy.className = 'hero-copy';
  const eyebrow = $('eyebrow');
  eyebrow.before(hero);
  copy.append(eyebrow, document.querySelector('.intro'));
  hero.append(copy);
  const destinations = document.createElement('div');
  destinations.className = 'destination-pills';
  destinations.setAttribute('aria-label', 'Направления / Destinations');
  copy.append(destinations);
  const visual = document.createElement('div');
  visual.className = 'hero-visual';
  visual.innerHTML = '<img id="heroApartment" alt="" fetchpriority="high" decoding="async" hidden><div class="hero-sticker"><span>✦</span><b id="heroSticker"></b></div><div class="hero-location"><div><small id="heroLocationLabel"></small><strong id="heroLocationTitle"></strong></div><button type="button" id="heroExplore">↗</button></div>';
  hero.append(visual);
  const entry = document.querySelector('.business-entry');
  if (entry) document.querySelector('footer').before(entry);
  const filters = document.querySelector('.rent-filters');
  const disclosure = document.createElement('details');
  disclosure.className = 'filter-disclosure';
  disclosure.open = matchMedia('(min-width: 761px)').matches;
  const summary = document.createElement('summary');
  summary.id = 'filterSummary';
  filters.before(disclosure);
  disclosure.append(summary, filters);
  const choose = value => {
    $('destination').value = value;
    $('search').requestSubmit();
  };
  const refreshCopy = () => {
    const featured = featuredStay();
    const featuredCity = cityName(featured?.city || 'Tashkent');
    const apartment = $('heroApartment');
    const apartmentPhoto = photoOf(featured);
    const apartmentName = (lang === 'en' ? featured?.en || featured?.ru : featured?.ru || featured?.en) || featured?.building || tr('Апартаменты', 'Apartments');
    if (apartmentPhoto && apartment.getAttribute('src') !== apartmentPhoto) apartment.src = apartmentPhoto;
    if (!apartmentPhoto) apartment.removeAttribute('src');
    apartment.hidden = !apartmentPhoto;
    apartment.alt = featured ? apartmentName + ' · ' + featuredCity : '';
    visual.classList.toggle('hero-visual-empty', !apartmentPhoto);
    $('eyebrow').textContent = tr('БЛИЖЕ К УЗБЕКИСТАНУ', 'MAKE YOURSELF AT HOME IN UZBEKISTAN');
    $('headline').textContent = tr('Почувствуй\nУзбекистан.', 'Feel\nUzbekistan.');
    $('subhead').textContent = tr('Ташкент — Самарканд — Бухара — Хива. Апартаменты и забота о каждой детали поездки.', 'Tashkent — Samarkand — Bukhara — Khiva. Apartments and thoughtful extras for your journey.');
    $('heroSticker').textContent = tr('Твоё место здесь', 'Your place is here');
    $('heroLocationLabel').textContent = tr('АПАРТАМЕНТЫ ДЛЯ ВАШЕЙ ПОЕЗДКИ', 'A PLACE TO FEEL AT HOME');
    const apartmentCaption = apartmentName.toLocaleLowerCase().includes(featuredCity.toLocaleLowerCase()) ? apartmentName : apartmentName + ' · ' + featuredCity;
    $('heroLocationTitle').textContent = apartmentCaption;
    $('heroExplore').setAttribute('aria-label', tr('Смотреть апартаменты: ', 'Explore apartments: ') + featuredCity);
    $('searchButton').textContent = tr('Найти жильё', 'Find a stay');
    summary.textContent = tr('Фильтры жилья · цена, тип, Wi-Fi', 'Stay filters · price, type, Wi-Fi');
    $('sectionHeading').textContent = category === 'stays' ? tr('Апартаменты Узбекистана', 'Apartments in Uzbekistan') : $('sectionHeading').textContent;
    $('tripTitle').textContent = tr('Планы, которые\nвдохновляют.', 'Plans to look\nforward to.');
    $('tripCopy').textContent = tr('Жильё, трансфер и приятные мелочи — собери свою поездку.', 'A stay, a ride and your favourite extras. Bring your trip together.');
    $('viewTrip').textContent = tr('Все поездки и услуги', 'All trips and extras');
    $('footerText').textContent = tr('Путешествия по Узбекистану · 1.9-demo', 'Travel across Uzbekistan · 1.9-demo');
    destinations.replaceChildren(...destinationCities().map(({id,ru,en})=>{
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = tr(ru,en) + ' ↗';
      button.dataset.city = id;
      button.setAttribute('aria-pressed', String(category === 'stays' && city === id));
      button.onclick = () => choose(id);
      return button;
    }));
    document.querySelectorAll('#nav button').forEach(button=>button.classList.toggle('active', button.dataset.nav===category));
  };
  const priorRender = render;
  render = function(){ priorRender(); refreshCopy(); };
  $('heroExplore').onclick = () => choose(featuredStay()?.city || 'Tashkent');
  document.querySelector('.brand').onclick = event => {
    event.preventDefault(); city='all'; $('destination').value='all'; selectCategory('stays');
    window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  };
  $('modal').setAttribute('aria-labelledby','modalTitle');
  $('closeModal').setAttribute('aria-label','Закрыть / Close');
  refreshCopy();
})();
