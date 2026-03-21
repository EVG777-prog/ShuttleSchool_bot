require("dotenv").config();
const express = require("express");
const { initGoogle } = require("./utils/googleSheets");
const bot = require("./bot");

require("./handlers/commands");
require("./handlers/messages");
require("./handlers/callbacks");

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // напр. https://your-domain.com

// Telegram будет слать сюда POST-запросы
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Healthcheck
app.get("/", (req, res) => res.send("Bot is running"));

(async () => {
  await initGoogle();
  console.log("🚀 Google Sheets ready");

  // Регистрируем webhook в Telegram
  await bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`);
  console.log("✅ Webhook встановлено:", `${WEBHOOK_URL}/bot${TOKEN}`);

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🌐 Server listening on port ${PORT}`));

  const info = await bot.getMe();
  console.log("Бот підключений:", info.username);

  await bot.setMyCommands([
    { command: "start", description: "Почати" },
    { command: "refresh", description: "Оновити кеш (адмін)" },
    { command: "myid", description: "Мій Chat ID" },
  ]);
})();
