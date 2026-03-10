require("dotenv").config();
const { initGoogle } = require("./utils/googleSheets");
const bot = require("./bot");

require("./handlers/commands");
require("./handlers/messages");
require("./handlers/callbacks");

(async () => {
  await initGoogle();
  console.log("🚀 Google Sheets ready");

  // Сбрасываем накопившиеся обновления
  await bot.deleteWebHook();
  bot.startPolling({ restart: false });

  const info = await bot.getMe();
  console.log("Бот підключений:", info.username);

  await bot.setMyCommands([
    { command: "start", description: "Почати" },
    { command: "refresh", description: "Оновити кеш (адмін)" },
    { command: "myid", description: "Мій Chat ID" },
  ]);
})();

bot.on("polling_error", (err) => console.error("Polling error:", err.message));
