"use strict";

// =========================
// ДНІ НАРОДЖЕННЯ
// =========================

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType
} = require("discord.js");

const utils = require("./utils");

const MONTHS = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"
];

const MONTHS_GEN = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"
];

module.exports = function createBirthdays(ctx) {
  const { client, cfg, save, isAdmin, EPH } = ctx;

  const fmt = b => `${b.d} ${MONTHS_GEN[b.m - 1]}${b.y ? ` ${b.y}` : ""}`;

  const commands = [
    new SlashCommandBuilder()
      .setName("birthday").setDescription("Дні народження")
      .addSubcommand(sc =>
        sc.setName("set").setDescription("Записати день народження")
          .addIntegerOption(o =>
            o.setName("day").setDescription("День").setMinValue(1).setMaxValue(31).setRequired(true)
          )
          .addIntegerOption(o =>
            o.setName("month").setDescription("Місяць").setRequired(true)
              .addChoices(...MONTHS.map((name, k) => ({ name, value: k + 1 })))
          )
          .addIntegerOption(o =>
            o.setName("year").setDescription("Рік народження (необов'язково)")
              .setMinValue(1900).setMaxValue(new Date().getFullYear())
          )
          .addUserOption(o =>
            o.setName("user").setDescription("Для іншого користувача (лише адміни)")
          )
      )
      .addSubcommand(sc =>
        sc.setName("remove").setDescription("Видалити день народження")
          .addUserOption(o => o.setName("user").setDescription("Для іншого користувача (лише адміни)"))
      )
      .addSubcommand(sc =>
        sc.setName("view").setDescription("Подивитись день народження")
          .addUserOption(o => o.setName("user").setDescription("Користувач"))
      )
      .addSubcommand(sc =>
        sc.setName("list").setDescription("Найближчі дні народження")
      ),

    new SlashCommandBuilder()
      .setName("setup-birthdays").setDescription("Канал для привітань з днем народження")
      .addChannelOption(o =>
        o.setName("channel").setDescription("Канал")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)
      )
  ];

  const handlers = {};

  handlers.birthday = async i => {
    const sub = i.options.getSubcommand();
    const x = cfg(i.guildId);

    if (sub === "list") {
      const now = utils.kyivNow();

      const rows = Object.entries(x.birthdays)
        .map(([id, b]) => ({ id, b, days: utils.daysUntilBirthday(b, now) }))
        .sort((a, c) => a.days - c.days)
        .slice(0, 10);

      if (!rows.length) {
        return i.reply({ content: "📭 Поки що ніхто не записав свій день народження. Використай `/birthday set`.", flags: EPH });
      }

      const when = d => d === 0 ? "**сьогодні** 🎉" : d === 1 ? "завтра" : `через ${d} дн.`;

      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff73fa)
            .setTitle("🎂 Найближчі дні народження")
            .setDescription(
              rows.map(r => `**${r.b.d} ${MONTHS_GEN[r.b.m - 1]}** — <@${r.id}> · ${when(r.days)}`).join("\n")
            )
        ],
        allowedMentions: { parse: [] }
      });
    }

    const target = i.options.getUser("user") || i.user;

    if (target.bot) return i.reply({ content: "🤖 У ботів немає дня народження.", flags: EPH });

    if (sub !== "view" && target.id !== i.user.id && !isAdmin(i.guildId, i.user.id)) {
      return i.reply({ content: "⛔ Змінювати чужий день народження можуть лише адміністратори.", flags: EPH });
    }

    if (sub === "view") {
      const b = x.birthdays[target.id];

      if (!b) return i.reply({ content: `📭 ${target} ще не записав день народження.`, flags: EPH, allowedMentions: { parse: [] } });

      const days = utils.daysUntilBirthday(b, utils.kyivNow());

      return i.reply({
        content: `🎂 ${target}: **${b.d} ${MONTHS_GEN[b.m - 1]}**${days === 0 ? " — **сьогодні!** 🎉" : ` (через ${days} дн.)`}`,
        allowedMentions: { parse: [] }
      });
    }

    if (sub === "remove") {
      if (!x.birthdays[target.id]) {
        return i.reply({ content: "❌ День народження не записаний.", flags: EPH });
      }

      delete x.birthdays[target.id];
      save();

      return i.reply({ content: `🗑️ День народження ${target} видалено.`, flags: EPH, allowedMentions: { parse: [] } });
    }

    // set
    const d = i.options.getInteger("day", true);
    const m = i.options.getInteger("month", true);
    const y = i.options.getInteger("year");

    if (!utils.validDate(d, m, y)) {
      return i.reply({ content: "❌ Такої дати не існує. Перевір день, місяць і рік.", flags: EPH });
    }

    x.birthdays[target.id] = y ? { d, m, y } : { d, m };
    save();

    return i.reply({
      content: `🎂 Записано для ${target}: **${fmt(x.birthdays[target.id])}**.` +
        (x.birthdayChannel ? "" : "\nℹ️ Канал привітань ще не налаштований — адмін може зробити це через `/setup-birthdays`."),
      flags: EPH,
      allowedMentions: { parse: [] }
    });
  };

  handlers["setup-birthdays"] = i => {
    const ch = i.options.getChannel("channel", true);

    cfg(i.guildId).birthdayChannel = ch.id;
    save();

    return i.reply(`✅ Канал привітань з днем народження: ${ch}\nПривітання надсилаються о 9:00 за Києвом.`);
  };

  async function check() {
    const now = utils.kyivNow();

    if (now.hour < 9) return;

    for (const g of client.guilds.cache.values()) {
      const x = cfg(g.id);

      if (!x.birthdayChannel || x.lastBirthdayCheck === now.key) continue;

      const ch = g.channels.cache.get(x.birthdayChannel);

      if (!ch?.isTextBased()) continue;

      const present = [];

      for (const [id, b] of Object.entries(x.birthdays)) {
        if (!utils.isBirthdayToday(b, now)) continue;

        const member = await g.members.fetch(id).catch(() => null);

        if (member) present.push({ id, b });
      }

      if (present.length) {
        const lines = present.map(({ id, b }) =>
          `🎉 З днем народження, <@${id}>!` + (b.y ? ` Сьогодні тобі **${now.year - b.y}**! 🥳` : "")
        );

        try {
          await ch.send({
            content: present.map(p => `<@${p.id}>`).join(" "),
            embeds: [
              new EmbedBuilder()
                .setColor(0xff73fa)
                .setTitle("🎂 День народження!")
                .setDescription(lines.join("\n") + "\n\nБажаємо щастя, здоров'я та яскравих емоцій! 🎁")
                .setTimestamp()
            ],
            allowedMentions: { users: present.map(p => p.id) }
          });
        } catch (e) {
          console.error("❌ Привітання з ДН:", e.message);
        }
      }

      x.lastBirthdayCheck = now.key;
      save();
    }
  }

  function onReady() {
    check().catch(e => console.error("❌ ДН:", e.message));

    setInterval(() => {
      check().catch(e => console.error("❌ ДН:", e.message));
    }, 10 * 60 * 1000);
  }

  return {
    commands,
    handlers,
    adminCommands: new Set(["setup-birthdays"]),
    onReady
  };
};
