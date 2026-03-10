const bot = require("../bot");
const { userAnswers } = require("../state");

const LANG_FLAGS = {
  Французька: "🇫🇷",
  Іспанська: "🇪🇸",
  Італійська: "🇮🇹",
};

const LANG_KEYBOARD = [
  [{ text: "🇫🇷 Французька", callback_data: "setlang_Французька" }],
  [{ text: "🇪🇸 Іспанська", callback_data: "setlang_Іспанська" }],
  [{ text: "🇮🇹 Італійська", callback_data: "setlang_Італійська" }],
];

function getMenuKeyboard(chatId) {
  const lang = userAnswers[chatId]?.["Мова"] || "не обрана";
  const flag = LANG_FLAGS[lang] || "🌍";

  return {
    keyboard: [
      [{ text: `${flag} Мова: ${lang}` }, { text: "👩‍🏫 Викладачі" }],
      [{ text: "📋 Записатись на урок" }, { text: "✉️ Написати нам" }],
      [{ text: "📝 Тест рівня" }, { text: "❓ FAQ" }],
      [{ text: "💰 Тарифи" }, { text: "🗣 Розмовний клуб" }],
    ],
    resize_keyboard: true,
    persistent: true,
  };
}

function getSlotsKeyboard(chatId) {
  if (!userAnswers[chatId]) return [];

  const raw = userAnswers[chatId]._teacherSlots;
  if (!raw) return [];

  const slots = raw.split(",").map((s) => s.trim());
  const selected = userAnswers[chatId].temp_slots || [];
  const maxSlots = userAnswers[chatId]._maxSlots || 2;

  const keyboard = slots.map((slot) => {
    const isSelected = selected.includes(slot);
    const isDisabled = !isSelected && selected.length >= maxSlots;
    return [
      {
        text: `${isSelected ? "✅ " : isDisabled ? "· " : ""}${slot}`,
        callback_data: isDisabled ? "slots_max" : `select_slot:${slot}`,
      },
    ];
  });

  if (selected.length === maxSlots) {
    keyboard.push([{ text: "📥 Готово", callback_data: "slots_done" }]);
  }

  return keyboard;
}

function askLanguage(chatId, text = "Яку мову ви плануєте вивчати:") {
  return bot.sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: LANG_KEYBOARD },
  });
}

module.exports = { getMenuKeyboard, getSlotsKeyboard, askLanguage };
