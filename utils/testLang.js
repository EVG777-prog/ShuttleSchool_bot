const LANG_MAP = {
  Французька: "french",
  Іспанська: "spain",
  Італійська: "italian",
};

function createTestLang({ flow, tests, userAnswers }, language) {
function getTestLang(chatId) {
  const selectedLang = language || userAnswers[chatId]["Мова"];
  const testKey = LANG_MAP[selectedLang];

  if (!testKey) {
    console.error("Язык не найден:", selectedLang);
    return;
  }

  // Очищаємо старі питання тесту з flow
  Object.keys(flow).forEach((key) => {
    if (key.startsWith("test_q") || key === "test_start" || key === "test_result") {
      delete flow[key];
    }
  });

  Object.assign(flow, tests[testKey]);
  console.log(`✅ Тест завантажено для мови: ${selectedLang}`);
}
return { getTestLang };
}

module.exports = { createTestLang };
