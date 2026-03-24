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

  // Новый формат с днями "ПН: ..."
  if (/[А-ЯІЇЄ]{2}:/.test(raw)) {
    const slots = [];
    // Убираем все переносы строк, потом разбиваем по дням
    const cleaned = raw.replace(/\n/g, " ");
    const parts = cleaned.split(/(?=[А-ЯІЇЄ]{2}:)/);
    for (const part of parts) {
      const match = part.match(/^([А-ЯІЇЄ]{2}):\s*(.+)/);
      if (!match) continue;
      const day = match[1];
      const times = match[2]
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      times.forEach((time) => slots.push(`${day} ${time}`));
    }
    return slots;
  }

  // Старый формат: "ПН 10:40, ПН 11:30"
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = { getMenuKeyboard, getSlotsKeyboard, askLanguage };
