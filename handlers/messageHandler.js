// messageHandler.js (полностью обновленный)
const User = require('../models/user');
const userStates = require('../states');
const { generateMainMenu, generateDataMenu, generateMedicationsMenu } = require('../commands/mainMenu');
const { adminChatIds } = require('../config');

module.exports = async (bot, msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Если это команда, не обрабатываем ее здесь
  if (text && text.startsWith('/')) return;

  if (!userStates[chatId]) return;

  const userState = userStates[chatId];
  let user = await User.findOne({ chatId });

  if (userState && userState.step === 'start_data_entry') {
    if (text === 'Да') {
      userStates[chatId].step = 'gender';
      return bot.sendMessage(chatId, 'Выберите ваш пол:', {
        reply_markup: {
          keyboard: [['Мужской', 'Женский'], ['Назад']],
          one_time_keyboard: true,
          resize_keyboard: true,
        },
      });
    } else if (text === 'Нет') {
      delete userStates[chatId];
      const user = await User.findOne({ chatId });
      return bot.sendMessage(
        chatId,
        'Хорошо! Вы сможете ввести свои данные позже в разделе "Работа с личными данными".',
        generateMainMenu(user ? user.subscribed : false)
      );
    } else {
      return bot.sendMessage(chatId, 'Пожалуйста, выберите "Да" или "Нет".', {
        reply_markup: {
          keyboard: [['Да', 'Нет']],
          one_time_keyboard: true,
          resize_keyboard: true,
        },
      });
    }
  }

  switch (userState.step) {
    case 'gender':
      if (text === 'Назад') {
        delete userStates[chatId];
        return bot.sendMessage(chatId, 'Вы вернулись в меню работы с личными данными.', generateDataMenu());
      }
      if (text !== 'Мужской' && text !== 'Женский') {
        return bot.sendMessage(
          chatId,
          'Пожалуйста, выберите пол с помощью кнопок или нажмите "Назад" для возврата в меню.',
          {
            reply_markup: {
              keyboard: [['Мужской', 'Женский'], ['Назад']],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          },
        );
      }
      user.gender = text;
      await user.save();
      userState.step = 'weight';
      bot.sendMessage(chatId, 'Введите ваш вес в килограммах:', {
        reply_markup: {
          keyboard: [['Назад']],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      break;

    case 'weight':
      if (text === 'Назад') {
        userState.step = 'gender';
        return bot.sendMessage(chatId, 'Вы вернулись на шаг назад. Выберите ваш пол:', {
          reply_markup: {
            keyboard: [['Мужской', 'Женский'], ['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
      }
      const weight = parseFloat(text);
      if (isNaN(weight) || weight < 30 || weight > 300) {
        return bot.sendMessage(
          chatId,
          'Пожалуйста, введите корректный вес в диапазоне от 30 до 300 кг или нажмите "Назад".',
          {
            reply_markup: {
              keyboard: [['Назад']],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          },
        );
      }

      user.weights.push({ date: new Date(), weight });
      await user.save();
      userState.step = 'goal';
      bot.sendMessage(chatId, 'Введите вес которого хотите достичь (в кг):', {
        reply_markup: {
          keyboard: [['Назад']],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      break;

    case 'goal':
      if (text === 'Назад') {
        userState.step = 'weight';
        return bot.sendMessage(chatId, 'Вы вернулись на шаг назад. Введите ваш вес в килограммах:', {
          reply_markup: {
            keyboard: [['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
      }
      const goalWeight = parseFloat(text);
      if (isNaN(goalWeight) || goalWeight < 30 || goalWeight > 300) {
        return bot.sendMessage(
          chatId,
          'Пожалуйста, введите корректное значение целевого веса в диапазоне от 30 до 300 кг или нажмите "Назад".',
          {
            reply_markup: {
              keyboard: [['Назад']],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          },
        );
      }
      user.goal = goalWeight;
      await user.save();
      userState.step = 'height';
      bot.sendMessage(chatId, 'Введите ваш рост в сантиметрах:', {
        reply_markup: {
          keyboard: [['Назад']],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      break;

    case 'height':
      if (text === 'Назад') {
        userState.step = 'weight';
        return bot.sendMessage(chatId, 'Вы вернулись на шаг назад. Введите ваш вес в килограммах:', {
          reply_markup: {
            keyboard: [['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
      }
      const height = parseFloat(text);
      if (isNaN(height) || height < 100 || height > 250) {
        return bot.sendMessage(
          chatId,
          'Пожалуйста, введите корректный рост в диапазоне от 100 до 250 см или нажмите "Назад".',
          {
            reply_markup: {
              keyboard: [['Назад']],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          },
        );
      }
      user.height = height;
      await user.save();
      userState.step = 'age';
      bot.sendMessage(chatId, 'Введите ваш возраст:', {
        reply_markup: {
          keyboard: [['Назад']],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      break;

    case 'age':
      if (text === 'Назад') {
        userState.step = 'height';
        return bot.sendMessage(chatId, 'Вы вернулись на шаг назад. Введите ваш рост в сантиметрах:', {
          reply_markup: {
            keyboard: [['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
      }
      const age = parseInt(text);
      if (isNaN(age) || age < 10 || age > 120) {
        return bot.sendMessage(
          chatId,
          'Пожалуйста, введите корректный возраст в диапазоне от 10 до 120 лет или нажмите "Назад".',
          {
            reply_markup: {
              keyboard: [['Назад']],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          },
        );
      }
      user.age = age;
      await user.save();
      userState.step = 'activityLevel';
      bot.sendMessage(
        chatId,
        'Выберите новый уровень физической активности:\n\n' +
        'Маленькая - Сидячий образ жизни\n' +
        'Низкая - Легкие упражнения 1-3 раза в неделю\n' +
        'Средняя - Умеренные упражнения 3-5 раз в неделю\n' +
        'Высокая - Интенсивные упражнения 6-7 раз в неделю\n' +
        'Очень высокая - Очень интенсивные упражнения, физическая работа',
        {
          reply_markup: {
            keyboard: [
              ['Маленькая', 'Низкая'],
              ['Средняя', 'Высокая'],
              ['Очень высокая'],
              ['Назад'],
            ],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        },
      );
      break;

    case 'activityLevel':
      if (text === 'Назад') {
        userState.step = 'age';
        return bot.sendMessage(chatId, 'Вы вернулись на шаг назад. Введите ваш возраст:', {
          reply_markup: {
            keyboard: [['Назад']],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
      }
      const validLevels = ['Маленькая', 'Низкая', 'Средняя', 'Высокая', 'Очень высокая'];
      if (!validLevels.includes(text)) {
        return bot.sendMessage(
          chatId,
          'Пожалуйста, выберите уровень активности с помощью кнопок или нажмите "Назад" для возврата в меню.',
          {
            reply_markup: {
              keyboard: [
                ['Маленькая', 'Низкая'],
                ['Средняя', 'Высокая'],
                ['Очень высокая'],
                ['Назад'],
              ],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          },
        );
      }
      user.activityLevel = text;
      await user.save();
      // Добавляем шаг для выбора часового пояса
      userState.step = 'timezone';
      bot.sendMessage(chatId, 'Укажите ваш часовой пояс. Например, UTC+3 или выберите из списка.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Выбрать из списка', callback_data: 'choose_timezone' }],
            [{ text: 'Ввести вручную', callback_data: 'input_timezone' }]
          ]
        }
      });
      break;
    case 'timezone':
      if (text.startsWith('UTC')) {
        const timezoneOffset = parseInt(text.replace('UTC', ''), 10);
        const etcTimezone = `Etc/GMT${timezoneOffset >= 0 ? '-' : '+'}${Math.abs(timezoneOffset)}`;

        if (moment.tz.zone(etcTimezone)) {
          user.timezone = etcTimezone;
          await user.save();
          delete userStates[chatId];
          return bot.sendMessage(chatId, 'Спасибо! Ваш часовой пояс сохранён.', generateDataMenu());
        } else {
          return bot.sendMessage(chatId, 'Неверный формат. Укажите часовой пояс в формате UTC+X.');
        }
      } else {
        return bot.sendMessage(chatId, 'Введите часовой пояс в формате UTC+X.');
      }


    case 'updateChoice':
      if (text === 'Назад') {
        delete userStates[chatId];
        return bot.sendMessage(chatId, 'Вы вернулись в меню работы с личными данными.', generateDataMenu());
      }
      const validChoices = ['Пол', 'Вес', 'Рост', 'Возраст', 'Уровень активности', 'Цель веса'];
      if (!validChoices.includes(text)) {
        return bot.sendMessage(
          chatId,
          'Пожалуйста, выберите параметр из предложенных или нажмите "Назад" для возврата в меню.',
          {
            reply_markup: {
              keyboard: [['Пол', 'Вес'], ['Рост', 'Возраст'], ['Уровень активности', 'Цель веса'], ['Назад']],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          },
        );
      }
      userState.updateField = text.toLowerCase();
      userState.step = 'updateValue';

      // Если пользователь выбирает "Пол" или "Уровень активности", показываем клавиатуру
      if (userState.updateField === 'пол') {
        bot.sendMessage(chatId, 'Выберите новый пол:', {
          reply_markup: {
            keyboard: [['Мужской', 'Женский'], ['Назад']],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });
      } else if (userState.updateField === 'уровень активности') {
        bot.sendMessage(
          chatId,
          'Выберите новый уровень физической активности:\n\n' +
          'Маленькая - Сидячий образ жизни\n' +
          'Низкая - Легкие упражнения 1-3 раза в неделю\n' +
          'Средняя - Умеренные упражнения 3-5 раз в неделю\n' +
          'Высокая - Интенсивные упражнения 6-7 раз в неделю\n' +
          'Очень высокая - Очень интенсивные упражнения, физическая работа',
          {
            reply_markup: {
              keyboard: [
                ['Маленькая', 'Низкая'],
                ['Средняя', 'Высокая'],
                ['Очень высокая'],
                ['Назад'],
              ],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          },
        );
      } else {
        bot.sendMessage(chatId, `Введите новое значение для "${text}":`, {
          reply_markup: {
            keyboard: [['Назад']],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });
      }
      break;

    case 'updateValue':
      if (text === 'Назад') {
        userState.step = 'updateChoice';
        return bot.sendMessage(chatId, 'Выберите параметр для изменения:', {
          reply_markup: {
            keyboard: [['Пол', 'Вес'], ['Рост', 'Возраст'], ['Уровень активности'], ['Назад']],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });
      }
      let newValue = text;
      switch (userState.updateField) {
        case 'пол':
          if (newValue !== 'Мужской' && newValue !== 'Женский') {
            return bot.sendMessage(
              chatId,
              'Пожалуйста, выберите пол с помощью кнопок или нажмите "Назад" для возврата в меню.',
              {
                reply_markup: {
                  keyboard: [['Мужской', 'Женский'], ['Назад']],
                  one_time_keyboard: true,
                  resize_keyboard: true,
                },
              },
            );
          }
          user.gender = newValue;
          break;
        case 'вес':
          newValue = parseFloat(newValue);
          if (isNaN(newValue) || newValue < 30 || newValue > 300) {
            return bot.sendMessage(
              chatId,
              'Пожалуйста, введите корректный вес в диапазоне от 30 до 300 кг или нажмите "Назад" для возврата в меню.',
              {
                reply_markup: {
                  keyboard: [['Назад']],
                  one_time_keyboard: true,
                  resize_keyboard: true,
                },
              },
            );
          }
          // Добавляем новую запись в массив weights
          user.weights.push({ date: new Date(), weight: newValue });
          break;
        case 'рост':
          newValue = parseFloat(newValue);
          if (isNaN(newValue) || newValue < 100 || newValue > 250) {
            return bot.sendMessage(
              chatId,
              'Пожалуйста, введите корректный рост в диапазоне от 100 до 250 см или нажмите "Назад" для возврата в меню.',
              {
                reply_markup: {
                  keyboard: [['Назад']],
                  one_time_keyboard: true,
                  resize_keyboard: true,
                },
              },
            );
          }
          user.height = newValue;
          break;
        case 'возраст':
          newValue = parseInt(newValue);
          if (isNaN(newValue) || newValue < 10 || newValue > 120) {
            return bot.sendMessage(
              chatId,
              'Пожалуйста, введите корректный возраст в диапазоне от 10 до 120 лет или нажмите "Назад" для возврата в меню.',
              {
                reply_markup: {
                  keyboard: [['Назад']],
                  one_time_keyboard: true,
                  resize_keyboard: true,
                },
              },
            );
          }
          user.age = newValue;
          break;
        case 'уровень активности':
          const validLevelsUpdate = ['Маленькая', 'Низкая', 'Средняя', 'Высокая', 'Очень высокая'];
          if (!validLevelsUpdate.includes(newValue)) {
            return bot.sendMessage(
              chatId,
              'Пожалуйста, выберите уровень активности с помощью кнопок или нажмите "Назад" для возврата в меню.',
              {
                reply_markup: {
                  keyboard: [
                    ['Маленькая', 'Низкая'],
                    ['Средняя', 'Высокая'],
                    ['Очень высокая'],
                    ['Назад'],
                  ],
                  one_time_keyboard: true,
                  resize_keyboard: true,
                },
              },
            );
          }
          user.activityLevel = newValue;
          break;
        case 'цель веса':
          newValue = parseFloat(newValue);
          if (isNaN(newValue) || newValue < 30 || newValue > 300) {
            return bot.sendMessage(
              chatId,
              'Пожалуйста, введите корректное значение цели веса в диапазоне от 30 до 300 кг или нажмите "Назад".',
              {
                reply_markup: {
                  keyboard: [['Назад']],
                  resize_keyboard: true,
                  one_time_keyboard: true,
                },
              },
            );
          }
          user.goal = newValue;
          break;
        default:
          return bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.', generateDataMenu());
      }

      await user.save();
      delete userStates[chatId];
      bot.sendMessage(chatId, 'Ваши данные успешно обновлены.', generateDataMenu());
      break;

    case 'mailing':
      if (text === 'Отмена') {
        delete userStates[chatId];
        return bot.sendMessage(chatId, 'Рассылка отменена.', generateMainMenu(user.subscribed));
      }
      // Проверяем, что отправитель является админом
      if (!adminChatIds.includes(chatId)) {
        delete userStates[chatId];
        return bot.sendMessage(chatId, 'У вас нет прав для выполнения этой операции.', generateMainMenu(user.subscribed));
      }

      // Получаем сообщение, которое нужно разослать
      const message = msg;

      // Удаляем состояние после получения сообщения
      delete userStates[chatId];

      // Получаем всех пользователей с подпиской
      const users = await User.find({ subscribed: true });

      let successCount = 0;
      let failureCount = 0;

      // Функция для копирования сообщения пользователю
      const copyMessageToUser = async (user) => {
        try {
          await bot.copyMessage(user.chatId, message.chat.id, message.message_id, {
            // Можно добавить дополнительные опции, если необходимо
            // Например, parse_mode: 'HTML'
          });
          successCount++;
        } catch (error) {
          console.error(`Не удалось отправить сообщение пользователю ${user.chatId}:`, error);
          failureCount++;
        }
      };

      // Отправляем сообщение всем пользователям с задержкой для соблюдения лимитов Telegram
      for (const user of users) {
        // Не отправляем сообщение админам
        if (adminChatIds.includes(user.chatId)) continue;
        await copyMessageToUser(user);
        // Задержка 0.5 секунды между сообщениями для соблюдения лимитов Telegram
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      bot.sendMessage(
        chatId,
        `Рассылка завершена.\nУспешно отправлено: ${successCount}\nНе удалось отправить: ${failureCount}`,
        generateMainMenu(user.subscribed)
      );
      break;

    case 'weight_update':
      if (text === 'Да') {
        // Запрашиваем ввод веса
        await bot.sendMessage(chatId, 'Пожалуйста, введите ваш текущий вес (в кг):', {
          reply_markup: {
            remove_keyboard: true,
          },
        });
        // Обновляем состояние
        userState.step = 'awaiting_new_weight';
        await user.save();
      } else if (text === 'Нет') {
        // Показываем меню медикаментов
        await bot.sendMessage(chatId, 'Выберите категорию медикаментов:', generateMedicationsMenu());
        // Обновляем состояние
        userState.module = 'medications';
        userState.step = null;
        await user.save();
      } else {
        // Неизвестный ответ, повторяем вопрос
        await bot.sendMessage(chatId, 'Пожалуйста, выберите "Да" или "Нет".', {
          reply_markup: {
            keyboard: [['Да', 'Нет']],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });
      }
      break;

    case 'awaiting_new_weight':
      if (text === 'Назад') {
        // Возврат к предыдущему шагу
        userState.step = 'weight_update';
        await bot.sendMessage(chatId, 'Хотите ли вы изменить свой вес?', {
          reply_markup: {
            keyboard: [['Да', 'Нет']],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });
        await user.save();
        break;
      }

      let newWeight = parseFloat(text);
      if (isNaN(newWeight) || newWeight < 30 || newWeight > 300) {
        return bot.sendMessage(
          chatId,
          'Пожалуйста, введите корректный вес в диапазоне от 30 до 300 кг или нажмите "Назад".',
          {
            reply_markup: {
              keyboard: [['Назад']],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          },
        );
      }

      // Сохраняем временный вес в состоянии
      userState.tempWeight = newWeight;

      // Запрашиваем, хочет ли пользователь оставить заметку о дозировке
      await bot.sendMessage(chatId, 'Хотите ли вы оставить заметку о дозировке?', {
        reply_markup: {
          keyboard: [['Да', 'Нет']],
          one_time_keyboard: true,
          resize_keyboard: true,
        },
      });

      // Обновляем состояние для ожидания ответа на запрос заметки
      userState.step = 'awaiting_weight_note';
      await user.save();
      break;

    case 'awaiting_weight_note':
      if (text === 'Назад') {
        // Возврат к меню медикаментов
        userState.step = 'weight_update';
        userState.module = 'medications';
        await bot.sendMessage(chatId, 'Выберите категорию медикаментов:', generateMedicationsMenu());
        // Очищаем временные данные
        userState.tempWeight = null;
        await user.save();
        break;
      }

      if (text === 'Да') {
        // Запрашиваем ввод заметки с примерами
        await bot.sendMessage(chatId, 'Пожалуйста, введите заметку о дозировке (до 5 символов, например "5mg", "15mg" или "20мг"):', {
          reply_markup: {
            keyboard: [['Отмена']],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });
        // Обновляем состояние для ожидания ввода заметки
        userState.step = 'awaiting_note_input';
        await user.save();
        break;
      } else if (text === 'Нет') {
        // Сохраняем данные в базе без заметки
        try {
          const weightEntry = {
            date: new Date(),
            weight: userState.tempWeight,
            note: null,
          };
          user.weights.push(weightEntry);
          await user.save();

          // Подтверждаем пользователю
          await bot.sendMessage(chatId, `Ваш вес успешно обновлён до ${userState.tempWeight} кг.`);

          // Переходим к меню медикаментов
          userState.module = 'medications';
          userState.step = null;
          userState.tempWeight = null;
          await bot.sendMessage(chatId, 'Выберите категорию медикаментов:', generateMedicationsMenu());
          await user.save();
        } catch (error) {
          console.error('Error saving weight without note:', error);
          await bot.sendMessage(chatId, 'Произошла ошибка при обновлении веса. Пожалуйста, попробуйте позже.');
        }
      } else {
        // Неизвестный ответ, повторяем вопрос
        await bot.sendMessage(chatId, 'Пожалуйста, выберите "Да" или "Нет".', {
          reply_markup: {
            keyboard: [['Да', 'Нет']],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });
      }
      break;

    case 'awaiting_note_input':
      if (text === 'Отмена') {
        // Сохраняем данные в базе без заметки
        try {
          const weightEntry = {
            date: new Date(),
            weight: userState.tempWeight,
            note: null,
          };
          user.weights.push(weightEntry);
          await user.save();

          // Подтверждаем пользователю
          await bot.sendMessage(chatId, `Ваш вес успешно обновлён до ${userState.tempWeight} кг.`);

          // Переходим к меню медикаментов
          userState.module = 'medications';
          userState.step = null;
          userState.tempWeight = null;
          await bot.sendMessage(chatId, 'Выберите категорию медикаментов:', generateMedicationsMenu());
          await user.save();
        } catch (error) {
          console.error('Error saving weight after cancelling note:', error);
          await bot.sendMessage(chatId, 'Произошла ошибка при обновлении веса. Пожалуйста, попробуйте позже.');
        }
        break;
      }

      // Проверяем длину заметки
      if (text.length > 5) {
        return bot.sendMessage(
          chatId,
          'Заметка должна содержать не более 5 символов. Попробуйте еще раз или нажмите "Отмена".',
          {
            reply_markup: {
              keyboard: [['Отмена']],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          },
        );
      }

      // Опционально: Дополнительная валидация формата заметки (например, дозировка)
      const doseRegex = /^\d+mg$/i; // Обновим позже для поддержки 'мг'

      // Обновим регулярное выражение для поддержки 'mg' и 'мг'
      const doseRegexUpdated = /^\d+(?:mg|мг)$/i;

      if (!doseRegexUpdated.test(text)) {
        return bot.sendMessage(
          chatId,
          'Заметка должна соответствовать формату дозировки, например "5mg", "15mg" или "20мг". Попробуйте еще раз или нажмите "Отмена".',
          {
            reply_markup: {
              keyboard: [['Отмена']],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          },
        );
      }

      // Сохраняем данные в базе с заметкой
      try {
        const weightEntry = {
          date: new Date(),
          weight: userState.tempWeight,
          note: text,
        };
        user.weights.push(weightEntry);
        await user.save();

        // Подтверждаем сохранение заметки
        await bot.sendMessage(chatId, `Заметка "${text}" успешно добавлена к вашему новому весу ${userState.tempWeight} кг.`);

        // Переходим к меню медикаментов
        userState.module = 'medications';
        userState.step = null;
        userState.tempWeight = null;
        await bot.sendMessage(chatId, 'Выберите категорию медикаментов:', generateMedicationsMenu());
        await user.save();
      } catch (error) {
        console.error('Error saving weight with note:', error);
        await bot.sendMessage(chatId, 'Произошла ошибка при обновлении веса. Пожалуйста, попробуйте позже.');
      }
      break;

  }
};

