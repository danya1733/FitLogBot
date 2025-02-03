const moment = require('moment-timezone');
const User = require('../models/user');
const userStates = require('../states');
const { generateMainMenu } = require('./mainMenu'); // Импортируем функцию для главного меню

// Определяем доступные часовые пояса
const availableTimezones = [
  'UTC-12', 'UTC-11', 'UTC-10', 'UTC-9', 'UTC-8', 'UTC-7', 'UTC-6', 'UTC-5',
  'UTC-4', 'UTC-3', 'UTC-2', 'UTC-1', 'UTC+0', 'UTC+1', 'UTC+2', 'UTC+3',
  'UTC+4', 'UTC+5', 'UTC+6', 'UTC+7', 'UTC+8', 'UTC+9', 'UTC+10', 'UTC+11', 'UTC+12',
];

// Функция для разделения массива на чанки фиксированного размера
const chunkArray = (array, size) => {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

// Функция для преобразования 'UTC+x' в 'Etc/GMT-x'
const convertUTCtoEtcGMT = (utc) => {
  const match = /^UTC([+-]\d{1,2})$/.exec(utc);
  if (!match) return null;
  const offset = parseInt(match[1], 10);
  return `Etc/GMT${offset >= 0 ? '-' : '+'}${Math.abs(offset)}`;
};

module.exports = {
  // Отправка сообщения с выбором часового пояса
  setTimezone: async (bot, msg) => {
    const chatId = msg.chat.id;

    await bot.sendMessage(
      chatId,
      'Пожалуйста, выберите ваш часовой пояс из списка ниже или введите свой вручную.\nПример: UTC+3',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Выбрать из списка', callback_data: 'choose_timezone' }],
            [{ text: 'Ввести свой', callback_data: 'input_timezone' }],
          ],
        },
      }
    );
  },

  // Обработка выбора часового пояса через callback_query
  handleCallback: async (bot, query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'choose_timezone') {
      const timezoneButtons = availableTimezones.map((tz) => ({
        text: tz,
        callback_data: `set_timezone_${tz}`,
      }));

      const keyboard = chunkArray(timezoneButtons, 3);
      keyboard.push([{ text: '⬅️ Назад', callback_data: 'back_to_timezone_options' }]);

      await bot.editMessageText('Выберите ваш часовой пояс:', {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: { inline_keyboard: keyboard },
      });
    } else if (data.startsWith('set_timezone_')) {
      const utcTimezone = data.replace('set_timezone_', '');
      const etcTimezone = convertUTCtoEtcGMT(utcTimezone);

      if (etcTimezone && moment.tz.zone(etcTimezone)) {
        try {
          await User.updateOne(
            { chatId: chatId },
            { $set: { timezone: etcTimezone } },
            { upsert: true }
          );

          await bot.answerCallbackQuery(query.id, { text: `Часовой пояс установлен на ${utcTimezone}.` });

          // Отправляем главное меню
          const user = await User.findOne({ chatId });
          await bot.sendMessage(chatId, `✅ Ваш часовой пояс установлен на ${utcTimezone}.`);
          await bot.sendMessage(chatId, 'Главное меню:', generateMainMenu(user ? user.subscribed : false));

          // Очищаем состояние
          delete userStates[chatId];

        } catch (error) {
          console.error('Ошибка при установке часового пояса:', error);
          await bot.answerCallbackQuery(query.id, {
            text: 'Произошла ошибка при установке часового пояса.',
          });
        }
      } else {
        await bot.answerCallbackQuery(query.id, { text: 'Неверный часовой пояс.' });
      }
    } else if (data === 'input_timezone') {
      await bot.editMessageText(
        'Введите ваш часовой пояс в формате UTC+X или UTC-X.\nПример: UTC+3',
        {
          chat_id: chatId,
          message_id: query.message.message_id,
        }
      );
      userStates[chatId] = { module: 'setTimezone', step: 'input_manual' };
    } else if (data === 'back_to_timezone_options') {
      await bot.editMessageText(
        'Пожалуйста, выберите ваш часовой пояс из списка ниже или введите свой вручную.\nПример: UTC+3',
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Выбрать из списка', callback_data: 'choose_timezone' }],
              [{ text: 'Ввести свой', callback_data: 'input_timezone' }],
            ],
          },
        }
      );
      delete userStates[chatId];
    }
  },

  // Обработка ручного ввода часового пояса
  handleManualTimezoneInput: async (bot, msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (/^UTC[+-]\d{1,2}$/.test(text)) {
      const timezoneOffset = parseInt(text.replace('UTC', ''), 10);
      const etcTimezone = `Etc/GMT${timezoneOffset >= 0 ? '-' : '+'}${Math.abs(timezoneOffset)}`;

      if (moment.tz.zone(etcTimezone)) {
        try {
          await User.updateOne(
            { chatId: chatId },
            { $set: { timezone: etcTimezone } },
            { upsert: true }
          );
          await bot.sendMessage(chatId, `✅ Ваш часовой пояс установлен на ${text}.`);

          // Отправляем главное меню
          const user = await User.findOne({ chatId });
          await bot.sendMessage(chatId, 'Главное меню:', generateMainMenu(user ? user.subscribed : false));

          // Очищаем состояние
          delete userStates[chatId];

        } catch (error) {
          console.error('Ошибка при сохранении часового пояса:', error);
          await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
        }
      } else {
        await bot.sendMessage(chatId, 'Неверный часовой пояс. Введите в формате UTC+X.');
      }
    } else {
      await bot.sendMessage(chatId, 'Неверный формат. Введите в формате UTC+X.');
    }
  },
};
