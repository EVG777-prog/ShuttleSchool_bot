const { flow, tests, userAnswers } = require("../state");

const LANG_MAP = {
  Французька: "french",
  Іспанська: "spain",
  Італійська: "italian",
};

function getTestLang(chatId) {
  const selectedLang = userAnswers[chatId]["Мова"];
  const language = LANG_MAP[selectedLang];

  if (!language) {
    console.error("Язык не найден:", selectedLang);
    return;
  }

  // Очищаємо старі питання тесту з flow
  Object.keys(flow).forEach((key) => {
    if (key.startsWith("test_q") || key === "test_start" || key === "test_result") {
      delete flow[key];
    }
  });

  Object.assign(flow, tests[language]);
  console.log(`✅ Тест завантажено для мови: ${selectedLang}`);
}

module.exports = { getTestLang };
