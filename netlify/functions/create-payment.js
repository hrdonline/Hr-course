exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: '{}' };

  try {
    const { name, email, phone, tariff, amount, description } = JSON.parse(event.body || '{}');

    if (!name || !email || !phone || !amount) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Заполните все поля' }) };
    }

    const shopId    = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    const siteUrl   = process.env.SITE_URL;

    // Нормализация телефона в +7XXXXXXXXXX
    const digits = phone.replace(/\D/g, '');
    const normalizedPhone =
      digits.length === 10                        ? '+7' + digits :
      digits.length === 11 && digits[0] === '8'   ? '+7' + digits.slice(1) :
      digits.length === 11 && digits[0] === '7'   ? '+' + digits :
                                                    '+7' + digits.slice(-10);

    const amountStr  = parseFloat(amount).toFixed(2);
    const idempotKey = `${Date.now()}-${email.replace(/\W/g,'')}-${tariff}`.slice(0, 64);

    const body = {
      amount:       { value: amountStr, currency: 'RUB' },
      confirmation: {
        type:       'redirect',
        return_url: `${siteUrl}/success.html?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&tariff=${encodeURIComponent(tariff)}`
      },
      capture:     true,
      description: description || `ИИ в HR. Практика — ${tariff}`,
      metadata:    { name, email, phone: normalizedPhone, tariff },
      receipt: {
        customer: { email, phone: normalizedPhone },
        items: [{
          description:     `ИИ в HR. Практика — ${tariff}`,
          quantity:        '1.00',
          amount:          { value: amountStr, currency: 'RUB' },
          vat_code:        1,            // Без НДС (самозанятый)
          payment_subject: 'service',
          payment_mode:    'full_payment'
        }]
      }
    };

    const auth   = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
    const ykRes  = await fetch('https://api.yookassa.ru/v3/payments', {
      method:  'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Idempotence-Key': idempotKey },
      body:    JSON.stringify(body)
    });

    const payment = await ykRes.json();

    if (!ykRes.ok) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: payment.description || 'Ошибка ЮKassa' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ redirect_url: payment.confirmation.confirmation_url }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Внутренняя ошибка. Попробуйте ещё раз.' }) };
  }
};
