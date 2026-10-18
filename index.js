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
  ChannelType
} = require("discord.js");

const fs = require("fs");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const CONFIG = "./config.json";

function load() {
  if (!fs.existsSync(CONFIG)) {
    fs.writeFileSync(CONFIG, "{}");
  }

  try {
    return JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  } catch {
    return {};
  }
}

function save(c) {
  fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2));
}

function cfg(id) {
  const c = load();

  c[id] ??= {
    warns: {},
    admins: [],
    logChannel: null,
    holidayChannel: null,
    ticketCategory: null
  };

  c[id].admins ??= [];

  save(c);

  return c[id];
}

function isOwner(userId) {
  return userId === process.env.OWNER_ID;
}

function isAdmin(guildId, userId) {
  if (isOwner(userId)) return true;

  const x = cfg(guildId);

  return x.admins.includes(userId);
}

async function adminOnly(i) {
  if (isAdmin(i.guild.id, i.user.id)) return true;

  await i.reply({
    content: "⛔ У тебе немає прав адміністратора.",
    ephemeral: true
  });

  return false;
}

async function ownerOnly(i) {
  if (isOwner(i.user.id)) return true;

  await i.reply({
    content: "👑 Ця команда доступна тільки власнику бота.",
    ephemeral: true
  });

  return false;
}

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


// =========================
// КОМАНДИ
// =========================

const commands = [

  // PLAYER
  new SlashCommandBuilder()
    .setName("ubping")
    .setDescription("Перевірити бота"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Список команд"),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Інформація про сервер"),

  new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("Інформація про бота"),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Створити тикет"),

  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Магічна відповідь"),

  new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Підкинути монетку"),

  new SlashCommandBuilder()
    .setName("dice")
    .setDescription("Кинути кубик"),

  new SlashCommandBuilder()
    .setName("random")
    .setDescription("Випадкове число"),

  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Створити опитування"),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Показати аватар")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Користувач")
    ),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Інформація про користувача")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Користувач")
    ),


  // =========================
  // ADMIN
  // =========================

  new SlashCommandBuilder()
    .setName("admin-add")
    .setDescription("Видати права адміністратора")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Користувач")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("admin-remove")
    .setDescription("Забрати права адміністратора")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Користувач")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("admins")
    .setDescription("Список адміністраторів"),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Заблокувати користувача")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Користувач")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Причина")
    ),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Розблокувати користувача")
    .addStringOption(o =>
      o.setName("userid")
        .setDescription("ID користувача")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Виключити користувача")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Користувач")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Причина")
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Видати попередження")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Користувач")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Причина")
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Переглянути попередження")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Користувач")
    ),

  new SlashCommandBuilder()
    .setName("unwarn")
    .setDescription("Зняти останній warn")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Користувач")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Очистити чат")
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Кількість 1-100")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Видати тайм-аут")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Користувач")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes")
        .setDescription("Хвилини")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Зняти тайм-аут")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Користувач")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Закрити канал"),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Відкрити канал"),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Встановити slowmode")
    .addIntegerOption(o =>
      o.setName("seconds")
        .setDescription("0-21600 секунд")
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("role-add")
    .setDescription("Видати роль")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Користувач")
        .setRequired(true)
    )
    .addRoleOption(o =>
      o.setName("role")
        .setDescription("Роль")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("role-remove")
    .setDescription("Зняти роль")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Користувач")
        .setRequired(true)
    )
    .addRoleOption(o =>
      o.setName("role")
        .setDescription("Роль")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setup-logs")
    .setDescription("Налаштувати логи")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Канал")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Налаштувати канал привітань")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Канал")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )

];


// =========================
// READY
// =========================

const rest = new REST({
  version: "10"
}).setToken(process.env.TOKEN);

client.once("ready", async () => {

  console.log(`🤖 ${client.user.tag}`);
  console.log(`🟢 Серверів: ${client.guilds.cache.size}`);

  try {

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      {
        body: commands.map(c => c.toJSON())
      }
    );

    console.log("✅ Slash-команди зареєстровані");

  } catch (e) {

    console.error("❌ Команди:", e.message);

  }

});


// =========================
// INTERACTIONS
// =========================

client.on("interactionCreate", async i => {

  try {

    // =========================
    // BUTTONS
    // =========================

    if (i.isButton()) {

      if (i.customId === "ticket") {

        const old = i.guild.channels.cache.find(
          c => c.name === `ticket-${i.user.id}`
        );

        if (old) {

          return i.reply({
            content: `❌ Тикет вже існує: ${old}`,
            ephemeral: true
          });

        }

        const x = cfg(i.guild.id);

        const ch = await i.guild.channels.create({

          name: `ticket-${i.user.id}`,

          type: ChannelType.GuildText,

          parent: x.ticketCategory || undefined,

          permissionOverwrites: [

            {
              id: i.guild.roles.everyone.id,
              deny: ["ViewChannel"]
            },

            {
              id: i.user.id,
              allow: [
                "ViewChannel",
                "SendMessages",
                "ReadMessageHistory"
              ]
            },

            {
              id: client.user.id,
              allow: [
                "ViewChannel",
                "SendMessages",
                "ManageChannels",
                "ReadMessageHistory"
              ]
            }

          ]

        });

        const row =
          new ActionRowBuilder()
            .addComponents(

              new ButtonBuilder()
                .setCustomId("close")
                .setLabel("Закрити")
                .setEmoji("🔒")
                .setStyle(ButtonStyle.Danger)

            );

        await ch.send({

          content:
            `🎫 <@${i.user.id}> Опиши свою проблему.`,

          components: [row]

        });

        return i.reply({

          content: `✅ Тикет створено: ${ch}`,

          ephemeral: true

        });

      }


      if (i.customId === "close") {

        await i.reply(
          "🔒 Тикет буде закрито через 5 секунд."
        );

        setTimeout(() => {

          i.channel.delete().catch(() => { });

        }, 5000);

        return;

      }

    }


    if (!i.isChatInputCommand()) return;

    const n = i.commandName;


    // =========================
    // OWNER COMMANDS
    // =========================

    if (n === "admin-add") {

      if (!(await ownerOnly(i))) return;

      const user = i.options.getUser("user");

      if (user.id === process.env.OWNER_ID) {

        return i.reply({
          content: "👑 Ти вже власник бота.",
          ephemeral: true
        });

      }

      const x = cfg(i.guild.id);

      if (x.admins.includes(user.id)) {

        return i.reply({
          content: `⚠️ ${user} вже є адміністратором.`,
          ephemeral: true
        });

      }

      x.admins.push(user.id);

      const all = load();

      all[i.guild.id] = x;

      save(all);

      await i.reply(
        `🛡️ ${user} тепер адміністратор.`
      );

      return log(
        i.guild,
        `🛡️ ${user.tag} отримав адмінку від ${i.user.tag}`
      );

    }


    if (n === "admin-remove") {

      if (!(await ownerOnly(i))) return;

      const user = i.options.getUser("user");

      const x = cfg(i.guild.id);

      if (!x.admins.includes(user.id)) {

        return i.reply({
          content: `❌ ${user} не є адміністратором.`,
          ephemeral: true
        });

      }

      x.admins =
        x.admins.filter(id => id !== user.id);

      const all = load();

      all[i.guild.id] = x;

      save(all);

      await i.reply(
        `❌ У ${user} забрано адмінку.`
      );

      return log(
        i.guild,
        `❌ ${user.tag} втратив адмінку. Зняв: ${i.user.tag}`
      );

    }


    if (n === "admins") {

      if (!(await ownerOnly(i))) return;

      const x = cfg(i.guild.id);

      if (!x.admins.length) {

        return i.reply(
          "📋 Адміністраторів поки немає."
        );

      }

      const list = x.admins
        .map((id, index) =>
          `${index + 1}. <@${id}> — \`${id}\``
        )
        .join("\n");

      return i.reply({

        embeds: [

          new EmbedBuilder()
            .setColor(0xffc107)
            .setTitle("🛡️ Адміністратори")
            .setDescription(
              `👑 Власник: <@${process.env.OWNER_ID}>\n\n${list}`
            )

        ]

      });

    }


    // =========================
    // ADMIN CHECK
    // =========================

    const adminCommands = [

      "ban",
      "unban",
      "kick",
      "warn",
      "warnings",
      "unwarn",
      "clear",
      "mute",
      "unmute",
      "lock",
      "unlock",
      "slowmode",
      "role-add",
      "role-remove",
      "setup-logs",
      "setup"

    ];

    if (adminCommands.includes(n)) {

      if (!(await adminOnly(i))) return;

    }


    // =========================
    // PLAYER
    // =========================

    if (n === "ubping") {

      return i.reply(
        `🏓 Pong! ${client.ws.ping}ms`
      );

    }


    if (n === "help") {

      return i.reply({

        embeds: [

          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🤖 Universal Bot MAX")
            .setDescription(
              "### 🎮 Команди для гравців\n" +
              "`/ubping` — перевірити бота\n" +
              "`/serverinfo` — інформація про сервер\n" +
              "`/userinfo` — інформація про користувача\n" +
              "`/avatar` — аватар\n" +
              "`/ticket` — підтримка\n" +
              "`/8ball` — магічна відповідь\n" +
              "`/coinflip` — монетка\n" +
              "`/dice` — кубик\n" +
              "`/random` — випадкове число\n" +
              "`/poll` — опитування\n\n" +

              "### 🛡️ Адміністрація\n" +
              "Адмін-команди доступні тільки власнику та виданим адміністраторам.\n\n" +

              "### 👑 Власник\n" +
              "`/admin-add` — видати адмінку\n" +
              "`/admin-remove` — забрати адмінку\n" +
              "`/admins` — список адмінів"
            )

        ]

      });

    }


    if (n === "serverinfo") {

      const g = i.guild;

      return i.reply({

        embeds: [

          new EmbedBuilder()
            .setTitle(`📊 ${g.name}`)
            .addFields(

              {
                name: "👥 Учасники",
                value: `${g.memberCount}`,
                inline: true
              },

              {
                name: "💬 Канали",
                value: `${g.channels.cache.size}`,
                inline: true
              },

              {
                name: "🎭 Ролі",
                value: `${g.roles.cache.size}`,
                inline: true
              }

            )

        ]

      });

    }


    if (n === "botinfo") {

      return i.reply({

        embeds: [

          new EmbedBuilder()
            .setTitle("🤖 Universal Bot MAX")
            .addFields(

              {
                name: "🏓 Ping",
                value: `${client.ws.ping}ms`,
                inline: true
              },

              {
                name: "🖥️ Серверів",
                value: `${client.guilds.cache.size}`,
                inline: true
              },

              {
                name: "💾 RAM",
                value:
                  `${(process.memoryUsage().rss / 1048576).toFixed(1)} MB`,
                inline: true
              }

            )

        ]

      });

    }


    if (n === "userinfo") {

      const u =
        i.options.getUser("user") || i.user;

      return i.reply({

        embeds: [

          new EmbedBuilder()
            .setTitle(`👤 ${u.tag}`)
            .setThumbnail(
              u.displayAvatarURL({ size: 512 })
            )
            .addFields(

              {
                name: "🆔 ID",
                value: u.id
              },

              {
                name: "📅 Створено",
                value:
                  `<t:${Math.floor(u.createdTimestamp / 1000)}:F>`
              }

            )

        ]

      });

    }


    if (n === "avatar") {

      const u =
        i.options.getUser("user") || i.user;

      return i.reply(
        u.displayAvatarURL({ size: 1024 })
      );

    }


    if (n === "8ball") {

      const answers = [

        "🎱 Так!",
        "🎱 Ні.",
        "🎱 Можливо.",
        "🎱 Запитай пізніше.",
        "🎱 Однозначно!"

      ];

      return i.reply(
        answers[Math.floor(Math.random() * answers.length)]
      );

    }


    if (n === "coinflip") {

      return i.reply(
        Math.random() < 0.5
          ? "🪙 Орел!"
          : "🪙 Решка!"
      );

    }


    if (n === "dice") {

      return i.reply(
        `🎲 Випало: **${Math.floor(Math.random() * 6) + 1}**`
      );

    }


    if (n === "random") {

      return i.reply(
        `🎯 Випадкове число: **${Math.floor(Math.random() * 100) + 1}**`
      );

    }


    if (n === "poll") {

      return i.reply(
        "📊 Опитування можна розширити кнопками та реакціями."
      );

    }


    // =========================
    // SETUP
    // =========================

    if (n === "setup-logs") {

      const x = cfg(i.guild.id);

      x.logChannel =
        i.options.getChannel("channel").id;

      const all = load();

      all[i.guild.id] = x;

      save(all);

      return i.reply(
        "✅ Канал логів налаштовано."
      );

    }


    if (n === "setup") {

      const x = cfg(i.guild.id);

      x.holidayChannel =
        i.options.getChannel("channel").id;

      const all = load();

      all[i.guild.id] = x;

      save(all);

      return i.reply(
        "✅ Канал привітань налаштовано."
      );

    }


    // =========================
    // MODERATION
    // =========================

    if (n === "ban") {

      const u =
        i.options.getUser("user");

      const m =
        await i.guild.members
          .fetch(u.id)
          .catch(() => null);

      if (!m) {

        return i.reply(
          "❌ Користувача не знайдено."
        );

      }

      await m.ban({

        reason:
          i.options.getString("reason") ||
          `Модератор: ${i.user.tag}`

      });

      await i.reply(
        `🔨 ${u} заблоковано.`
      );

      return log(
        i.guild,
        `🔨 ${u.tag} заблокований ${i.user.tag}`
      );

    }


    if (n === "unban") {

      const id =
        i.options.getString("userid");

      await i.guild.members.unban(id);

      return i.reply(
        `✅ ${id} розблоковано.`
      );

    }


    if (n === "kick") {

      const u =
        i.options.getUser("user");

      const m =
        await i.guild.members
          .fetch(u.id)
          .catch(() => null);

      if (!m) {

        return i.reply(
          "❌ Користувача не знайдено."
        );

      }

      await m.kick(
        i.options.getString("reason") ||
        "Не вказано"
      );

      return i.reply(
        `👢 ${u} виключено.`
      );

    }


    if (
      ["warn", "warnings", "unwarn"]
        .includes(n)
    ) {

      const u =
        i.options.getUser("user") ||
        i.user;

      const x =
        cfg(i.guild.id);

      x.warns[u.id] ??= [];


      if (n === "warn") {

        x.warns[u.id].push({

          reason:
            i.options.getString("reason") ||
            "Не вказано",

          by: i.user.id,

          date: Date.now()

        });

        const all = load();

        all[i.guild.id] = x;

        save(all);

        return i.reply(
          `⚠️ ${u} отримав warn №${x.warns[u.id].length}`
        );

      }


      if (n === "unwarn") {

        if (!x.warns[u.id].length) {

          return i.reply(
            "❌ Warn немає."
          );

        }

        x.warns[u.id].pop();

        const all = load();

        all[i.guild.id] = x;

        save(all);

        return i.reply(
          `✅ Останній warn знято з ${u}.`
        );

      }


      return i.reply(

        x.warns[u.id].length

          ? `⚠️ ${u}:\n` +
          x.warns[u.id]
            .map(
              (w, k) =>
                `${k + 1}. ${w.reason}`
            )
            .join("\n")

          : `✅ У ${u} немає warn.`

      );

    }


    if (n === "clear") {

      const amount =
        i.options.getInteger("amount");

      const d =
        await i.channel.bulkDelete(
          amount,
          true
        );

      return i.reply({

        content:
          `🧹 Видалено ${d.size} повідомлень.`,

        ephemeral: true

      });

    }


    if (
      n === "mute" ||
      n === "unmute"
    ) {

      const u =
        i.options.getUser("user");

      const m =
        await i.guild.members
          .fetch(u.id)
          .catch(() => null);

      if (!m) {

        return i.reply(
          "❌ Користувача не знайдено."
        );

      }

      if (n === "mute") {

        const minutes =
          i.options.getInteger("minutes");

        await m.timeout(
          minutes * 60000
        );

        return i.reply(
          `🔇 ${u} отримав тайм-аут на ${minutes} хв.`
        );

      }

      await m.timeout(null);

      return i.reply(
        `🔊 Тайм-аут з ${u} знято.`
      );

    }


    if (
      n === "lock" ||
      n === "unlock"
    ) {

      await i.channel.permissionOverwrites.edit(

        i.guild.roles.everyone,

        {
          SendMessages:
            n === "lock"
              ? false
              : null
        }

      );

      return i.reply(

        n === "lock"
          ? "🔒 Канал закрито."
          : "🔓 Канал відкрито."

      );

    }


    if (n === "slowmode") {

      const seconds =
        i.options.getInteger("seconds");

      await i.channel.setRateLimitPerUser(
        seconds
      );

      return i.reply(
        `🐢 Slowmode: ${seconds} секунд.`
      );

    }


    if (
      n === "role-add" ||
      n === "role-remove"
    ) {

      const u =
        i.options.getUser("user");

      const r =
        i.options.getRole("role");

      const m =
        await i.guild.members.fetch(u.id);

      if (n === "role-add") {

        await m.roles.add(r);

        return i.reply(
          `✅ Роль ${r} видано ${u}.`
        );

      }

      await m.roles.remove(r);

      return i.reply(
        `✅ Роль ${r} знято з ${u}.`
      );

    }


    // =========================
    // TICKET
    // =========================

    if (n === "ticket") {

      const row =
        new ActionRowBuilder()
          .addComponents(

            new ButtonBuilder()
              .setCustomId("ticket")
              .setLabel("Створити тикет")
              .setEmoji("🎫")
              .setStyle(ButtonStyle.Primary)

          );

      return i.reply({

        embeds: [

          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🎫 Підтримка")
            .setDescription(
              "Натисни кнопку нижче, щоб створити тикет."
            )

        ],

        components: [row]

      });

    }

  } catch (e) {

    console.error("❌", e);

    if (!i.replied) {

      await i.reply({

        content:
          "❌ Помилка. Перевір права бота.",

        ephemeral: true

      }).catch(() => { });

    }

  }

});


// =========================
// START
// =========================

if (
  !process.env.TOKEN ||
  !process.env.CLIENT_ID ||
  !process.env.GUILD_ID ||
  !process.env.OWNER_ID
) {

  console.error(
    "❌ Заповни TOKEN, CLIENT_ID, GUILD_ID та OWNER_ID у .env"
  );

  process.exit(1);

}

client.login(process.env.TOKEN)
  .catch(e => {

    console.error(
      "❌ Login:",
      e.message
    );

    process.exit(1);

  });


let counter = 0;

setInterval(() => {
    counter++;
    console.log(`Universal Bot | Цикл: ${counter}`);

    if (counter % 100 === 0 && global.gc) {
        global.gc();
        console.log('Очищення пам’яті виконано');
    }
}, 60000);
