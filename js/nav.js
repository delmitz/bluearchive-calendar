// Top menu: shows the page named by the URL hash (#/timeline, #/growth,
// #/events) and marks its tab. Fires a "route" event on window with the page
// name so pages can redo layout work that needs them to be visible.
(function () {
  'use strict';

  var DEFAULT = 'timeline';
  var pages = document.querySelectorAll('[data-page]');
  var tabs = document.querySelectorAll('.site-tabs [data-route]');

  function current() {
    var name = location.hash.replace(/^#\/?/, '');
    for (var i = 0; i < pages.length; i++) {
      if (pages[i].getAttribute('data-page') === name) return name;
    }
    return DEFAULT;
  }

  function show() {
    var name = current();
    Array.prototype.forEach.call(pages, function (p) {
      p.hidden = p.getAttribute('data-page') !== name;
    });
    Array.prototype.forEach.call(tabs, function (t) {
      if (t.getAttribute('data-route') === name) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    window.dispatchEvent(new CustomEvent('route', { detail: name }));
  }

  window.addEventListener('hashchange', show);
  show();
})();
