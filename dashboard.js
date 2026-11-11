const express = require('express');
const crypto = require('crypto');
const path = require('path');
const antiRaid = require('./antiraid');

function startDashboard(client) {
  const app = express();
  app.use(express.urlencoded({extended:false}));
  app.use(express.json());
  const secret = process.env.DASHBOARD_SECRET || process.env.DASHBOARD_PASSWORD;
  if (!secret) { console.log('ℹ️ Dashboard вимкнено: задай DASHBOARD_PASSWORD у .env'); return; }
  const owner = process.env.OWNER_ID;
  const cookieName = 'bindarik_owner';
  const sign = value => crypto.createHmac('sha256', secret).update(value).digest('hex');
  const token = `${owner}.${sign(owner)}`;
  function auth(req,res,next){
    const raw = (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));
    if (!raw) return res.redirect('/login');
    const value = decodeURIComponent(raw.slice(cookieName.length+1));
    if (value !== token) return res.status(403).send('Доступ заборонено');
    next();
  }
  app.get('/login',(req,res)=>res.send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Bindarik Dashboard</title><style>body{background:#10131d;color:#f5f6ff;font:16px Arial;display:grid;place-items:center;height:95vh}.box{background:#1c2232;padding:32px;border-radius:18px;width:min(360px,85vw)}input,button{box-sizing:border-box;width:100%;padding:13px;margin-top:12px;border:0;border-radius:9px}button{background:#7c5cff;color:white;font-weight:bold;cursor:pointer}</style><div class="box"><h1>Bindarik Bot</h1><p>Вхід власника</p><form method="post" action="/login"><input type="password" name="password" placeholder="Пароль панелі" required><button>Увійти</button></form></div>`));
  app.post('/login',(req,res)=>{ if(!crypto.timingSafeEqual(Buffer.from(String(req.body.password||'').padEnd(secret.length,' ').slice(0,secret.length)),Buffer.from(secret))) return res.status(401).send('Невірний пароль. <a href="/login">Назад</a>'); res.setHeader('Set-Cookie',`${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Secure`); res.redirect('/'); });
  app.get('/logout',(req,res)=>{res.setHeader('Set-Cookie',`${cookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict; Secure`);res.redirect('/login');});
  app.get('/',auth,(req,res)=>res.send(`<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Bindarik Dashboard</title><style>*{box-sizing:border-box}body{margin:0;background:#10131d;color:#f4f5ff;font:15px Arial}.wrap{max-width:980px;margin:35px auto;padding:20px}.card{background:#1c2232;border:1px solid #30394f;border-radius:16px;padding:22px;margin:16px 0}h1{font-size:30px}label{display:block;margin:14px 0 6px;color:#b9c2d8}input,select,button{padding:12px;border-radius:9px;border:1px solid #39445e;background:#111827;color:white;width:100%}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}button{background:#7257ed;border:0;font-weight:bold;cursor:pointer;margin-top:15px}.muted{color:#aab4ca}a{color:#b8aaff;float:right}</style><div class="wrap"><h1>🟣 Bindarik Dashboard <a href="/logout">Вийти</a></h1><p class="muted">Панель власника • налаштування серверів та Anti-Raid</p><section class="card"><h2>Сервер</h2><select id="guild"></select><div id="status" class="muted"></div></section><section class="card"><h2>🛡️ Anti-Raid</h2><p class="muted">Виявляє хвилю нових учасників і надсилає попередження. За бажанням можна обмежувати дуже нові акаунти тайм-аутом.</p><label><input style="width:auto" type="checkbox" id="enabled"> Увімкнути Anti-Raid</label><div class="grid"><div><label>Поріг входів</label><input id="threshold" type="number" min="2" max="50" value="6"></div><div><label>Часове вікно (сек.)</label><input id="windowSeconds" type="number" min="5" max="120" value="15"></div><div><label>Мінімальний вік акаунта (днів, 0 = вимкнено)</label><input id="minAccountAgeDays" type="number" min="0" max="365" value="0"></div></div><label>ID каналу для сповіщень</label><input id="logChannelId" placeholder="Наприклад: 123456789012345678"><button onclick="save()">Зберегти налаштування</button><p id="msg" class="muted"></p></section><section class="card"><h2>ℹ️ Інформація</h2><p>Панель доступна лише власнику, заданому через OWNER_ID. Не передавай пароль панелі іншим. Для публічного розміщення використовуй HTTPS.</p></section></div><script>
const $=id=>document.getElementById(id);let guilds=[];
async function init(){let r=await fetch('/api/guilds');guilds=await r.json();$('guild').innerHTML=guilds.map(g=>'<option value="'+g.id+'">'+String(g.name).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))+'</option>').join('');$('guild').onchange=load;if(guilds.length)load();else $('status').textContent='Бот поки не має доступних серверів.'}
async function load(){let id=$('guild').value,r=await fetch('/api/config/'+id);if(!r.ok)return;let s=await r.json();$('enabled').checked=!!s.enabled;$('threshold').value=s.threshold;$('windowSeconds').value=s.windowSeconds;$('minAccountAgeDays').value=s.minAccountAgeDays;$('logChannelId').value=s.logChannelId||'';$('status').textContent='Обрано сервер: '+($('guild').selectedOptions[0]?.text||'')}
async function save(){let id=$('guild').value;let body={enabled:$('enabled').checked,threshold:Number($('threshold').value),windowSeconds:Number($('windowSeconds').value),minAccountAgeDays:Number($('minAccountAgeDays').value),logChannelId:$('logChannelId').value.trim()||null};let r=await fetch('/api/config/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});$('msg').textContent=r.ok?'✅ Налаштування збережено':'❌ Не вдалося зберегти';}
init();</script>`));
  app.get('/api/guilds',auth,(req,res)=>res.json(client.guilds.cache.map(g=>({id:g.id,name:g.name}))));
  app.get('/api/config/:id',auth,(req,res)=>{const g=client.guilds.cache.get(req.params.id);if(!g)return res.sendStatus(404);res.json(antiRaid.get(g.id));});
  app.post('/api/config/:id',auth,(req,res)=>{const g=client.guilds.cache.get(req.params.id);if(!g)return res.sendStatus(404);const b=req.body||{};const s=antiRaid.get(g.id);s.enabled=!!b.enabled;s.threshold=Math.max(2,Math.min(50,Number(b.threshold)||6));s.windowSeconds=Math.max(5,Math.min(120,Number(b.windowSeconds)||15));s.minAccountAgeDays=Math.max(0,Math.min(365,Number(b.minAccountAgeDays)||0));s.logChannelId=typeof b.logChannelId==='string'&&/^\d{17,20}$/.test(b.logChannelId)?b.logChannelId:null;antiRaid.save();res.json({ok:true});});
  const port=Number(process.env.PORT)||3000;app.listen(port,'0.0.0.0',()=>console.log(`🌐 Bindarik Dashboard слухає порт ${port}`));
}
module.exports = startDashboard;
