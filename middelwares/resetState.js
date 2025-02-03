// middlewares/resetState.js
const userStates = require('../states');

module.exports = (bot) => {
  bot.use((msg, next) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Если команда требует клавиатуру (например, /choose_day), пропускаем сброс состояния и удаление клавиатуры
    const commandsRequiringKeyboard = ['/some_other_command'];
    if (commandsRequiringKeyboard.includes(text)) {
      return next(); // Пропускаем сброс состояния и удаление клавиатуры для этих команд
    }

    // Сброс состояния пользователя для всех остальных команд
    if (userStates[chatId]) {
      delete userStates[chatId];
    }

    // Удаление клавиатуры, если команда не требует её использования
    bot.sendMessage(chatId, '', {
      reply_markup: {
        remove_keyboard: true, // Удаление клавиатуры
      },
    }).then(() => {
      next(); // Выполняем следующую команду
    });
  });
};
