exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const n = JSON.parse(event.body || '{}');
    if (n.type !== 'notification' || n.object?.status !== 'succeeded') {
      return { statusCode: 200, body: 'OK' };
    }

    const pay    = n.object;
    const { name, email, phone, tariff } = pay.metadata || {};
    const amount = pay.amount?.value || '0';
    const date   = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

    // 1. Google Таблица
    if (process.env.GOOGLE_SCRIPT_URL) {
      try {
        await fetch(process.env.GOOGLE_SCRIPT_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'text/plain' },
          body:    JSON.stringify({ name, email, phone, tariff, amount, paymentId: pay.id, date })
        });
      } catch (e) { console.error('Sheets:', e.message); }
    }

    // 2. Telegram
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      try {
        const msg = [
          '🎉 <b>Новая оплата!</b>',
          `👤 <b>Имя:</b> ${name || '—'}`,
          `📧 <b>Email:</b> ${email || '—'}`,
          `📱 <b>Телефон:</b> ${phone || '—'}`,
          `📦 <b>Тариф:</b> ${tariff || '—'}`,
          `💰 <b>Сумма:</b> ${amount} ₽`,
          `📅 <b>Дата:</b> ${date}`
        ].join('\n');

        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: msg, parse_mode: 'HTML' })
        });
      } catch (e) { console.error('Telegram:', e.message); }
    }

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    return { statusCode: 200, body: 'OK' };
  }
};
