const bot = require("../bot");
const { flow, userState, userAnswers } = require("../state");
const { getSlotsKeyboard } = require("../utils/keyboard");
const { getTestLang } = require("../utils/testLang");
const { sendResultsToAdmin } = require("../utils/admin");
const {
  handleIndividualTariff,
  handlePayment,
  handleZeroGroups,
  handleIndividualTeachers,
  handleIndividualSlots,
  handleTestResult,
} = require("./stepHandlers");

async function sendStep(chatId, stepKey) {
  const step = flow[stepKey];
  if (!step) return;

  // Перехоплюємо end в одному місці
  if (step.end) {
    console.log("=== END STEP ===", chatId);
    await bot.sendMessage(chatId, step.text);
    console.log("=== SENDING TO ADMIN ===", chatId);
    sendResultsToAdmin(chatId);

    delete userState[chatId];
    // Очищаємо службові поля але залишаємо відповіді
    delete userAnswers[chatId]._test;
    delete userAnswers[chatId]._currentOptions;
    delete userAnswers[chatId]._teacherSlots;
    delete userAnswers[chatId]._slotsMessageId;
    delete userAnswers[chatId]._paymentPhotoId;
    delete userAnswers[chatId].temp_slots;
    return;
  }

  const answers = userAnswers[chatId] || {};

  // Пропускаємо крок з контактом якщо нік вже є
  if (step.requestContact && answers.Telegram && answers.Telegram !== "-") {
    console.log("Игнорируем запрос номера");
    const nextStepKey = step.next;
    return sendStep(chatId, nextStepKey);
  }

  userState[chatId] = stepKey;

  if (step.autoNext) {
    await bot.sendMessage(chatId, step.text);
    return sendStep(chatId, step.next);
  }

  // Динамічні обробники кроків

  if (stepKey === "individual_tariff") await handleIndividualTariff(step);

  if (stepKey === "payment") {
    if (
      answers["Група з нуля"] === "Ні" ||
      (answers["Учбовий формат"] === "Індивідуально" &&
        !answers["Слоти"]?.trim())
    ) {
      return sendStep(chatId, step.next);
    }
    await handlePayment(step, chatId);
  }

  if (stepKey === "zero_groups") {
    await handleZeroGroups(chatId, step, answers);

    // Якщо немає груп для підлітків — відправляємо повідомлення і йдемо далі
    if (step.noTeenGroups) {
      delete step.noTeenGroups;
      await bot.sendMessage(chatId, step.text);
      return sendStep(chatId, step.next); // іде на contact → end → sendResultsToAdmin
    }
  }

  if (stepKey === "individual_teachers") {
    const shouldSkip = await handleIndividualTeachers(chatId, step, answers);
    if (shouldSkip) return sendStep(chatId, step.next);
  }

  if (stepKey === "test_result") {
    handleTestResult(chatId, step);
    sendResultsToAdmin(chatId);
  }

  // Підготовка клавіатури
  let keyboard = [];

  if (stepKey === "individual_slots") {
    const shouldSkip = await handleIndividualSlots(chatId, step, answers);
    if (shouldSkip) return sendStep(chatId, step.next);
    keyboard = getSlotsKeyboard(chatId);
  } else if (step.options) {
    let options = step.options;

    if (stepKey.startsWith("test_q")) {
      options = [...step.options].sort(() => Math.random() - 0.5);
      userAnswers[chatId]._currentOptions = options;

      keyboard = options.map((opt, index) => [
        {
          text: opt.label,
          callback_data: `tq_${index}_${opt.value}`,
        },
      ]);
    } else {
      keyboard = options.map((opt, index) => [
        {
          text: opt.label,
          callback_data: String(opt.value ?? `info_${index}`),
        },
      ]);
    }
  }

  // Відправка
  if (step.requestContact) {
    return bot.sendMessage(chatId, step.text, {
      reply_markup: {
        keyboard: [[{ text: "📞 Надіслати номер", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }

  const sent = await bot.sendMessage(chatId, step.text, {
    reply_markup: { inline_keyboard: keyboard },
  });

  // Після основного повідомлення — номер рахунку окремо
  if (stepKey === "payment") {
    await bot.sendMessage(chatId, "UA523220010000026006300055066");
  }

  if (stepKey === "individual_slots") {
    userAnswers[chatId]._slotsMessageId = sent.message_id;
  }
}

module.exports = { sendStep };
