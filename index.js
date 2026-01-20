require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const flow = require("./questions.json");

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const userState = {};
const userAnswers = {};

function sendStep(chatId, stepKey) {
  const step = flow[stepKey];
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

  if (!step?.freeInput) return;

  // сохраняем ответ
  if (step.saveAs) {
    userAnswers[chatId][step.saveAs] = text;
  }

  // конец анкеты
  if (step.end || flow[step.next]?.end) {
    sendResultsToAdmin(chatId);
  }

  sendStep(chatId, step.next);
});

function sendResultsToAdmin(chatId) {
  const answers = userAnswers[chatId];

  let message = "📝 Новая анкета:\n\n";
  for (const key in answers) {
    message += `${key}: ${answers[key]}\n`;
  }

  bot.sendMessage(ADMIN_CHAT_ID, message);
}
