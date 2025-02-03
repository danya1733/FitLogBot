const { generateMainMenu } = require('./mainMenu');
const User = require('../models/user');
const userStates = require('../states');

module.exports = async (bot, msg) => {
  const chatId = msg.chat.id;

  // Проверяем, существует ли пользователь в базе
  let user = await User.findOne({ chatId });

  if (!user) {
    // Если пользователь новый, создаем запись в базе
    user = new User({ chatId, subscribed: true });
    await user.save();

    // Устанавливаем состояние для заполнения данных
    userStates[chatId] = { step: 'start_data_entry' };

    return bot.sendMessage(chatId, 'Привет! Вы впервые используете меня. Хотите заполнить свои данные?', {
      reply_markup: {
        keyboard: [['Да', 'Нет']],
        one_time_keyboard: true,
        resize_keyboard: true,
      },
    });
  }

  // Существующий пользователь: показываем главное меню
  bot.sendMessage(
    chatId,
    'Привет! Используйте клавиатуру ниже для выбора команды.',
    generateMainMenu(user.subscribed)
  );
};
