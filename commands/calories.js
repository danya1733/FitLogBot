const User = require('../models/user');
const { mainMenu } = require('../commands/mainMenu');

module.exports = async (bot, msg) => {
  const chatId = msg.chat.id;
  const user = await User.findOne({ chatId });

  if (!user || user.weights.length === 0 || !user.height || !user.age || !user.activityLevel) {
    return bot.sendMessage(
      chatId,
      'У нас нет ваших полных данных. Пожалуйста, введите их с помощью команды /start.',
      mainMenu,
    );
  }

  const latestWeight = user.weights[user.weights.length - 1].weight;

  // Рассчитываем базовый уровень метаболизма (BMR)
  let bmr;
  if (user.gender === 'Мужской') {
    bmr = 88.36 + 13.4 * latestWeight + 4.8 * user.height - 5.7 * user.age;
  } else if (user.gender === 'Женский') {
    bmr = 447.6 + 9.2 * latestWeight + 3.1 * user.height - 4.3 * user.age;
  } else {
    return bot.sendMessage(
      chatId,
      'Некорректно указан пол. Пожалуйста, обновите данные.',
      mainMenu,
    );
  }

  // Множитель активности
  let activityMultiplier;
  switch (user.activityLevel) {
    case 'Маленькая':
      activityMultiplier = 1.2;
      break;
    case 'Низкая':
      activityMultiplier = 1.375;
      break;
    case 'Средняя':
      activityMultiplier = 1.55;
      break;
    case 'Высокая':
      activityMultiplier = 1.725;
      break;
    case 'Очень высокая':
      activityMultiplier = 1.9;
      break;
    default:
      activityMultiplier = 1.2;
  }

  const dailyCalories = bmr * activityMultiplier;

  bot.sendMessage(
    chatId,
    `Ваша суточная норма калорий составляет примерно ${dailyCalories.toFixed(0)} ккал.`,
    mainMenu,
  );
};
