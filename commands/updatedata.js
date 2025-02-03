const userStates = require('../states');

module.exports = async (bot, msg) => {
  const chatId = msg.chat.id;

  userStates[chatId] = { step: 'updateChoice' };

  bot.sendMessage(chatId, 'Что вы хотите изменить?', {
    reply_markup: {
      keyboard: [
        ['Пол', 'Вес'], ['Рост', 'Возраст'], ['Уровень активности', "Цель веса"], ['Назад']
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    }
  });
};
