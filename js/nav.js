// Top menu: shows the page named by the URL hash (#/timeline, #/eleph,
// #/events) and marks its tab. A second segment picks a sub page inside it
// (#/eleph/expert, #/eleph/hard); without one the page's first sub page is
// shown. Fires a "route" event on window with the page name so pages can
// redo layout work that needs them to be visible.
(function () {
  'use strict';

  var DEFAULT = 'timeline';
  var pages = document.querySelectorAll('[data-page]');
  var tabs = document.querySelectorAll('.site-tabs [data-route]');

  function segments() { return location.hash.replace(/^#\/?/, '').split('/'); }

  function current() {
    var name = segments()[0];
    for (var i = 0; i < pages.length; i++) {
      if (pages[i].getAttribute('data-page') === name) return name;
    }
    return DEFAULT;
  }

  // Shows one sub page of a page and marks its sub tab.
  function showSub(page, wanted) {
    var subs = page.querySelectorAll('[data-subpage]');
    if (!subs.length) return;
    var name = subs[0].getAttribute('data-subpage');
    Array.prototype.forEach.call(subs, function (s) {
      if (s.getAttribute('data-subpage') === wanted) name = wanted;
    });
    Array.prototype.forEach.call(subs, function (s) {
      s.hidden = s.getAttribute('data-subpage') !== name;
    });
    Array.prototype.forEach.call(page.querySelectorAll('[data-subroute]'), function (t) {
      if (t.getAttribute('data-subroute') === name) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
  }

  function show() {
    var name = current();
    Array.prototype.forEach.call(pages, function (p) {
      if (p.getAttribute('data-page') === name) showSub(p, segments()[1]);
    });
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
