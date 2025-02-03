const userStates = require('../states');

module.exports = (bot, msg) => {
  const chatId = msg.chat.id;
  delete userStates[chatId];
  bot.sendMessage(chatId, 'Операция отменена.', {
    reply_markup: {
      remove_keyboard: true,
    },
  });
};
