const { GoogleSpreadsheet } = require("google-spreadsheet");

const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, {
  apiKey: process.env.GOOGLE_API_KEY,
});

let isReady = false;

// ============= КЕШІ =============
const cache = {
  rates: null,
  teachers: {},
  lessons: {},
  lastUpdate: {
    rates: null,
    teachers: {},
    lessons: {},
  },
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
function isCacheValid(type, key = null) {
  const last = key ? cache.lastUpdate[type][key] : cache.lastUpdate[type];
  if (!last) return false;
  return Date.now() - last < CACHE_TTL;
}

function invalidateCache() {
  cache.rates = null;
  cache.teachers = {};
  cache.lessons = {};
  cache.lastUpdate = { rates: null, teachers: {}, lessons: {} };
  console.log("🗑️ Cache invalidated");
}

// ============= ТАРИФИ =============
async function getRates() {
  // Якщо кеш валідний - повертаємо з кешу
  if (cache.rates && isCacheValid("rates")) {
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
  cache.lastUpdate.rates = Date.now();

  return rates;
}

// ============= ВЧИТЕЛІ =============
async function getTeachers(lang) {
  // Якщо є в кеші і кеш валідний - повертаємо
  if (cache.teachers[lang] && isCacheValid("teachers", lang)) {
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
  cache.lastUpdate.teachers[lang] = Date.now();

  return teachers;
}

// ============= ЛЕКЦІЇ =============
async function getLessons(lang) {
  // Якщо є в кеші і кеш валідний - повертаємо
  if (cache.lessons[lang] && isCacheValid("lessons", lang)) {
    console.log(`📦 Lessons (${lang}) from cache`);
    return cache.lessons[lang];
  }

  console.log(`🌐 Fetching lessons (${lang}) from Google Sheets...`);

  const map = {
    Французька: "French_lessons",
    Іспанська: "Spanish_lessons",
    Італійська: "Italian_lessons",
  };

  const sheetName = map[lang];
  if (!sheetName) return [];

  const sheet = doc.sheetsByTitle[sheetName];
  if (!sheet) {
    console.error(`❌ Sheet "${sheetName}" not found`);
    return [];
  }

  const rows = await sheet.getRows();
  console.log("ROWS", rows);

  const lessons = rows
    .map((row) => {
      const data = row._rawData;
      console.log("LESSON ROW:", JSON.stringify(data));
      if (!data || data.length < 3) return null;

      return {
        level: data[0],
        schedule: data[1],
        teacher: data[2],
        rate: data[3],
        start: data[4],
        groupNumber: data[5],
      };
    })
    .filter(Boolean);

  // Зберігаємо в кеш
  cache.lessons[lang] = lessons;
  cache.lastUpdate.lessons[lang] = Date.now();

  return lessons;
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
  await Promise.all([
    getLessons("Французька"),
    getLessons("Іспанська"),
    getLessons("Італійська"),
  ]);

  console.log("✅ Cache refreshed");
}

module.exports = {
  initGoogle,
  getRates,
  getTeachers,
  getLessons,
  refreshCache,
  invalidateCache,
};
