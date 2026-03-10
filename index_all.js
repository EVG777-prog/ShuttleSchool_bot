require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const questions = require("./questions.json");
const testFrench = require("./test_french.json");
const testSpain = require("./test_spain.json");
const testItalian = require("./test_italian.json");
const {
  initGoogle,
  getRates,
  getTeachers,
  getLessons,
  refreshCache,
} = require("./google_docs");

const flow = {
  ...questions,
};

const tests = {
  french: testFrench,
  spain: testSpain,
  italian: testItalian,
};

(async () => {
  await initGoogle();
  console.log("🚀 Google Sheets ready");
})();

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const userState = {};
const userAnswers = {};

bot.getMe().then((botInfo) => {
  console.log("Бот підключений:", botInfo.username);
});

async function sendStep(chatId, stepKey) {
  const step = flow[stepKey];
  if (!step) return;

  const answers = userAnswers[chatId] || {};

  // 1. ПЕРЕВІРКА: Якщо це крок з контактом, але нік вже є — пропускаємо
  if (step.requestContact && answers.Telegram && answers.Telegram !== "-") {
    const nextStepKey = step.next;

    // Якщо наступний крок - фінальний, завершуємо анкету
    if (flow[nextStepKey]?.end) {
      await bot.sendMessage(chatId, flow[nextStepKey].text, {
        reply_markup: { remove_keyboard: true },
      });
      sendResultsToAdmin(chatId); // Надсилаємо результат адміну!
      delete userState[chatId];
      return;
    }

    // Інакше просто йдемо далі
    return sendStep(chatId, nextStepKey);
  }

  userState[chatId] = stepKey;

  // При выборе языка присоединение соответствующего теста
  if (stepKey === "level") {
    getTestLang(chatId);
  }
  // 2. ДИНАМІЧНІ ТЕКСТИ (Тарифи)
  if (stepKey === "individual_tariff") {
    await handleIndividualTariff(step);
  }

  // 2.5 ДИНАМІЧНІ ТЕКСТИ (Платіж першого уроку)
  if (stepKey === "payment") {
    console.log(answers);
    if (
      answers["Група з нуля"] === "Ні" ||
      (answers["Учбовий формат"] === "Індивідуально" &&
        (!answers["Слоти"] || answers["Слоти"].trim() === ""))
    ) {
      return sendStep(chatId, step.next);
    }
    await handlePayment(step, chatId);
  }

  // 2.7 ДИНАМІЧНІ ТЕКСТИ (Групи з нуля)
  if (stepKey === "zero_groups") {
    await handleZeroGroups(chatId, step, answers);
  }

  // 3. ПІДГОТОВКА ОПЦІЙ (Вчителі)
  if (stepKey === "individual_teachers") {
    const shouldSkip = await handleIndividualTeachers(chatId, step, answers);
    if (shouldSkip) return;
  }

  if (stepKey === "test_result") {
    const score = (userAnswers[chatId]._test || []).filter(
      (v) => v === "correct",
    ).length;
    const total = (userAnswers[chatId]._test || []).length;
    let level;
    if (score <= 5) level = "A1";
    else if (score <= 12) level = "A2";
    else if (score <= 19) level = "B1";
    else if (score <= 28) level = "B2";
    else if (score <= 33) level = "C1";

    userAnswers[chatId]["Рівень"] = level;

    step.text = step.text
      .replace("{score}", score)
      .replace("{total}", total)
      .replace("{level}", level);
  }

  // 4. ПІДГОТОВКА КЛАВІАТУРИ
  let keyboard = [];

  if (stepKey === "individual_slots") {
    console.log(`Индивидуальные слоты`);
    const shouldSkip = await handleIndividualSlots(chatId, step, answers);
    if (shouldSkip) return;
    keyboard = getSlotsKeyboard(chatId);
  } else if (step.options) {
    keyboard = step.options.map((opt, index) => [
      {
        text: opt.label,
        callback_data: opt.value || `info_${index}`,
      },
    ]);
  }

  // 5. ВІДПРАВКА
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

  if (stepKey === "individual_slots") {
    userAnswers[chatId]._slotsMessageId = sent.message_id;
  }
}

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const stepKey = userState[chatId];
  const step = flow[stepKey];

  console.log(`🔔 Callback: data="${data}", step="${stepKey}"`); // ДОБАВИТЬ ЭТУ СТРОКУ

  // Мультиселект слотів
  if (data.startsWith("select_slot:")) {
    console.log(`📍 Обробка select_slot`); // ДОБАВИТЬ
    if (!userAnswers[chatId]) return bot.answerCallbackQuery(query.id);

    const slot = data.split("slot:")[1];

    if (!userAnswers[chatId].temp_slots) userAnswers[chatId].temp_slots = [];

    const prev = userAnswers[chatId].temp_slots;

    let next;
    if (prev.includes(slot)) {
      next = prev.filter((s) => s !== slot);
    } else {
      next = [...prev, slot];
    }

    userAnswers[chatId].temp_slots = next;

    const keyboard = getSlotsKeyboard(chatId);

    try {
      await bot.editMessageReplyMarkup(
        { inline_keyboard: keyboard },
        {
          chat_id: chatId,
          message_id: query.message.message_id,
        },
      );
    } catch (e) {
      console.log("Edit failed:", e.message);
    }

    return bot.answerCallbackQuery(query.id);
  }

  if (data === "slots_done") {
    console.log(`📍 Обробка slots_done`); // ДОБАВИТЬ
    userAnswers[chatId][step.saveAs || "Слоти"] =
      userAnswers[chatId].temp_slots.join(", ");

    // Очистка временных данных сессии
    delete userAnswers[chatId].temp_slots;
    delete userAnswers[chatId]._slotsMessageId;
    delete userAnswers[chatId]._teacherSlots;

    sendStep(chatId, step.next);
    return bot.answerCallbackQuery(query.id);
  }

  if (data.startsWith("setlang_")) {
    const lang = data.split("_")[1];
    if (!userAnswers[chatId]) userAnswers[chatId] = {};
    userAnswers[chatId]["Мова"] = lang;

    // Обновляем меню с новым языком
    await bot.sendMessage(chatId, `✅ Мова змінена на ${lang}`, {
      reply_markup: getMenuKeyboard(chatId),
    });
    return bot.answerCallbackQuery(query.id);
  }

  if (!stepKey || !step) return bot.answerCallbackQuery(query.id);

  if (stepKey.startsWith("test_q")) {
    console.log(`📍 Обробка test_q...`); // ДОБАВИТЬ
    const index = parseInt(data.split("_").pop());
    const opt = step?.options?.[index];

    if (!userAnswers[chatId]._test) userAnswers[chatId]._test = [];
    userAnswers[chatId]._test.push(data); // "correct" или "wrong"

    bot.answerCallbackQuery(query.id);
    return sendStep(chatId, step.next);
  }

  console.log(`📍 Перевірка звичайної опції`); // ДОБАВИТЬ
  // Звичайна логіка кнопок
  const option =
    step?.options?.find((o) => o.value === data) ||
    (data.startsWith("info_") ? step?.options[data.split("_")[1]] : null);

  console.log(`📍 Знайдена опція:`, option); // ДОБАВИТЬ
  if (!option) return bot.answerCallbackQuery(query.id);

  if (data.startsWith("info_")) {
    await bot.sendMessage(chatId, option.info);
    return bot.answerCallbackQuery(query.id);
  }

  console.log(`📍 Збереження відповіді`); // ДОБАВИТЬ

  if (step.saveAs) {
    userAnswers[chatId][step.saveAs] = option.value;
    console.log(`✅ Збережено ${step.saveAs}:`, option.value); // ДОБАВИТЬ
  }
  const nextStep = option.next || step.next;
  console.log(`➡️ Перехід на крок:`, nextStep); // ДОБАВИТЬ

  if (flow[nextStep]?.end) {
    await bot.sendMessage(chatId, flow[nextStep].text, {
      reply_markup: { remove_keyboard: true },
    });
    sendResultsToAdmin(chatId);
    delete userState[chatId];
  } else {
    sendStep(chatId, nextStep);
  }
  bot.answerCallbackQuery(query.id);
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const stepKey = userState[chatId];
  const step = flow[stepKey];

  if (msg.text === "📋 Записатись на урок") {
    return sendStep(msg.chat.id, "start");
  }
  if (msg.text === "📝 Тест рівня") {
    return sendStep(msg.chat.id, "start");
  }

  if (msg.text?.includes("Мова:")) {
    return askLanguage(chatId, "Оберіть нову мову:");
  }
  if (!step || msg.text?.startsWith("/")) return;
  // Обробка контакту
  if (msg.contact && step.requestContact) {
    userAnswers[chatId][step.saveAs || "Телефон"] = msg.contact.phone_number;
    const nextStep = step.next;

    if (flow[nextStep]?.end) {
      await bot.sendMessage(chatId, flow[nextStep].text, {
        reply_markup: { remove_keyboard: true },
      });
      sendResultsToAdmin(chatId);
      delete userState[chatId];
    } else {
      await bot.sendMessage(chatId, "Дякуємо! Продовжуємо...", {
        reply_markup: { remove_keyboard: true },
      });
      sendStep(chatId, nextStep);
    }
    return;
  }

  // Обробка фото (скріншот оплати)
  if (msg.photo && step.acceptPhoto) {
    // Берем фото с наивысшим разрешением (последнее в массиве)
    const photo = msg.photo[msg.photo.length - 1];
    const photoCaption = msg.caption || "(без підпису)";

    // Сохраняем file_id фотографии
    userAnswers[chatId][step.saveAs] = `[Скріншот] ${photoCaption}`;
    userAnswers[chatId]._paymentPhotoId = photo.file_id;

    // Отправляем фото админу сразу
    // await bot.sendPhoto(ADMIN_CHAT_ID, photo.file_id, {
    //   caption: `💳 Підтвердження оплати від ${userAnswers[chatId].Telegram || "користувача"}`,
    // });

    if (flow[step.next]?.end) {
      await bot.sendMessage(chatId, flow[step.next].text, {
        reply_markup: { remove_keyboard: true },
      });
      sendResultsToAdmin(chatId);
      delete userState[chatId];
    } else {
      await bot.sendMessage(chatId, "Дякуємо за підтвердження! Продовжуємо...");
      sendStep(chatId, step.next);
    }
    return;
  }

  // Вільне введення тексту
  if (step.freeInput && msg.text) {
    userAnswers[chatId][step.saveAs] = msg.text;
    if (flow[step.next]?.end) {
      await bot.sendMessage(chatId, flow[step.next].text, {
        reply_markup: { remove_keyboard: true },
      });
      sendResultsToAdmin(chatId);
      delete userState[chatId];
    } else {
      sendStep(chatId, step.next);
    }
  }
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userAnswers[chatId] = {
    Telegram: msg.from.username ? "@" + msg.from.username : "-",
  };

  // Показываем постоянное меню
  bot.sendMessage(chatId, "Оберіть дію:", {
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

// ============= ДОПОМІЖНІ ФУНКЦІЇ =============

async function handleIndividualTariff(step) {
  const rates = await getRates();

  const rateMap = {
    r45f: `Перший урок “Лише ти 45”`,
    r90f: `Перший урок “Лише ти 90”`,
    r45: `Тариф “Лише ти 45”`,
    r90: `Тариф “Лише ти 90”`,
  };

  const foundRates = {};
  for (const [key, searchText] of Object.entries(rateMap)) {
    foundRates[key] = rates.find((r) => r.name.includes(searchText));
  }

  const { r45f, r90f, r45, r90 } = foundRates;

  step.text = `Можемо запропонувати два варіанти індивідуальних занять:
- ${r45.name} становить: ${r45.price} грн за кожні ${r45.lessons} уроків по 45 хвилин, заняття відбуваються 2 рази на тиждень. Вартість пробного уроку - ${r45f.price} грн.
- ${r90.name} становить: ${r90.price} грн за кожні ${r90.lessons} уроків по 90 хвилин, заняття відбуваються 2 рази на тиждень. Вартість пробного уроку - ${r90f.price} грн.`;
}

async function handlePayment(step, chatId) {
  const answers = userAnswers[chatId];
  const rates = await getRates();

  const rateMap = {
    r45f: `Перший урок “Лише ти 45”`,
    r90f: `Перший урок “Лише ти 90”`,
    rGroupFirst: `Перший урок в групі`,
  };

  const foundRates = {};
  for (const [key, searchText] of Object.entries(rateMap)) {
    foundRates[key] = rates.find((r) => r.name.includes(searchText));
  }

  const { r45f, r90f, rGroupFirst } = foundRates;

  const price =
    answers["Учбовий формат"] === "Міні-група"
      ? rGroupFirst.price
      : answers["Тривалість"] === "45 хв"
        ? r45f.price
        : r90f.price;

  step.text = `Добре 💙\nВам необхідно внести оплату першого уроку ${price} грн ФОП Лещенко С.Б. рахунок UA523220010000026006300055066, ЄДРПОУ: 2992609434, призначення платежу: оплата уроків.\n\nМаємо зауважити, що місце за вами бронюється після оплати першого уроку, в інакшому випадку - хтось може бути спритнішим і його забрати 🌝\nПісля оплати напишіть, будь ласка, прізвище та ім'я платника чи надішліть скрін ☺️`;
}

async function handleZeroGroups(chatId, step, answers) {
  const lessons = await getLessons(answers.Мова);
  const rates = await getRates();

  const priceFirst = rates.filter(
    (rate) => rate.name === "Перший урок в групі",
  )[0].price;

  const zeroLessons = lessons.filter((t) => t.level === "з нуля");

  const textLessons = zeroLessons
    .map(
      (l) => `  - група №${l.groupNumber} - ${l.schedule} (старт ${l.start})`,
    )
    .join("\n");

  console.log(textLessons);

  const rate = rates.filter((rate) => rate.name === zeroLessons[0].rate)[0];

  step.text = `Ми запускаємо онлайн міні-групи з нуля:
🗓 розклад: 
${textLessons}
    
🕒 час київський

Це живі он-лайн уроки з викладачем з використанням сучасної комунікативної методики;

📚 ${zeroLessons[0].rate}:
кожні ${rate.lessons} занять — ${rate.price} грн.
${rate.duration}

Спробуйте перше заняття лише за ${priceFirst} грн
— далі вирішуйте, чи продовжуєте ви навчання!

📩 Бажаєте записатись на перший урок?`;

  if (zeroLessons.length === 1) {
    step.options = [
      { label: "Так", value: zeroLessons[0].groupNumber },
      { label: "Ні", value: "Ні" },
    ];
  } else if (zeroLessons.length > 1) {
    step.options = zeroLessons.map((l) => ({
      label: `${l.schedule} старт з ${l.start}`,
      value: l.groupNumber,
    }));
  }
}

async function handleIndividualTeachers(chatId, step, answers) {
  const teachers = await getTeachers(answers.Мова);
  const duration = answers.Тривалість;
  const slotsKey = duration === "45 хв" ? "slots45" : "slots90";

  const availableTeachers = teachers.filter((t) => t[slotsKey]);

  if (availableTeachers.length === 0) {
    await bot.sendMessage(
      chatId,
      "На жаль, зараз немає доступних вчителів для обраних параметрів. Ми зв'яжемося з вами найближчим часом!",
    );
    if (step.next) await sendStep(chatId, step.next);
    return true; // shouldSkip
  }

  step.options = availableTeachers.map((t) => ({
    label: t.name,
    value: t.name,
  }));
  return false; // don't skip
}

async function handleIndividualSlots(chatId, step, answers) {
  console.log(`🎯 handleIndividualSlots викликано`);
  console.log(`   Вчитель: ${answers.Вчитель}`);
  console.log(`   Тривалість: ${answers.Тривалість}`);
  const teachers = await getTeachers(answers.Мова);
  const teacher = teachers.find((t) => t.name === answers.Вчитель);

  if (!teacher) {
    if (step.next) await sendStep(chatId, step.next);
    return true; // shouldSkip
  }

  const duration = answers.Тривалість;
  const slotsKey = duration === "45 хв" ? "slots45" : "slots90";
  const raw = teacher[slotsKey];

  if (!raw?.trim()) {
    await bot.sendMessage(
      chatId,
      "На жаль, у обраного вчителя зараз немає доступних слотів. Ми зв'яжемося з вами для узгодження часу!",
    );
    if (step.next) await sendStep(chatId, step.next);
    return true; // shouldSkip
  }

  // Сохраняем слоты для текущего пользователя (не кеш, а данные сессии)
  userAnswers[chatId]._teacherSlots = raw;

  return false; // don't skip
}

function sendResultsToAdmin(chatId) {
  const answers = userAnswers[chatId];
  let message = "📝 Нова анкета:\n\n";

  // Фильтруем служебные поля
  for (const key in answers) {
    if (key.startsWith("_") || key === "temp_slots") {
      continue;
    }
    message += `<b>${key}</b>: ${answers[key]}\n`;
  }

  bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: "HTML" });

  // ⬇️ НОВОЕ: Если есть скриншот - отправляем его отдельно
  if (answers._paymentPhotoId) {
    bot.sendPhoto(ADMIN_CHAT_ID, answers._paymentPhotoId, {
      caption: "💳 Скріншот підтвердження оплати",
    });
  }
}

function getSlotsKeyboard(chatId) {
  if (!userAnswers[chatId]) return [];

  const raw = userAnswers[chatId]._teacherSlots;
  if (!raw) return [];

  const slots = raw.split(",").map((s) => s.trim());
  const selected = userAnswers[chatId].temp_slots || [];

  const keyboard = slots.map((slot) => [
    {
      text: `${selected.includes(slot) ? "✅ " : ""}${slot}`,
      callback_data: `select_slot:${slot}`,
    },
  ]);

  if (selected.length > 0) {
    keyboard.push([{ text: "📥 Готово", callback_data: "slots_done" }]);
  }

  return keyboard;
}

function getTestLang(chatId) {
  console.log("Запускаем загрузку вопросов теста");
  console.log(userAnswers[chatId]);

  const map = {
    Французька: "french",
    Іспанська: "spain",
    Італійська: "italian",
  };

  const selectedLangUA = userAnswers[chatId]["Мова"];
  const language = map[selectedLangUA];

  console.log(language);

  if (!language) {
    console.error("Язык не найден");
    return;
  }

  const test = tests[language];

  console.log(test);

  Object.assign(flow, test);
}

function getMenuKeyboard(chatId) {
  const lang = userAnswers[chatId]?.["Мова"] || "не обрана";
  const flag =
    { Французька: "🇫🇷", Іспанська: "🇪🇸", Італійська: "🇮🇹" }[lang] || "🌍";

  return {
    keyboard: [
      [{ text: `${flag} Мова: ${lang}` }],
      [{ text: "📝 Тест рівня" }, { text: "✉️ Написати нам" }],
      [{ text: "📋 Записатись на урок" }, { text: "ℹ️ Про нас" }],
    ],
    resize_keyboard: true,
    persistent: true,
  };
}

function askLanguage(chatId, text = "Оберіть мову навчання:") {
  return bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🇫🇷 Французька", callback_data: "setlang_Французька" }],
        [{ text: "🇪🇸 Іспанська", callback_data: "setlang_Іспанська" }],
        [{ text: "🇮🇹 Італійська", callback_data: "setlang_Італійська" }],
      ],
    },
  });
}
