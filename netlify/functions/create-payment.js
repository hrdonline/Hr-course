const https = require('https');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{}' };

  try {
    const { name, email, phone, tariff, amount, description } = JSON.parse(event.body || '{}');

    if (!name || !email || !phone || !amount) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Заполните все поля' }) };
    }

    const shopId    = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    const siteUrl   = process.env.SITE_URL;

    const digits = phone.replace(/\D/g, '');
    const normalizedPhone =
      digits.length === 10                      ? '+7' + digits :
      digits.length === 11 && digits[0] === '8' ? '+7' + digits.slice(1) :
      digits.length === 11 && digits[0] === '7' ? '+' + digits :
                                                  '+7' + digits.slice(-10);

    const amountStr  = parseFloat(amount).toFixed(2);
    const idempotKey = `${Date.now()}-${email.replace(/\W/g,'')}-${tariff}`.slice(0, 64);

    const requestBody = JSON.stringify({
      amount:       { value: amountStr, currency: 'RUB' },
      confirmation: {
        type:       'redirect',
        return_url: `${siteUrl}/success.html?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&tariff=${encodeURIComponent(tariff)}`
      },
      capture:     true,
      description: description || `ИИ в HR. Практика — ${tariff}`,
      metadata:    { name, email, phone: normalizedPhone, tariff }
    });

    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');

    const payment = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.yookassa.ru',
        path:     '/v3/payments',
        method:   'POST',
        headers: {
          'Authorization':   `Basic ${auth}`,
          'Content-Type':    'application/json',
          'Idempotence-Key': idempotKey,
          'Content-Length':  Buffer.byteLength(requestBody)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch (e) { reject(new Error('Неверный ответ от ЮKassa')); }
        });
      });
      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    if (payment.status !== 200 && payment.status !== 201) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: payment.body.description || 'Ошибка ЮKassa' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ redirect_url: payment.body.confirmation.confirmation_url })
    };

  } catch (err) {
    console.error('Ошибка:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Ошибка: ' + err.message })
    };
  }
};
