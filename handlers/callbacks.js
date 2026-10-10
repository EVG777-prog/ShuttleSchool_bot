function registerCallbacks(bot, state, actions, config) {
const { flow, userState, userAnswers } = state;
const { sendStep, getSlotsKeyboard, getMenuKeyboard, sendResultsToAdmin, getTestLang } = actions;
const { language } = config;
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const stepKey = userState[chatId];
  const step = flow[stepKey];

  console.log(`🔔 Callback: data="${data}", step="${stepKey}"`);

  // Вибір мови (до перевірки stepKey)
  if (data.startsWith("setlang_")) {
    if (language) {
      await bot.answerCallbackQuery(query.id, { text: `Цей бот: ${language}` });
      return;
    }
    const lang = data.slice("setlang_".length);
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
    const parts = data.split("_");
    const selectedIndex = parseInt(parts[1]);
    const value = parts[2];

    if (!userAnswers[chatId]._test) userAnswers[chatId]._test = [];
    userAnswers[chatId]._test.push(value);

    const newKeyboard = options.map((opt, index) => {
      const button = {
        text: opt.label,
        callback_data: `tq_${index}_${opt.value}`,
      };
      if (opt.value === "correct") button.style = "success";
      else if (index === selectedIndex) button.style = "danger";
      return [button];
    });

    try {
      const resultEmoji = value === "correct" ? "🟢" : "🔴";
      const updatedText = step.text.replace(
        /▸ (\d+\/\d+)/,
        `▸ $1 ${resultEmoji}`,
      );

      await bot.editMessageText(updatedText, {
        reply_markup: { inline_keyboard: newKeyboard },
        chat_id: chatId,
        message_id: query.message.message_id,
      });
    } catch (e) {
      console.log("Edit failed:", e.message);
    }

    await new Promise((r) => setTimeout(r, 800));
    delete userAnswers[chatId]._currentOptions;

    await bot.answerCallbackQuery(query.id);
    await sendStep(chatId, step.next);
    return; // ← ВОТ ТАК ПРАВИЛЬНО
  }

  // Звичайні кнопки
  const availableOptions =
    stepKey === "zero_groups" || stepKey === "individual_teachers"
      ? userAnswers[chatId]._currentOptions || []
      : step?.options;
  const option =
    availableOptions?.find((o) => String(o.value) === data) ||
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
  if (stepKey === "start_trial" && option.value === "Дитина") {
    userAnswers[chatId]["Учбовий формат"] = "Індивідуально";
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

  await bot.answerCallbackQuery(query.id);
  try {
    await sendStep(chatId, nextStep);
  } catch (error) {
    console.error(`Failed to process callback for ${chatId}:`, error);
    await bot.sendMessage(chatId, "Не вдалося продовжити запис. Спробуйте ще раз або напишіть адміністратору.");
  }
});
}

module.exports = { registerCallbacks };
