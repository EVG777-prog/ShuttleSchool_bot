// Telegram-токени задавайте в змінних середовища, не зберігайте їх у репозиторії.
module.exports = {
  bots: [
    {
      id: "shuttle",
      tokenEnv: "BOT_TOKEN",
      nameSchool: "Шатл",
      language: null,
      showLanguageMenu: true,
      bankAccount: "UA523220010000026006300055066",
      fop: "ФОП Лещенко С.Б., ЄДРПОУ: 2992609434",
    },
    {
      id: "italian",
      tokenEnv: "BOT_ITALIAN_TOKEN",
      nameSchool: "Tutto bene",
      language: "Італійська",
      showLanguageMenu: false,
      bankAccount: "UA073220010000026008330017168",
      fop: "ФОП Лещенко Т.С., ЄДРПОУ: 3479106201",
    },
    {
      id: "french",
      tokenEnv: "BOT_FRENCH_TOKEN",
      nameSchool: "Ile-de-France",
      language: "Французька",
      showLanguageMenu: false,
      bankAccount: "UA523220010000026006300055066",
      fop: "ФОП Лещенко С.Б., ЄДРПОУ: 2992609434",
    },
    {
      id: "spanish",
      tokenEnv: "BOT_SPANISH_TOKEN",
      nameSchool: "Me Gusta",
      language: "Іспанська",
      showLanguageMenu: false,
      bankAccount: "UA073220010000026008330017168",
      fop: "ФОП Лещенко Т.С., ЄДРПОУ: 3479106201",
    },
  ],
};
