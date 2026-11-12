"use strict";

// =========================
// МУЗИКА (як Jockie Music): голосові канали, черга, 24/7
// Джерела: YouTube, SoundCloud та інше, що вміє yt-dlp
// =========================

const { spawn, execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
  generateDependencyReport
} = require("@discordjs/voice");

const { fmtDuration, progressBar, shuffle, truncate, mdSafe } = require("./utils");

let ffmpegPath = null;

try {
  ffmpegPath = require("ffmpeg-static");
} catch { }

class UserError extends Error { }

const MAX_QUEUE = 200;
const MAX_PLAYLIST = 50;
const IDLE_LEAVE_MS = 3 * 60 * 1000;
const ALONE_LEAVE_MS = 2 * 60 * 1000;

// =========================
// yt-dlp: пошук, завантаження, оновлення
// =========================

const BIN_DIR = path.join(__dirname, "bin");
const IS_WIN = process.platform === "win32";

const ytdlp = process.env.YTDLP_PATH || path.join(BIN_DIR, IS_WIN ? "yt-dlp.exe" : "yt-dlp");

let jsRuntimeArgs = [];
let ytdlpReady = null;

function ytdlpAsset() {
  if (IS_WIN) return "yt-dlp.exe";
  if (process.platform === "darwin") return "yt-dlp_macos";
  if (process.arch === "arm64") return "yt-dlp_linux_aarch64";
  if (process.arch === "arm") return "yt-dlp_linux_armv7l";

  return "yt-dlp_linux";
}

function run(args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile(
      ytdlp,
      args,
      { maxBuffer: 64 * 1024 * 1024, timeout, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          err.stderr = String(stderr || "");
          return reject(err);
        }

        resolve(String(stdout));
      }
    );
  });
}

function ensureYtDlp() {
  ytdlpReady ??= (async () => {
    if (!process.env.YTDLP_PATH && !fs.existsSync(ytdlp)) {
      console.log("⬇️ Завантажую yt-dlp...");

      fs.mkdirSync(BIN_DIR, { recursive: true });

      const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytdlpAsset()}`;
      const res = await fetch(url);

      if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);

      const tmp = ytdlp + ".tmp";

      fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()), { mode: 0o755 });
      fs.renameSync(tmp, ytdlp);

      try { fs.chmodSync(ytdlp, 0o755); } catch { }
    }

    // Для YouTube yt-dlp потрібен JS-рантайм — використовуємо Node, якщо ця версія вміє
    const help = await run(["--help"]);

    if (help.includes("--js-runtimes")) jsRuntimeArgs = ["--js-runtimes", "node"];
  })().catch(e => {
    ytdlpReady = null;
    throw e;
  });

  return ytdlpReady;
}

async function updateYtDlp() {
  if (process.env.YTDLP_PATH || process.env.YTDLP_NO_UPDATE === "1") return;

  try {
    await ensureYtDlp();

    const out = await run(["-U"], 120000);

    console.log("🔄 yt-dlp:", out.trim().split("\n").pop());
  } catch (e) {
    console.error("⚠️ Оновлення yt-dlp:", e.message);
  }
}

function toTrack(e, requestedBy) {
  let url = e.webpage_url || e.original_url || e.url;

  if (url && !/^https?:\/\//i.test(url)) {
    url = e.id ? `https://www.youtube.com/watch?v=${e.id}` : null;
  }

  if (!url) return null;

  return {
    title: e.title || "Без назви",
    url,
    duration: Number.isFinite(e.duration) && !e.is_live ? e.duration : null,
    thumbnail: e.thumbnail || e.thumbnails?.at(-1)?.url || null,
    author: e.uploader || e.channel || null,
    requestedBy,
    failed: false
  };
}

async function resolveQuery(query, requestedBy, searchSource = "youtube") {
  try {
    await ensureYtDlp();
  } catch (e) {
    console.error("❌ yt-dlp:", e);
    throw new UserError(`❌ Не вдалося підготувати yt-dlp: ${truncate(e.message, 150)}`);
  }

  const isUrl = /^https?:\/\//i.test(query);

  if (/open\.spotify\.com|^spotify:/i.test(query)) {
    throw new UserError("❌ Spotify-посилання не підтримуються. Встав назву пісні або посилання YouTube / SoundCloud. Для Spotify-посилань встав назву треку та обери SoundCloud або YouTube.");
  }

  const wantsPlaylist = isUrl && (
    (/[?&]list=/.test(query) && !/[?&]v=/.test(query)) ||
    /youtube\.com\/playlist/i.test(query) ||
    /soundcloud\.com\/[^/]+\/sets\//i.test(query)
  );

  const args = [
    "--dump-single-json",
    "--flat-playlist",
    "--no-warnings",
    "--playlist-end", String(MAX_PLAYLIST),
    ...jsRuntimeArgs
  ];

  if (!wantsPlaylist) args.push("--no-playlist");

  args.push(isUrl ? query : `${searchSource === "soundcloud" ? "scsearch1" : "ytsearch1"}:${query}`);

  let out;

  try {
    out = await run(args, 90000);
  } catch (e) {
    const err = e.stderr || e.message || "";

    if (e.code === "ENOENT") throw new UserError("❌ yt-dlp не знайдено. Перевір YTDLP_PATH або перезапусти бота.");
    if (/Unsupported URL/i.test(err)) throw new UserError("❌ Це посилання не підтримується.");
    if (/confirm you.?re not a bot|Sign in to confirm/i.test(err)) {
      throw new UserError("❌ YouTube просить підтвердження, що це не бот. Спробуй пізніше або інше джерело (SoundCloud).");
    }
    if (e.killed) throw new UserError("❌ Час очікування вичерпано. Спробуй ще раз.");

    console.error("❌ yt-dlp (пошук):", truncate(err, 500));

    throw new UserError("❌ Нічого не знайдено або відео недоступне.");
  }

  let data;

  try {
    data = JSON.parse(out);
  } catch {
    throw new UserError("❌ Не вдалося обробити відповідь yt-dlp.");
  }

  const entries = Array.isArray(data.entries) ? data.entries.filter(Boolean) : [data];

  const tracks = entries
    .map(e => toTrack(e, requestedBy))
    .filter(Boolean);

  if (!tracks.length) throw new UserError("❌ Нічого не знайдено.");

  return {
    tracks,
    playlist: wantsPlaylist && tracks.length > 1 ? (data.title || "Плейлист") : null
  };
}

function openStream(track) {
  const args = [
    "-f", "bestaudio/best",
    "--no-playlist",
    "--no-warnings",
    "--quiet",
    "--no-part",
    ...jsRuntimeArgs
  ];

  if (ffmpegPath) args.push("--ffmpeg-location", ffmpegPath);

  args.push("-o", "-", track.url);

  return spawn(ytdlp, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
}

function explainYtError(text) {
  const t = String(text || "");

  if (/confirm you.?re not a bot|Sign in to confirm/i.test(t)) return "YouTube просить підтвердження (спробуй пізніше)";
  if (/private video/i.test(t)) return "приватне відео";
  if (/not available|unavailable|removed/i.test(t)) return "відео недоступне";
  if (/age/i.test(t) && /restrict|verify|confirm/i.test(t)) return "вікове обмеження";
  if (/copyright|blocked/i.test(t)) return "заблоковано правовласником або регіоном";

  const last = t.trim().split("\n").filter(Boolean).pop();

  return last ? truncate(last, 150) : "невідома помилка";
}

// =========================
// МОДУЛЬ
// =========================

module.exports = function createMusic(ctx) {
  const { client, cfg, save, isAdmin, EPH } = ctx;

  const sessions = new Map();
  const creating = new Map();

  // ---------- допоміжні ----------

  const fail = e => {
    if (e instanceof UserError) return e.message;

    console.error("❌ Музика:", e);

    return "❌ Сталася помилка під час роботи з музикою.";
  };

  async function send(s, payload) {
    const ch = s.guild.channels.cache.get(s.textChannelId);

    if (!ch?.isTextBased()) return null;

    try {
      return await ch.send({ allowedMentions: { parse: [] }, ...payload });
    } catch {
      return null;
    }
  }

  function killProc(s) {
    if (!s.proc) return;

    const p = s.proc;

    s.proc = null;

    try { p.kill("SIGKILL"); } catch { }
  }

  const isPaused = s => {
    const st = s.player.state.status;

    return st === AudioPlayerStatus.Paused || st === AudioPlayerStatus.AutoPaused;
  };

  const LOOP_LABEL = { off: "вимкнено", track: "🔂 трек", queue: "🔁 черга" };

  function nowEmbed(s) {
    const t = s.current;

    const e = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: isPaused(s) ? "⏸️ Пауза" : "🎶 Зараз грає" })
      .setTitle(truncate(mdSafe(t.title), 250))
      .setURL(t.url)
      .addFields(
        { name: "⏱️ Тривалість", value: fmtDuration(t.duration), inline: true },
        { name: "👤 Замовив", value: `<@${t.requestedBy}>`, inline: true },
        { name: "🔊 Гучність", value: `${s.volume}%`, inline: true },
        { name: "🔁 Повтор", value: LOOP_LABEL[s.loop], inline: true },
        { name: "📃 У черзі", value: `${s.queue.length}`, inline: true }
      );

    if (t.author) e.setDescription(`🎤 ${truncate(mdSafe(t.author), 100)}`);
    if (t.thumbnail) e.setThumbnail(t.thumbnail);

    return e;
  }

  function controls(s) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mus:toggle")
        .setEmoji(isPaused(s) ? "▶️" : "⏸️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mus:skip")
        .setEmoji("⏭️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mus:loop")
        .setEmoji("🔁")
        .setStyle(s.loop === "off" ? ButtonStyle.Secondary : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("mus:stop")
        .setEmoji("⏹️")
        .setStyle(ButtonStyle.Danger)
    );
  }

  async function sendNowPlaying(s) {
    const old = s.nowMsg;

    s.nowMsg = null;
    old?.delete().catch(() => { });

    const token = s.token;
    const msg = await send(s, { embeds: [nowEmbed(s)], components: [controls(s)] });

    if (!msg) return;

    if (s.destroyed || s.token !== token || !s.current) {
      msg.delete().catch(() => { });
      return;
    }

    s.nowMsg = msg;
  }

  // ---------- сесія ----------

  function scheduleIdleLeave(s) {
    clearTimeout(s.idleTimer);

    if (s.destroyed || cfg(s.id).music.stay247) return;

    s.idleTimer = setTimeout(async () => {
      if (s.destroyed || s.current || s.queue.length) return;

      await send(s, { content: "💤 Черга порожня — виходжу з каналу." });

      destroySession(s);
    }, IDLE_LEAVE_MS);
  }

  function checkAlone(s) {
    clearTimeout(s.aloneTimer);

    if (s.destroyed || cfg(s.id).music.stay247) return;

    const ch = s.guild.channels.cache.get(s.voiceChannelId);

    if (!ch) return;

    const humans = ch.members.filter(m => !m.user.bot).size;

    if (humans > 0) return;

    s.aloneTimer = setTimeout(async () => {
      if (s.destroyed) return;

      await send(s, { content: "👋 У каналі нікого не залишилось — виходжу." });

      destroySession(s);
    }, ALONE_LEAVE_MS);
  }

  function destroySession(s, { rejoin = false } = {}) {
    if (s.destroyed) return;

    s.destroyed = true;
    s.queue.length = 0;
    s.current = null;

    clearTimeout(s.idleTimer);
    clearTimeout(s.aloneTimer);

    killProc(s);

    s.nowMsg?.delete().catch(() => { });
    s.nowMsg = null;

    try { s.player.stop(true); } catch { }

    try {
      if (s.connection.state.status !== VoiceConnectionStatus.Destroyed) s.connection.destroy();
    } catch { }

    if (sessions.get(s.id) === s) sessions.delete(s.id);

    if (rejoin && cfg(s.id).music.stay247) {
      setTimeout(() => join247(s.guild).catch(() => { }), 10000);
    }
  }

  async function createSession(guild, vc, textChannelId) {
    const connection = joinVoiceChannel({
      channelId: vc.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true
    });

    const player = createAudioPlayer();

    const s = {
      id: guild.id,
      guild,
      connection,
      player,
      voiceChannelId: vc.id,
      textChannelId,
      queue: [],
      current: null,
      loop: "off",
      volume: cfg(guild.id).music.volume,
      proc: null,
      resource: null,
      forceSkip: false,
      token: 0,
      startedAt: 0,
      idleTimer: null,
      aloneTimer: null,
      nowMsg: null,
      destroyed: false
    };

    sessions.set(guild.id, s);

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Якщо бота перемістили — він швидко перепідключиться сам
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000)
        ]);
      } catch {
        destroySession(s, { rejoin: true });
      }
    });

    connection.on("error", e => console.error("❌ Voice:", e.message));

    player.on(AudioPlayerStatus.Idle, () => onIdle(s));

    player.on("error", e => {
      console.error("❌ Плеєр:", e.message);

      if (s.current && !s.current.failed) {
        s.current.failed = true;

        send(s, { content: `⚠️ Помилка відтворення **${mdSafe(s.current.title)}** — пропускаю.` });
      }
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20000);
    } catch (e) {
      console.error("❌ Підключення до voice:", e.message);

      destroySession(s);

      throw new UserError("❌ Не вдалося підʼєднатися до голосового каналу (перевір права або спробуй пізніше).");
    }

    connection.subscribe(player);

    const x = cfg(guild.id).music;

    if (x.stay247 && x.voiceChannel !== vc.id) {
      x.voiceChannel = vc.id;
      save();
    }

    return s;
  }

  async function getOrCreateSession(guild, vc, textChannelId) {
    const existing = sessions.get(guild.id);

    if (existing && !existing.destroyed) return existing;

    if (creating.has(guild.id)) return creating.get(guild.id);

    const p = createSession(guild, vc, textChannelId).finally(() => creating.delete(guild.id));

    creating.set(guild.id, p);

    return p;
  }

  async function join247(guild) {
    const x = cfg(guild.id).music;

    if (!x.stay247 || !x.voiceChannel || sessions.has(guild.id)) return;

    const ch = guild.channels.cache.get(x.voiceChannel);

    if (!ch || ch.type !== ChannelType.GuildVoice) return;

    await getOrCreateSession(guild, ch, null);
  }

  // ---------- відтворення ----------

  function nextTrack(s, force) {
    const cur = s.current;

    if (cur && !cur.failed) {
      if (s.loop === "track" && !force) return cur;
      if (s.loop === "queue") s.queue.push(cur);
    }

    return s.queue.shift() ?? null;
  }

  function onIdle(s) {
    if (s.destroyed) return;

    killProc(s);

    const force = s.forceSkip;

    s.forceSkip = false;

    const next = nextTrack(s, force);

    if (!next) {
      s.current = null;
      s.resource = null;
      s.token++;

      s.nowMsg?.delete().catch(() => { });
      s.nowMsg = null;

      scheduleIdleLeave(s);

      return;
    }

    startTrack(s, next);
  }

  function failTrack(s, token, reason) {
    if (s.destroyed || s.token !== token || !s.current || s.current.failed) return;

    s.current.failed = true;

    send(s, { content: `⚠️ Не вдалося відтворити **${mdSafe(s.current.title)}**: ${explainYtError(reason)}` });

    s.forceSkip = true;

    try { s.player.stop(true); } catch { }
  }

  function startTrack(s, track) {
    s.current = track;

    const token = ++s.token;

    clearTimeout(s.idleTimer);
    killProc(s);

    try {
      const proc = openStream(track);

      s.proc = proc;

      let errText = "";

      proc.stderr.on("data", d => { errText = (errText + d).slice(-800); });
      proc.stdout.on("error", () => { });
      proc.stderr.on("error", () => { });

      proc.on("error", e => failTrack(s, token, e.code === "ENOENT" ? "yt-dlp не знайдено" : e.message));

      proc.on("close", code => {
        // Помилка лише якщо потік обірвався на самому початку
        if (code && s.token === token && s.proc === proc && Date.now() - s.startedAt < 15000) {
          failTrack(s, token, errText);
        }
      });

      const resource = createAudioResource(proc.stdout, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true
      });

      resource.volume.setVolume(s.volume / 100);

      s.resource = resource;
      s.startedAt = Date.now();

      s.player.play(resource);
    } catch (e) {
      console.error("❌ startTrack:", e);

      track.failed = true;

      send(s, { content: `⚠️ Не вдалося відтворити **${mdSafe(track.title)}**.` });

      setImmediate(() => onIdle(s));

      return;
    }

    sendNowPlaying(s);
  }

  function skipCurrent(s) {
    s.forceSkip = true;

    s.player.stop(true);
  }

  function stopAll(s) {
    s.queue.length = 0;
    s.current = null;
    s.forceSkip = true;

    s.player.stop(true);

    if (s.player.state.status === AudioPlayerStatus.Idle) onIdle(s);
  }

  // ---------- перевірки ----------

  function voiceProblem(i) {
    const vc = i.member.voice?.channel;

    if (!vc) return "🔊 Спочатку зайди в голосовий канал.";
    if (vc.type !== ChannelType.GuildVoice) return "❌ Підтримуються лише звичайні голосові канали (не Stage).";

    const p = vc.permissionsFor(vc.guild.members.me);

    if (!p?.has(["ViewChannel", "Connect", "Speak"])) {
      return "❌ У мене немає прав «Підключатися» та «Говорити» в цьому каналі.";
    }

    const cur = sessions.get(i.guildId);

    if (!cur && vc.userLimit && vc.members.size >= vc.userLimit && !p.has("MoveMembers")) {
      return "❌ Голосовий канал заповнений.";
    }

    if (cur && cur.voiceChannelId !== vc.id) {
      if (cur.current || cur.queue.length) return `🔊 Я вже граю в <#${cur.voiceChannelId}>. Зайди туди.`;

      if (cfg(i.guildId).music.stay247 && !isAdmin(i.guildId, i.user.id)) {
        return `♾️ Режим 24/7: я залишаюсь у <#${cur.voiceChannelId}>.`;
      }
    }

    return null;
  }

  // Бот вільний у іншому каналі — переходимо до того, хто покликав
  function moveIfIdle(i, vc) {
    const cur = sessions.get(i.guildId);

    if (cur && cur.voiceChannelId !== vc.id) destroySession(cur);
  }

  async function guard(i) {
    const s = sessions.get(i.guildId);

    if (!s) {
      await i.reply({ content: "❌ Я зараз не в голосовому каналі.", flags: EPH });
      return null;
    }

    if (i.member.voice?.channelId !== s.voiceChannelId) {
      await i.reply({ content: `🔊 Зайди в мій голосовий канал: <#${s.voiceChannelId}>`, flags: EPH });
      return null;
    }

    return s;
  }

  // ---------- команди ----------

  const commands = [
    new SlashCommandBuilder()
      .setName("play").setDescription("Увімкнути музику (назва або посилання)")
      .addStringOption(o =>
        o.setName("query").setDescription("Назва, посилання YouTube/SoundCloud або плейлист")
          .setRequired(true).setMaxLength(300)
      )
      .addStringOption(o => o.setName("source").setDescription("Де шукати назву пісні").addChoices(
        { name: "YouTube", value: "youtube" }, { name: "SoundCloud", value: "soundcloud" }
      )),
    new SlashCommandBuilder().setName("skip").setDescription("Пропустити поточний трек"),
    new SlashCommandBuilder().setName("stop").setDescription("Зупинити музику та очистити чергу"),
    new SlashCommandBuilder().setName("pause").setDescription("Поставити на паузу"),
    new SlashCommandBuilder().setName("resume").setDescription("Продовжити відтворення"),
    new SlashCommandBuilder()
      .setName("queue").setDescription("Показати чергу")
      .addIntegerOption(o => o.setName("page").setDescription("Сторінка").setMinValue(1)),
    new SlashCommandBuilder().setName("nowplaying").setDescription("Що зараз грає"),
    new SlashCommandBuilder()
      .setName("volume").setDescription("Гучність (1-150%)")
      .addIntegerOption(o => o.setName("percent").setDescription("Відсотки").setMinValue(1).setMaxValue(150)),
    new SlashCommandBuilder()
      .setName("loop").setDescription("Режим повтору")
      .addStringOption(o =>
        o.setName("mode").setDescription("Режим").setRequired(true).addChoices(
          { name: "Вимкнено", value: "off" },
          { name: "Поточний трек", value: "track" },
          { name: "Уся черга", value: "queue" }
        )
      ),
    new SlashCommandBuilder().setName("shuffle").setDescription("Перемішати чергу"),
    new SlashCommandBuilder()
      .setName("remove").setDescription("Видалити трек із черги")
      .addIntegerOption(o => o.setName("position").setDescription("Номер у черзі").setMinValue(1).setRequired(true)),
    new SlashCommandBuilder().setName("clearqueue").setDescription("Очистити чергу (поточний трек грає далі)"),
    new SlashCommandBuilder().setName("join").setDescription("Приєднатися до твого голосового каналу"),
    new SlashCommandBuilder().setName("leave").setDescription("Вийти з голосового каналу"),
    new SlashCommandBuilder()
      .setName("24-7").setDescription("Бот постійно сидить у голосовому каналі")
      .addBooleanOption(o => o.setName("enabled").setDescription("Увімкнути чи вимкнути").setRequired(true))
  ];

  const handlers = {};

  handlers.play = async i => {
    const problem = voiceProblem(i);

    if (problem) return i.reply({ content: problem, flags: EPH });

    const vc = i.member.voice.channel;

    await i.deferReply();

    try {
      const result = await resolveQuery(i.options.getString("query", true).trim(), i.user.id, i.options.getString("source") || "youtube");

      moveIfIdle(i, vc);

      const s = await getOrCreateSession(i.guild, vc, i.channelId);

      s.textChannelId = i.channelId;

      clearTimeout(s.idleTimer);

      const room = MAX_QUEUE - s.queue.length;
      const tracks = result.tracks.slice(0, Math.max(0, room));

      if (!tracks.length) return i.editReply(`❌ Черга заповнена (максимум ${MAX_QUEUE} треків).`);

      const startsNow = !s.current;
      const firstPos = s.queue.length + 1;

      s.queue.push(...tracks);

      const t = tracks[0];
      const link = `[${truncate(mdSafe(t.title), 100)}](${t.url})`;

      let text;

      if (result.playlist) {
        text = `📃 Додано плейлист **${truncate(mdSafe(result.playlist), 80)}**: ${tracks.length} треків`;
      } else if (startsNow) {
        text = `▶️ Починаю грати: **${link}** \`${fmtDuration(t.duration)}\``;
      } else {
        text = `➕ Додано в чергу: **${link}** \`${fmtDuration(t.duration)}\` — позиція #${firstPos}`;
      }

      await i.editReply({
        embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(text)]
      });

      if (startsNow) {
        const first = s.queue.shift();

        startTrack(s, first);
      }
    } catch (e) {
      await i.editReply(fail(e)).catch(() => { });
    }
  };

  handlers.skip = async i => {
    const s = await guard(i);

    if (!s) return;
    if (!s.current) return i.reply({ content: "❌ Зараз нічого не грає.", flags: EPH });

    const title = mdSafe(s.current.title);

    skipCurrent(s);

    return i.reply(`⏭️ Пропущено **${truncate(title, 100)}**`);
  };

  handlers.stop = async i => {
    const s = await guard(i);

    if (!s) return;

    stopAll(s);

    return i.reply("⏹️ Музику зупинено, чергу очищено.");
  };

  handlers.pause = async i => {
    const s = await guard(i);

    if (!s) return;
    if (!s.current) return i.reply({ content: "❌ Зараз нічого не грає.", flags: EPH });
    if (isPaused(s)) return i.reply({ content: "⏸️ Вже на паузі.", flags: EPH });

    s.player.pause();

    return i.reply("⏸️ Пауза.");
  };

  handlers.resume = async i => {
    const s = await guard(i);

    if (!s) return;
    if (!s.current) return i.reply({ content: "❌ Зараз нічого не грає.", flags: EPH });
    if (!isPaused(s)) return i.reply({ content: "▶️ Вже грає.", flags: EPH });

    s.player.unpause();

    return i.reply("▶️ Продовжую.");
  };

  handlers.queue = async i => {
    const s = sessions.get(i.guildId);

    if (!s || (!s.current && !s.queue.length)) {
      return i.reply({ content: "📭 Черга порожня.", flags: EPH });
    }

    const per = 10;
    const pages = Math.max(1, Math.ceil(s.queue.length / per));
    const page = Math.min(i.options.getInteger("page") ?? 1, pages);

    const lines = s.queue
      .slice((page - 1) * per, page * per)
      .map((t, k) =>
        `**${(page - 1) * per + k + 1}.** [${truncate(mdSafe(t.title), 60)}](${t.url}) \`${fmtDuration(t.duration)}\` — <@${t.requestedBy}>`
      );

    const total = s.queue.reduce((a, t) => a + (t.duration ?? 0), 0);

    const e = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📃 Черга")
      .setFooter({ text: `Сторінка ${page}/${pages} · треків: ${s.queue.length} · ${fmtDuration(total)} · повтор: ${LOOP_LABEL[s.loop]}` });

    if (s.current) {
      e.addFields({
        name: "🎶 Зараз грає",
        value: `[${truncate(mdSafe(s.current.title), 80)}](${s.current.url}) \`${fmtDuration(s.current.duration)}\``
      });
    }

    e.setDescription(lines.join("\n") || "_Далі нічого немає._");

    return i.reply({ embeds: [e] });
  };

  handlers.nowplaying = async i => {
    const s = sessions.get(i.guildId);

    if (!s?.current) return i.reply({ content: "❌ Зараз нічого не грає.", flags: EPH });

    const pos = Math.floor((s.resource?.playbackDuration ?? 0) / 1000);
    const total = s.current.duration;

    const e = nowEmbed(s).addFields({
      name: "⏳ Прогрес",
      value: `${fmtDuration(pos)} ${progressBar(pos, total)} ${total ? fmtDuration(total) : "🔴"}`
    });

    return i.reply({ embeds: [e] });
  };

  handlers.volume = async i => {
    const s = await guard(i);

    if (!s) return;

    const v = i.options.getInteger("percent");

    if (v == null) return i.reply({ content: `🔊 Гучність: **${s.volume}%**`, flags: EPH });

    s.volume = v;
    s.resource?.volume?.setVolume(v / 100);

    cfg(i.guildId).music.volume = v;
    save();

    return i.reply(`🔊 Гучність: **${v}%**`);
  };

  handlers.loop = async i => {
    const s = await guard(i);

    if (!s) return;

    s.loop = i.options.getString("mode", true);

    return i.reply(`🔁 Повтор: **${LOOP_LABEL[s.loop]}**`);
  };

  handlers.shuffle = async i => {
    const s = await guard(i);

    if (!s) return;
    if (s.queue.length < 2) return i.reply({ content: "❌ У черзі замало треків.", flags: EPH });

    shuffle(s.queue);

    return i.reply(`🔀 Чергу перемішано (${s.queue.length} треків).`);
  };

  handlers.remove = async i => {
    const s = await guard(i);

    if (!s) return;

    const pos = i.options.getInteger("position", true);

    if (pos > s.queue.length) {
      return i.reply({ content: `❌ У черзі лише ${s.queue.length} треків.`, flags: EPH });
    }

    const [t] = s.queue.splice(pos - 1, 1);

    return i.reply(`🗑️ Видалено: **${truncate(mdSafe(t.title), 100)}**`);
  };

  handlers.clearqueue = async i => {
    const s = await guard(i);

    if (!s) return;

    const n = s.queue.length;

    s.queue.length = 0;

    return i.reply(`🧹 Чергу очищено (${n}).`);
  };

  handlers.join = async i => {
    const problem = voiceProblem(i);

    if (problem) return i.reply({ content: problem, flags: EPH });

    const vc = i.member.voice.channel;

    await i.deferReply();

    try {
      moveIfIdle(i, vc);

      const s = await getOrCreateSession(i.guild, vc, i.channelId);

      s.textChannelId = i.channelId;

      if (!s.current) scheduleIdleLeave(s);

      await i.editReply(`✅ Приєднався до <#${vc.id}>. Використай \`/play\`, щоб увімкнути музику.`);
    } catch (e) {
      await i.editReply(fail(e)).catch(() => { });
    }
  };

  handlers.leave = async i => {
    const s = await guard(i);

    if (!s) return;

    const x = cfg(i.guildId).music;

    if (x.stay247 && !isAdmin(i.guildId, i.user.id)) {
      return i.reply({ content: "♾️ Режим 24/7 увімкнено — вимкнути його може лише адміністратор.", flags: EPH });
    }

    x.stay247 = false;
    x.voiceChannel = null;
    save();

    destroySession(s);

    return i.reply("👋 Вийшов з голосового каналу.");
  };

  handlers["24-7"] = async i => {
    const on = i.options.getBoolean("enabled", true);
    const x = cfg(i.guildId).music;

    if (!on) {
      x.stay247 = false;
      x.voiceChannel = null;
      save();

      const s = sessions.get(i.guildId);

      if (s && !s.current && !s.queue.length) scheduleIdleLeave(s);

      return i.reply("✅ Режим 24/7 вимкнено. Коли черга порожня, я вийду з каналу.");
    }

    const problem = voiceProblem(i);

    if (problem && !sessions.has(i.guildId)) return i.reply({ content: problem, flags: EPH });

    await i.deferReply();

    try {
      let s = sessions.get(i.guildId);

      if (!s) {
        const vc = i.member.voice.channel;

        s = await getOrCreateSession(i.guild, vc, i.channelId);
        s.textChannelId = i.channelId;
      }

      x.stay247 = true;
      x.voiceChannel = s.voiceChannelId;
      save();

      clearTimeout(s.idleTimer);
      clearTimeout(s.aloneTimer);

      await i.editReply(`♾️ Режим 24/7 увімкнено — я залишаюсь у <#${s.voiceChannelId}>, навіть коли черга порожня.`);
    } catch (e) {
      await i.editReply(fail(e)).catch(() => { });
    }
  };

  // ---------- кнопки під «Зараз грає» ----------

  async function onButton(i) {
    if (!i.customId.startsWith("mus:")) return false;

    const s = sessions.get(i.guildId);

    if (!s || !s.current) {
      await i.reply({ content: "❌ Зараз нічого не грає.", flags: EPH });
      return true;
    }

    if (i.member.voice?.channelId !== s.voiceChannelId) {
      await i.reply({ content: `🔊 Зайди в мій голосовий канал: <#${s.voiceChannelId}>`, flags: EPH });
      return true;
    }

    const action = i.customId.slice(4);

    if (action === "toggle") {
      if (isPaused(s)) s.player.unpause();
      else s.player.pause();

      await i.update({ embeds: [nowEmbed(s)], components: [controls(s)] });
    } else if (action === "loop") {
      s.loop = s.loop === "off" ? "track" : s.loop === "track" ? "queue" : "off";

      await i.update({ embeds: [nowEmbed(s)], components: [controls(s)] });
    } else if (action === "skip") {
      await i.deferUpdate();
      skipCurrent(s);
    } else if (action === "stop") {
      await i.deferUpdate();
      stopAll(s);
    }

    return true;
  }

  // ---------- голосові події ----------

  function onVoiceState(oldS, newS) {
    const s = sessions.get(newS.guild.id);

    if (!s) return;

    // Бота перемістили в інший канал
    if (newS.id === client.user.id) {
      if (newS.channelId && newS.channelId !== s.voiceChannelId) {
        s.voiceChannelId = newS.channelId;

        const x = cfg(s.id).music;

        if (x.stay247) {
          x.voiceChannel = newS.channelId;
          save();
        }
      }

      return;
    }

    if (oldS.channelId === s.voiceChannelId || newS.channelId === s.voiceChannelId) checkAlone(s);
  }

  // ---------- запуск ----------

  function onReady() {
    try {
      console.log(generateDependencyReport());
    } catch { }

    ensureYtDlp()
      .then(() => console.log("✅ yt-dlp готовий"))
      .catch(e => console.error("⚠️ yt-dlp:", e.message));

    updateYtDlp();
    setInterval(updateYtDlp, 12 * 60 * 60 * 1000).unref?.();

    for (const g of client.guilds.cache.values()) {
      join247(g).catch(e => console.error(`❌ 24/7 (${g.name}):`, e.message));
    }
  }

  function status(guildId) {
    const s = sessions.get(guildId);

    if (!s) return null;

    if (s.current) return `🎶 **${truncate(mdSafe(s.current.title), 80)}** у <#${s.voiceChannelId}>`;

    return `🔊 Сиджу в <#${s.voiceChannelId}>`;
  }

  function shutdown() {
    for (const s of [...sessions.values()]) destroySession(s);
  }

  return {
    commands,
    handlers,
    adminCommands: new Set(["24-7"]),
    onReady,
    onButton,
    onVoiceState,
    status,
    shutdown
  };
};
