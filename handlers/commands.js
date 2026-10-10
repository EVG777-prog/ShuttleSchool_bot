const { refreshCache } = require("../utils/googleSheets");
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

function registerCommands(bot, state, actions, config) {
  const { userAnswers } = state;
  const { sendStep, getTestLang } = actions;
  const { getMenuKeyboard, askLanguage } = actions.keyboard;
  const { language, nameSchool } = config;

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    userAnswers[chatId] = {
      Telegram: msg.from.username ? "@" + msg.from.username : "-",
      ...(language && { Мова: language }),
    };
    if (language) getTestLang(chatId);

    await bot.sendMessage(
      chatId,
      `Вітаємо у школі іноземних мов ${nameSchool || "Шатл"} 📚`,
      {
      reply_markup: getMenuKeyboard(chatId),
      },
    );
    if (!language && !userAnswers[chatId]["Мова"]) return askLanguage(chatId);
    return sendStep(chatId, "start");
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
}

module.exports = { registerCommands };
