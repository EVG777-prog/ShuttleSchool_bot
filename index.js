require("dotenv").config();

console.log("TOKEN:", process.env.BOT_TOKEN);
console.log("ADMIN_CHAT_ID:", process.env.ADMIN_CHAT_ID);

const TelegramBot = require("node-telegram-bot-api");
const flow = require("./questions.json");

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const userState = {};
const userAnswers = {};

bot.getMe().then((botInfo) => {
  console.log("Бот подключен:", botInfo.username);
});

function sendStep(chatId, stepKey) {
  const step = flow[stepKey];
  console.log("sendStep called:", stepKey, step); // лог
  if (!step) return;

  userState[chatId] = stepKey;

  const keyboard = step.options?.map((opt) => [
    { text: opt.label, callback_data: opt.value },
  ]);

  bot.sendMessage(chatId, step.text, {
    reply_markup: keyboard?.length ? { inline_keyboard: keyboard } : undefined,
  });
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  userAnswers[chatId] = {}; // очищаем ответы
  sendStep(chatId, "start");
});

bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const stepKey = userState[chatId];
  const step = flow[stepKey];
  if (!step) return;

  const option = step.options?.find((o) => o.value === query.data);

  if (step.saveAs && option) {
    userAnswers[chatId][step.saveAs] = option.value;
  }

  const nextStep = step.next;

  // ✅ ЕСЛИ СЛЕДУЮЩИЙ ШАГ — КОНЕЦ
  if (flow[nextStep]?.end) {
    sendResultsToAdmin(chatId);
  }

  sendStep(chatId, nextStep);
  bot.answerCallbackQuery(query.id);
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text.startsWith("/")) return;

  const stepKey = userState[chatId];
  const step = flow[stepKey];

  if (!step) return;

  // Если есть кнопки — игнорируем текст
  if (step.options && step.options.length > 0) {
    bot.sendMessage(chatId, "Будь ласка, оберіть варіант кнопкою 👆");
    return;
  }

  // только если freeInput разрешен
  if (step.freeInput) {
    if (step.saveAs) {
      userAnswers[chatId][step.saveAs] = text;
    }

    // конец анкеты
    if (step.end || flow[step.next]?.end) {
      sendResultsToAdmin(chatId);
    }

    sendStep(chatId, step.next);
  }
});

function sendResultsToAdmin(chatId) {
  const answers = userAnswers[chatId];

  let message = "📝 Нова анкета:\n\n";
  for (const key in answers) {
    message += `${key}: ${answers[key]}\n`;
  }

  bot.sendMessage(ADMIN_CHAT_ID, message);
}
