# Bindarik Bot 10.0 Ultimate

Discord.js v14 bot with owner-only web dashboard and Anti-Raid join-burst detection.

## Included
- Existing commands/modules from the supplied 10.0 build: moderation, roles, `/alert`, `/say`, giveaways, birthdays/holidays, music, economy, XP, lockdown and owner controls.
- **Owner-only Dashboard**: choose a server and configure Anti-Raid from a browser.
- **Anti-Raid**: detects a burst of joins within a configurable window and posts an alert to a selected channel. Optional account-age rule can timeout very new accounts for 10 minutes. This option is OFF by default.

## Setup
1. Create `.env` from `.env.example`.
2. Set `TOKEN`, `CLIENT_ID`, `OWNER_ID` and a strong `DASHBOARD_PASSWORD`.
3. Install dependencies with `npm install`.
4. Start with `npm start`.
5. Set your hosting service's public web port to `PORT` (default 3000). Open the host-provided HTTPS URL and sign in with `DASHBOARD_PASSWORD`.

## Discord intents and permissions
Enable **Server Members Intent** for join monitoring. Grant the bot View Channels and Send Messages in the selected alert channel. If enabling account-age timeout, grant Moderate Members. The dashboard uses `OWNER_ID` and the dashboard password; do not share either. Use the hosting provider's HTTPS URL; do not expose the app over plain public HTTP.

## Anti-Raid defaults
Disabled by default. Suggested starting values: 6 joins in 15 seconds. It alerts only; optional minimum account age is set to 0 (off). It does not mass-ban or delete channels. Review alerts manually and use the existing `/lockdown` only when necessary.

## Important
- Existing music providers remain subject to provider availability and their terms; this project does not bypass YouTube anti-bot restrictions.
- Keep `.env` private and never upload it to a public repository.
- This build should be tested on a private Discord test server before enabling moderation actions.
