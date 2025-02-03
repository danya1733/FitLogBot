const User = require('../models/user');
const { generateMainMenu } = require('./mainMenu');

module.exports = async (bot, msg, isSubscribe) => {
  const chatId = msg.chat.id;

  // Проверяем наличие пользователя в базе данных
  let user = await User.findOne({ chatId });
  if (!user) {
    // Если пользователя нет, создаем его
    user = new User({ chatId, subscribed: true });
    await user.save();
  }

  // Логика подписки или отписки
  if (isSubscribe) {
    user.subscribed = true;
    await user.save();
    return bot.sendMessage(chatId, 'Вы успешно подписались на рассылку.', generateMainMenu(user.subscribed));
  } else {
    user.subscribed = false;
    await user.save();
    return bot.sendMessage(chatId, 'Вы успешно отписались от рассылки.', generateMainMenu(user.subscribed));
  }
};
