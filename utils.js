"use strict";

const crypto = require("crypto");

// =========================
// ТРИВАЛІСТЬ
// =========================

const UNIT_MAP = {
  s: 1, sec: 1, с: 1, сек: 1,
  m: 60, min: 60, хв: 60, мін: 60,
  h: 3600, hr: 3600, г: 3600, год: 3600,
  d: 86400, дн: 86400, д: 86400,
  w: 604800, т: 604800, тиж: 604800
};

// "1d 2h 30m", "90хв", "2 год 15 хв" -> мілісекунди (або null, якщо формат неправильний)
function parseDuration(str) {
  if (typeof str !== "string") return null;

  const s = str.trim();
  if (!s) return null;

  const re = /(\d+)\s*([a-zа-яіїєґ]+)/giu;
  const junk = /[\s,]+/g;

  let total = 0;
  let last = 0;
  let found = false;
  let m;

  while ((m = re.exec(s))) {
    const unit = UNIT_MAP[m[2].toLowerCase()];

    if (!unit) return null;
    if (s.slice(last, m.index).replace(junk, "")) return null;

    total += Number(m[1]) * unit;
    last = re.lastIndex;
    found = true;
  }

  if (!found || s.slice(last).replace(junk, "")) return null;

  return total * 1000;
}

// секунди -> "3:25" / "1:02:03"; null (стрім) -> LIVE
function fmtDuration(sec) {
  if (sec == null || !Number.isFinite(sec)) return "🔴 LIVE";

  sec = Math.max(0, Math.floor(sec));

  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = n => String(n).padStart(2, "0");

  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

// мілісекунди -> "1д 2г 5хв"
function fmtSpan(ms) {
  let s = Math.max(0, Math.floor(ms / 1000));

  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;

  const parts = [];

  if (d) parts.push(`${d}д`);
  if (h) parts.push(`${h}г`);
  if (m) parts.push(`${m}хв`);
  if (s && !d && !h) parts.push(`${s}с`);

  return parts.join(" ") || "0с";
}

function progressBar(pos, total, len = 16) {
  if (!total || total <= 0) return "▬".repeat(len);

  const idx = Math.min(len - 1, Math.max(0, Math.floor((pos / total) * len)));

  return "▬".repeat(idx) + "🔘" + "▬".repeat(len - idx - 1);
}

function truncate(str, n) {
  str = String(str ?? "");
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

// прибирає [] та переноси рядків, щоб назви не ламали markdown-посилання
function mdSafe(str) {
  return String(str ?? "").replace(/[\[\]\r\n]/g, " ").trim();
}

// =========================
// ВИПАДКОВІСТЬ
// =========================

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function pickRandom(arr, n) {
  const a = [...arr];
  const out = [];

  while (out.length < n && a.length) {
    out.push(a.splice(crypto.randomInt(a.length), 1)[0]);
  }

  return out;
}

// =========================
// ЧАС (Київ)
// =========================

function kyivNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kiev",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const get = t => parts.find(p => p.type === t).value;

  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));

  return {
    year, month, day, hour,
    key: `${get("year")}-${get("month")}-${get("day")}`,
    md: `${get("month")}-${get("day")}`
  };
}

// =========================
// ДНІ НАРОДЖЕННЯ
// =========================

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function validDate(d, m, y) {
  if (!Number.isInteger(d) || !Number.isInteger(m)) return false;
  if (m < 1 || m > 12 || d < 1 || d > DAYS_IN_MONTH[m - 1]) return false;
  if (y != null && m === 2 && d === 29 && !isLeap(y)) return false;

  return true;
}

// 29 лютого у невисокосний рік святкуємо 28 лютого
function isBirthdayToday(b, t) {
  if (b.m === t.month && b.d === t.day) return true;

  return b.m === 2 && b.d === 29 && t.month === 2 && t.day === 28 && !isLeap(t.year);
}

function daysUntilBirthday(b, t) {
  const today = Date.UTC(t.year, t.month - 1, t.day);

  const at = year => {
    const d = b.m === 2 && b.d === 29 && !isLeap(year) ? 28 : b.d;
    return Date.UTC(year, b.m - 1, d);
  };

  let target = at(t.year);

  if (target < today) target = at(t.year + 1);

  return Math.round((target - today) / 86400000);
}

module.exports = {
  parseDuration, fmtDuration, fmtSpan, progressBar, truncate, mdSafe,
  shuffle, pickRandom, kyivNow,
  isLeap, validDate, isBirthdayToday, daysUntilBirthday
};
