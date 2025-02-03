// medications/syringesHandler.js

const User = require('../models/user');
const userStates = require('../states');
const moment = require('moment-timezone');

const { generateSyringesMenu, generateSyringeActionsMenu, generateDosesMenu } = require('./menus');
const { generateMedicationsMenu, generateMainMenu } = require('../commands/mainMenu');
const { parseTime, parseDate, parseDateTime } = require('./dateUtils');

module.exports.handleMessage = async (bot, msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const user = await User.findOne({ chatId });

    if (!userStates[chatId]) {
        userStates[chatId] = { step: null, module: null };
    }

    const state = userStates[chatId];
    const userTimezone = user.timezone || 'Etc/GMT-3'
    if (text === 'Шприц-ручки') {
        state.module = 'syringes';
        state.step = null;

        // Отправляем сначала сообщение "Выберите действие"
        bot.sendMessage(chatId, 'Выберите действие:', {
            reply_markup: {
                keyboard: [
                    ['Добавить шприц-ручку'],
                    ['Назад'],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
            },
        });

        // Затем отправляем список шприц-ручек
        const syringesMenu = await generateSyringesMenu(user);
        bot.sendMessage(chatId, syringesMenu.text, syringesMenu.options);
    } else if (state.module === 'syringes') {
        if (text === 'Добавить шприц-ручку') {
            state.step = 'add_syringe_name';
            bot.sendMessage(chatId, 'Выберите название шприц-ручки из предложенных или напишите его текстом.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Моунджаро 10мг', callback_data: 'syringe_name_Моунджаро 10мг' }],
                        [{ text: 'Парацетамол 500мг', callback_data: 'syringe_name_Парацетамол 500мг' }],
                    ],
                },
            });
        } else if (text === 'Назад') {
            if (state.step === null && state.selectedSyringeIndex === undefined) {
                // Пользователь в списке шприц-ручек, возвращаем в меню выбора типов медикаментов
                state.module = 'medications';
                state.step = null;
                bot.sendMessage(chatId, 'Выберите категорию медикаментов:', generateMedicationsMenu());
            } else if (state.selectedSyringeIndex !== undefined && state.step === null) {
                // Пользователь в конкретной шприц-ручке, возвращаем к списку шприц-ручек
                delete state.selectedSyringeIndex;
                state.step = null;

                // Отправляем сначала сообщение "Выберите действие"
                bot.sendMessage(chatId, 'Выберите действие:', {
                    reply_markup: {
                        keyboard: [
                            ['Добавить шприц-ручку'],
                            ['Назад'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });

                // Затем отправляем список шприц-ручек
                const syringesMenu = await generateSyringesMenu(user);
                bot.sendMessage(chatId, syringesMenu.text, syringesMenu.options);
            } else if (state.step && state.step.startsWith('add_syringe_')) {
                // Пользователь в процессе добавления шприц-ручки, отменяем добавление
                state.step = null;
                state.syringe = null;

                bot.sendMessage(chatId, 'Добавление шприц-ручки отменено.', {
                    reply_markup: {
                        keyboard: [
                            ['Добавить шприц-ручку'],
                            ['Назад'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });
                // Затем отправляем список шприц-ручек
                const syringesMenu = await generateSyringesMenu(user);
                bot.sendMessage(chatId, syringesMenu.text, syringesMenu.options);
            } else if (state.step) {
                // Пользователь в процессе какого-либо действия внутри шприц-ручки
                state.step = null;

                const syringe = user.medications.syringes[state.selectedSyringeIndex];
                const syringeActionsMenu = generateSyringeActionsMenu(syringe);
                bot.sendMessage(chatId, `Действия для шприц-ручки: ${syringe.name}`, syringeActionsMenu);
            }
        } else if (state.step === 'add_syringe_name') {
            // Пользователь ввел название вручную
            state.syringe = { name: text };
            state.step = 'add_syringe_quantity';
            bot.sendMessage(chatId, 'Сколько шприц-ручек у вас есть?');
        } else if (state.step === 'add_syringe_quantity') {
            const quantity = parseInt(text);
            if (isNaN(quantity) || quantity <= 0) {
                bot.sendMessage(chatId, 'Пожалуйста, введите корректное количество шприц-ручек.');
            } else {
                state.syringe.quantity = quantity;
                state.step = 'add_syringe_doses_per_pen';
                bot.sendMessage(chatId, 'Сколько доз содержится в одной шприц-ручке?', {
                    reply_markup: {
                        keyboard: [
                            ['2', '4', '6'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: true,
                    },
                });
            }
        } else if (state.step === 'add_syringe_doses_per_pen') {
            // Используем parseInt с основанием 10 для корректного парсинга числа
            const dosesPerPen = parseInt(text, 10);

            // Добавляем регулярное выражение для строгой валидации ввода
            const dosesPerPenRegex = /^-?\d+$/; // Разрешает только целые числа, положительные и отрицательные

            // Проверяем, что ввод соответствует регулярному выражению и находится в допустимом диапазоне
            if (isNaN(dosesPerPen) || dosesPerPen <= 0 || dosesPerPen > 20 || !dosesPerPenRegex.test(text.trim())) {
                console.warn(`Некорректное количество доз: "${text}"`);
                bot.sendMessage(chatId, 'Пожалуйста, введите корректное количество доз (от 1 до 20).');
            } else {
                state.syringe.dosesPerPen = dosesPerPen;
                state.step = 'add_syringe_schedule_type';
                bot.sendMessage(chatId, 'Когда вы должны принимать это лекарство?', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Ввести вручную', callback_data: 'syringe_schedule_manual' }],
                            [{ text: 'Ежедневно', callback_data: 'syringe_schedule_daily' }],
                            [{ text: 'Еженедельно', callback_data: 'syringe_schedule_weekly' }],
                            [{ text: 'Ежемесячно', callback_data: 'syringe_schedule_monthly' }],
                        ],
                    },
                });
            }
        } else if (state.step === 'add_syringe_manual_datetime') {
            const dateTime = parseDateTime(text, userTimezone);
            if (!dateTime) {
                bot.sendMessage(chatId, 'Пожалуйста, введите дату и время в правильном формате: ДД.ММ.ГГГГ ЧЧ:ММ (например, 10.10.2024 08:00). Попробуйте снова.');
                return; // Прерываем дальнейшую обработку до получения корректного ввода
            } else {
                state.syringe.schedule = {
                    type: 'manual',
                    details: {
                        startDate: dateTime.toDate(),
                    },
                };
                await saveSyringe(bot, chatId, state.syringe);
                state.step = null;
            }
        } else if (state.step === 'add_syringe_schedule_date') {
            // Обработка ввода стартовой даты
            const date = parseDate(text, userTimezone);
            if (!date) {
                bot.sendMessage(chatId, 'Пожалуйста, введите корректную дату в формате ДД.ММ.ГГГГ (например, 10.10.2024):');
            } else {
                state.scheduleDate = date;
                state.step = 'add_syringe_schedule_time';
                bot.sendMessage(chatId, 'Введите время приема в формате ЧЧ:ММ (например, 08:00):');
            }
        } else if (state.step === 'add_syringe_schedule_time') {
            // Обработка ввода времени приема
            const time = parseTime(text);
            if (!time) {
                bot.sendMessage(chatId, 'Пожалуйста, введите корректное время в формате ЧЧ:ММ (например, 08:00):');
            } else {
                state.scheduleDate.hour(time.hours).minute(time.minutes).second(0).millisecond(0);
                state.syringe.schedule = {
                    type: state.scheduleType,
                    details: {
                        startDate: state.scheduleDate.toDate(),
                    },
                };
                await saveSyringe(bot, chatId, state.syringe);
                state.step = null;
            }
        } else if (state.selectedSyringeIndex !== undefined && state.step === null) {
            const action = text;
            if (action === 'Изменить дозировки') {
                // Переходим к изменению дозировок
                state.step = 'edit_doses';
                const syringe = user.medications.syringes[state.selectedSyringeIndex];
                const dosesMenu = generateDosesMenu(syringe, state.editedDoses || null, userTimezone);
                bot.sendMessage(chatId, 'Выберите дозы для изменения:', dosesMenu);

                // Отображаем клавиатуру с кнопками "Сохранить" и "Назад"
                bot.sendMessage(chatId, 'Выберите дозы для изменения состояния:', {
                    reply_markup: {
                        keyboard: [
                            ['Сохранить', 'Назад'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });
            } else if (action === 'Изменить количество') {
                // Запрашиваем новое количество
                state.step = 'edit_quantity';
                bot.sendMessage(chatId, 'Введите новое количество шприц-ручек:');
            } else if (action === 'Изменить время/дату приема') {
                // Переходим к редактированию графика
                state.step = 'edit_schedule';
                bot.sendMessage(chatId, 'Как вы хотите изменить время или дату приема?', {
                    reply_markup: {
                        keyboard: [
                            ['Изменить время'],
                            ['Сместить дату'],
                            ['Изменить график'],
                            ['Вернуться к шприцам'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });
            } else if (action === 'Удалить') {
                // Удаляем шприц-ручку
                user.medications.syringes.splice(state.selectedSyringeIndex, 1);
                await user.save();
                delete state.selectedSyringeIndex;
                state.step = null;

                bot.sendMessage(chatId, 'Шприц-ручка удалена.');

                // Отправляем сначала сообщение "Выберите действие"
                bot.sendMessage(chatId, 'Выберите действие:', {
                    reply_markup: {
                        keyboard: [
                            ['Добавить шприц-ручку'],
                            ['Назад'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });

                // Затем отправляем список шприц-ручек
                const syringesMenu = await generateSyringesMenu(user);
                bot.sendMessage(chatId, syringesMenu.text, syringesMenu.options);
            } else if (action === 'Назад') {
                // Возвращаемся в меню шприц-ручек
                delete state.selectedSyringeIndex;
                state.step = null;

                // Отправляем сначала сообщение "Выберите действие"
                bot.sendMessage(chatId, 'Выберите действие:', {
                    reply_markup: {
                        keyboard: [
                            ['Добавить шприц-ручку'],
                            ['Назад'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });

                // Затем отправляем список шприц-ручек
                const syringesMenu = await generateSyringesMenu(user);
                bot.sendMessage(chatId, syringesMenu.text, syringesMenu.options);
            }
        } else if (state.step === 'edit_doses') {
            // Обработка изменения дозировок
            if (text === 'Сохранить') {
                const syringe = user.medications.syringes[state.selectedSyringeIndex];
                if (state.editedDoses) {
                    // Применяем изменения к дозам
                    syringe.doses = state.editedDoses;

                    // Проверяем, если все дозы приняты
                    const allDosesTaken = syringe.doses.every(dose => dose.taken);
                    if (allDosesTaken) {
                        // Уменьшаем количество шприц-ручек на один
                        syringe.quantity -= 1;

                        if (syringe.quantity > 0) {
                            // Находим дату последней принятой дозы
                            let lastDoseDate;
                            const takenDoses = syringe.doses.filter(dose => dose.taken);

                            if (takenDoses.length > 0) {
                                // Предполагаем, что дозы упорядочены по дате
                                lastDoseDate = moment(takenDoses[takenDoses.length - 1].scheduledAt);
                            } else {
                                // Если нет принятых доз, используем текущий startDate
                                lastDoseDate = moment(syringe.schedule.details.startDate).tz(userTimezone);
                            }

                            // Смещаем дату последней дозы в зависимости от типа расписания
                            const scheduleType = syringe.schedule.type;
                            if (scheduleType === 'daily') {
                                lastDoseDate.add(1, 'day');
                            } else if (scheduleType === 'weekly') {
                                lastDoseDate.add(1, 'week');
                            } else if (scheduleType === 'monthly') {
                                lastDoseDate.add(1, 'month');
                            }

                            // Обновляем startDate в расписании
                            syringe.schedule.details.startDate = lastDoseDate.toDate();

                            // Генерируем новые дозы с обновлёнными датами
                            const dosesPerPen = syringe.dosesPerPen;
                            const newDoses = [];
                            let currentDate = lastDoseDate.clone();

                            for (let i = 0; i < dosesPerPen; i++) {
                                newDoses.push({
                                    doseNumber: i + 1,
                                    taken: false,
                                    takenAt: null,
                                    scheduledAt: currentDate.toDate(),
                                });

                                // Обновляем дату следующей дозы в зависимости от расписания
                                if (scheduleType === 'daily') {
                                    currentDate.add(1, 'day');
                                } else if (scheduleType === 'weekly') {
                                    currentDate.add(1, 'week');
                                } else if (scheduleType === 'monthly') {
                                    currentDate.add(1, 'month');
                                }
                            }

                            // Обновляем дозы шприц-ручки
                            syringe.doses = newDoses;

                            bot.sendMessage(chatId, `Количество шприц-ручек уменьшено. Новое количество: ${syringe.quantity}. График приема обновлён.`);
                        } else {
                            // Если количество шприц-ручек стало 0, удаляем шприц-ручку
                            user.medications.syringes.splice(state.selectedSyringeIndex, 1);
                            delete state.selectedSyringeIndex;

                            // Сообщаем пользователю и возвращаем в меню шприц-ручек
                            bot.sendMessage(chatId, 'Все дозы приняты. Шприц-ручка удалена из списка.');

                            bot.sendMessage(chatId, 'Выберите действие:', {
                                reply_markup: {
                                    keyboard: [
                                        ['Добавить шприц-ручку'],
                                        ['Назад'],
                                    ],
                                    resize_keyboard: true,
                                    one_time_keyboard: false,
                                },
                            });

                            const syringesMenu = await generateSyringesMenu(user);
                            bot.sendMessage(chatId, syringesMenu.text, syringesMenu.options);

                            await user.save();
                            delete state.editedDoses;
                            state.step = null;
                            return;
                        }
                    }

                    await user.save();
                }

                delete state.editedDoses;
                state.step = null;

                bot.sendMessage(chatId, 'Изменения сохранены.', {
                    reply_markup: {
                        keyboard: [
                            ['Изменить дозировки', 'Изменить количество'],
                            ['Изменить время/дату приема', 'Удалить'],
                            ['Назад'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });
            } else if (text === 'Назад') {
                // Отменяем изменения
                delete state.editedDoses;
                state.step = null;

                bot.sendMessage(chatId, 'Изменения отменены.', {
                    reply_markup: {
                        keyboard: [
                            ['Изменить дозировки', 'Изменить количество'],
                            ['Изменить время/дату приема', 'Удалить'],
                            ['Назад'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });
            }
        } else if (state.step === 'edit_quantity') {
            // Обработка изменения количества
            const newQuantity = parseInt(text);
            if (isNaN(newQuantity) || newQuantity < 0) {
                bot.sendMessage(chatId, 'Пожалуйста, введите корректное количество.');
            } else {
                const syringe = user.medications.syringes[state.selectedSyringeIndex];
                syringe.quantity = newQuantity;

                if (syringe.quantity === 0) {
                    // Удаляем шприц-ручку
                    user.medications.syringes.splice(state.selectedSyringeIndex, 1);
                    delete state.selectedSyringeIndex;

                    await user.save();

                    bot.sendMessage(chatId, 'Шприц-ручка удалена, так как количество стало 0.');

                    // Возвращаемся в меню шприц-ручек
                    bot.sendMessage(chatId, 'Выберите действие:', {
                        reply_markup: {
                            keyboard: [
                                ['Добавить шприц-ручку'],
                                ['Назад'],
                            ],
                            resize_keyboard: true,
                            one_time_keyboard: false,
                        },
                    });

                    const syringesMenu = await generateSyringesMenu(user);
                    bot.sendMessage(chatId, syringesMenu.text, syringesMenu.options);

                    state.step = null;
                } else {
                    await user.save();

                    state.step = null;

                    bot.sendMessage(chatId, 'Количество обновлено.', {
                        reply_markup: {
                            keyboard: [
                                ['Изменить дозировки', 'Изменить количество'],
                                ['Изменить время/дату приема', 'Удалить'],
                                ['Назад'],
                            ],
                            resize_keyboard: true,
                            one_time_keyboard: false,
                        },
                    });
                }
            }
        } else if (state.step === 'edit_schedule') {
            // Обработка изменения времени/даты приема
            if (text === 'Изменить время') {
                state.step = 'edit_schedule_time';
                bot.sendMessage(chatId, 'Введите новое время приема в формате ЧЧ:ММ (например, 14:00):');
            } else if (text === 'Сместить дату') {
                state.step = 'edit_schedule_shift_date';
                bot.sendMessage(chatId, 'На сколько дней вы хотите сместить дату приема?');
            } else if (text === 'Изменить график') {
                state.step = 'edit_schedule_change';
                bot.sendMessage(chatId, 'Выберите новый график приема:', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Ввести вручную', callback_data: 'change_schedule_manual' }],
                            [{ text: 'Ежедневно', callback_data: 'change_schedule_daily' }],
                            [{ text: 'Еженедельно', callback_data: 'change_schedule_weekly' }],
                            [{ text: 'Ежемесячно', callback_data: 'change_schedule_monthly' }],
                        ],
                    },
                });
            } else if (text === 'Вернуться к шприцам') {
                state.step = null;
                const syringe = user.medications.syringes[state.selectedSyringeIndex];
                const syringeActionsMenu = generateSyringeActionsMenu(syringe);
                bot.sendMessage(chatId, `Действия для шприц-ручки: ${syringe.name}`, syringeActionsMenu);
            }
        } else if (state.step === 'edit_schedule_time') {
            // Обработка изменения времени приема
            const time = parseTime(text);
            if (!time) {
                bot.sendMessage(chatId, 'Пожалуйста, введите время в формате ЧЧ:ММ (например, 14:00):');
            } else {
                const syringe = user.medications.syringes[state.selectedSyringeIndex];
                // Обновляем startDate в schedule.details
                let startDate = moment(syringe.schedule.details.startDate).tz(userTimezone);
                startDate.hour(time.hours).minute(time.minutes).second(0).millisecond(0);
                syringe.schedule.details.startDate = startDate.toDate();
                // Обновляем время во всех дозах
                syringe.doses.forEach(dose => {
                    let date = moment(dose.scheduledAt).tz(userTimezone);
                    date.hour(time.hours).minute(time.minutes).second(0).millisecond(0);
                    dose.scheduledAt = date.toDate();
                });
                await user.save();

                state.step = null;
                bot.sendMessage(chatId, 'Время приема обновлено.', {
                    reply_markup: {
                        keyboard: [
                            ['Изменить дозировки', 'Изменить количество'],
                            ['Изменить время/дату приема', 'Удалить'],
                            ['Назад'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });
            }
        } else if (state.step === 'edit_schedule_shift_date') {
            // Обработка смещения даты приема
            const shiftDateRegex = /^-?\d+$/; // Разрешает только целые числа, положительные и отрицательные

            // Удаляем пробелы в начале и конце строки
            const trimmedText = text.trim();

            // Проверяем соответствие регулярному выражению
            if (!shiftDateRegex.test(trimmedText)) {
                bot.sendMessage(chatId, 'Пожалуйста, введите корректное число дней (только цифры, например, -5 или 3).');
                return; // Прерываем дальнейшую обработку
            }

            // Парсим число после успешной проверки
            const days = parseInt(trimmedText, 10);

            // Дополнительная проверка на корректность парсинга
            if (isNaN(days)) {
                bot.sendMessage(chatId, 'Произошла ошибка при обработке числа дней. Пожалуйста, попробуйте снова.');
                return;
            }

            const syringe = user.medications.syringes[state.selectedSyringeIndex];

            // Проверка существования шприц-ручки
            if (!syringe) {
                bot.sendMessage(chatId, 'Ошибка: не удалось найти выбранную шприц-ручку. Пожалуйста, попробуйте снова.');
                state.step = null;
                return;
            }

            try {
                // Сдвигаем дату во всех дозах
                syringe.doses.forEach(dose => {
                    let date = moment(dose.scheduledAt).tz(userTimezone);
                    date.add(days, 'days');
                    dose.scheduledAt = date.toDate();
                });

                // Сдвигаем startDate в schedule.details
                syringe.schedule.details.startDate = moment(syringe.schedule.details.startDate).add(days, 'days').toDate();

                // Сохраняем изменения в базе данных
                await user.save();

                // Сбрасываем состояние
                state.step = null;

                // Отправляем подтверждение пользователю
                bot.sendMessage(chatId, 'Дата приема смещена.', {
                    reply_markup: {
                        keyboard: [
                            ['Изменить дозировки', 'Изменить количество'],
                            ['Изменить время/дату приема', 'Удалить'],
                            ['Назад'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });
            } catch (error) {
                console.error('Ошибка при смещении даты:', error);
                bot.sendMessage(chatId, 'Произошла ошибка при смещении даты. Пожалуйста, попробуйте позже.');
            }
        } else if (state.step === 'change_schedule_date') {
            // Обработка ввода новой стартовой даты
            const date = parseDate(text, userTimezone);
            if (!date) {
                bot.sendMessage(chatId, 'Пожалуйста, введите новую дату в формате ДД.ММ.ГГГГ (например, 10.10.2024):');
            } else {
                state.newScheduleDate = date;
                state.step = 'change_schedule_time';
                bot.sendMessage(chatId, 'Введите новое время приема в формате ЧЧ:ММ (например, 08:00):');
            }
        } else if (state.step === 'change_schedule_time') {
            // Обработка ввода нового времени приема
            const time = parseTime(text);
            if (!time) {
                bot.sendMessage(chatId, 'Пожалуйста, введите время в формате ЧЧ:ММ (например, 08:00):');
            } else {
                // Находим нужный шприц
                const syringe = user.medications.syringes[state.selectedSyringeIndex];
                if (!syringe) {
                    bot.sendMessage(chatId, 'Ошибка: не удалось найти выбранную шприц-ручку. Попробуйте снова.');
                    state.step = null;
                    return;
                }


                // Обновляем график
                state.newScheduleDate.hour(time.hours).minute(time.minutes).second(0).millisecond(0);
                syringe.schedule = {
                    type: state.newScheduleType,
                    details: {
                        startDate: state.newScheduleDate.toDate(),
                    },
                };

                // Пересчитываем дозы
                let currentDate = moment(state.newScheduleDate);  // Начальная дата
                syringe.doses = syringe.doses.map((dose, index) => {
                    // Обновляем дату для каждой дозы в зависимости от расписания
                    dose.scheduledAt = currentDate.toDate();
                    dose.takenAt = null;

                    // Обновляем текущую дату в зависимости от типа расписания
                    if (syringe.schedule.type === 'daily') {
                        currentDate.add(1, 'day');
                    } else if (syringe.schedule.type === 'weekly') {
                        currentDate.add(1, 'week');
                    } else if (syringe.schedule.type === 'monthly') {
                        currentDate.add(1, 'month');
                    }

                    return dose;
                });

                try {
                    await user.save();
                    bot.sendMessage(chatId, 'График приема и дозы успешно обновлены.', {
                        reply_markup: {
                            keyboard: [
                                ['Изменить дозировки', 'Изменить количество'],
                                ['Изменить время/дату приема', 'Удалить'],
                                ['Назад'],
                            ],
                            resize_keyboard: true,
                            one_time_keyboard: false,
                        },
                    });
                    // Сброс состояния после успешного сохранения
                    state.step = null;
                } catch (error) {
                    console.error('Ошибка сохранения шприц-ручки:', error);
                    bot.sendMessage(chatId, 'Произошла ошибка при сохранении изменений. Пожалуйста, попробуйте снова.');
                }
            }
        }
    } else if (text === 'Назад') {
        // Пользователь в меню выбора категорий медикаментов, возвращаем в главное меню
        bot.sendMessage(chatId, 'Главное меню:', generateMainMenu());
    }
};

module.exports.handleCallbackQuery = async (bot, query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const user = await User.findOne({ chatId });
    const userTimezone = user.timezone || 'Etc/GMT-3';
    if (!userStates[chatId]) {
        userStates[chatId] = { step: null, module: null };
    }

    const state = userStates[chatId];

    if (data.startsWith('syringe_name_')) {
        // Пользователь выбрал название шприц-ручки из предложенных
        const name = data.substring('syringe_name_'.length);
        state.syringe = { name: name };
        state.step = 'add_syringe_quantity';
        bot.sendMessage(chatId, 'Сколько шприц-ручек у вас есть?');
    } else if (data.startsWith('syringe_schedule_')) {
        // Пользователь выбрал тип расписания
        const scheduleType = data.substring('syringe_schedule_'.length);
        state.scheduleType = scheduleType;
        if (scheduleType === 'manual') {
            state.step = 'add_syringe_manual_datetime';
            bot.sendMessage(chatId, 'Введите стартовую дату и время приема в формате ДД.ММ.ГГГГ ЧЧ:ММ (например, 10.10.2024 08:00):');
        } else {
            state.step = 'add_syringe_schedule_date';
            bot.sendMessage(chatId, 'Введите стартовую дату приема в формате ДД.ММ.ГГГГ (например, 10.10.2024):');
        }
    } else if (data.startsWith('syringe_action_')) {
        // Обработка действий для конкретной шприц-ручки
        const index = parseInt(data.substring('syringe_action_'.length));
        state.selectedSyringeIndex = index;
        const syringe = user.medications.syringes[index];
        const syringeActionsMenu = generateSyringeActionsMenu(syringe);
        bot.sendMessage(chatId, `Действия для шприц-ручки: ${syringe.name}`, syringeActionsMenu);
    } else if (data.startsWith('toggle_dose_')) {
        const doseIndex = parseInt(data.substring('toggle_dose_'.length));
        const syringe = user.medications.syringes[state.selectedSyringeIndex];

        if (!state.editedDoses) {
            // Глубоко клонируем дозы для редактирования
            state.editedDoses = syringe.doses.map((dose) => {
                if (typeof dose.toObject === 'function') {
                    return dose.toObject();
                } else {
                    return JSON.parse(JSON.stringify(dose));
                }
            });
        }

        // Переключаем состояние дозы
        state.editedDoses[doseIndex].taken = !state.editedDoses[doseIndex].taken;

        // Обновляем меню доз
        const dosesMenu = generateDosesMenu(syringe, state.editedDoses, userTimezone);
        try {
            bot.editMessageReplyMarkup(dosesMenu.reply_markup, {
                chat_id: chatId,
                message_id: query.message.message_id,
            });
        } catch (error) {
            console.error('Ошибка при обновлении сообщения:', error);
            bot.sendMessage(chatId, 'Произошла ошибка при обновлении доз. Пожалуйста, попробуйте снова.');
        }
    }
    else if (data.startsWith('change_schedule_')) {
        const scheduleType = data.substring('change_schedule_'.length);
        state.newScheduleType = scheduleType;
        state.step = 'change_schedule_date';
        bot.sendMessage(chatId, 'Введите новую стартовую дату приема в формате ДД.ММ.ГГГГ (например, 10.10.2024):');
    }
};

const saveSyringe = async (bot, chatId, syringeData) => {
    const user = await User.findOne({ chatId });
    if (!user.medications) user.medications = {};
    if (!user.medications.syringes) user.medications.syringes = [];

    const dosesPerPen = syringeData.dosesPerPen;

    // Генерация доз для одной шприц-ручки
    const doses = [];
    let currentDate = moment(syringeData.schedule.details.startDate);

    for (let i = 0; i < dosesPerPen; i++) {
        doses.push({
            doseNumber: i + 1,
            taken: false,
            takenAt: null,
            scheduledAt: currentDate.toDate(),
        });

        // Обновляем дату следующей дозы в зависимости от расписания
        if (syringeData.schedule.type === 'daily') {
            currentDate.add(1, 'day');
        } else if (syringeData.schedule.type === 'weekly') {
            currentDate.add(1, 'week');
        } else if (syringeData.schedule.type === 'monthly') {
            currentDate.add(1, 'month');
        } else if (syringeData.schedule.type === 'manual') {
            // Для ручного ввода не меняем дату
        }
    }

    user.medications.syringes.push({
        name: syringeData.name,
        quantity: syringeData.quantity,
        dosesPerPen: dosesPerPen,
        doses: doses,
        schedule: syringeData.schedule,
        lastUpdated: new Date(),
    });

    await user.save();

    // Отправляем сообщение об успешном добавлении
    bot.sendMessage(chatId, 'Шприц-ручка успешно добавлена.');

    // Сбрасываем состояние пользователя для корректной работы кнопки "Назад"
    userStates[chatId] = { module: 'syringes', step: null };

    // Отображаем клавиатуру с кнопками (СООБЩЕНИЕ ПЕРВОЕ)
    bot.sendMessage(chatId, 'Выберите действие:', {
        reply_markup: {
            keyboard: [
                ['Добавить шприц-ручку'],
                ['Назад'],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
        },
    });

    // Отображаем список шприц-ручек (СООБЩЕНИЕ ВТОРОЕ)
    const syringesMenu = await generateSyringesMenu(user);
    bot.sendMessage(chatId, syringesMenu.text, syringesMenu.options);
};
