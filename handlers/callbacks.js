const bot = require("../bot");
const { flow, userState, userAnswers } = require("../state");
const { sendStep } = require("../steps/sendStep");
const { getSlotsKeyboard, getMenuKeyboard } = require("../utils/keyboard");
const { sendResultsToAdmin } = require("../utils/admin");
const { getTestLang } = require("../utils/testLang");

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const stepKey = userState[chatId];
  const step = flow[stepKey];

  console.log(`🔔 Callback: data="${data}", step="${stepKey}"`);

  // Вибір мови (до перевірки stepKey)
  if (data.startsWith("setlang_")) {
    const lang = data.split("_")[1];
    if (!userAnswers[chatId]) userAnswers[chatId] = {};
    userAnswers[chatId]["Мова"] = lang;

    // Підвантажуємо тест для нової мови
    getTestLang(chatId);

    await bot.sendMessage(chatId, `✅ Мова змінена на ${lang}`, {
      reply_markup: getMenuKeyboard(chatId),
    });
    return bot.answerCallbackQuery(query.id);
  }

  if (!stepKey || !step) return bot.answerCallbackQuery(query.id);

  // Мультиселект слотів
  if (data.startsWith("select_slot:")) {
    const slot = data.split("slot:")[1];
    if (!userAnswers[chatId].temp_slots) userAnswers[chatId].temp_slots = [];

    const prev = userAnswers[chatId].temp_slots;
    userAnswers[chatId].temp_slots = prev.includes(slot)
      ? prev.filter((s) => s !== slot)
      : [...prev, slot];

    try {
      await bot.editMessageReplyMarkup(
        { inline_keyboard: getSlotsKeyboard(chatId) },
        { chat_id: chatId, message_id: query.message.message_id },
      );
    } catch (e) {
      console.log("Edit failed:", e.message);
    }
    return bot.answerCallbackQuery(query.id);
  }

  // Підтвердження слотів
  if (data === "slots_done") {
    userAnswers[chatId][step.saveAs || "Слоти"] =
      userAnswers[chatId].temp_slots.join(", ");
    delete userAnswers[chatId].temp_slots;
    delete userAnswers[chatId]._slotsMessageId;
    delete userAnswers[chatId]._teacherSlots;
    sendStep(chatId, step.next);
    return bot.answerCallbackQuery(query.id);
  }

  if (data === "slots_max") {
    return bot.answerCallbackQuery(query.id, {
      text: "Можна обрати лише 2 слоти",
    });
  }

  // Відповідь на питання тесту
  if (data.startsWith("tq_")) {
    const options = userAnswers[chatId]._currentOptions || step.options;
    const parts = data.split("_"); // ["tq", "2", "correct"]
    const selectedIndex = parseInt(parts[1]);
    const value = parts[2]; // "correct" або "wrong"

    if (!userAnswers[chatId]._test) userAnswers[chatId]._test = [];
    userAnswers[chatId]._test.push(value);

    const newKeyboard = options.map((opt, index) => {
      let text = opt.label;
      if (opt.value === "correct") text = `✅ ${opt.label} ✅`;
      else if (index === selectedIndex) text = `❌ ${opt.label} ❌`;
      return [{ text, callback_data: `tq_${index}_${opt.value}` }];
    });

    try {
      const resultEmoji = value === "correct" ? "🟢" : "🔴";

      const updatedText = step.text.replace(
        /▸ (\d+\/\d+)/,
        `▸ $1 ${resultEmoji}`,
      );

      await bot.editMessageText(updatedText, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: { inline_keyboard: newKeyboard },
      });
    } catch (e) {
      console.log("Edit failed:", e.message);
    }

    await new Promise((r) => setTimeout(r, 800));
    delete userAnswers[chatId]._currentOptions;
    bot.answerCallbackQuery(query.id);
    return sendStep(chatId, step.next);
  }

  // Звичайні кнопки
  const option =
    step?.options?.find((o) => String(o.value) === data) ||
    (data.startsWith("info_") ? step?.options?.[data.split("_")[1]] : null);

  if (!option) return bot.answerCallbackQuery(query.id);

  if (data.startsWith("info_")) {
    await bot.sendMessage(chatId, option.info);
    return bot.answerCallbackQuery(query.id);
  }

  if (step.saveAs) {
    userAnswers[chatId][step.saveAs] = option.value;
    console.log(`✅ Збережено ${step.saveAs}:`, option.value);
  }

  if (stepKey.startsWith("speaking_club")) {
    await bot.sendMessage(
      chatId,
      "✅ Вашу заявку прийнято! Ми зв'яжемося з вами найближчим часом 😊",
    );
    sendResultsToAdmin(chatId);
  }

  const nextStep = option.next || step.next;
  console.log(`➡️ Перехід на крок:`, nextStep);

  sendStep(chatId, nextStep);

  bot.answerCallbackQuery(query.id);
});
