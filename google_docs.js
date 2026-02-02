const { GoogleSpreadsheet } = require("google-spreadsheet");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const API_KEY = process.env.GOOGLE_API_KEY;

async function getRates() {
  const doc = new GoogleSpreadsheet(SHEET_ID, { apiKey: API_KEY });
  await doc.loadInfo();

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

module.exports = { getRates };
