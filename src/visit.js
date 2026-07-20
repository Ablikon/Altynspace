// Тихий «маячок» посещения — без всплывающих окон и запросов разрешений.
// Шлёт на /api/hit два события: "enter" (заход) и "leave" (уход + сколько
// времени провели на сайте). /api/hit пересылает это в Telegram.
// ?me=1 один раз помечает устройство как «твоё» (cookie owner), чтобы
// отличать твои заходы от чужих.
(function () {
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('me') === '1') {
      document.cookie = 'owner=1; path=/; max-age=' + 60 * 60 * 24 * 3650 + '; SameSite=Lax';
      try { localStorage.setItem('owner', '1'); } catch (e) {}
    }

    var owner =
      /(?:^|;\s*)owner=1(?:;|$)/.test(document.cookie) ||
      (function () { try { return localStorage.getItem('owner') === '1'; } catch (e) { return false; } })();

    var tz = (function () {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; }
    })();

    var sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    var start = Date.now();

    var base = {
      owner: owner,
      site: location.hostname,
      path: location.pathname + location.search,
      ref: document.referrer || '',
      screen: screen.width + 'x' + screen.height + '@' + (window.devicePixelRatio || 1) + 'x',
      tz: tz,
      sid: sid,
    };

    function send(extra, useBeacon) {
      var payload = Object.assign({}, base, extra);
      var body = JSON.stringify(payload);
      try {
        if (useBeacon && navigator.sendBeacon) {
          navigator.sendBeacon('/api/hit', new Blob([body], { type: 'application/json' }));
          return;
        }
      } catch (e) {}
      fetch('/api/hit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body: body,
      }).catch(function () {});
    }

    // заход
    send({ type: 'enter' }, false);

    // уход (шлём один раз, с длительностью сессии)
    var left = false;
    function leave() {
      if (left) return;
      left = true;
      var durationSec = Math.round((Date.now() - start) / 1000);
      send({ type: 'leave', durationSec: durationSec }, true);
    }
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') leave();
    });
  } catch (e) {
    /* тихо игнорируем — трекинг не должен мешать сайту */
  }
})();
