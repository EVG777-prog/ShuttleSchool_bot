const { GoogleSpreadsheet } = require("google-spreadsheet");

const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, {
  apiKey: process.env.GOOGLE_API_KEY,
});

let isReady = false;

// ============= КЕШІ =============
const cache = {
  rates: null,
  teachers: {}, // { "Французька": [...], "Іспанська": [...] }
  lastUpdate: null,
};

const CACHE_TTL = 10 * 60 * 1000; // 10 хвилин

// ============= ІНІЦІАЛІЗАЦІЯ =============
async function initGoogle() {
  if (isReady) return;

  await doc.loadInfo();
  console.log("📊 Google Sheets connected:", doc.title);

  isReady = true;

  // Предзагрузка тарифов при старте (опционально)
  await getRates();
}

// ============= ПЕРЕВІРКА КЕШУ =============
function isCacheValid() {
  if (!cache.lastUpdate) return false;
  return Date.now() - cache.lastUpdate < CACHE_TTL;
}

function invalidateCache() {
  cache.rates = null;
  cache.teachers = {};
  cache.lastUpdate = null;
  console.log("🗑️ Cache invalidated");
}

// ============= ТАРИФИ =============
async function getRates() {
  // Якщо кеш валідний - повертаємо з кешу
  if (cache.rates && isCacheValid()) {
    console.log("📦 Rates from cache");
    return cache.rates;
  }

  console.log("🌐 Fetching rates from Google Sheets...");

  const sheet = doc.sheetsByTitle["Rates"];
  const rows = await sheet.getRows();

  const rates = rows
    .map((row) => {
      const data = row._rawData;
      if (!data || data.length < 5) return null;

      return {
        name: data[0],
        price: data[1],
        duration: data[2],
        details: data[3],
        lessons: data[4],
      };
    })
    .filter(Boolean); // видаляємо null значення

  // Зберігаємо в кеш
  cache.rates = rates;
  cache.lastUpdate = Date.now();

  return rates;
}

// ============= ВЧИТЕЛІ =============
async function getTeachers(lang) {
  // Якщо є в кеші і кеш валідний - повертаємо
  if (cache.teachers[lang] && isCacheValid()) {
    console.log(`📦 Teachers (${lang}) from cache`);
    return cache.teachers[lang];
  }

  console.log(`🌐 Fetching teachers (${lang}) from Google Sheets...`);

  const map = {
    Французька: "French_teachers",
    Іспанська: "Spanish_teachers",
    Італійська: "Italian_teachers",
  };

  const sheetName = map[lang];
  if (!sheetName) return [];

  const sheet = doc.sheetsByTitle[sheetName];
  if (!sheet) {
    console.error(`❌ Sheet "${sheetName}" not found`);
    return [];
  }

  const rows = await sheet.getRows();

  const teachers = rows
    .map((row) => {
      const data = row._rawData;
      if (!data || data.length < 3) return null;

      return {
        name: data[0],
        description: data[1],
        photo_name: data[2],
        youtube: data[3],
        slots45: data[4],
        slots90: data[5],
      };
    })
    .filter(Boolean);

  // Зберігаємо в кеш
  cache.teachers[lang] = teachers;
  cache.lastUpdate = Date.now();

  return teachers;
}

// ============= ФОРСОВАНА ОНОВЛЕННЯ КЕШУ =============
async function refreshCache() {
  console.log("🔄 Force refreshing cache...");
  invalidateCache();

  // Предзагрузка всех данных
  await getRates();
  await Promise.all([
    getTeachers("Французька"),
    getTeachers("Іспанська"),
    getTeachers("Італійська"),
  ]);

  console.log("✅ Cache refreshed");
}

module.exports = {
  initGoogle,
  getRates,
  getTeachers,
  refreshCache,
  invalidateCache,
};
