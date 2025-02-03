const User = require('../models/user');

module.exports = async (bot, msg) => {
  const chatId = msg.chat.id;
  const user = await User.findOne({ chatId });

  if (!user || user.weights.length === 0 || !user.height) {
    return bot.sendMessage(
      chatId,
      'У нас нет ваших данных. Пожалуйста, введите их с помощью команды /start.'
    );
  }

  const latestWeight = user.weights[user.weights.length - 1].weight;
  const heightInMeters = user.height / 100;
  const bmi = latestWeight / (heightInMeters * heightInMeters);
  let bmiCategory = '';

  if (bmi < 18.5) {
    bmiCategory = 'Недостаточный вес';
  } else if (bmi >= 18.5 && bmi < 24.9) {
    bmiCategory = 'Нормальный вес';
  } else if (bmi >= 25 && bmi < 29.9) {
    bmiCategory = 'Избыточный вес';
  } else {
    bmiCategory = 'Ожирение';
  }

  bot.sendMessage(
    chatId,
    `Ваш индекс массы тела (BMI): ${bmi.toFixed(2)}. Это ${bmiCategory}.\n\nИндекс массы тела — это показатель, который позволяет оценить, соответствует ли ваш вес вашему росту. 
    Важно понимать, что BMI — это всего лишь ориентир, и его результаты могут варьироваться в зависимости от возраста, пола и уровня физической активности. 
    Для более точной оценки здоровья рекомендуется проконсультироваться с врачом.`
  );
};
