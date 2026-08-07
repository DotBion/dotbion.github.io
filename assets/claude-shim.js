/* Wires the design's existing chat + visitor counter to the portfolio Worker.
 *
 * The design already ships both features. They fail in production for two
 * unrelated reasons, and this file fixes exactly those two:
 *
 *   1. Chat calls window.claude.complete(), which only exists inside
 *      claude.ai's artifact runtime. On GitHub Pages it is undefined, so every
 *      message throws and shows the "something went wrong" fallback.
 *   2. The counter fetches komarev.com/ghpvc via githubusercontent, which
 *      sends no CORS header, so the request is blocked and the badge hides.
 *
 * This script runs at parse time — before the bundle swaps the document root
 * and before its React code mounts — and only touches `window`, which survives
 * the swap. Nothing here renders UI; the design owns all of that.
 */
(function () {
  'use strict';

  var API = (window.PORTFOLIO_API || '').replace(/\/$/, '');
  if (!API) return; // Not configured yet — leave the page exactly as-is.

  function sessionId() {
    try {
      var key = 'pf_sid';
      var id = sessionStorage.getItem(key);
      if (!id) {
        id = (crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : String(Date.now()) + Math.random().toString(16).slice(2);
        sessionStorage.setItem(key, id);
      }
      return id;
    } catch (err) {
      return null; // Private mode / storage disabled — logging just loses the grouping.
    }
  }

  /* 1. Chat -------------------------------------------------------------- */

  if (!window.claude || typeof window.claude.complete !== 'function') {
    window.claude = {
      // The design awaits this and uses the resolved value as the reply text,
      // so it must resolve to a plain string.
      complete: function (opts) {
        // `opts.system` is deliberately NOT forwarded. The Worker supplies its
        // own system prompt; accepting one from the browser would make the
        // endpoint an open Claude proxy.
        var payload = {
          messages: (opts && opts.messages) || [],
          session_id: sessionId()
        };

        return fetch(API + '/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (res) {
          return res.json().then(function (data) {
            // The Worker returns a friendly `text` even for 429 and 502, so
            // those surface as a normal assistant message rather than the
            // design's generic error state.
            if (data && typeof data.text === 'string') return data.text;
            throw new Error('chat failed: HTTP ' + res.status);
          });
        });
      }
    };
  }

  /* 2. Visitor counter --------------------------------------------------- */

  // The counter's URL is a design-time prop we cannot set from here, so
  // redirect just that one request. The match is deliberately narrow — every
  // other fetch (including the bundle's own blob loading) passes through
  // untouched.
  var COUNTER_URL = /komarev\.com\/ghpvc|camo\.githubusercontent\.com/;
  var nativeFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    var url = '';
    try {
      url = typeof input === 'string' ? input : (input && input.url) || '';
    } catch (err) {
      url = '';
    }

    if (url && COUNTER_URL.test(url)) {
      return nativeFetch(API + '/api/visit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId(),
          referrer: document.referrer || null,
          path: location.pathname
        })
      });
    }

    return nativeFetch(input, init);
  };
})();
