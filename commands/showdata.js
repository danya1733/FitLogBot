const User = require('../models/user');

module.exports = async (bot, msg) => {
  const chatId = msg.chat.id;
  const user = await User.findOne({ chatId });

  if (!user) {
    return bot.sendMessage(
      chatId,
      'Данных не найдено. Пожалуйста, введите их с помощью команды /start.'
    );
  }

  // Проверяем наличие данных и заменяем undefined на "не указано"
  const gender = user.gender || 'не указано';
  const latestWeight = user.weights.length > 0 ? `${user.weights[user.weights.length - 1].weight} кг` : 'не указано';
  const goal = user.goal ? `${user.goal} кг` : 'не указано';
  const height = user.height ? `${user.height} см` : 'не указано';
  const age = user.age ? `${user.age} лет` : 'не указано';
  const activityLevel = user.activityLevel || 'не указано';

  bot.sendMessage(
    chatId,
    `Ваши данные:
  - Пол: ${gender}
  - Вес: ${latestWeight}
  - Целевой вес: ${goal}
  - Рост: ${height}
  - Возраст: ${age}
  - Физическая активность: ${activityLevel}`
  );
};
