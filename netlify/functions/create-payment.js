const https = require('https');
exports.handler = async (event) => {
  const h = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json'};
  if (event.httpMethod === 'OPTIONS') return {statusCode:200,headers:h,body:''};
  if (event.httpMethod !== 'POST') return {statusCode:405,headers:h,body:'{}'};
  try {
    const b = JSON.parse(event.body || '{}');
    const {name,email,phone,tariff,amount} = b;
    if (!name||!email||!phone||!amount) return {statusCode:400,headers:h,body:JSON.stringify({error:'Заполните все поля'})};
    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    const siteUrl = process.env.SITE_URL;
    console.log('shop:'+shopId+' url:'+siteUrl+' key:'+String(secretKey).slice(0,8));
    const digits = phone.replace(/\D/g,'');
    const ph = digits.length===10?'+7'+digits:digits.length===11&&digits[0]==='8'?'+7'+digits.slice(1):'+'+digits;
    const amt = parseFloat(amount).toFixed(2);
    const key = Date.now()+'-'+Math.random().toString(36).slice(2,8);
    const rb = JSON.stringify({amount:{value:amt,currency:'RUB'},confirmation:{type:'redirect',return_url:siteUrl+'/success.html'},capture:true,description:'HR курс '+tariff,metadata:{name,email,phone:ph,tariff}});
    const auth = Buffer.from(shopId+':'+secretKey).toString('base64');
    const result = await new Promise((resolve,reject)=>{
      const req = https.request({hostname:'api.yookassa.ru',path:'/v3/payments',method:'POST',headers:{Authorization:'Basic '+auth,'Content-Type':'application/json','Idempotence-Key':key,'Content-Length':Buffer.byteLength(rb)}},(res)=>{
        let d='';
        res.on('data',c=>d+=c);
        res.on('end',()=>{try{resolve({s:res.statusCode,b:JSON.parse(d)})}catch(e){reject(e)}});
      });
      req.on('error',reject);
      req.write(rb);
      req.end();
    });
    console.log('yk status:'+result.s+' body:'+JSON.stringify(result.b));
    if (result.s!==200&&result.s!==201) return {statusCode:400,headers:h,body:JSON.stringify({error:result.b.description||result.b.code||'Ошибка ЮKassa'})};
    return {statusCode:200,headers:h,body:JSON.stringify({redirect_url:result.b.confirmation.confirmation_url})};
  } catch(err) {
    console.error('ERR:'+err.message);
    return {statusCode:500,headers:h,body:JSON.stringify({error:'Ошибка: '+err.message})};
  }
};
