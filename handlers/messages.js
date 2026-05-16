const bot = require("../bot");
const path = require("path");
const fs = require("fs");
const { flow, userState, userAnswers } = require("../state");
const { sendStep } = require("../steps/sendStep");
const { askLanguage } = require("../utils/keyboard");
const { sendResultsToAdmin } = require("../utils/admin");
const { getRates, getTeachers } = require("../utils/googleSheets");

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  // Кнопки меню — до будь-яких перевірок
  if (msg.text === "📋 Записатись на урок") {
    const lang = userAnswers[chatId]?.["Мова"];
    if (!lang) return askLanguage(chatId);

    const level = userAnswers[chatId]?.["Результат тесту"];

    // Берём ник из сообщения, а не из кеша
    const telegram = msg.from.username
      ? "@" + msg.from.username
      : userAnswers[chatId]?.Telegram || "-";

    userAnswers[chatId] = {
      Telegram: telegram,
      Мова: lang,
      ...(level && { "Результат тесту": level }),
    };

    return sendStep(chatId, "start_trial");
  }

  if (msg.text === "❓ FAQ") return sendStep(chatId, "faq");
  if (msg.text === "📝 Тест рівня") {
    const lang = userAnswers[chatId]?.["Мова"];
    if (!lang) return askLanguage(chatId);

    // Очищаем данные предыдущего теста
    delete userAnswers[chatId]._test;
    delete userAnswers[chatId]._currentOptions;
    delete userAnswers[chatId]["Результат тесту"];

    console.log(`🎯 Початок нового тесту для ${chatId}, мова: ${lang}`);

    return sendStep(chatId, "test_start");
  }
  if (msg.text === "✉️ Написати адміністратору") {
    return bot.sendMessage(chatId, "Напишіть адміністратору: @shuttle_school1");
  }
  if (msg.text === "🗣 Розмовний клуб") {
    const lang = userAnswers[chatId]?.["Мова"];
    if (!lang) return askLanguage(chatId);

    const clubStep = {
      Французька: "speaking_club_french",
      Іспанська: "speaking_club_spain",
      Італійська: "speaking_club_italian",
    }[lang];

    return sendStep(chatId, clubStep);
  }
  if (msg.text === "💰 Тарифи") {
    const rates = await getRates();

    // Функция для поиска тарифа
    const findRate = (searchText) =>
      rates.find((r) => r.name.includes(searchText));

    const group2x = findRate("Тариф “Двічі”");
    const group3x = findRate("Тариф “Тричі”");
    const ind45 = findRate("Тариф “Лише ти 45”");
    const ind90 = findRate("Тариф “Лише ти 90”");
    const duo = findRate("Тариф “Удвох”");

    const text = `ГРУПОВІ тарифи 📚:
${group2x ? `• *${group2x.name}*: ${group2x.lessons} занять по 90 хв - ${group2x.price} грн. (2 уроки на тиждень)` : ""}
${group3x ? `• *${group3x.name}*: ${group3x.lessons} занять по 90 хв - ${group3x.price} грн. (3 уроки на тиждень)` : ""}

ІНДИВІДУАЛЬНІ тарифи 📚:
${ind45 ? `• *${ind45.name}*: ${ind45.lessons} занять по 45 хв - ${ind45.price} грн. (2 уроки на тиждень)` : ""}
${ind90 ? `• *${ind90.name}*: ${ind90.lessons} занять по 90 хв - ${ind90.price} грн. (2 уроки на тиждень)` : ""}
${duo ? `• *${duo.name}*: ${duo.lessons} занять по 90 хв - ${duo.price} грн. (за двох. 2 уроки на тиждень)` : ""}`;

    return bot.sendMessage(chatId, `💰 *Наші тарифи:*\n\n${text}`, {
      parse_mode: "Markdown",
    });
  }
  if (msg.text === "👩‍🏫 Викладачі") {
    const lang = userAnswers[chatId]?.["Мова"];
    if (!lang) return askLanguage(chatId);

    const teachers = await getTeachers(lang);
    const fs = require("fs");

    for (const teacher of teachers) {
      const caption = [
        `*${teacher.name}*\n`,
        teacher.description,
        teacher.youtube
          ? `\n▶️ [Відео-знайомство](${teacher.youtube.replace("/embed/", "/watch?v=")})`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const photoPath = path.join(
        __dirname,
        "../photos",
        `${teacher.photo_name}.webp`,
      );
      const photoExists = fs.existsSync(photoPath);

      if (photoExists) {
        await bot.sendPhoto(chatId, fs.createReadStream(photoPath), {
          caption,
          parse_mode: "Markdown",
        });
      } else {
        await bot.sendMessage(chatId, `👤\n\n${caption}`, {
          parse_mode: "Markdown",
        });
      }
    }
    return;
  }

  if (msg.text?.includes("Мова:"))
    return askLanguage(chatId, "Оберіть мову, яку хочете вивчати:");

  const stepKey = userState[chatId];
  const step = flow[stepKey];
  if (!step || msg.text?.startsWith("/")) return;

  // Контакт
  if (msg.contact && step.requestContact) {
    userAnswers[chatId][step.saveAs || "Телефон"] = msg.contact.phone_number;
    const nextStep = step.next;
    if (flow[nextStep]?.end) {
      await bot.sendMessage(chatId, flow[nextStep].text, {
        reply_markup: getMenuKeyboard(chatId),
      });
      sendResultsToAdmin(chatId);
    } else {
      sendStep(chatId, nextStep);
    }
    return;
  }

  // Фото (скріншот оплати)
  if (msg.photo && step.acceptPhoto) {
    const photo = msg.photo[msg.photo.length - 1];
    userAnswers[chatId][step.saveAs] =
      `[Скріншот] ${msg.caption || "(без підпису)"}`;
    userAnswers[chatId]._paymentPhotoId = photo.file_id;

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
    // Проверяем что пользователь действительно на шаге с freeInput
    if (userState[chatId] !== stepKey) return;

    userAnswers[chatId][step.saveAs] = msg.text;
    sendStep(chatId, step.next);
  }
});
