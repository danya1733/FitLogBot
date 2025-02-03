// scheduler.js
const cron = require('node-cron');
const moment = require('moment-timezone');
const mongoose = require('mongoose');
const User = require('./models/user');
const userStates = require('./states');
const { generateMedicationsMenu } = require('./commands/mainMenu');

/**
 * Функция для отправки комбинированного напоминания о приёме лекарств
 * и сохранения его в базе данных.
 * При наличии активного напоминания удаляет старое сообщение и отправляет новое с накопленными дозами.
 */
async function sendCombinedMedicationReminder(bot, chatId, newDueDoses) {
  if (newDueDoses.length === 0) return;

  try {
    // Получаем пользователя с его pendingReminders
    const user = await User.findOne({ chatId }).exec();
    if (!user) {
      console.error(`Пользователь с chatId ${chatId} не найден.`);
      return;
    }

    // Собираем все существующие дозы из pendingReminders
    let accumulatedDoses = [];
    if (user.pendingReminders.length > 0) {
      user.pendingReminders.forEach(reminder => {
        accumulatedDoses.push(...reminder.data);
      });
    }

    // Добавляем новые дозы, избегая дубликатов
    newDueDoses.forEach(newDose => {
      const exists = accumulatedDoses.some(dose =>
        dose.medicationType === newDose.medicationType &&
        dose.medicationIndex === newDose.medicationIndex &&
        dose.doseNumber === newDose.doseNumber
      );
      if (!exists) {
        accumulatedDoses.push({
          ...newDose,
          status: 'Не выбрано',
        });
      }
    });

    // Если есть активные напоминания, удаляем старые сообщения
    if (user.pendingReminders.length > 0) {
      for (const reminder of user.pendingReminders) {
        try {
          await bot.deleteMessage(chatId, reminder.messageId.toString());
          console.log(`Старое напоминание удалено для пользователя ${chatId}, messageId: ${reminder.messageId}`);
        } catch (err) {
          console.error(`Ошибка при удалении сообщения ${reminder.messageId} для пользователя ${chatId}:`, err);
        }
      }
      // Очищаем pendingReminders
      user.pendingReminders = [];
    }

    // Формируем новое сообщение
    let message = `🕒 Напоминание о приёме лекарств:\n\n`;
    const inlineKeyboard = [];

    accumulatedDoses.forEach((dose, index) => {
      const { medicationType, medicationIndex, doseNumber, medicationName, status } = dose;
      message += `*${index + 1}. Доза ${doseNumber}:* ${medicationName} — *${status}*\n`;

      inlineKeyboard.push([
        {
          text: `✅ Принял${status === 'Принят' ? ' ✅' : ''}`,
          callback_data: `status_${medicationType}_${medicationIndex}_${doseNumber}_taken`,
        },
        {
          text: `⏰ Отложить на 3 часа${status === 'Отложен' ? ' ✅' : ''}`,
          callback_data: `status_${medicationType}_${medicationIndex}_${doseNumber}_delay`,
        },
      ]);
    });

    // Кнопка подтверждения
    inlineKeyboard.push([
      {
        text: '✅ Подтвердить изменения',
        callback_data: `confirm_changes`,
      },
    ]);

    const options = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    };

    // Отправляем новое сообщение
    const sentMessage = await bot.sendMessage(chatId, message, options);
    console.log(`Напоминание отправлено пользователю ${chatId}, messageId: ${sentMessage.message_id}`);

    // Сохраняем новое напоминание в базе данных
    const reminderData = accumulatedDoses.map(dose => ({
      medicationType: dose.medicationType,
      medicationIndex: dose.medicationIndex,
      doseNumber: dose.doseNumber,
      medicationName: dose.medicationName,
      status: dose.status,
    }));

    user.pendingReminders.push({
      messageId: sentMessage.message_id,
      data: reminderData,
    });

    await user.save();
    console.log(`Напоминание сохранено в БД для пользователя ${chatId}`);
  } catch (err) {
    console.error('Ошибка при отправке или сохранении комбинированного напоминания:', err);
  }
}

/**
 * Функция для обработки изменения статуса дозы.
 * Теперь она только применяет изменения без отправки сообщений.
 */
async function processDoseStatusChange(user, medicationType, medicationIndex, doseNumber, status, bot, chatId) {
  const medication = user.medications[medicationType]?.[medicationIndex];
  if (!medication) {
    console.error(`Тип медикамента ${medicationType} с индексом ${medicationIndex} не найден для chatId ${chatId}.`);
    return;
  }

  const dose = medication.doses.find(d => d.doseNumber === doseNumber);
  if (!dose) {
    console.error(`Номер дозы ${doseNumber} не найден для типа медикамента ${medicationType} с индексом ${medicationIndex}.`);
    return;
  }

  console.log(`До изменения: dose.taken = ${dose.taken}, dose.status = ${dose.status}`);

  if (status === 'Принят') {
    if (dose.taken) {
      console.log(`Доза ${doseNumber} уже отмечена как принята.`);
      return;
    }

    // Отметить дозу как принятую
    dose.taken = true;
    dose.takenAt = new Date();
    dose.status = 'Принят'; // Устанавливаем статус

    if (medicationType === 'flacons' || medicationType === 'tablets') {
      // Уменьшить количество на 1
      medication.quantity -= 1;

      if (medication.quantity <= 0) {
        // Удалить медикамент из списка
        user.medications[medicationType].splice(medicationIndex, 1);
        console.log(`Медикамент ${medication.name} удален из списка для chatId ${chatId} из-за нулевого количества.`);
      } else {
        // Определяем общее количество доз для отображения
        const takenDoses = medication.doses.filter(d => d.taken).length;
        const totalDoses = takenDoses + medication.quantity;

        console.log(`Доза ${doseNumber} типа ${medicationType} с индексом ${medicationIndex} отмечена как принята для chatId ${chatId}. Осталось: ${medication.quantity} доз.`);
      }
    } else if (medicationType === 'syringes') {
      // Проверить, все ли дозы приняты
      const allDosesTaken = medication.doses.every(d => d.taken);

      if (allDosesTaken) {
        // Уменьшить количество на 1
        medication.quantity -= 1;

        if (medication.quantity > 0) {
          // Сбросить все дозы
          medication.doses.forEach(d => {
            d.taken = false;
            d.takenAt = null;
            d.status = 'Не выбрано'; // Сбросить статус
          });

          // Обновить расписание на основе типа расписания
          let lastDoseDate = moment().tz(user.timezone || 'Etc/GMT-4');
          const scheduleType = medication.schedule.type;
          if (scheduleType === 'daily') {
            lastDoseDate.add(1, 'day');
          } else if (scheduleType === 'weekly') {
            lastDoseDate.add(1, 'week');
          } else if (scheduleType === 'monthly') {
            lastDoseDate.add(1, 'month');
          }

          // Обновить startDate в расписании
          medication.schedule.details.startDate = lastDoseDate.toDate();

          // Генерация новых доз
          const dosesPerPen = medication.dosesPerPen || medication.doses.length;
          const newDoses = [];
          let currentDate = lastDoseDate.clone();

          for (let i = 0; i < dosesPerPen; i++) {
            newDoses.push({
              doseNumber: i + 1,
              taken: false,
              takenAt: null,
              scheduledAt: currentDate.toDate(),
              status: 'Не выбрано', // Инициализация статуса
            });

            // Обновить дату следующей дозы
            if (scheduleType === 'daily') {
              currentDate.add(1, 'day');
            } else if (scheduleType === 'weekly') {
              currentDate.add(1, 'week');
            } else if (scheduleType === 'monthly') {
              currentDate.add(1, 'month');
            }
          }

          medication.doses = newDoses;

          console.log(`Шприц с индексом ${medicationIndex} сброшен и расписание обновлено для chatId ${chatId}. Осталось: ${medication.quantity} шприцов.`);
        } else {
          // Удалить медикамент из списка
          user.medications.syringes.splice(medicationIndex, 1);
          console.log(`Шприц с индексом ${medicationIndex} удален из списка для chatId ${chatId} из-за нулевого количества.`);
        }
      }
    } else {
      console.error(`Неизвестный тип медикамента: ${medicationType}`);
    }

  } else if (status === 'Отложен') {
    const newScheduledAt = moment().add(3, 'hours').toDate();
    dose.scheduledAt = newScheduledAt;
    dose.status = 'Отложен'; // Устанавливаем статус
    console.log(`Доза ${doseNumber} типа ${medicationType} с индексом ${medicationIndex} отложена для chatId ${chatId}`);
  } else {
    console.error(`Неизвестный статус: ${status}`);
  }

  console.log(`После изменения: dose.taken = ${dose.taken}, dose.status = ${dose.status}`);

  // Указываем Mongoose, что путь изменён
  user.markModified(`medications.${medicationType}.${medicationIndex}.doses`);
}

/**
 * Функция для обработки изменения статуса дозы и отправки одного информативного сообщения.
 */
async function applyPendingChanges(user, bot, chatId) {
  const changes = [];

  for (const reminder of user.pendingReminders) {
    for (const dose of reminder.data) {
      if (dose.status !== 'Не выбрано') {
        changes.push(dose);
        await processDoseStatusChange(user, dose.medicationType, dose.medicationIndex, dose.doseNumber, dose.status, bot, chatId);
      }
    }
  }

  await user.save();

  // Формируем итоговое сообщение
  let summaryMessage = `✅ *Изменения приняты:*\n\n`;

  changes.forEach(dose => {
    const { medicationType, medicationName, doseNumber, status } = dose;

    if (medicationType === 'syringes') {
      const syringe = user.medications.syringes.find((med, index) => index === dose.medicationIndex);
      const remainingDoses = syringe ? syringe.doses.filter(d => !d.taken).length : 0;
      const totalDoses = syringe ? syringe.doses.length : 0;
      summaryMessage += `*Доза ${doseNumber}* шприца *${medicationName}* ${status === 'Принят' ? 'принята' : 'отложена'}. Осталось: *${remainingDoses}/${totalDoses}* доз.\n`;
    } else {
      const medication = user.medications[medicationType].find((med, index) => index === dose.medicationIndex);
      const remainingDoses = medication ? medication.quantity : 0;
      const takenDoses = medication ? medication.doses.filter(d => d.taken).length : 0;
      const totalDoses = takenDoses + remainingDoses;
      summaryMessage += `*Доза ${doseNumber}* лекарства *${medicationName}* ${status === 'Принят' ? 'принята' : 'отложена'}. Осталось: *${remainingDoses}* доз из *${totalDoses}*.\n`;
    }
  });

  await bot.sendMessage(chatId, summaryMessage, { parse_mode: 'Markdown' });
}

/**
 * Функция для проверки и отправки напоминаний.
 */
async function checkAndSendReminders(bot) {
  const now = moment.utc();

  try {
    // Поиск всех подписанных пользователей
    const users = await User.find({ subscribed: true }).exec();

    for (const user of users) {
      const { chatId, medications, timezone } = user;
      const userTimezone = timezone || 'Etc/GMT-4';
      const userNow = now.clone().tz(userTimezone);

      const dueDoses = [];

      // Функция для обработки категорий медикаментов
      const processMedications = (medicationType) => {
        if (medications && medications[medicationType]) {
          medications[medicationType].forEach((medication, medicationIndex) => {
            if (medication.doses) {
              medication.doses.forEach((dose) => {
                if (!dose.taken && dose.scheduledAt) {
                  const doseTime = moment(dose.scheduledAt).tz(userTimezone);
                  if (doseTime.isSame(userNow, 'minute')) {
                    dueDoses.push({
                      medicationType,
                      medicationIndex,
                      doseNumber: dose.doseNumber,
                      medicationName: medication.name,
                    });
                  }
                }
              });
            }
          });
        }
      };

      // Обработка шприцов, флаконов и таблеток
      processMedications('syringes');
      processMedications('flacons');
      processMedications('tablets');

      if (dueDoses.length > 0) {
        console.log(`Отправка напоминания пользователю ${chatId} по дозам:`, dueDoses);
        await sendCombinedMedicationReminder(bot, chatId, dueDoses);
      }
    }
  } catch (error) {
    console.error('Ошибка в checkAndSendReminders:', error);
  }
}

/**
 * Функция для запуска планировщика.
 */
function startScheduler(bot) {
  // Запуск задачи каждую минуту
  cron.schedule('* * * * *', () => {
    console.log('Scheduler: Проверка напоминаний в', new Date());
    checkAndSendReminders(bot).catch((err) => console.error('Scheduler Error:', err));
  });

  console.log('Scheduler: Запущен');
}

/**
 * Функция для обработки индивидуальных действий доз.
 */
async function handleDoseAction(bot, query) {
  const chatId = query.message.chat.id;
  const data = query.data;

  const [action, medicationType, medicationIndex, doseNumber] = data.split('_');

  if (!action || !medicationType || medicationIndex === undefined || doseNumber === undefined) {
    console.error('Неверный формат callback_data:', data);
    bot.answerCallbackQuery(query.id, { text: 'Неверные данные.' });
    return;
  }

  const statusAction = action === 'taken' ? 'Принят' : action === 'delay' ? 'Отложен' : null;

  if (statusAction) {
    try {
      console.log(`Обработка действия ${statusAction} для дозы ${doseNumber} типа ${medicationType} [Index: ${medicationIndex}] для chatId ${chatId}`);
      const user = await User.findOne({ chatId }).exec();
      if (!user) {
        console.error(`Пользователь с chatId ${chatId} не найден.`);
        bot.answerCallbackQuery(query.id, { text: 'Пользователь не найден.' });
        return;
      }

      // Найти соответствующую дозу в pendingReminders
      let doseFound = false;
      for (const reminder of user.pendingReminders) {
        const dose = reminder.data.find(d =>
          d.medicationType === medicationType &&
          d.medicationIndex === parseInt(medicationIndex, 10) &&
          d.doseNumber === parseInt(doseNumber, 10)
        );
        if (dose) {
          if (dose.status !== 'Не выбрано') {
            // Уже было изменено
            bot.answerCallbackQuery(query.id, { text: `Доза уже отмечена как ${dose.status}.` });
            return;
          }
          dose.status = statusAction;
          doseFound = true;
          break;
        }
      }

      if (!doseFound) {
        console.error(`Доза не найдена в pendingReminders для chatId ${chatId}, doseNumber ${doseNumber}.`);
        bot.answerCallbackQuery(query.id, { text: 'Доза не найдена или уже обработана.' });
        return;
      }

      await user.save();
      console.log(`Сохранение пользователя ${chatId} после изменения статуса дозы.`);

      bot.answerCallbackQuery(query.id, { text: `Доза отмечена как ${statusAction === 'Принят' ? 'принята' : 'отложена'}.` });

      // Обновляем сообщение с текущими статусами
      const reminder = user.pendingReminders.find(rem => rem.data.some(d =>
        d.medicationType === medicationType &&
        d.medicationIndex === parseInt(medicationIndex, 10) &&
        d.doseNumber === parseInt(doseNumber, 10)
      ));

      if (reminder) {
        const messageId = reminder.messageId;

        // Формируем обновлённое сообщение
        let updatedMessage = `🕒 Напоминание о приёме лекарств:\n\n`;
        const inlineKeyboard = [];

        reminder.data.forEach((dose, index) => {
          const { medicationType, medicationIndex, doseNumber, medicationName, status } = dose;
          updatedMessage += `*${index + 1}. Доза ${doseNumber}:* ${medicationName} — *${status}*\n`;

          inlineKeyboard.push([
            {
              text: `✅ Принял${status === 'Принят' ? ' ✅' : ''}`,
              callback_data: `status_${medicationType}_${medicationIndex}_${doseNumber}_taken`,
            },
            {
              text: `⏰ Отложить на 3 часа${status === 'Отложен' ? ' ✅' : ''}`,
              callback_data: `status_${medicationType}_${medicationIndex}_${doseNumber}_delay`,
            },
          ]);
        });

        // Кнопка подтверждения
        inlineKeyboard.push([
          {
            text: '✅ Подтвердить изменения',
            callback_data: `confirm_changes`,
          },
        ]);

        const options = {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          },
        };

        try {
          await bot.editMessageText(updatedMessage, {
            chat_id: chatId,
            message_id: messageId,
            ...options,
          });
          console.log(`Напоминание обновлено для пользователя ${chatId}, messageId: ${messageId}`);
        } catch (err) {
          if (err.response && err.response.description === 'message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message') {
            console.log('Сообщение не изменилось, пропускаем редактирование.');
          } else {
            console.error('Ошибка при редактировании сообщения:', err);
          }
        }
      }

    } catch (error) {
      console.error('Ошибка при обработке действия дозы:', error);
      bot.answerCallbackQuery(query.id, { text: 'Ошибка при обработке действия.' });
    }
    return;
  }

  // Неизвестное действие
  console.error('Неизвестное действие:', action);
  bot.answerCallbackQuery(query.id, { text: 'Неверное действие.' });
}

/**
 * Функция для обработки подтверждения изменений.
 */
async function handleCombinedDoseAction(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  try {
    // Получение пользователя из базы данных
    const user = await User.findOne({ chatId }).exec();
    if (!user) {
      console.error(`Пользователь с chatId ${chatId} не найден.`);
      bot.answerCallbackQuery(query.id, { text: 'Пользователь не найден.' });
      return;
    }

    // Поиск напоминания по messageId
    const reminder = user.pendingReminders.find(rem => rem.messageId === messageId);
    if (!reminder) {
      console.error(`Нет pendingReminders для chatId ${chatId} и messageId ${messageId}`);
      bot.answerCallbackQuery(query.id, { text: 'Нет активных напоминаний.' });
      return;
    }

    if (data.startsWith('status_')) {
      // Обработка изменения статуса дозы
      const parts = data.split('_');
      const [statusKeyword, medicationType, medicationIndex, doseNumber, statusActionKey] = parts;

      if (!medicationType || medicationIndex === undefined || doseNumber === undefined || !statusActionKey) {
        console.error('Неверный формат callback_data:', data);
        bot.answerCallbackQuery(query.id, { text: 'Неверные данные.' });
        return;
      }

      const statusAction = statusActionKey === 'taken' ? 'Принят' : statusActionKey === 'delay' ? 'Отложен' : null;

      if (!statusAction) {
        console.error('Неизвестное действие статуса:', statusActionKey);
        bot.answerCallbackQuery(query.id, { text: 'Неверное действие.' });
        return;
      }

      // Поиск соответствующей дозы в данных напоминания
      const dose = reminder.data.find(d =>
        d.medicationType === medicationType &&
        d.medicationIndex.toString() === medicationIndex &&
        d.doseNumber.toString() === doseNumber
      );

      if (!dose) {
        console.error(`Доза не найдена в данных напоминания для ключа: ${medicationType}_${medicationIndex}_${doseNumber}`);
        bot.answerCallbackQuery(query.id, { text: 'Доза не найдена.' });
        return;
      }

      // Обновление статуса дозы в данных напоминания
      dose.status = statusAction;
      console.log(`Статус для ${medicationType}_${medicationIndex}_${doseNumber} обновлен на ${statusAction}`);

      // Сохранение изменений в базе данных
      await user.save();
      console.log(`Сохранение пользователя ${chatId} после обновления статуса дозы в напоминании.`);

      // Обновляем сообщение с текущими статусами
      let updatedMessage = `🕒 Напоминание о приёме лекарств:\n\n`;
      const inlineKeyboard = [];

      reminder.data.forEach((dose, index) => {
        const { medicationType, medicationIndex, doseNumber, medicationName, status } = dose;
        updatedMessage += `*${index + 1}. Доза ${doseNumber}:* ${medicationName} — *${status}*\n`;

        inlineKeyboard.push([
          {
            text: `✅ Принял${status === 'Принят' ? ' ✅' : ''}`,
            callback_data: `status_${medicationType}_${medicationIndex}_${doseNumber}_taken`,
          },
          {
            text: `⏰ Отложить на 3 часа${status === 'Отложен' ? ' ✅' : ''}`,
            callback_data: `status_${medicationType}_${medicationIndex}_${doseNumber}_delay`,
          },
        ]);
      });

      // Кнопка подтверждения
      inlineKeyboard.push([
        {
          text: '✅ Подтвердить изменения',
          callback_data: `confirm_changes`,
        },
      ]);

      const options = {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
      };

      try {
        await bot.editMessageText(updatedMessage, {
          chat_id: chatId,
          message_id: messageId,
          ...options,
        });
        console.log(`Напоминание обновлено для пользователя ${chatId}, messageId: ${messageId}`);
      } catch (err) {
        if (err.response && err.response.description === 'message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message') {
          console.log('Сообщение не изменилось, пропускаем редактирование.');
        } else {
          console.error('Ошибка при редактировании сообщения:', err);
        }
      }

      bot.answerCallbackQuery(query.id, { text: 'Статус обновлен.' });
      return;
    }

    if (data === 'confirm_changes') {
      // Сбор всех изменений
      const changes = reminder.data.filter(dose => dose.status !== 'Не выбрано');

      if (changes.length === 0) {
        bot.answerCallbackQuery(query.id, { text: 'Нет изменений для подтверждения.' });
        return;
      }

      // Применение изменений
      for (const dose of changes) {
        await processDoseStatusChange(
          user,
          dose.medicationType,
          dose.medicationIndex,
          dose.doseNumber,
          dose.status,
          bot,
          chatId
        );
      }

      await user.save();
      console.log(`Изменения применены для пользователя ${chatId}.`);

      // Формируем итоговое сообщение
      let summaryMessage = `✅ *Изменения приняты:*\n\n`;

      changes.forEach(dose => {
        const { medicationType, medicationName, doseNumber, status } = dose;

        if (medicationType === 'syringes') {
          const syringe = user.medications.syringes.find((med, index) => index === dose.medicationIndex);
          const remainingDoses = syringe ? syringe.doses.filter(d => !d.taken).length : 0;
          const totalDoses = syringe ? syringe.doses.length : 0;
          summaryMessage += `*Доза ${doseNumber}* шприца *${medicationName}* ${status === 'Принят' ? 'принята' : 'отложена'}. Осталось: *${remainingDoses}/${totalDoses}* доз.\n`;
        } else {
          const medication = user.medications[medicationType].find((med, index) => index === dose.medicationIndex);
          const remainingDoses = medication ? medication.quantity : 0;
          const takenDoses = medication ? medication.doses.filter(d => d.taken).length : 0;
          const totalDoses = takenDoses + remainingDoses;
          summaryMessage += `*Доза ${doseNumber}* лекарства *${medicationName}* ${status === 'Принят' ? 'принята' : 'отложена'}. Осталось: *${remainingDoses}* доз из *${totalDoses}*.\n`;
        }
      });

      // Отправка итогового сообщения
      await bot.sendMessage(chatId, summaryMessage, { parse_mode: 'Markdown' });

      // Удаление напоминания из pendingReminders
      user.pendingReminders = user.pendingReminders.filter(rem => rem.messageId !== messageId);
      await user.save();
      console.log(`Напоминание messageId: ${messageId} удалено из pendingReminders для пользователя ${chatId}.`);

      // Сброс состояния пользователя, если необходимо
      if (!userStates[chatId]) {
        userStates[chatId] = {};
      }
      userStates[chatId] = {};
      userStates[chatId].step = 'weight_update';

      // Отправка подтверждения и предложения обновить вес
      await bot.sendMessage(chatId, 'Изменения применены. Хотите ли вы изменить свой вес?', {
        reply_markup: {
          keyboard: [
            [{ text: 'Да' }, { text: 'Нет' }],
          ],
          one_time_keyboard: true,
          resize_keyboard: true,
        },
      });

      bot.answerCallbackQuery(query.id, { text: 'Изменения применены.' });
      return;
    }

    // Неизвестное действие
    console.error('Неизвестное действие:', data);
    bot.answerCallbackQuery(query.id, { text: 'Неверное действие.' });
  } catch (error) {
    console.error('Ошибка при обработке комбинированного действия дозы:', error);
    bot.answerCallbackQuery(query.id, { text: 'Ошибка при обработке действия.' });
  }
}

module.exports = {
  startScheduler,
  handleDoseAction,
  handleCombinedDoseAction,
};
