require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const flow = require("./questions.json");
const { initGoogle, getRates, getTeachers } = require("./google_docs");

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

  // 1. ПЕРЕВІРКА: Якщо це крок з контактом, але нік вже є — пропускаємо
  if (
    step.requestContact &&
    userAnswers[chatId]?.["Telegram"] &&
    userAnswers[chatId]["Telegram"] !== "-"
  ) {
    if (step.next) return sendStep(chatId, step.next);
  }

  userState[chatId] = stepKey;

  // 2. ДИНАМІЧНІ ТЕКСТИ (Тарифи)
  if (step.text === "dynamic:individual") {
    const rates = await getRates();
    const r45f = rates.find((r) => r.name.includes("Перший урок “Лише ти 45”"));
    const r90f = rates.find((r) => r.name.includes("Перший урок “Лише ти 90”"));
    const r45 = rates.find((r) => r.name.includes("Тариф “Лише ти 45”"));
    const r90 = rates.find((r) => r.name.includes("Тариф “Лише ти 90”"));

    step.text = `Можемо запропонувати два варіанти індивідуальних занять:\n\n• тариф «${r45.name}»: ${r45.price} грн за ${r45.lessons} занять. Пробний – ${r45f.price} грн.\n\n• тариф «${r90.name}»: ${r90.price} грн за ${r90.lessons} занять. Пробний – ${r90f.price} грн.`;
  }

  // 3. ПІДГОТОВКА ОПЦІЙ (Вчителі та Слоти)
  if (stepKey === "teachers") {
    const teachers = await getTeachers(userAnswers[chatId]["Мова"]);
    const duration = userAnswers[chatId]["Тривалість"];
    const availableTeachers = teachers.filter((t) =>
      duration === "45 хв" ? t.slots45 : t.slots90,
    );

    // ⬅️ ПЕРЕВІРКА: якщо немає вчителів - пропускаємо крок
    if (availableTeachers.length === 0) {
      if (step.next) return sendStep(chatId, step.next);
      return;
    }

    step.options = availableTeachers.map((t) => ({
      label: t.name,
      value: t.name,
    }));
  }
  let keyboard = [];

  if (stepKey === "slots") {
    // ⬅️ КЕШИРУЕМ данные учителя при первом заходе на этот шаг
    const teachers = await getTeachers(userAnswers[chatId]["Мова"]);
    const teacher = teachers.find(
      (t) => t.name === userAnswers[chatId]["Вчитель"],
    );

    if (teacher) {
      userAnswers[chatId]._cachedTeacher = teacher; // сохраняем в кеш

      const duration = userAnswers[chatId]["Тривалість"];
      const raw = duration === "45 хв" ? teacher.slots45 : teacher.slots90;

      // ⬅️ Якщо немає слотів - пропускаємо крок
      if (!raw || raw.trim() === "") {
        await bot.sendMessage(
          chatId,
          "На жаль, у обраного вчителя зараз немає доступних слотів. Ми зв'яжемося з вами для узгодження часу!",
        );
        if (step.next) return sendStep(chatId, step.next);
        return;
      }
    } else {
      sendStep(chatId, step.next);
      return;
    }

    keyboard = await getSlotsKeyboard(chatId);
  } else if (step.options) {
    keyboard = step.options.map((opt, index) => [
      {
        text: opt.label,
        callback_data: opt.value || `info_${index}`,
      },
    ]);
  }

  // 4. ВІДПРАВКА
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

  if (stepKey === "slots") {
    userAnswers[chatId].slotsMessageId = sent.message_id;
  }
  return;
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userAnswers[chatId] = {
    Telegram: msg.from.username ? "@" + msg.from.username : "-",
  };
  sendStep(chatId, "start");
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const stepKey = userState[chatId];
  const step = flow[stepKey];

  // Мультиселект слотів
  if (data.startsWith("select_slot:")) {
    if (!userAnswers[chatId]) return bot.answerCallbackQuery(query.id);

    const slot = data.split("slot:")[1];

    if (!userAnswers[chatId].temp_slots) userAnswers[chatId].temp_slots = [];

    const prev = userAnswers[chatId].temp_slots || [];

    let next;
    if (prev.includes(slot)) {
      next = prev.filter((s) => s !== slot);
    } else {
      next = [...prev, slot];
    }

    userAnswers[chatId].temp_slots = next;

    const keyboard = await getSlotsKeyboard(chatId);

    try {
      await bot.editMessageReplyMarkup(
        { inline_keyboard: keyboard },
        {
          chat_id: chatId,
          message_id: query.message.message_id, // ⬅️ ВИПРАВЛЕННЯ: використовуємо message_id з самого query
        },
      );
    } catch (e) {
      console.log("Edit failed:", e.message);
    }

    return bot.answerCallbackQuery(query.id);
  }

  if (data === "slots_done") {
    userAnswers[chatId][step.saveAs || "Слоти"] =
      userAnswers[chatId]["temp_slots"].join(", ");
    delete userAnswers[chatId]["temp_slots"];
    delete userAnswers[chatId]["slotsMessageId"];
    delete userAnswers[chatId]["_cachedTeacher"]; // ⬅️ ОЧИСТКА КЕША
    sendStep(chatId, step.next);
    return bot.answerCallbackQuery(query.id);
  }

  // Звичайна логіка кнопок
  const option =
    step?.options?.find((o) => o.value === data) ||
    (data.startsWith("info_") ? step?.options[data.split("_")[1]] : null);
  if (!option) return bot.answerCallbackQuery(query.id);

  if (data.startsWith("info_")) {
    await bot.sendMessage(chatId, option.info);
    return bot.answerCallbackQuery(query.id);
  }

  if (step.saveAs) userAnswers[chatId][step.saveAs] = option.value;
  const nextStep = option.next || step.next;

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
  if (!step || msg.text?.startsWith("/")) return;

  // Обробка контакту
  if (msg.contact && step.requestContact) {
    userAnswers[chatId][step.saveAs || "Телефон"] = msg.contact.phone_number;
    const nextStep = step.next;

    // Видаляємо фізичну кнопку телефону наступним повідомленням
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

function sendResultsToAdmin(chatId) {
  const answers = userAnswers[chatId];
  let message = "📝 Нова анкета:\n\n";
  for (const key in answers) {
    message += `<b>${key}</b>: ${answers[key]}\n`;
  }
  bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: "HTML" });
}

async function getSlotsKeyboard(chatId) {
  if (!userAnswers[chatId]) return [];

  // ⬅️ ИСПОЛЬЗУЕМ КЕШИРОВАННЫЕ ДАННЫЕ
  const teacher = userAnswers[chatId]._cachedTeacher;

  if (!teacher) return [];

  const duration = userAnswers[chatId]["Тривалість"];
  const raw = duration === "45 хв" ? teacher.slots45 : teacher.slots90;

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
