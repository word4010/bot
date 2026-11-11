const fs = require('fs');
const path = require('path');
const { Events, PermissionFlagsBits } = require('discord.js');
const FILE = path.join(__dirname, 'antiraid.json');
let settings = {};
try { settings = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
function save(){ fs.writeFileSync(FILE, JSON.stringify(settings, null, 2)); }
function get(guildId){ return settings[guildId] ||= { enabled:false, threshold:6, windowSeconds:15, logChannelId:null, minAccountAgeDays:0 }; }
const joins = new Map();
function attach(client){
 client.on(Events.GuildMemberAdd, async member => {
  const s = get(member.guild.id); if (!s.enabled) return;
  const now = Date.now(), windowMs = Math.max(5, Math.min(120, Number(s.windowSeconds)||15))*1000;
  const list = (joins.get(member.guild.id)||[]).filter(t => now-t < windowMs); list.push(now); joins.set(member.guild.id,list);
  const ageDays = (now - member.user.createdTimestamp) / 86400000;
  if (Number(s.minAccountAgeDays)>0 && ageDays < Number(s.minAccountAgeDays)) {
   try { await member.timeout(10*60*1000, 'Bindarik Anti-Raid: новий акаунт'); } catch {}
  }
  if (list.length >= Math.max(2, Number(s.threshold)||6)) {
   const ch = s.logChannelId && member.guild.channels.cache.get(s.logChannelId);
   if (ch?.isTextBased()) ch.send({ content:`🚨 **Bindarik Anti-Raid:** за ${Math.round(windowMs/1000)} с на сервер приєдналося ${list.length} учасників. Перевірте список нових учасників.`, allowedMentions:{parse:[]} }).catch(()=>{});
   joins.set(member.guild.id, []);
  }
 });
}
module.exports = { attach, get, save };
