// Vercel Serverless Function — записывает каждый заход на сайт и шлёт
// уведомление в Telegram (бот kotask). Никаких попапов/запросов разрешений
// у посетителя не появляется: гео берётся из edge-заголовков Vercel по IP,
// браузерный geolocation НЕ используется.

function parseUA(ua = '') {
  const s = String(ua);
  let os = 'неизвестно';
  if (/iPhone|iPad|iPod/.test(s)) os = 'iOS';
  else if (/Android/.test(s)) os = 'Android';
  else if (/Mac OS X|Macintosh/.test(s)) os = 'macOS';
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/Linux/.test(s)) os = 'Linux';

  let browser = 'неизвестно';
  if (/Edg\//.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(s)) browser = 'Opera';
  else if (/Chrome\//.test(s) && !/Edg\//.test(s)) browser = 'Chrome';
  else if (/Firefox\//.test(s)) browser = 'Firefox';
  else if (/Version\/.*Safari/.test(s)) browser = 'Safari';

  const device = /Mobile|iPhone|iPod|(Android.*Mobile)/.test(s)
    ? 'Телефон'
    : /iPad|Tablet/.test(s)
    ? 'Планшет'
    : 'Компьютер';

  return { os, browser, device };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const h = req.headers || {};
    const get = (k) => h[k] || h[k.toLowerCase()] || '';

    let body = {};
    if (req.method === 'POST') {
      if (req.body && typeof req.body === 'object') body = req.body;
      else {
        try {
          body = JSON.parse(req.body || '{}');
        } catch {
          body = {};
        }
      }
    }

    // IP
    const xff = get('x-forwarded-for');
    const ip =
      (xff ? String(xff).split(',')[0].trim() : '') ||
      get('x-real-ip') ||
      'неизвестно';

    // Гео по IP (заголовки Vercel edge — без запроса разрешений у пользователя)
    const country = get('x-vercel-ip-country');
    const region = get('x-vercel-ip-country-region');
    let city = get('x-vercel-ip-city');
    try {
      city = decodeURIComponent(city || '');
    } catch {
      /* keep as-is */
    }
    const edgeTz = get('x-vercel-ip-timezone');
    const lat = get('x-vercel-ip-latitude');
    const lon = get('x-vercel-ip-longitude');

    const ua = get('user-agent');
    const { os, browser, device } = parseUA(ua);
    const lang = get('accept-language');

    // «Это я» — по cookie owner=1 (ставится один раз после захода на ?me=1)
    const cookies = String(get('cookie') || '');
    const isOwner = /(?:^|;\s*)owner=1(?:;|$)/.test(cookies) || body.owner === true;

    const site = body.site || get('x-forwarded-host') || get('host') || '';
    const path = body.path || '';
    const ref = body.ref || get('referer') || '';
    const screen = body.screen || '';
    const clientTz = body.tz || '';

    const who = isOwner
      ? '🟢 ЭТО ТЫ (это устройство помечено как своё)'
      : '🔴 ЧУЖОЙ заход (не помечен как твой)';
    const geo = [city, region, country].filter(Boolean).join(', ') || '—';
    const maps = lat && lon ? `https://www.google.com/maps?q=${lat},${lon}` : '';

    const lines = [`👀 Заход на сайт${site ? ` (${site})` : ''}`, who, ''];
    lines.push(`🕒 ${new Date().toISOString()} (UTC)`);
    lines.push(`🌍 IP: ${ip}`);
    lines.push(`📍 Гео по IP: ${geo}${edgeTz ? ` · ${edgeTz}` : ''}`);
    if (maps) lines.push(`🗺 Карта: ${maps}`);
    lines.push(`📱 Устройство: ${device} · ${os} · ${browser}`);
    if (screen) lines.push(`🖥 Экран: ${screen}`);
    if (clientTz) lines.push(`⏰ Часовой пояс браузера: ${clientTz}`);
    if (lang) lines.push(`🗣 Язык: ${lang}`);
    lines.push(`↩️ Источник: ${ref || 'прямой заход / закладка'}`);
    if (path) lines.push(`🔗 Путь: ${path}`);
    lines.push('');
    lines.push(`🧾 UA: ${ua || '—'}`);

    const text = lines.join('\n');

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (token && chatId) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      }).catch(() => {});
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(200).json({ ok: false });
  }
}
