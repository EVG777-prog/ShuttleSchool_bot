const TelegramBot = require("node-telegram-bot-api");

function createBot(token) {
  return new TelegramBot(token, { polling: false });
}

module.exports = { createBot };
