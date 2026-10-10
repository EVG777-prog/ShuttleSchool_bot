# ShuttleSchool Telegram bots

The application starts four Telegram bots from one process. Bot IDs, language assignments, and token environment variable names are configured in `data/languages.js`.

Set these environment variables:

- `BOT_TOKEN` — token for the general Shuttle bot.
- `BOT_ITALIAN_TOKEN` — token for the Italian bot.
- `BOT_FRENCH_TOKEN` — token for the French bot.
- `BOT_SPANISH_TOKEN` — token for the Spanish bot.
- `ADMIN_CHAT_ID` — administrator chat ID.
- `GOOGLE_SHEET_ID` and `GOOGLE_API_KEY` — spreadsheet access.
- `WEBHOOK_URL` — public base URL in production; omit for local polling.
- `PORT` — optional, defaults to `3000`.

Language bot tokens belong in environment variables (for example, `.env`, which is git-ignored), not in `data/languages.js`. Run all four bots with `npm start`. In production, all webhook paths use the same `WEBHOOK_URL` and server, with a separate token-based path for each bot.
