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
      [
        { text: "📋 Записатись на урок" },
        { text: "✉️ Написати адміністратору" },
      ],
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

  console.log(JSON.stringify(raw));

  const slots = parseSlots(raw);

  const selected = userAnswers[chatId].temp_slots || [];
  const maxSlots = userAnswers[chatId]._maxSlots || 2;

  const keyboard = slots.map((slot) => {
    const isSelected = selected.includes(slot);
    const isDisabled = !isSelected && selected.length >= maxSlots;
    return [
      {
        text: `${isSelected ? "✅ " : ""}${slot}`,
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

// Парсит оба формата слотов в плоский массив ["ПН 10:40", "ВТ 9:00", ...]
function parseSlots(raw) {
  if (!raw?.trim()) return [];

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const parts = line
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const [day, firstTime] = parts[0].split(" "); // "СБ 13:00" → ["СБ", "13:00"]
      const times = [firstTime, ...parts.slice(1)];
      return times.filter(Boolean).map((time) => `${day} ${time}`);
    });
}

module.exports = { getMenuKeyboard, getSlotsKeyboard, askLanguage };
