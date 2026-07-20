// Тихий «маячок» посещения — без всплывающих окон и запросов разрешений.
// Отправляет заход на /api/hit, который шлёт уведомление в Telegram.
// Один раз открой сайт со ссылкой ?me=1 на своём телефоне/ноуте — и это
// устройство навсегда пометится как «твоё» (owner), чтобы отличать твои
// заходы от чужих.
(function () {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('me') === '1') {
      document.cookie =
        'owner=1; path=/; max-age=' + 60 * 60 * 24 * 3650 + '; SameSite=Lax';
      try {
        localStorage.setItem('owner', '1');
      } catch {}
    }

    const owner =
      /(?:^|;\s*)owner=1(?:;|$)/.test(document.cookie) ||
      (function () {
        try {
          return localStorage.getItem('owner') === '1';
        } catch {
          return false;
        }
      })();

    const tz = (function () {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        return '';
      }
    })();

    fetch('/api/hit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({
        owner,
        site: location.hostname,
        path: location.pathname + location.search,
        ref: document.referrer || '',
        screen:
          screen.width +
          'x' +
          screen.height +
          '@' +
          (window.devicePixelRatio || 1) +
          'x',
        tz,
      }),
    }).catch(function () {});
  } catch (e) {
    /* тихо игнорируем — трекинг не должен мешать сайту */
  }
})();
