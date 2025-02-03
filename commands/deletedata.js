const User = require('../models/user');

module.exports = async (bot, msg) => {
  const chatId = msg.chat.id;
  await User.deleteOne({ chatId });
  bot.sendMessage(chatId, 'Ваши данные удалены.');
};
