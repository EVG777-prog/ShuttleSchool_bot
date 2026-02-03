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

  const rates = [];

  rows.forEach((row) => {
    const data = row._rawData;

    // если строка пустая — пропускаем
    if (!data || data.length < 5) return;

    rates.push({
      name: data[0],
      price: data[1],
      duration: data[2],
      details: data[3],
      lessons: data[4],
    });
  });

  return rates;
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

  const teachers = [];

  rows.forEach((row) => {
    const data = row._rawData;

    // если строка пустая — пропускаем
    if (!data || data.length < 3) return;

    teachers.push({
      name: data[0],
      description: data[1],
      photo_name: data[2],
      youtube: data[3],
      slots45: data[4],
      slots90: data[5],
    });
  });

  return teachers;
}

module.exports = {
  initGoogle,
  getRates,
  getTeachers,
};
