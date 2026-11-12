const express = require('express');
const crypto = require('crypto');
const antiRaid = require('./antiraid');

function startDashboard(client) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20kb' }));
  const password = process.env.DASHBOARD_PASSWORD || '';
  const ownerId = process.env.OWNER_ID || '';
  const secret = process.env.DASHBOARD_SECRET || password;
  const allowedOrigin = (process.env.DASHBOARD_ORIGIN || '').replace(/\/$/, '');
  if (!password || !ownerId || !secret || !allowedOrigin) {
    console.log('ℹ️ Dashboard API вимкнено: задай DASHBOARD_PASSWORD, DASHBOARD_ORIGIN та OWNER_ID.');
    return;
  }
  const sessions = new Map();
  const safeEqual = (a,b) => { const x=Buffer.from(String(a)); const y=Buffer.from(String(b)); return x.length===y.length && crypto.timingSafeEqual(x,y); };
  app.use((req,res,next) => {
    const origin = req.headers.origin;
    if (origin && origin.replace(/\/$/, '') === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(origin === allowedOrigin ? 204 : 403);
    next();
  });
  function auth(req,res,next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const record = sessions.get(token);
    if (!record || record.expires < Date.now() || record.ownerId !== ownerId) {
      if (record) sessions.delete(token);
      return res.status(401).json({ error: 'Сесія завершилась. Увійди знову.' });
    }
    next();
  }
  app.post('/api/auth/login',(req,res) => {
    if (!safeEqual(req.body?.password || '', password)) return res.status(401).json({ error: 'Невірний пароль.' });
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token,{ ownerId, expires: Date.now()+8*60*60*1000 });
    res.json({ token, expiresIn: 28800 });
  });
  app.post('/api/auth/logout',auth,(req,res) => { sessions.delete((req.headers.authorization||'').slice(7)); res.json({ ok:true }); });
  app.get('/api/health',(req,res)=>res.json({ok:true,name:'Bindarik Bot API'}));
  app.get('/api/guilds',auth,(req,res)=>res.json(client.guilds.cache.map(g=>({id:g.id,name:g.name}))));
  app.get('/api/config/:id',auth,(req,res)=>{const g=client.guilds.cache.get(req.params.id);if(!g)return res.sendStatus(404);res.json(antiRaid.get(g.id));});
  app.post('/api/config/:id',auth,(req,res)=>{
    const g=client.guilds.cache.get(req.params.id); if(!g)return res.sendStatus(404);
    const b=req.body||{}; const s=antiRaid.get(g.id);
    s.enabled=!!b.enabled;
    s.threshold=Math.max(2,Math.min(50,Number(b.threshold)||6));
    s.windowSeconds=Math.max(5,Math.min(120,Number(b.windowSeconds)||15));
    s.minAccountAgeDays=Math.max(0,Math.min(365,Number(b.minAccountAgeDays)||0));
    s.logChannelId=typeof b.logChannelId==='string'&&/^\d{17,20}$/.test(b.logChannelId)?b.logChannelId:null;
    antiRaid.save(); res.json({ok:true});
  });
  app.get('/healthz',(req,res)=>res.status(200).send('Bindarik Bot API OK'));
  const port=Number(process.env.SERVER_PORT || process.env.PORT)||3000;
  app.listen(port,'0.0.0.0',()=>console.log(`🌐 Bindarik API слухає 0.0.0.0:${port}; дозволений сайт: ${allowedOrigin}`));
}
module.exports = startDashboard;
