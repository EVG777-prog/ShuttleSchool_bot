require("dotenv").config();
const express = require("express");
const { initGoogle } = require("./utils/googleSheets");
const bot = require("./bot");

require("./handlers/commands");
require("./handlers/messages");
require("./handlers/callbacks");

const TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

(async () => {
  await initGoogle();
  console.log("🚀 Google Sheets ready");

  const info = await bot.getMe();
  console.log("Бот підключений:", info.username);

  // Команды для всех
  await bot.setMyCommands([{ command: "start", description: "Почати" }]);

  // Команды для админа (добавляются поверх)
  await bot.setMyCommands(
    [
      { command: "start", description: "Почати" },
      { command: "refresh", description: "Оновити кеш (адмін)" },
      { command: "myid", description: "Мій Chat ID" },
    ],
    {
      scope: { type: "chat", chat_id: Number(process.env.ADMIN_CHAT_ID) },
    },
  );

  if (WEBHOOK_URL) {
    // 🚀 ПРОДАКШН — webhook (Railway)
    const app = express();
    app.use(express.json());

    app.post(`/bot${TOKEN}`, (req, res) => {
      bot.processUpdate(req.body);
      res.sendStatus(200);
    });

    app.get("/", (req, res) => res.send("Bot is running"));

    await bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`);
    console.log("✅ Webhook встановлено:", `${WEBHOOK_URL}/bot${TOKEN}`);

    app.listen(PORT, () => console.log(`🌐 Server listening on port ${PORT}`));
  } else {
    // 💻 ЛОКАЛЬНА РОЗРОБКА — polling
    await bot.deleteWebHook();
    bot.startPolling();
    console.log("🔄 Polling запущено (локальна розробка)");
  }
})();
