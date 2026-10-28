require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  Events
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const EPH = MessageFlags.Ephemeral;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// =========================
// КОНФІГ (кеш у пам'яті + безпечний запис)
// =========================

const CONFIG_PATH = path.join(__dirname, "config.json");

let db = {};

try {
  db = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
} catch {
  db = {};
}

let saveTimer = null;

function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;

  const tmp = CONFIG_PATH + ".tmp";

  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, CONFIG_PATH);
}

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 500);
}

function cfg(id) {
  db[id] ??= {};

  const c = db[id];

  c.warns ??= {};
  c.admins ??= [];
  c.logChannel ??= null;
  c.holidayChannel ??= null;
  c.ticketCategory ??= null;
  c.lastHoliday ??= null;
  c.autoMuteWarns ??= 3;

  return c;
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    try { flush(); } catch { }
    process.exit(0);
  });
}

// =========================
// ПРАВА
// =========================

const isOwner = id => id === process.env.OWNER_ID;

const isAdmin = (guildId, userId) =>
  isOwner(userId) || cfg(guildId).admins.includes(userId);

async function log(g, text) {
  const x = cfg(g.id);

  if (!x.logChannel) return;

  const ch = g.channels.cache.get(x.logChannel);

  if (!ch) return;

  ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📋 Лог")
        .setDescription(text)
        .setTimestamp()
    ]
  }).catch(() => { });
}

// Перевірка, чи можна застосувати дію до учасника
function checkTarget(i, member) {
  if (!member) return "❌ Користувача не знайдено на сервері.";
  if (member.id === i.user.id) return "❌ Не можна застосувати до себе.";
  if (member.id === client.user.id) return "❌ Не можна застосувати до бота.";
  if (isOwner(member.id)) return "❌ Не можна застосувати до власника бота.";
  if (member.id === i.guild.ownerId) return "❌ Не можна застосувати до власника сервера.";

  if (!isOwner(i.user.id) && isAdmin(i.guild.id, member.id)) {
    return "❌ Не можна застосувати до адміністратора бота.";
  }

  const me = i.guild.members.me;

  if (member.roles.highest.position >= me.roles.highest.position) {
    return "❌ Найвища роль користувача не нижча за роль бота.";
  }

  return null;
}

// =========================
// КОМАНДИ
// =========================

const userOpt = (required = true, desc = "Користувач") => o =>
  o.setName("user").setDescription(desc).setRequired(required);

const reasonOpt = o =>
  o.setName("reason").setDescription("Причина").setMaxLength(400);

const commands = [

  // ---- Для всіх ----
  new SlashCommandBuilder().setName("ubping").setDescription("Перевірити бота"),
  new SlashCommandBuilder().setName("help").setDescription("Список команд"),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Інформація про сервер"),
  new SlashCommandBuilder().setName("botinfo").setDescription("Інформація про бота"),
  new SlashCommandBuilder().setName("ticket").setDescription("Панель створення тикетів"),

  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Магічна відповідь")
    .addStringOption(o =>
      o.setName("question").setDescription("Твоє питання").setRequired(true).setMaxLength(200)
    ),

  new SlashCommandBuilder().setName("coinflip").setDescription("Підкинути монетку"),

  new SlashCommandBuilder()
    .setName("dice")
    .setDescription("Кинути кубик")
    .addIntegerOption(o =>
      o.setName("sides").setDescription("Кількість граней (за замовчуванням 6)")
        .setMinValue(2).setMaxValue(1000)
    ),

  new SlashCommandBuilder()
    .setName("random")
    .setDescription("Випадкове число")
    .addIntegerOption(o =>
      o.setName("min").setDescription("Мінімум (за замовчуванням 1)")
    )
    .addIntegerOption(o =>
      o.setName("max").setDescription("Максимум (за замовчуванням 100)")
    ),

  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Створити опитування")
    .addStringOption(o =>
      o.setName("question").setDescription("Питання").setRequired(true).setMaxLength(250)
    )
    .addStringOption(o =>
      o.setName("option1").setDescription("Варіант 1").setRequired(true).setMaxLength(100)
    )
    .addStringOption(o =>
      o.setName("option2").setDescription("Варіант 2").setRequired(true).setMaxLength(100)
    )
    .addStringOption(o => o.setName("option3").setDescription("Варіант 3").setMaxLength(100))
    .addStringOption(o => o.setName("option4").setDescription("Варіант 4").setMaxLength(100))
    .addStringOption(o => o.setName("option5").setDescription("Варіант 5").setMaxLength(100)),

  new SlashCommandBuilder()
    .setName("avatar").setDescription("Показати аватар")
    .addUserOption(userOpt(false)),

  new SlashCommandBuilder()
    .setName("userinfo").setDescription("Інформація про користувача")
    .addUserOption(userOpt(false)),

  // ---- Власник ----
  new SlashCommandBuilder()
    .setName("admin-add").setDescription("Видати права адміністратора")
    .addUserOption(userOpt()),

  new SlashCommandBuilder()
    .setName("admin-remove").setDescription("Забрати права адміністратора")
    .addUserOption(userOpt()),

  new SlashCommandBuilder().setName("admins").setDescription("Список адміністраторів"),

  // ---- Адміністрація ----
  new SlashCommandBuilder()
    .setName("ban").setDescription("Заблокувати користувача")
    .addUserOption(userOpt())
    .addStringOption(reasonOpt)
    .addIntegerOption(o =>
      o.setName("days").setDescription("Видалити повідомлення за N днів (0-7)")
        .setMinValue(0).setMaxValue(7)
    ),

  new SlashCommandBuilder()
    .setName("unban").setDescription("Розблокувати користувача")
    .addStringOption(o =>
      o.setName("userid").setDescription("ID користувача").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick").setDescription("Виключити користувача")
    .addUserOption(userOpt())
    .addStringOption(reasonOpt),

  new SlashCommandBuilder()
    .setName("warn").setDescription("Видати попередження")
    .addUserOption(userOpt())
    .addStringOption(reasonOpt),

  new SlashCommandBuilder()
    .setName("warnings").setDescription("Переглянути попередження")
    .addUserOption(userOpt(false)),

  new SlashCommandBuilder()
    .setName("unwarn").setDescription("Зняти останній warn")
    .addUserOption(userOpt()),

  new SlashCommandBuilder()
    .setName("clear").setDescription("Очистити чат")
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Кількість 1-100")
        .setMinValue(1).setMaxValue(100).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("mute").setDescription("Видати тайм-аут")
    .addUserOption(userOpt())
    .addIntegerOption(o =>
      o.setName("minutes").setDescription("Хвилини (до 40320)")
        .setMinValue(1).setMaxValue(40320).setRequired(true)
    )
    .addStringOption(reasonOpt),

  new SlashCommandBuilder()
    .setName("unmute").setDescription("Зняти тайм-аут")
    .addUserOption(userOpt()),

  new SlashCommandBuilder().setName("lock").setDescription("Закрити канал"),
  new SlashCommandBuilder().setName("unlock").setDescription("Відкрити канал"),

  new SlashCommandBuilder()
    .setName("slowmode").setDescription("Встановити slowmode")
    .addIntegerOption(o =>
      o.setName("seconds").setDescription("0-21600 секунд")
        .setMinValue(0).setMaxValue(21600).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("role-add").setDescription("Видати роль")
    .addUserOption(userOpt())
    .addRoleOption(o => o.setName("role").setDescription("Роль").setRequired(true)),

  new SlashCommandBuilder()
    .setName("role-remove").setDescription("Зняти роль")
    .addUserOption(userOpt())
    .addRoleOption(o => o.setName("role").setDescription("Роль").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setup-logs").setDescription("Налаштувати канал логів")
    .addChannelOption(o =>
      o.setName("channel").setDescription("Канал")
        .addChannelTypes(ChannelType.GuildText).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setup").setDescription("Налаштувати канал привітань зі святами")
    .addChannelOption(o =>
      o.setName("channel").setDescription("Канал")
        .addChannelTypes(ChannelType.GuildText).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setup-tickets").setDescription("Вибрати категорію для тикетів")
    .addChannelOption(o =>
      o.setName("category").setDescription("Категорія")
        .addChannelTypes(ChannelType.GuildCategory).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setup-warns").setDescription("Скільки warn до автоматичного тайм-ауту (1 год)")
    .addIntegerOption(o =>
      o.setName("count").setDescription("Кількість (0 = вимкнено)")
        .setMinValue(0).setMaxValue(20).setRequired(true)
    )

];

const OWNER_COMMANDS = new Set(["admin-add", "admin-remove", "admins"]);

const ADMIN_COMMANDS = new Set([
  "ban", "unban", "kick", "warn", "warnings", "unwarn", "clear",
  "mute", "unmute", "lock", "unlock", "slowmode",
  "role-add", "role-remove", "setup-logs", "setup", "setup-tickets", "setup-warns"
]);

// =========================
// СВЯТА
// =========================

const HOLIDAYS = {
  "01-01": "🎆 З Новим роком!",
  "01-22": "🇺🇦 З Днем Соборності України!",
  "02-14": "💘 З Днем святого Валентина!",
  "03-08": "💐 З Міжнародним жіночим днем!",
  "05-08": "🕊️ День пам'яті та перемоги над нацизмом у Другій світовій війні.",
  "06-28": "📜 З Днем Конституції України!",
  "08-24": "💙💛 З Днем Незалежності України!",
  "10-01": "🛡️ З Днем захисників і захисниць України!",
  "11-21": "🔥 З Днем Гідності та Свободи!",
  "12-06": "🪖 З Днем Збройних Сил України!",
  "12-25": "🎄 З Різдвом Христовим!"
};

function kyivNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false
  }).formatToParts(new Date());

  const get = t => parts.find(p => p.type === t).value;

  return {
    key: `${get("year")}-${get("month")}-${get("day")}`,
    md: `${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24
  };
}

async function checkHolidays() {
  const now = kyivNow();

  const text = HOLIDAYS[now.md];

  if (!text || now.hour < 9) return;

  for (const g of client.guilds.cache.values()) {
    const x = cfg(g.id);

    if (!x.holidayChannel || x.lastHoliday === now.key) continue;

    const ch = g.channels.cache.get(x.holidayChannel);

    if (!ch) continue;

    try {
      await ch.send({
        embeds: [
          new EmbedBuilder().setColor(0xffd700).setDescription(text).setTimestamp()
        ]
      });

      x.lastHoliday = now.key;
      save();
    } catch (e) {
      console.error("❌ Привітання:", e.message);
    }
  }
}

// =========================
// ОБРОБНИКИ КОМАНД
// =========================

const handlers = {};

// ---- Для всіх ----

handlers.ubping = i => i.reply(`🏓 Pong! ${client.ws.ping}ms`);

handlers.help = i => i.reply({
  embeds: [
    new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🤖 Universal Bot MAX")
      .setDescription(
        "### 🎮 Для всіх\n" +
        "`/ubping` `/serverinfo` `/botinfo` `/userinfo` `/avatar`\n" +
        "`/ticket` — підтримка\n" +
        "`/8ball` `/coinflip` `/dice` `/random`\n" +
        "`/poll` — опитування з реакціями\n\n" +

        "### 🛡️ Адміністрація\n" +
        "`/ban` `/unban` `/kick` `/mute` `/unmute`\n" +
        "`/warn` `/warnings` `/unwarn`\n" +
        "`/clear` `/lock` `/unlock` `/slowmode`\n" +
        "`/role-add` `/role-remove`\n" +
        "`/setup-logs` `/setup` `/setup-tickets` `/setup-warns`\n\n" +

        "### 👑 Власник\n" +
        "`/admin-add` `/admin-remove` `/admins`"
      )
  ]
});

handlers.serverinfo = i => {
  const g = i.guild;

  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📊 ${g.name}`)
        .setThumbnail(g.iconURL({ size: 256 }))
        .addFields(
          { name: "👑 Власник", value: `<@${g.ownerId}>`, inline: true },
          { name: "👥 Учасники", value: `${g.memberCount}`, inline: true },
          { name: "💬 Канали", value: `${g.channels.cache.size}`, inline: true },
          { name: "🎭 Ролі", value: `${g.roles.cache.size}`, inline: true },
          { name: "🚀 Бусти", value: `${g.premiumSubscriptionCount ?? 0}`, inline: true },
          { name: "📅 Створено", value: `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`, inline: true }
        )
    ]
  });
};

handlers.botinfo = i => {
  const s = Math.floor(process.uptime());

  const uptime =
    `${Math.floor(s / 86400)}д ${Math.floor(s % 86400 / 3600)}г ${Math.floor(s % 3600 / 60)}хв`;

  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🤖 Universal Bot MAX")
        .addFields(
          { name: "🏓 Ping", value: `${client.ws.ping}ms`, inline: true },
          { name: "🖥️ Серверів", value: `${client.guilds.cache.size}`, inline: true },
          { name: "💾 RAM", value: `${(process.memoryUsage().rss / 1048576).toFixed(1)} MB`, inline: true },
          { name: "⏱️ Аптайм", value: uptime, inline: true },
          { name: "🟩 Node.js", value: process.version, inline: true }
        )
    ]
  });
};

handlers.userinfo = async i => {
  const u = i.options.getUser("user") || i.user;
  const m = await i.guild.members.fetch(u.id).catch(() => null);

  const e = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`👤 ${u.username}`)
    .setThumbnail(u.displayAvatarURL({ size: 512 }))
    .addFields(
      { name: "🆔 ID", value: u.id },
      { name: "📅 Акаунт створено", value: `<t:${Math.floor(u.createdTimestamp / 1000)}:F>` }
    );

  if (m) {
    e.addFields({
      name: "📥 Приєднався",
      value: `<t:${Math.floor(m.joinedTimestamp / 1000)}:F>`
    });

    const roles = m.roles.cache
      .filter(r => r.id !== i.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => `${r}`)
      .slice(0, 15);

    if (roles.length) e.addFields({ name: "🎭 Ролі", value: roles.join(" ") });
  }

  return i.reply({ embeds: [e] });
};

handlers.avatar = i => {
  const u = i.options.getUser("user") || i.user;

  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🖼️ ${u.username}`)
        .setImage(u.displayAvatarURL({ size: 1024 }))
    ]
  });
};

handlers["8ball"] = i => {
  const answers = [
    "Так!", "Однозначно!", "Без сумніву.", "Усе вказує на «так».",
    "Можливо.", "Запитай пізніше.", "Краще не розповідати зараз.",
    "Навряд чи.", "Ні.", "Дуже сумнівно."
  ];

  return i.reply(
    `❓ ${i.options.getString("question")}\n🎱 ${answers[Math.floor(Math.random() * answers.length)]}`
  );
};

handlers.coinflip = i =>
  i.reply(Math.random() < 0.5 ? "🪙 Орел!" : "🪙 Решка!");

handlers.dice = i => {
  const sides = i.options.getInteger("sides") ?? 6;

  return i.reply(`🎲 d${sides}: **${Math.floor(Math.random() * sides) + 1}**`);
};

handlers.random = i => {
  let min = i.options.getInteger("min") ?? 1;
  let max = i.options.getInteger("max") ?? 100;

  if (min > max) [min, max] = [max, min];

  return i.reply(
    `🎯 Число від ${min} до ${max}: **${Math.floor(Math.random() * (max - min + 1)) + min}**`
  );
};

handlers.poll = async i => {
  const numbers = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

  const options = [1, 2, 3, 4, 5]
    .map(n => i.options.getString(`option${n}`))
    .filter(Boolean);

  await i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📊 ${i.options.getString("question")}`)
        .setDescription(options.map((o, k) => `${numbers[k]} ${o}`).join("\n\n"))
        .setFooter({ text: `Опитування від ${i.user.username}` })
    ]
  });

  const msg = await i.fetchReply();

  for (let k = 0; k < options.length; k++) {
    await msg.react(numbers[k]).catch(() => { });
  }
};

// ---- Тикети (панель) ----

handlers.ticket = i => i.reply({
  embeds: [
    new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🎫 Підтримка")
      .setDescription("Натисни кнопку нижче, щоб створити тикет.")
  ],
  components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket")
        .setLabel("Створити тикет")
        .setEmoji("🎫")
        .setStyle(ButtonStyle.Primary)
    )
  ]
});

// ---- Власник ----

handlers["admin-add"] = async i => {
  const user = i.options.getUser("user");

  if (user.bot) {
    return i.reply({ content: "🤖 Боту не можна видати адмінку.", flags: EPH });
  }

  if (isOwner(user.id)) {
    return i.reply({ content: "👑 Ти вже власник бота.", flags: EPH });
  }

  const x = cfg(i.guild.id);

  if (x.admins.includes(user.id)) {
    return i.reply({ content: `⚠️ ${user} вже є адміністратором.`, flags: EPH });
  }

  x.admins.push(user.id);
  save();

  await i.reply(`🛡️ ${user} тепер адміністратор.`);

  return log(i.guild, `🛡️ ${user} отримав адмінку від ${i.user}`);
};

handlers["admin-remove"] = async i => {
  const user = i.options.getUser("user");
  const x = cfg(i.guild.id);

  if (!x.admins.includes(user.id)) {
    return i.reply({ content: `❌ ${user} не є адміністратором.`, flags: EPH });
  }

  x.admins = x.admins.filter(id => id !== user.id);
  save();

  await i.reply(`❌ У ${user} забрано адмінку.`);

  return log(i.guild, `❌ ${user} втратив адмінку. Зняв: ${i.user}`);
};

handlers.admins = i => {
  const x = cfg(i.guild.id);

  const list = x.admins.length
    ? x.admins.map((id, k) => `${k + 1}. <@${id}> — \`${id}\``).join("\n")
    : "_Адміністраторів поки немає._";

  return i.reply({
    flags: EPH,
    embeds: [
      new EmbedBuilder()
        .setColor(0xffc107)
        .setTitle("🛡️ Адміністратори")
        .setDescription(`👑 Власник: <@${process.env.OWNER_ID}>\n\n${list}`)
    ]
  });
};

// ---- Налаштування ----

handlers["setup-logs"] = async i => {
  const ch = i.options.getChannel("channel");

  cfg(i.guild.id).logChannel = ch.id;
  save();

  await i.reply(`✅ Канал логів: ${ch}`);

  return log(i.guild, `⚙️ Канал логів налаштовано (${i.user})`);
};

handlers.setup = i => {
  const ch = i.options.getChannel("channel");

  cfg(i.guild.id).holidayChannel = ch.id;
  save();

  return i.reply(`✅ Канал привітань: ${ch}\nПривітання надсилаються о 9:00 за Києвом у дні свят.`);
};

handlers["setup-tickets"] = i => {
  const cat = i.options.getChannel("category");

  cfg(i.guild.id).ticketCategory = cat.id;
  save();

  return i.reply(`✅ Тикети створюватимуться в категорії **${cat.name}**.`);
};

handlers["setup-warns"] = i => {
  const n = i.options.getInteger("count");

  cfg(i.guild.id).autoMuteWarns = n;
  save();

  return i.reply(
    n ? `✅ Після **${n}** warn — автоматичний тайм-аут на 1 годину.` : "✅ Автотайм-аут вимкнено."
  );
};

// ---- Модерація ----

handlers.ban = async i => {
  const u = i.options.getUser("user");
  const m = await i.guild.members.fetch(u.id).catch(() => null);

  const err = checkTarget(i, m);
  if (err) return i.reply({ content: err, flags: EPH });

  const reason = i.options.getString("reason") || "Не вказано";
  const days = i.options.getInteger("days") ?? 0;

  await m.ban({
    reason: `${reason} | Модератор: ${i.user.username}`,
    deleteMessageSeconds: days * 86400
  });

  await i.reply(`🔨 ${u} заблоковано. Причина: ${reason}`);

  return log(i.guild, `🔨 ${u} заблокований ${i.user}\nПричина: ${reason}`);
};

handlers.unban = async i => {
  const id = i.options.getString("userid").trim();

  if (!/^\d{15,22}$/.test(id)) {
    return i.reply({ content: "❌ Некоректний ID.", flags: EPH });
  }

  try {
    await i.guild.members.unban(id);
  } catch {
    return i.reply({ content: "❌ Цього користувача немає в списку банів.", flags: EPH });
  }

  await i.reply(`✅ <@${id}> розблоковано.`);

  return log(i.guild, `✅ <@${id}> розблокований ${i.user}`);
};

handlers.kick = async i => {
  const u = i.options.getUser("user");
  const m = await i.guild.members.fetch(u.id).catch(() => null);

  const err = checkTarget(i, m);
  if (err) return i.reply({ content: err, flags: EPH });

  const reason = i.options.getString("reason") || "Не вказано";

  await m.kick(`${reason} | Модератор: ${i.user.username}`);

  await i.reply(`👢 ${u} виключено. Причина: ${reason}`);

  return log(i.guild, `👢 ${u} виключений ${i.user}\nПричина: ${reason}`);
};

handlers.warn = async i => {
  const u = i.options.getUser("user");
  const m = await i.guild.members.fetch(u.id).catch(() => null);

  const err = checkTarget(i, m);
  if (err) return i.reply({ content: err, flags: EPH });

  const x = cfg(i.guild.id);

  x.warns[u.id] ??= [];

  const reason = i.options.getString("reason") || "Не вказано";

  x.warns[u.id].push({ reason, by: i.user.id, date: Date.now() });
  save();

  const count = x.warns[u.id].length;

  let extra = "";

  if (x.autoMuteWarns && count >= x.autoMuteWarns && count % x.autoMuteWarns === 0) {
    const ok = await m.timeout(3600000, `Авто: ${count} warn`).then(() => true).catch(() => false);

    if (ok) extra = "\n🔇 Автоматичний тайм-аут на 1 годину.";
  }

  await i.reply(`⚠️ ${u} отримав warn №${count}. Причина: ${reason}${extra}`);

  return log(i.guild, `⚠️ ${u} отримав warn №${count} від ${i.user}\nПричина: ${reason}${extra}`);
};

handlers.warnings = i => {
  const u = i.options.getUser("user") || i.user;
  const list = cfg(i.guild.id).warns[u.id] ?? [];

  if (!list.length) return i.reply(`✅ У ${u} немає warn.`);

  const text = list
    .map((w, k) =>
      `**${k + 1}.** ${w.reason} — <@${w.by}>, <t:${Math.floor(w.date / 1000)}:R>`
    )
    .join("\n")
    .slice(0, 4000);

  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle(`⚠️ Попередження: ${u.username} (${list.length})`)
        .setDescription(text)
    ]
  });
};

handlers.unwarn = async i => {
  const u = i.options.getUser("user");
  const list = cfg(i.guild.id).warns[u.id] ?? [];

  if (!list.length) {
    return i.reply({ content: "❌ Warn немає.", flags: EPH });
  }

  list.pop();
  save();

  await i.reply(`✅ Останній warn знято з ${u}. Залишилось: ${list.length}`);

  return log(i.guild, `✅ З ${u} знято warn (${i.user})`);
};

handlers.clear = async i => {
  await i.deferReply({ flags: EPH });

  const d = await i.channel.bulkDelete(i.options.getInteger("amount"), true);

  await i.editReply(
    `🧹 Видалено ${d.size} повідомлень.` +
    "\nℹ️ Повідомлення старші за 14 днів Discord видалити не дозволяє."
  );

  return log(i.guild, `🧹 ${i.user} видалив ${d.size} повідомлень у ${i.channel}`);
};

handlers.mute = async i => {
  const u = i.options.getUser("user");
  const m = await i.guild.members.fetch(u.id).catch(() => null);

  const err = checkTarget(i, m);
  if (err) return i.reply({ content: err, flags: EPH });

  const minutes = i.options.getInteger("minutes");
  const reason = i.options.getString("reason") || "Не вказано";

  await m.timeout(minutes * 60000, reason);

  await i.reply(`🔇 ${u} отримав тайм-аут на ${minutes} хв. Причина: ${reason}`);

  return log(i.guild, `🔇 ${u} — тайм-аут ${minutes} хв від ${i.user}\nПричина: ${reason}`);
};

handlers.unmute = async i => {
  const u = i.options.getUser("user");
  const m = await i.guild.members.fetch(u.id).catch(() => null);

  if (!m) return i.reply({ content: "❌ Користувача не знайдено на сервері.", flags: EPH });

  await m.timeout(null);

  await i.reply(`🔊 Тайм-аут з ${u} знято.`);

  return log(i.guild, `🔊 З ${u} знято тайм-аут (${i.user})`);
};

async function setLock(i, locked) {
  await i.channel.permissionOverwrites.edit(i.guild.roles.everyone, {
    SendMessages: locked ? false : null
  });

  await i.reply(locked ? "🔒 Канал закрито." : "🔓 Канал відкрито.");

  return log(i.guild, `${locked ? "🔒" : "🔓"} ${i.channel} ${locked ? "закрито" : "відкрито"} (${i.user})`);
}

handlers.lock = i => setLock(i, true);
handlers.unlock = i => setLock(i, false);

handlers.slowmode = async i => {
  const s = i.options.getInteger("seconds");

  await i.channel.setRateLimitPerUser(s);

  return i.reply(s ? `🐢 Slowmode: ${s} с.` : "🐇 Slowmode вимкнено.");
};

async function roleAction(i, add) {
  const u = i.options.getUser("user");
  const r = i.options.getRole("role");
  const m = await i.guild.members.fetch(u.id).catch(() => null);

  if (!m) return i.reply({ content: "❌ Користувача не знайдено на сервері.", flags: EPH });

  if (r.id === i.guild.id || r.managed) {
    return i.reply({ content: "❌ Цю роль не можна видавати/знімати вручну.", flags: EPH });
  }

  if (r.position >= i.guild.members.me.roles.highest.position) {
    return i.reply({ content: "❌ Ця роль вища або рівна ролі бота.", flags: EPH });
  }

  // Звичайний адмін бота не може керувати ролями вище за свої
  if (!isOwner(i.user.id) && i.user.id !== i.guild.ownerId &&
    r.position >= i.member.roles.highest.position) {
    return i.reply({ content: "❌ Ця роль вища або рівна твоїй найвищій ролі.", flags: EPH });
  }

  if (add) await m.roles.add(r);
  else await m.roles.remove(r);

  await i.reply({
    content: add ? `✅ Роль ${r} видано ${u}.` : `✅ Роль ${r} знято з ${u}.`,
    allowedMentions: { parse: [] }
  });

  return log(i.guild, `${add ? "➕" : "➖"} Роль ${r} ${add ? "видано" : "знято"}: ${u} (${i.user})`);
}

handlers["role-add"] = i => roleAction(i, true);
handlers["role-remove"] = i => roleAction(i, false);

// =========================
// КНОПКИ ТИКЕТІВ
// =========================

async function handleButton(i) {
  if (!i.inGuild()) return;

  if (i.customId === "ticket") {
    const old = i.guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.topic === `ticket:${i.user.id}`
    );

    if (old) {
      return i.reply({ content: `❌ Тикет вже існує: ${old}`, flags: EPH });
    }

    await i.deferReply({ flags: EPH });

    const x = cfg(i.guild.id);

    const staff = x.admins
      .filter(id => i.guild.members.cache.has(id) || true)
      .map(id => ({
        id,
        allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"]
      }));

    const parent =
      x.ticketCategory && i.guild.channels.cache.has(x.ticketCategory)
        ? x.ticketCategory
        : undefined;

    const ch = await i.guild.channels.create({
      name: `ticket-${i.user.username}`.slice(0, 90),
      type: ChannelType.GuildText,
      topic: `ticket:${i.user.id}`,
      parent,
      permissionOverwrites: [
        { id: i.guild.roles.everyone.id, deny: ["ViewChannel"] },
        { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        {
          id: client.user.id,
          allow: ["ViewChannel", "SendMessages", "ManageChannels", "ReadMessageHistory"]
        },
        ...staff.filter(s => s.id !== i.user.id)
      ]
    });

    await ch.send({
      content: `🎫 <@${i.user.id}> Опиши свою проблему — адміністрація скоро відповість.`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("close")
            .setLabel("Закрити")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger)
        )
      ]
    });

    await i.editReply(`✅ Тикет створено: ${ch}`);

    return log(i.guild, `🎫 Тикет ${ch} створено ${i.user}`);
  }

  if (i.customId === "close") {
    const ownerId = i.channel.topic?.startsWith("ticket:")
      ? i.channel.topic.slice(7)
      : null;

    if (!ownerId) {
      return i.reply({ content: "❌ Це не тикет.", flags: EPH });
    }

    if (i.user.id !== ownerId && !isAdmin(i.guild.id, i.user.id)) {
      return i.reply({ content: "⛔ Закрити тикет може його автор або адміністратор.", flags: EPH });
    }

    await i.reply("🔒 Тикет буде закрито через 5 секунд.");

    const name = i.channel.name;

    setTimeout(() => {
      i.channel.delete().catch(() => { });
    }, 5000);

    return log(i.guild, `🔒 Тикет **${name}** закрито ${i.user}`);
  }
}

// =========================
// READY
// =========================

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

client.once(Events.ClientReady, async () => {
  console.log(`🤖 ${client.user.tag}`);
  console.log(`🟢 Серверів: ${client.guilds.cache.size}`);

  try {
    const body = commands.map(c => c.toJSON());

    const route = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.CLIENT_ID);

    await rest.put(route, { body });

    console.log(
      `✅ Slash-команди зареєстровані (${process.env.GUILD_ID ? "сервер" : "глобально"}): ${body.length}`
    );
  } catch (e) {
    console.error("❌ Команди:", e.message);
  }

  checkHolidays();
  setInterval(checkHolidays, 10 * 60 * 1000);
});

// =========================
// INTERACTIONS
// =========================

client.on(Events.InteractionCreate, async i => {
  try {
    if (i.isButton()) return await handleButton(i);

    if (!i.isChatInputCommand()) return;

    if (!i.inGuild() || !i.guild) {
      return i.reply({ content: "❌ Команди працюють лише на сервері.", flags: EPH });
    }

    const n = i.commandName;

    if (OWNER_COMMANDS.has(n) && !isOwner(i.user.id)) {
      return i.reply({ content: "👑 Ця команда доступна тільки власнику бота.", flags: EPH });
    }

    if (ADMIN_COMMANDS.has(n) && !isAdmin(i.guild.id, i.user.id)) {
      return i.reply({ content: "⛔ У тебе немає прав адміністратора.", flags: EPH });
    }

    const h = handlers[n];

    if (!h) {
      return i.reply({ content: "❓ Невідома команда.", flags: EPH });
    }

    await h(i);
  } catch (e) {
    console.error("❌", e);

    const msg =
      e?.code === 50013 || e?.code === 50001
        ? "❌ У бота недостатньо прав для цієї дії (перевір права та позицію ролі бота)."
        : "❌ Сталася помилка. Спробуй ще раз.";

    const payload = { content: msg, flags: EPH };

    if (i.deferred || i.replied) i.followUp(payload).catch(() => { });
    else i.reply(payload).catch(() => { });
  }
});

client.on(Events.Error, e => console.error("❌ Client:", e));

process.on("unhandledRejection", e => console.error("❌ Unhandled:", e));
process.on("uncaughtException", e => console.error("❌ Uncaught:", e));

// =========================
// START
// =========================

if (!process.env.TOKEN || !process.env.CLIENT_ID || !process.env.OWNER_ID) {
  console.error("❌ Заповни TOKEN, CLIENT_ID та OWNER_ID у .env (GUILD_ID — необов'язково)");
  process.exit(1);
}

client.login(process.env.TOKEN).catch(e => {
  console.error("❌ Login:", e.message);
  process.exit(1);
});
