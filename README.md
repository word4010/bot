# Universal Bot MAX 5.0

## Запуск
1. Node.js 20 або новіший.
2. У папці `bot` виконай `npm install`.
3. Створи `.env` за прикладом `.env.example` та заповни `TOKEN`, `CLIENT_ID`, `OWNER_ID`. `GUILD_ID` необов'язковий.
4. Запусти `npm start`.

## Нове у MAX 5.0
- `/alert` — оголошення з @everyone або @here. Доступне адміністраторам бота, cooldown 5 хвилин.
- `/role-create` та `/role-delete` — створення і видалення ролей.
- `/daily`, `/balance` — щоденні 100 монет і перегляд балансу.
- `/rank`, `/leaderboard` — рівні та рейтинг XP. За повідомлення нараховується 10 XP.
- `/setup-welcome` та `/setup-goodbye` — канали входу/виходу учасників.
- Збереження даних у `config.json`.

## Музика
Команди музики залежать від модуля `music.js`. Потрібні права Connect, Speak, View Channel та Send Messages.

## Важливо для Discord Developer Portal
Увімкни **Server Members Intent** (для welcome/goodbye) у Privileged Gateway Intents. Боту потрібні права Manage Roles для керування ролями; його найвища роль має бути вище ролей, якими він керує. Для `/alert` потрібне право Mention Everyone. Не давай це право звичайним учасникам.

Не завантажуй `.env` у публічний репозиторій і не ділися токеном бота.
