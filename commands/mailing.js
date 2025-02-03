// commands/mailing.js
const { adminChatIds } = require('../config');

module.exports = (bot, msg, userStates) => {
  const chatId = msg.chat.id;

  // Проверяем, является ли пользователь админом
  if (!adminChatIds.includes(chatId)) {
    console.log('hahah');
    return;
  }

  // Устанавливаем состояние для рассылки
  userStates[chatId] = { step: 'mailing' };

  bot.sendMessage(
    chatId,
    'Пожалуйста, отправьте сообщение для рассылки. Это может быть текст, фото или документ.',
    {
      reply_markup: {
        keyboard: [['Отмена']],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
};
