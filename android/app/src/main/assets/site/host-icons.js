/* Shared, font-independent host navigation icons; no user HTML is interpolated. */
(function (w) {
  'use strict';
  const paths = Object.freeze({
    today: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-14 4h3m4 0h3m-10 3h3"/>',
    listings: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h4"/>',
    messages: '<path d="M21 11a8 8 0 0 1-8 8H8l-5 3V6a3 3 0 0 1 3-3h7a8 8 0 0 1 8 8Z"/><path d="M7 8h9M7 12h6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    analytics: '<path d="M4 3v17h17M8 16v-5m5 5V7m5 9V4"/>',
    new: '<path d="M12 4v16M4 12h16"/>',
    account: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01"/>',
    default: '<circle cx="12" cy="12" r="8"/><path d="M8 12h8m-3-3 3 3-3 3"/>'
  });
  w.VertexHostIcons = Object.freeze({
    render: key => '<svg class="vh-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (paths[key] || paths.default) + '</svg>'
  });
})(window);
