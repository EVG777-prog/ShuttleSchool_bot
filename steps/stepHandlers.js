const bot = require("../bot");
const { userAnswers } = require("../state");
const { getRates, getTeachers, getLessons } = require("../utils/googleSheets");

async function handleIndividualTariff(step) {
  const rates = await getRates();

  const find = (name) => rates.find((r) => r.name.includes(name));
  const r45f = rates.find(
    (r) => r.name.includes("Перший урок") && r.name.includes("45"),
  );
  const r90f = rates.find(
    (r) => r.name.includes("Перший урок") && r.name.includes("90"),
  );
  const r45 = rates.find(
    (r) => r.name.includes("Лише ти 45") && !r.name.includes("Перший"),
  );
  const r90 = rates.find(
    (r) => r.name.includes("Лише ти 90") && !r.name.includes("Перший"),
  );

  console.log({ r45f, r90f, r45, r90 }); // ← проверим что нашли

  step.text = `Можемо запропонувати два варіанти індивідуальних занять:
- ${r45.name}: ${r45.price} грн за кожні ${r45.lessons} уроків по 45 хв, 2 рази на тиждень. Пробний урок — ${r45f.price} грн.
- ${r90.name}: ${r90.price} грн за кожні ${r90.lessons} уроків по 90 хв, 2 рази на тиждень. Пробний урок — ${r90f.price} грн.`;
}

async function handlePayment(step, chatId) {
  const answers = userAnswers[chatId];
  const rates = await getRates();

  const find = (name) => rates.find((r) => r.name.includes(name));
  const r45f = rates.find(
    (r) => r.name.includes("Перший урок") && r.name.includes("45"),
  );
  const r90f = rates.find(
    (r) => r.name.includes("Перший урок") && r.name.includes("90"),
  );
  const rGroupFirst = find(`Перший урок в групі`);

  const price =
    answers["Учбовий формат"] === "Міні-група"
      ? rGroupFirst.price
      : answers["Тривалість"] === "45 хв"
        ? r45f.price
        : r90f.price;

  step.text = `Добре 💙\nВам необхідно внести оплату першого уроку ${price} грн ФОП Лещенко С.Б. рахунок UA523220010000026006300055066, ЄДРПОУ: 2992609434, призначення платежу: оплата уроків.\n\nМаємо зауважити, що місце за вами бронюється після оплати першого уроку, в інакшому випадку - хтось може бути спритнішим і його забрати 🌝\nПісля оплати напишіть, будь ласка, прізвище та ім'я платника чи надішліть скрін ☺️`;
}

async function handleZeroGroups(chatId, step, answers) {
  const escapeMarkdown = (text) =>
    String(text).replace(/[_*[\]()~`>#+=|{}.!\\-]/g, "\\$&");

  const [lessons, rates, teachers] = await Promise.all([
    getLessons(answers.Мова),
    getRates(),
    getTeachers(answers.Мова),
  ]);

  const priceFirst = rates.find((r) => r.name === "Перший урок в групі").price;
  const isChild = answers["Вік"] === "Дитина";

  const zeroLessons = lessons.filter((l) => {
    if (l.level !== "з нуля") return false;
    if (isChild) return l.rate === "Тариф “Підлітки”";
    return l.rate !== "Тариф “Підлітки”";
  });

  if (isChild && zeroLessons.length === 0) {
    step.options = [];
    step.next = "contact";
    return;
  }

  const getTeacherLink = (teacherName) => {
    const teacher = teachers.find((t) => t.name === teacherName);
    if (!teacher?.youtube) return escapeMarkdown(teacherName);
    const url = teacher.youtube.replace("/embed/", "/watch?v=");
    return `[${escapeMarkdown(teacherName)}](${url})`;
  };

  // Групуємо уроки по тарифу
  const byRate = {};
  for (const l of zeroLessons) {
    if (!byRate[l.rate]) byRate[l.rate] = [];
    byRate[l.rate].push(l);
  }

  // Формуємо текст по кожному тарифу
  const rateBlocks = Object.entries(byRate).map(([rateName, group]) => {
    const rate = rates.find((r) => r.name === rateName);
    const textLessons = group
      .map(
        (l) =>
          `  \\- група №${escapeMarkdown(l.groupNumber)} \\- ${escapeMarkdown(l.schedule)}, старт ${escapeMarkdown(l.start)}, викладач ${getTeacherLink(l.teacher)}`,
      )
      .join("\n");

    return `${textLessons}\n\n🕒 час київський\n\n📚 ${escapeMarkdown(rateName)}:\nкожні ${escapeMarkdown(rate.lessons)} занять по 90 хв \\- ${escapeMarkdown(rate.price)} грн\\.\n${escapeMarkdown(rate.duration)}`;
  });

  step.text = `Ми запускаємо онлайн міні\\-групи з нуля:\n\n🗓 розклад:\n\n${rateBlocks.join("\n\n")}\n\nЦе живі онлайн уроки з викладачем з використанням сучасної комунікативної методики;\nОбирайте групу, яка вам підходить за розкладом, та спробуйте перше заняття в ній лише за ${escapeMarkdown(priceFirst)} грн\\!\n\n📩 Бажаєте записатись на перший урок?`;
  step.parseMode = "MarkdownV2";

  step.options =
    zeroLessons.length === 1
      ? [{ label: "Так", value: zeroLessons[0].groupNumber }]
      : zeroLessons.map((l) => ({
          label: `${l.schedule} старт з ${l.start}`,
          value: l.groupNumber,
        }));
}

async function handleIndividualTeachers(chatId, step, answers) {
  const teachers = await getTeachers(answers.Мова);
  const slotsKey = answers.Тривалість === "45 хв" ? "slots45" : "slots90";
  const duration = answers.Тривалість === "45 хв" ? "45" : "90";

  const available = teachers.filter((t) => t[slotsKey]?.trim());

  if (available.length === 0) {
    await bot.sendMessage(
      chatId,
      "На жаль, зараз немає доступних вчителів. Ми зв'яжемося з вами найближчим часом!",
    );
    return true; // shouldSkip
  }

  const langFlag =
    { Французька: "🇫🇷", Іспанська: "🇪🇸", Італійська: "🇮🇹" }[answers.Мова] || "";

  // Формируем текст со всеми учителями и слотами
  const slotsText = available
    .map((t) => `${t.name}:\n${t[slotsKey]}`)
    .join("\n\n");

  const langUrl =
    {
      Французька: "https://shuttleschool.com.ua/pages/french.html#teachers",
      Іспанська: "https://shuttleschool.com.ua/pages/spanish.html#teachers",
      Італійська: "https://shuttleschool.com.ua/pages/italian.html#teachers",
    }[answers.Мова] || "";

  step.text = `${langFlag} Наразі є наступні вільні слоти по ${duration} хвилин для розкладу:\n\n${slotsText}\n\n🕒 час київський\nВам потрібно обрати викладача і розклад (2 слоти).\n\nІнформацію про викладачів ви знайдете за посиланням: ${langUrl}`;

  step.options = available.map((t) => ({ label: t.name, value: t.name }));
  return false;
}

async function handleIndividualSlots(chatId, step, answers) {
  const teachers = await getTeachers(answers.Мова);
  const teacher = teachers.find((t) => t.name === answers.Вчитель);

  if (!teacher) return true;

  const slotsKey = answers.Тривалість === "45 хв" ? "slots45" : "slots90";
  const raw = teacher[slotsKey];

  if (!raw?.trim()) {
    await bot.sendMessage(
      chatId,
      "На жаль, у обраного вчителя зараз немає доступних слотів. Ми зв'яжемося з вами!",
    );
    return true;
  }

  userAnswers[chatId]._teacherSlots = raw;
  userAnswers[chatId]._maxSlots = 2; // ограничение
  return false;
}

function handleTestResult(chatId, step) {
  const results = userAnswers[chatId]._test || [];
  const score = results.filter((v) => v === "correct").length;
  const total = results.length;

  let level;
  if (score <= 5) level = "A1";
  else if (score <= 12) level = "A2";
  else if (score <= 19) level = "B1";
  else if (score <= 28) level = "B2";
  else level = "C1";

  userAnswers[chatId]["Результат тесту"] =
    `${level}, ${score} з ${total} правильних відповідей`;

  step.text = step.text
    .replace("{score}", score)
    .replace("{total}", total)
    .replace("{level}", level);
}

module.exports = {
  handleIndividualTariff,
  handlePayment,
  handleZeroGroups,
  handleIndividualTeachers,
  handleIndividualSlots,
  handleTestResult,
};
