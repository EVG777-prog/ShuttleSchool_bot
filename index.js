require("dotenv").config();
const express = require("express");
const { createBot } = require("./bot");
const { createState } = require("./state");
const botSettings = require("./data/languages");
const { initGoogle } = require("./utils/googleSheets");
const { createKeyboard } = require("./utils/keyboard");
const { createAdmin } = require("./utils/admin");
const { createTestLang } = require("./utils/testLang");
const { createSendStep } = require("./steps/sendStep");
const { registerCommands } = require("./handlers/commands");
const { registerMessages } = require("./handlers/messages");
const { registerCallbacks } = require("./handlers/callbacks");

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;
const WEBHOOK_BASE_URL = WEBHOOK_URL?.replace(/\/+$/, "");

function createRuntime(settings) {
  const token = process.env[settings.tokenEnv];
  if (!token) throw new Error(`Missing Telegram token: ${settings.tokenEnv}`);
  const bot = createBot(token);
  const state = createState();
  const config = {
    language: settings.language,
    nameSchool: settings.nameSchool,
    showLanguageMenu: settings.showLanguageMenu,
    bankAccount: settings.bankAccount,
    fop: settings.fop,
  };
  const keyboard = createKeyboard(bot, { ...state, ...config });
  const admin = createAdmin(bot, state);
  const testLang = createTestLang(state, settings.language);
  const { sendStep } = createSendStep(bot, state, keyboard, testLang, admin, config);
  const actions = {
    ...keyboard,
    keyboard,
    sendStep,
    sendResultsToAdmin: admin.sendResultsToAdmin,
    getTestLang: testLang.getTestLang,
  };

  registerCommands(bot, state, actions, config);
  registerMessages(bot, state, actions, config);
  registerCallbacks(bot, state, actions, config);
  return { bot, token, settings };
}

(async () => {
  const ids = new Set();
  const envNames = new Set();
  const validLanguages = ["Французька", "Іспанська", "Італійська"];
  for (const settings of botSettings.bots) {
    if (ids.has(settings.id)) throw new Error(`Duplicate bot id: ${settings.id}`);
    if (envNames.has(settings.tokenEnv)) throw new Error(`Duplicate token setting: ${settings.tokenEnv}`);
    ids.add(settings.id);
    envNames.add(settings.tokenEnv);
    if (settings.language && !validLanguages.includes(settings.language)) {
      throw new Error(`Unsupported language for bot ${settings.id}: ${settings.language}`);
    }
  }

  await initGoogle();
  console.log("🚀 Google Sheets ready");
  const runtimes = botSettings.bots.map(createRuntime);

  for (const { bot, settings } of runtimes) {
    const info = await bot.getMe();
    console.log(`Бот підключений (${settings.id}): @${info.username}`);
    await bot.setMyCommands([{ command: "start", description: "Почати" }]);
    if (process.env.ADMIN_CHAT_ID) {
      try {
        await bot.setMyCommands(
          [
            { command: "start", description: "Почати" },
            { command: "refresh", description: "Оновити кеш (адмін)" },
            { command: "myid", description: "Мій Chat ID" },
          ],
          { scope: { type: "chat", chat_id: Number(process.env.ADMIN_CHAT_ID) } },
        );
      } catch (err) {
        console.error(
          `⚠️ Не вдалося налаштувати команди для ADMIN_CHAT_ID=${process.env.ADMIN_CHAT_ID}:`,
          err.message,
        );
      }
    }
  }

  if (WEBHOOK_URL) {
    const app = express();
    app.use(express.json());
    for (const { bot, settings } of runtimes) {
      const webhookPath = `/webhook/${settings.id}`;
      app.post(webhookPath, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
      });
      await bot.setWebHook(`${WEBHOOK_BASE_URL}${webhookPath}`);
      console.log(`✅ Webhook встановлено (${settings.id})`);
    }
    app.get("/", (req, res) => res.send("Bots are running"));
    app.listen(PORT, () => console.log(`🌐 Server listening on port ${PORT}`));
  } else {
    await Promise.all(
      runtimes.map(async ({ bot, settings }) => {
        await bot.deleteWebHook();
        await bot.startPolling();
        console.log(`🔄 Polling запущено (${settings.id})`);
      }),
    );
  }
})().catch((err) => {
  console.error("Bot startup failed:", err);
  process.exitCode = 1;
});
