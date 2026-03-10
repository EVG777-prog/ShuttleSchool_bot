const bot = require("../bot");
const { userAnswers } = require("../state");

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

function sendResultsToAdmin(chatId) {
  console.log("=== sendResultsToAdmin called ===", chatId, userAnswers[chatId]);
  const answers = userAnswers[chatId];
  let message = "📝 Нова анкета:\n\n";

  for (const key in answers) {
    if (key.startsWith("_") || key === "temp_slots") continue;
    message += `<b>${key}</b>: ${answers[key]}\n`;
  }

  bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: "HTML" });

  if (answers._paymentPhotoId) {
    bot.sendPhoto(ADMIN_CHAT_ID, answers._paymentPhotoId, {
      caption: "💳 Скріншот підтвердження оплати",
    });
  }
}

module.exports = { sendResultsToAdmin };
