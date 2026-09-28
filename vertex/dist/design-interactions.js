/* Vertex visual interactions. Load after the application scripts. */
(() => {
  'use strict';
  if (window.vertexDesignInteractions) return;
  window.vertexDesignInteractions = true;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const svgNS = 'http://www.w3.org/2000/svg';
  const paths = {
    home: 'M3 10.5 12 3l9 7.5M5 9v12h5v-7h4v7h5V9',
    compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM16 8l-2.5 5.5L8 16l2.5-5.5L16 8Z',
    spark: 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z',
    car: 'm5 8 2-5h10l2 5M3 9h18v9H3V9Zm2 9v3m14-3v3M6 13h2m8 0h2',
    plane: 'm21 3-5 18-4-8-9-4 18-6ZM12 13l9-10',
    food: 'M4 3v5a3 3 0 0 0 6 0V3M7 3v18M17 3v9h4M21 3v18',
    bag: 'M5 7h14l2 14H3L5 7Zm4 0V5a3 3 0 0 1 6 0v2',
    user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
    users: 'M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM2 21v-2a8 8 0 0 1 16 0v2M18 4a4 4 0 0 1 0 7m2 4a6 6 0 0 1 2 4v2',
    heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
    map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5ZM9 3v16m6-14v16',
    chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l1.6-5.2A8.5 8.5 0 1 1 21 11.5ZM8 10h8m-8 4h5',
    phone: 'M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2C10 20 4 14 3 5a2 2 0 0 1 2-2Z',
    calendar: 'M4 5h16v16H4V5Zm3-3v6m10-6v6M4 11h16m-13 4h2m3 0h2m3 0h1',
    search: 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-2 6 6 6',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    back: 'M19 12H5m6-6-6 6 6 6',
    plus: 'M12 5v14M5 12h14',
    close: 'm6 6 12 12M6 18 18 6',
    check: 'm5 12 4 4L19 6',
    edit: 'm14 5 5 5M3 21l5-1L21 7l-5-5L3 15v6Z',
    send: 'm22 2-7 20-4-9-9-4 20-7ZM11 13 22 2',
    globe: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM2 12h20M12 2c5 5 5 15 0 20-5-5-5-15 0-20Z',
    download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    refresh: 'M20 8a8 8 0 1 0 0 8M20 3v5h-5',
    mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 6v1a6 6 0 0 0 12 0v-1M12 18v4m-4 0h8',
    volume: 'M3 9h4l5-5v16l-5-5H3V9Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
    shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 10 3 3 5-6',
    laundry: 'M4 2h16v20H4V2Zm0 5h16M7 4h1m3 0h1m5 10a5 5 0 1 1-10 0 5 5 0 0 1 10 0Zm-9-1c3-2 5 3 8 1',
    rail: 'M5 3h14v14H5V3Zm0 8h14M9 3v8m6-8v8M7 17l-3 5m13-5 3 5M8 14h1m6 0h1',
  };
  const types = {stays:'home', home:'home', transport:'car', tickets:'plane', food:'food', care:'spark', services:'spark', explore:'compass', trips:'bag', profile:'user', crm:'users', map:'map', chat:'chat', calls:'phone'};
  const ids = {
    searchButton:'search', mapButton:'map', cartButton:'bag', viewTrip:'bag', demoTrip:'spark',
    allServices:'spark', installButton:'download', profileInstall:'download', language:'globe', profileLanguage:'globe',
    closeModal:'close', bizClose:'close', favoriteList:'heart', bookingsList:'bag', hostPanel:'home',
    newClient:'plus', clientChat:'chat', clientCall:'phone', clientEdit:'edit', chatCall:'phone',
    backClients:'back', backChats:'back', backCalls:'back', cancelEdit:'back',
    demoCall:'phone', addPhone:'plus', muteDemo:'mic', speakerDemo:'volume', hangup:'phone',
    reloadMap:'refresh', contactHost:'chat', openMyTrips:'bag', newListing:'plus',
    confirmCancel:'close', keepTrip:'check', prevMonth:'back', nextMonth:'arrow', calendarHost:'calendar',
    addStay:'plus', checkout:'check', replaceDemo:'spark',
  };
  const serviceTypes = {taxi:'car', comfort:'car', car:'car', flight:'plane', rail:'rail', market:'bag', meal:'food', bar:'food', laundry:'laundry', concierge:'spark', tour:'compass', guide:'user'};
  const controlSelector = 'button, .dial-link';
  const decorationSelector = '.vx-icon, .vx-legacy-glyph, .vx-ripple';
  const scopes = [...document.querySelectorAll('header, main, #mobileNav, #modal, #businessDialog')];
  const pendingEnters = new Set();
  const runningAnimations = new WeakMap();
  let frame = 0;
  let keyboard = false;
  let restoreFocus = null;

  function icon(name) {
    const el = document.createElementNS(svgNS, 'svg');
    el.classList.add('vx-icon');
    for (const [key,value] of Object.entries({viewBox:'0 0 24 24', width:'20', height:'20', fill:'none', stroke:'currentColor', 'stroke-width':'1.8', 'stroke-linecap':'round', 'stroke-linejoin':'round', 'aria-hidden':'true', focusable:'false'})) el.setAttribute(key,value);
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', paths[name] || paths.arrow);
    el.append(path);
    return el;
  }

  function iconFor(button) {
    const d = button.dataset;
    if (d.tab || d.cat || d.nav || d.screen || d.open) return types[d.tab || d.cat || d.nav || d.screen || d.open];
    if (d.heart !== undefined) return 'heart';
    if (d.rental !== undefined) return 'arrow';
    if (d.service !== undefined || d.id !== undefined) return button.closest('.service-card') ? 'plus' : 'arrow';
    if (d.remove !== undefined) return 'close';
    if (d.status) return d.status === 'Подтверждено' ? 'check' : 'close';
    if (ids[button.id]) return ids[button.id];
    if (button.matches('.dial-link')) return 'phone';
    if (button.closest('#messageForm')) return 'send';
    if (button.closest('#bookingForm')) return 'send';
    if (button.closest('#clientForm, #listingForm') && button.type === 'submit') return 'check';
    if (button.closest('#calendarForm')) return button.value === 'block' ? 'shield' : 'calendar';
    if (/Календарь|Calendar/.test(button.textContent)) return 'calendar';
    return null;
  }

  // Retain all original text nodes and handlers; only decorative Unicode glyphs
  // move into hidden spans when a matching drawn icon is present.
  function hideLegacyGlyphs(button) {
    const mobileGlyph = button.querySelector(':scope > span[aria-hidden="true"]:not(.vx-legacy-glyph)');
    if (button.dataset.tab && mobileGlyph) {
      mobileGlyph.hidden = true;
      mobileGlyph.classList.add('vx-legacy-glyph');
    }
    for (const node of [...button.childNodes]) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const text = node.textContent;
      const matches = [...text.matchAll(/[⌂⌖✧✈◉↗▦▤☎♡♥✕←→◇◎♧♙]|(?<=^|\s)\+(?=\s|$)/gu)];
      if (!matches.length) continue;
      const fragment = document.createDocumentFragment();
      let index = 0;
      for (const match of matches) {
        fragment.append(text.slice(index, match.index));
        const glyph = document.createElement('span');
        glyph.className = 'vx-legacy-glyph';
        glyph.hidden = true;
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = match[0];
        fragment.append(glyph);
        index = match.index + match[0].length;
      }
      fragment.append(text.slice(index));
      node.replaceWith(fragment);
    }
  }

  function decorate(root) {
    root.querySelectorAll(controlSelector).forEach(button => {
      button.classList.add('vx-tap');
      const name = iconFor(button);
      if (name && !button.querySelector(':scope > .vx-icon')) {
        hideLegacyGlyphs(button);
        button.prepend(icon(name));
        button.classList.add('vx-has-icon');
      }
      if (button.dataset.cat) {
        const selected = typeof category !== 'undefined' ? button.dataset.cat === category : button.classList.contains('active');
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      }
      if (button.dataset.nav && typeof category !== 'undefined') {
        const selected = button.dataset.nav === category || (button.dataset.nav === 'care' && category === 'all');
        button.classList.toggle('active', selected);
        selected ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current');
      }
    });
    root.querySelectorAll('.service-icon').forEach(el => {
      if (el.querySelector('.vx-icon')) return;
      const button = el.closest('.service-card')?.querySelector('button');
      const service = button?.dataset.service || button?.dataset.id;
      const glyph = document.createElement('span');
      glyph.className = 'vx-legacy-glyph';
      glyph.hidden = true;
      glyph.textContent = el.textContent;
      el.replaceChildren(icon(serviceTypes[service] || 'spark'), glyph);
      el.setAttribute('aria-hidden', 'true');
    });
  }

  function animate(el, keyframes, options) {
    if (motion.matches || !el.animate || !el.isConnected) return;
    runningAnimations.get(el)?.cancel();
    const animation = el.animate(keyframes, {...options, fill:'backwards'});
    runningAnimations.set(el, animation);
    animation.finished.catch(() => {});
  }

  function enter(root) {
    if (root.matches('dialog')) {
      if (root.open) animate(root, [{opacity:0, transform:'translateY(16px) scale(.985)'}, {opacity:1, transform:'translateY(0) scale(1)'}], {duration:270, easing:'cubic-bezier(.16,1,.3,1)'});
      return;
    }
    if (root.closest('dialog:not([open])')) return;
    [...root.children].filter(el => !el.matches(decorationSelector)).slice(0, 12).forEach((el, index) => {
      animate(el, [{opacity:0, transform:'translateY(10px)'}, {opacity:1, transform:'translateY(0)'}], {duration:240, delay:Math.min(index * 25, 125), easing:'cubic-bezier(.16,1,.3,1)'});
    });
  }

  const observer = new MutationObserver(records => {
    let relevant = false;
    for (const record of records) {
      if (record.target.nodeType !== Node.ELEMENT_NODE || record.target.closest(decorationSelector)) continue;
      const added = [...record.addedNodes];
      if (record.type === 'childList' && added.length && added.every(node => node.nodeType === Node.ELEMENT_NODE && node.matches(decorationSelector))) continue;
      if (record.type === 'childList' && !added.length && [...record.removedNodes].every(node => node.nodeType === Node.ELEMENT_NODE && node.matches(decorationSelector))) continue;
      relevant = true;
      if (record.attributeName === 'open' && record.target.open) pendingEnters.add(record.target);
      if (record.type === 'childList' && record.target.matches('#results, #modalBody, #bizBody, #clientList')) pendingEnters.add(record.target);
    }
    if (relevant && !frame) frame = requestAnimationFrame(refresh);
  });

  function observe() {
    scopes.forEach(root => observer.observe(root, {subtree:true, childList:true, attributes:true, attributeFilter:['open']}));
  }

  function refresh() {
    frame = 0;
    observer.disconnect();
    scopes.forEach(decorate);
    observe();
    for (const root of pendingEnters) {
      const dialog = root.closest('dialog');
      if (root === dialog || !dialog || !pendingEnters.has(dialog)) enter(root);
    }
    pendingEnters.clear();
    if (restoreFocus) {
      const saved = restoreFocus;
      restoreFocus = null;
      if (!saved.original.isConnected && document.activeElement === document.body) {
        document.querySelector(saved.selector)?.focus({preventScroll:true});
      }
    }
  }

  function feedback(button, event) {
    if (motion.matches || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    const rect = button.getBoundingClientRect();
    const diameter = Math.hypot(rect.width, rect.height) * 2;
    const ripple = document.createElement('span');
    ripple.className = 'vx-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    const x = event.clientX === undefined ? rect.width / 2 : event.clientX - rect.left;
    const y = event.clientY === undefined ? rect.height / 2 : event.clientY - rect.top;
    Object.assign(ripple.style, {position:'absolute', left:`${x-diameter/2}px`, top:`${y-diameter/2}px`, width:`${diameter}px`, height:`${diameter}px`, borderRadius:'50%', background:'currentColor', opacity:'.12', pointerEvents:'none'});
    button.append(ripple);
    if (ripple.animate) {
      const wave = ripple.animate([{transform:'scale(0)', opacity:.16}, {transform:'scale(1)', opacity:0}], {duration:420, easing:'cubic-bezier(.16,1,.3,1)'});
      wave.finished.then(() => ripple.remove(), () => ripple.remove());
    } else ripple.remove();
    animate(button, [{transform:'scale(1)'}, {transform:'scale(.965)', offset:.35}, {transform:'scale(1)'}], {duration:210, easing:'ease-out'});
  }

  document.addEventListener('pointerdown', event => {
    keyboard = false;
    if (event.button !== 0 || !event.isPrimary) return;
    const button = event.target.closest?.(controlSelector);
    if (button) feedback(button, event);
  }, {passive:true});
  document.addEventListener('keydown', event => {
    keyboard = true;
    if (event.repeat || !['Enter', ' '].includes(event.key)) return;
    const button = event.target.closest?.(controlSelector);
    if (button) feedback(button, {});
  });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!keyboard || !button || document.activeElement !== button) return;
    const attribute = ['data-cat','data-nav','data-tab','data-heart'].find(name => button.hasAttribute(name));
    if (attribute) restoreFocus = {original:button, selector:`button[${attribute}="${CSS.escape(button.getAttribute(attribute))}"]`};
  }, true);
  motion.addEventListener?.('change', () => {
    if (!motion.matches) return;
    scopes.forEach(root => root.getAnimations({subtree:true}).forEach(animation => animation.cancel()));
    document.querySelectorAll('.vx-ripple').forEach(el => el.remove());
  });

  refresh();
  enter(document.getElementById('results'));
})();
