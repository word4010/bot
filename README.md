# Bindarik Bot 10.0 — GitHub Pages Edition

Проєкт розділений на дві частини: статичний сайт у GitHub Pages та Discord-бот/API на Bot-Hosting.net. Дані й секрети залишаються на хостингу; у GitHub публікується лише HTML/CSS/JS без токенів.

## 1. Завантаження в GitHub

1. Створи репозиторій GitHub (можна public) і завантаж **вміст** цієї папки.
2. У `dashboard/config.js` заміни `https://YOUR-BOT-HOSTING-DOMAIN` на HTTPS-адресу API, яку надає Bot-Hosting для твого сервера. Не додавай `/` у кінці.
3. У GitHub відкрий Settings → Pages → Build and deployment → Deploy from a branch → `main` → `/dashboard` (якщо Pages не дозволяє вибрати підпапку, перемісти вміст `dashboard/` у корінь окремого репозиторію).
4. Скопіюй точний origin сайту, наприклад `https://username.github.io` (для CORS саме origin без шляху репозиторію).

## 2. Запуск бота на Bot-Hosting

1. Завантаж папку `bot/` як файли застосунку або підключи репозиторій і встанови робочу директорію `bot`.
2. Встанови залежності командою `npm install`, запуск — `npm start`.
3. У Environment Variables хостингу створи: `TOKEN`, `CLIENT_ID`, `OWNER_ID`, `DASHBOARD_PASSWORD`, `DASHBOARD_ORIGIN`, `DASHBOARD_SECRET`. `DASHBOARD_ORIGIN` — точний origin GitHub Pages. `PORT` не задавай вручну, якщо хостинг сам надає порт; код читає `SERVER_PORT` або `PORT`.
4. Переконайся, що хостинг надає публічний HTTPS web endpoint для Node-процесу. API має бути доступне за адресою, вказаною в `dashboard/config.js`.
5. Перезапусти бота. Перевір `https://ТВОЯ-API-АДРЕСА/api/health`.

## Безпека

- Ніколи не коміть `.env`, токен Discord, пароль або секрет підпису. `.gitignore` уже виключає `.env`.
- `DASHBOARD_PASSWORD` і `DASHBOARD_SECRET` зберігай тільки в Environment Variables хостингу. Використовуй різні довгі випадкові значення.
- Вхід видає короткоживу (8 годин) сесію; токен зберігається лише в `sessionStorage`. API приймає запити лише з заданого `DASHBOARD_ORIGIN`.
- Публічний GitHub Pages сайт — лише інтерфейс; він не містить Discord-токена чи бази даних.
- Для реального використання перевір HTTPS, домен і права бота на тестовому Discord-сервері.

## Важливо про GitHub Pages

GitHub Pages хостить лише статичні файли. Він не запускає Node.js, не зберігає серверні дані й не може самостійно тримати Discord-бота онлайн. Саме тому API та збереження JSON-файлів працюють на Bot-Hosting.
