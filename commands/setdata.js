const User = require('../models/user');
const userStates = require('../states');

module.exports = async (bot, msg) => {
  const chatId = msg.chat.id;

  let user = await User.findOne({ chatId });
  if (!user) {
    user = new User({ chatId });
    await user.save();
  }

  userStates[chatId] = { step: 'gender' };

  bot.sendMessage(chatId, 'Начнем с заполнения данных. Выберите ваш пол:', {
    reply_markup: {
      keyboard: [['Мужской', 'Женский'], ['Назад']],
      one_time_keyboard: true,
    },
  });
};
