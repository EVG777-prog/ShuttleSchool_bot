const { GoogleSpreadsheet } = require("google-spreadsheet");

const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, {
  apiKey: process.env.GOOGLE_API_KEY,
});

let isReady = false;

async function initGoogle() {
  if (isReady) return;

  await doc.loadInfo(); // загружаем структуру таблицы
  console.log("📊 Google Sheets connected:", doc.title);

  isReady = true;
}

/**
 * Загрузка тарифов из листа Rates
 */
async function getRates() {
  const sheet = doc.sheetsByTitle["Rates"];
  const rows = await sheet.getRows();

  return rows.map((row) => ({
    name: row["Ім'я"],
    price: row["Ціна"],
    duration: row["Тривалість"],
    lessons: row["Кількість уроків"],
    details: row["Деталі"],
  }));
}

/**
 * Загрузка учителей по языку
 */
async function getTeachers(lang) {
  const map = {
    Французька: "French_teachers",
    Іспанська: "Spanish_teachers",
    Італійська: "Italian_teachers",
  };

  const sheetName = map[lang];
  if (!sheetName) return [];

  const sheet = doc.sheetsByTitle[sheetName];
  const rows = await sheet.getRows();

  return rows.map((row) => ({
    name: row["Ім'я"],
    description: row["Опис"],
    photo: row["Фото"],
    link: row["Посилання"],
    slots45: row["Слоти 45"],
    slots90: row["Слоти 90"],
  }));
}

module.exports = {
  initGoogle,
  getRates,
  getTeachers,
};
