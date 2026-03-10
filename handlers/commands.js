const bot = require("../bot");
const { userAnswers } = require("../state");
const { sendStep } = require("../steps/sendStep");
const { getMenuKeyboard, askLanguage } = require("../utils/keyboard");
const { refreshCache } = require("../utils/googleSheets");

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  userAnswers[chatId] = {
    Telegram: msg.from.username ? "@" + msg.from.username : "-",
  };

  bot.sendMessage(chatId, "Вітаємо у школі іноземних мов Шатл 📚", {
    reply_markup: getMenuKeyboard(chatId),
  });

  if (!userAnswers[chatId]["Мова"]) {
    return askLanguage(chatId);
  }

  sendStep(chatId, "start");
});

bot.onText(/\/refresh/, async (msg) => {
  const chatId = msg.chat.id;

  if (chatId.toString() !== ADMIN_CHAT_ID) {
    return bot.sendMessage(chatId, "⛔ У вас немає прав для цієї команди");
  }

  try {
    await bot.sendMessage(chatId, "🔄 Оновлюю кеш...");
    await refreshCache();
    bot.sendMessage(chatId, "✅ Кеш успішно оновлено!");
  } catch (err) {
    console.error("Refresh error:", err);
    bot.sendMessage(chatId, "❌ Помилка оновлення кешу");
  }
});

bot.onText(/\/myid/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Ваш chat ID: \`${msg.chat.id}\``, {
    parse_mode: "Markdown",
  });
});
