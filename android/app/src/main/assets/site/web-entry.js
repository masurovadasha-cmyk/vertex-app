/* Stable host entry and observable startup, no storage deletion. */
(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  if (params.get('view') === 'host' && window.VertexHostConsole) {
    window.VertexHostConsole.open('today');
  }
  document.documentElement.dataset.vertexReady = window.VertexHostConsole && window.VertexRentals ? 'true' : 'false';
})();
