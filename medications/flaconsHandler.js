// medications/flaconsHandler.js

const User = require('../models/user');
const userStates = require('../states');
const moment = require('moment-timezone');

const { generateFlaconsMenu, generateFlaconActionsMenu, generateFlaconDosesMenu, displayDateTime } = require('./menus');
const { generateMedicationsMenu, generateMainMenu } = require('../commands/mainMenu');
const { parseTime, parseDate, parseDateTime } = require('./dateUtils');

module.exports.handleMessage = async (bot, msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const user = await User.findOne({ chatId });
    const userTimezone = user.timezone || 'Etc/GMT-3'
    if (!userStates[chatId]) {
        userStates[chatId] = { step: null, module: null };
    }

    const state = userStates[chatId];

    if (text === 'Флаконы') {
        state.module = 'flacons';
        state.step = null;

        bot.sendMessage(chatId, 'Выберите действие:', {
            reply_markup: {
                keyboard: [
                    ['Добавить флаконы'],
                    ['Назад'],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
            },
        });

        const flaconsMenu = await generateFlaconsMenu(user);
        bot.sendMessage(chatId, flaconsMenu.text, flaconsMenu.options);
    } else if (state.module === 'flacons') {
        if (text === 'Добавить флаконы') {
            state.step = 'add_flacon_name';
            bot.sendMessage(chatId, 'Выберите название флакона из предложенных или напишите его текстом.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Флакон А', callback_data: 'flacon_name_Флакон А' }],
                        [{ text: 'Флакон Б', callback_data: 'flacon_name_Флакон Б' }],
                    ],
                },
            });
        } else if (text === 'Назад') {
            if (state.step === null && state.selectedFlaconIndex === undefined) {
                state.module = 'medications';
                state.step = null;
                bot.sendMessage(chatId, 'Выберите категорию медикаментов:', generateMedicationsMenu());
            } else if (state.selectedFlaconIndex !== undefined && state.step === null) {
                delete state.selectedFlaconIndex;
                state.step = null;

                bot.sendMessage(chatId, 'Выберите действие:', {
                    reply_markup: {
                        keyboard: [['Добавить флаконы'], ['Назад']],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });

                const flaconsMenu = await generateFlaconsMenu(user);
                bot.sendMessage(chatId, flaconsMenu.text, flaconsMenu.options);
            } else if (state.step && state.step.startsWith('add_flacon_')) {
                state.step = null;
                state.flacon = null;

                bot.sendMessage(chatId, 'Добавление флаконов отменено.', {
                    reply_markup: {
                        keyboard: [['Добавить флаконы'], ['Назад']],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });
                // Возвращаем пользователя в меню флаконов
                const flaconsMenu = await generateFlaconsMenu(user);
                bot.sendMessage(chatId, flaconsMenu.text, flaconsMenu.options);
            } else if (state.step) {
                state.step = null;

                const flacon = user.medications.flacons[state.selectedFlaconIndex];
                const flaconActionsMenu = generateFlaconActionsMenu(flacon);
                bot.sendMessage(chatId, `Действия для флаконов: ${flacon.name}`, flaconActionsMenu);
            }
        } else if (state.step === 'add_flacon_name') {
            state.flacon = { name: text };
            state.step = 'add_flacon_quantity';
            bot.sendMessage(chatId, 'Сколько флаконов у вас есть?');
        } else if (state.step === 'add_flacon_quantity') {
            // Регулярное выражение для проверки, что ввод состоит только из цифр
            const flaconQuantityRegex = /^\d+$/;

            // Удаляем пробелы в начале и конце строки
            const trimmedText = text.trim();

            // Парсим число с основанием 10
            const quantity = parseInt(trimmedText, 10);

            // Проверяем соответствие регулярному выражению и диапазон
            if (!flaconQuantityRegex.test(trimmedText) || isNaN(quantity) || quantity <= 0 || quantity > 30) {
                console.warn(`Некорректное количество флаконов: "${text}"`);
                bot.sendMessage(chatId, 'Пожалуйста, введите корректное количество флаконов (от 1 до 30).');
                return; // Прерываем дальнейшую обработку
            }

            // Установка количества флаконов и переход к следующему шагу
            state.flacon.quantity = quantity;
            state.step = 'add_flacon_schedule_type';
            bot.sendMessage(chatId, 'Когда вы должны принимать это лекарство?', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Ввести вручную', callback_data: 'flacon_schedule_manual' }],
                        [{ text: 'Ежедневно', callback_data: 'flacon_schedule_daily' }],
                        [{ text: 'Еженедельно', callback_data: 'flacon_schedule_weekly' }],
                        [{ text: 'Ежемесячно', callback_data: 'flacon_schedule_monthly' }],
                    ],
                },
            });
        } else if (state.step === 'add_flacon_manual_datetime') {
            const dateTime = parseDateTime(text, userTimezone);
            if (!dateTime) {
                bot.sendMessage(
                    chatId,
                    'Пожалуйста, введите дату и время в формате ДД.ММ.ГГГГ ЧЧ:ММ (например, 10.10.2024 08:00):'
                );
            } else {
                state.flacon.schedule = {
                    type: 'manual',
                    details: {
                        startDate: dateTime.toDate(),
                    },
                };
                await saveFlacon(bot, chatId, state.flacon);
                state.step = null;
            }
        } else if (state.step === 'add_flacon_schedule_date') {
            const date = parseDate(text, userTimezone);
            if (!date) {
                bot.sendMessage(
                    chatId,
                    'Пожалуйста, введите корректную дату в формате ДД.ММ.ГГГГ (например, 10.10.2024):'
                );
            } else {
                state.scheduleDate = date;
                state.step = 'add_flacon_schedule_time';
                bot.sendMessage(chatId, 'Введите время приема в формате ЧЧ:ММ (например, 08:00):');
            }
        } else if (state.step === 'add_flacon_schedule_time') {
            const time = parseTime(text);
            if (!time) {
                bot.sendMessage(
                    chatId,
                    'Пожалуйста, введите корректное время в формате ЧЧ:ММ (например, 08:00):'
                );
            } else {
                state.scheduleDate.hour(time.hours).minute(time.minutes).second(0).millisecond(0);
                state.flacon.schedule = {
                    type: state.scheduleType,
                    details: {
                        startDate: state.scheduleDate.toDate(),
                    },
                };
                await saveFlacon(bot, chatId, state.flacon);
                state.step = null;
            }
        } else if (state.selectedFlaconIndex !== undefined && state.step === null) {
            const action = text;
            if (action === 'Изменить количество') {
                state.step = 'edit_quantity';
                bot.sendMessage(chatId, 'Введите новое количество флаконов:');
            } else if (action === 'Изменить время/дату приема') {
                state.step = 'edit_schedule';
                bot.sendMessage(chatId, 'Как вы хотите изменить время или дату приема?', {
                    reply_markup: {
                        keyboard: [
                            ['Изменить время'],
                            ['Сместить дату'],
                            ['Изменить график'],
                            ['Вернуться к флаконам'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });
            } else if (action === 'Показать график приема') {
                const flacon = user.medications.flacons[state.selectedFlaconIndex];
                const doses = flacon.doses || [];
                if (doses.length === 0) {
                    bot.sendMessage(chatId, 'График приема отсутствует.');
                } else {
                    let scheduleText = 'График приема флаконов:\n';
                    doses.forEach((dose) => {
                        const statusText = dose.taken ? 'Принята' : 'Не принята';
                        const scheduledTime = displayDateTime(dose.scheduledAt, userTimezone);
                        scheduleText += `- ${scheduledTime}: ${statusText}\n`;
                    });
                    bot.sendMessage(chatId, scheduleText);
                }
            } else if (action === 'Изменить состояние дозы') {
                state.step = 'edit_doses';
                const flacon = user.medications.flacons[state.selectedFlaconIndex];
                // Инициализируем editedDoses текущими дозами
                state.editedDoses = flacon.doses.map((dose) => {
                    if (typeof dose.toObject === 'function') {
                        return dose.toObject();
                    } else {
                        return { ...dose };
                    }
                });
                const dosesMenu = generateFlaconDosesMenu(flacon, state.editedDoses, userTimezone);
                bot.sendMessage(chatId, 'Выберите дозы для изменения состояния:', dosesMenu);

                // Отправляем сообщение с кнопками "Сохранить" и "Назад"
                bot.sendMessage(chatId, 'Когда закончите, нажмите "Сохранить" или "Назад":', {
                    reply_markup: {
                        keyboard: [['Сохранить', 'Назад']],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });
            } else if (action === 'Удалить') {
                user.medications.flacons.splice(state.selectedFlaconIndex, 1);
                await user.save();
                delete state.selectedFlaconIndex;
                state.step = null;

                bot.sendMessage(chatId, 'Флаконы удалены.');

                bot.sendMessage(chatId, 'Выберите действие:', {
                    reply_markup: {
                        keyboard: [['Добавить флаконы'], ['Назад']],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });

                const flaconsMenu = await generateFlaconsMenu(user);
                bot.sendMessage(chatId, flaconsMenu.text, flaconsMenu.options);
            } else if (action === 'Назад') {
                delete state.selectedFlaconIndex;
                state.step = null;

                bot.sendMessage(chatId, 'Выберите действие:', {
                    reply_markup: {
                        keyboard: [['Добавить флаконы'], ['Назад']],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });

                const flaconsMenu = await generateFlaconsMenu(user);
                bot.sendMessage(chatId, flaconsMenu.text, flaconsMenu.options);
            }
        } else if (state.step === 'edit_doses') {
            if (text === 'Сохранить') {
                const flacon = user.medications.flacons[state.selectedFlaconIndex];
                if (state.editedDoses) {
                    flacon.doses = state.editedDoses;

                    // Обновляем количество флаконов на основе принятых доз
                    const dosesLeft = flacon.doses.filter((d) => !d.taken).length;
                    flacon.quantity = dosesLeft;

                    if (flacon.quantity === 0) {
                        // Удаляем флакон из списка
                        user.medications.flacons.splice(state.selectedFlaconIndex, 1);
                        delete state.selectedFlaconIndex;
                        // Возвращаем пользователя в меню
                        bot.sendMessage(chatId, 'Все дозы приняты. флаконы удалены из списка.', {
                            reply_markup: {
                                keyboard: [['Добавить флаконы'], ['Назад']],
                                resize_keyboard: true,
                                one_time_keyboard: false,
                            },
                        });
                        const flaconsMenu = await generateFlaconsMenu(user);
                        bot.sendMessage(chatId, flaconsMenu.text, flaconsMenu.options);
                    } else {
                        bot.sendMessage(chatId, 'Изменения сохранены.', {
                            reply_markup: {
                                keyboard: [
                                    ['Изменить количество'],
                                    ['Изменить время/дату приема'],
                                    ['Показать график приема'],
                                    ['Изменить состояние дозы'],
                                    ['Удалить'],
                                    ['Назад'],
                                ],
                                resize_keyboard: true,
                                one_time_keyboard: false,
                            },
                        });
                    }

                    await user.save();
                }

                delete state.editedDoses;
                state.step = null;
            } else if (text === 'Назад') {
                delete state.editedDoses;
                state.step = null;

                bot.sendMessage(chatId, 'Изменения отменены.', {
                    reply_markup: {
                        keyboard: [
                            ['Изменить количество'],
                            ['Изменить время/дату приема'],
                            ['Показать график приема'],
                            ['Изменить состояние дозы'],
                            ['Удалить'],
                            ['Назад'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });
            }
        } else if (state.step === 'edit_quantity') {
            // Регулярное выражение для проверки, что ввод состоит только из цифр
            const quantityRegex = /^\d+$/;

            // Удаляем пробелы в начале и конце строки
            const trimmedText = text.trim();

            // Парсим число с основанием 10
            const newQuantity = parseInt(trimmedText, 10);

            // Проверяем соответствие регулярному выражению и диапазон значений
            if (!quantityRegex.test(trimmedText) || isNaN(newQuantity) || newQuantity <= 0 || newQuantity > 30) {
                if (newQuantity === 0) {
                    try {
                        // Удаляем флакон из массива
                        user.medications.flacons.splice(state.selectedFlaconIndex, 1);
                        await user.save(); // Сохраняем изменения в базе данных

                        bot.sendMessage(chatId, 'Флакон удалён, так как количество установлено на 0.', {
                            reply_markup: {
                                keyboard: [['Добавить флаконы'], ['Назад']],
                                resize_keyboard: true,
                                one_time_keyboard: false,
                            },
                        });

                        // Удаляем индекс выбранного флакона из состояния
                        delete state.selectedFlaconIndex;
                        state.step = null; // Сбрасываем состояние

                        // Генерируем и отправляем меню флаконов
                        const flaconsMenu = await generateFlaconsMenu(user);
                        bot.sendMessage(chatId, flaconsMenu.text, flaconsMenu.options);
                        return;
                    } catch (error) {
                        console.error('Ошибка при удалении флакона:', error);
                        bot.sendMessage(chatId, 'Произошла ошибка при удалении флакона. Пожалуйста, попробуйте позже.');
                        return;
                    }
                }
                console.warn(`Некорректное количество флаконов: "${text}"`);
                bot.sendMessage(chatId, 'Пожалуйста, введите корректное количество флаконов (от 0 до 30).');
                return; // Прерываем дальнейшую обработку
            }

            const flacon = user.medications.flacons[state.selectedFlaconIndex];

            // Проверка существования флакона
            if (!flacon) {
                bot.sendMessage(chatId, 'Ошибка: не удалось найти выбранный флакон. Пожалуйста, попробуйте снова.');
                state.step = null;
                return;
            }

            // Проверка, что новое количество не меньше количества уже принятых доз
            const takenDosesCount = flacon.doses.filter(dose => dose.taken).length;
            if (newQuantity < takenDosesCount) {
                bot.sendMessage(chatId, `Невозможно установить количество флаконов меньше количества уже принятых доз (${takenDosesCount}).`);
                return;
            }

            // Установка нового количества и переход к следующему шагу
            state.newQuantity = newQuantity;
            state.step = 'confirm_keep_start_date';

            // Получаем текущую стартовую дату и форматируем её
            const currentStartDate = displayDateTime(flacon.schedule.details.startDate, userTimezone);

            bot.sendMessage(chatId, `Вы хотите сохранить текущую стартовую дату приема (${currentStartDate})?`, {
                reply_markup: {
                    keyboard: [
                        ['Да', 'Нет'],
                        ['Отмена'],
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false,
                },
            });
        } else if (state.step === 'confirm_keep_start_date') {
            if (text === 'Да') {
                const flacon = user.medications.flacons[state.selectedFlaconIndex];
                if (!flacon) {
                    bot.sendMessage(chatId, 'Ошибка: не удалось найти выбранный флакон. Пожалуйста, попробуйте снова.');
                    state.step = null;
                    return;
                }

                try {
                    // Устанавливаем новое количество флаконов
                    flacon.quantity = state.newQuantity;

                    // Определяем количество доз, которые уже существуют
                    const existingDoses = flacon.doses.length;
                    const additionalDoses = state.newQuantity - existingDoses;

                    // Если новое количество больше текущего, добавляем новые дозы
                    if (additionalDoses > 0) {
                        let lastScheduledDate = flacon.schedule.details.startDate;
                        if (existingDoses > 0) {
                            const lastDose = flacon.doses[flacon.doses.length - 1];
                            lastScheduledDate = lastDose.scheduledAt;
                        }

                        let currentDate = moment(lastScheduledDate).tz(userTimezone);

                        for (let i = 0; i < additionalDoses; i++) {
                            // Увеличиваем дату в зависимости от типа расписания
                            if (flacon.schedule.type === 'daily') {
                                currentDate = currentDate.clone().add(1, 'day');
                            } else if (flacon.schedule.type === 'weekly') {
                                currentDate = currentDate.clone().add(1, 'week');
                            } else if (flacon.schedule.type === 'monthly') {
                                currentDate = currentDate.clone().add(1, 'month');
                            }

                            flacon.doses.push({
                                doseNumber: flacon.doses.length + 1,
                                taken: false,
                                takenAt: null,
                                scheduledAt: currentDate.toDate(),
                                status: 'scheduled', // Можно добавить статус, если требуется
                            });
                        }
                    } else if (additionalDoses < 0) {
                        // Если новое количество меньше, удаляем дозы с конца, но только те, которые не приняты
                        // Поскольку уже проверили, что newQuantity >= takenDosesCount, можно безопасно удалять
                        flacon.doses = flacon.doses.slice(0, state.newQuantity);
                    }

                    await user.save();

                    // Сбрасываем состояние
                    state.step = null;

                    bot.sendMessage(chatId, 'Количество и график приема обновлены.', {
                        reply_markup: {
                            keyboard: [
                                ['Изменить количество'],
                                ['Изменить время/дату приема'],
                                ['Показать график приема'],
                                ['Изменить состояние дозы'],
                                ['Удалить'],
                                ['Назад'],
                            ],
                            resize_keyboard: true,
                            one_time_keyboard: false,
                        },
                    });
                } catch (error) {
                    console.error('Ошибка при изменении количества флаконов:', error);
                    bot.sendMessage(chatId, 'Произошла ошибка при изменении количества флаконов. Пожалуйста, попробуйте позже.');
                }
            } else if (text === 'Нет') {
                // Запрашиваем новую стартовую дату
                state.step = 'change_quantity_new_start_date';
                bot.sendMessage(chatId, 'Введите новую стартовую дату приема в формате ДД.ММ.ГГГГ (например, 10.10.2024):');
            } else if (text === 'Отмена') {
                state.step = null;
                bot.sendMessage(chatId, 'Изменение количества отменено.', {
                    reply_markup: {
                        keyboard: [
                            ['Изменить количество'],
                            ['Изменить время/дату приема'],
                            ['Показать график приема'],
                            ['Изменить состояние дозы'],
                            ['Удалить'],
                            ['Назад'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });
            } else {
                bot.sendMessage(chatId, 'Пожалуйста, выберите "Да", "Нет" или "Отмена".');
            }
        } else if (state.step === 'change_quantity_new_start_date') {
            const date = parseDate(text, userTimezone);
            if (!date) {
                bot.sendMessage(chatId, 'Пожалуйста, введите новую дату в формате ДД.ММ.ГГГГ (например, 10.10.2024):');
            } else {
                state.newStartDate = date;
                state.step = 'change_quantity_new_time';
                bot.sendMessage(chatId, 'Введите новое время приема в формате ЧЧ:ММ (например, 08:00):');
            }
        } else if (state.step === 'change_quantity_new_time') {
            const time = parseTime(text);
            if (!time) {
                bot.sendMessage(chatId, 'Пожалуйста, введите время в формате ЧЧ:ММ (например, 08:00):');
            } else {
                const flacon = user.medications.flacons[state.selectedFlaconIndex];
                if (!flacon) {
                    bot.sendMessage(chatId, 'Ошибка: не удалось найти выбранный флакон. Пожалуйста, попробуйте снова.');
                    state.step = null;
                    return;
                }

                try {
                    // Устанавливаем новую стартовую дату с новым временем
                    state.newStartDate.hour(time.hours).minute(time.minutes).second(0).millisecond(0);
                    flacon.schedule.details.startDate = state.newStartDate.toDate();
                    flacon.quantity = state.newQuantity;

                    // Обнуляем все дозы
                    flacon.doses = [];

                    // Создаём новый график доз начиная с новой стартовой даты
                    let currentDate = moment(state.newStartDate).tz(userTimezone);
                    for (let i = 0; i < flacon.quantity; i++) {
                        flacon.doses.push({
                            doseNumber: i + 1,
                            taken: false,
                            takenAt: null,
                            scheduledAt: currentDate.toDate(),
                            status: 'scheduled', // Можно добавить статус, если требуется
                        });

                        // Увеличиваем дату в зависимости от типа расписания
                        if (flacon.schedule.type === 'daily') {
                            currentDate.add(1, 'day');
                        } else if (flacon.schedule.type === 'weekly') {
                            currentDate.add(1, 'week');
                        } else if (flacon.schedule.type === 'monthly') {
                            currentDate.add(1, 'month');
                        }
                    }

                    await user.save();

                    // Сбрасываем состояние
                    state.step = null;

                    // Отправляем подтверждение пользователю
                    bot.sendMessage(chatId, 'Количество и график приема обновлены.', {
                        reply_markup: {
                            keyboard: [
                                ['Изменить количество'],
                                ['Изменить время/дату приема'],
                                ['Показать график приема'],
                                ['Изменить состояние дозы'],
                                ['Удалить'],
                                ['Назад'],
                            ],
                            resize_keyboard: true,
                            one_time_keyboard: false,
                        },
                    });
                } catch (error) {
                    console.error('Ошибка при изменении количества флаконов:', error);
                    bot.sendMessage(chatId, 'Произошла ошибка при изменении количества флаконов. Пожалуйста, попробуйте позже.');
                }
            }
        } else if (state.step === 'edit_schedule') {
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
            } else if (text === 'Вернуться к флаконам') {
                state.step = null;
                const flacon = user.medications.flacons[state.selectedFlaconIndex];
                const flaconActionsMenu = generateFlaconActionsMenu(flacon);
                bot.sendMessage(chatId, `Действия для флаконов: ${flacon.name}`, flaconActionsMenu);
            }
        } else if (state.step === 'edit_schedule_time') {
            const time = parseTime(text);
            if (!time) {
                bot.sendMessage(chatId, 'Пожалуйста, введите время в формате ЧЧ:ММ (например, 14:00):');
            } else {
                const flacon = user.medications.flacons[state.selectedFlaconIndex];
                // Обновляем startDate в schedule.details
                let startDate = moment(flacon.schedule.details.startDate).tz(userTimezone);
                startDate.hour(time.hours).minute(time.minutes).second(0).millisecond(0);
                flacon.schedule.details.startDate = startDate.toDate();

                // Обновляем время во всех дозах
                flacon.doses.forEach(dose => {
                    let date = moment(dose.scheduledAt).tz(userTimezone);
                    date.hour(time.hours).minute(time.minutes).second(0).millisecond(0);
                    dose.scheduledAt = date.toDate();
                });

                await user.save();

                state.step = null;
                bot.sendMessage(chatId, 'Время приема обновлено.', {
                    reply_markup: {
                        keyboard: [
                            ['Изменить количество'],
                            ['Изменить время/дату приема'],
                            ['Показать график приема'],
                            ['Изменить состояние дозы'],
                            ['Удалить'],
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
                console.warn(`Некорректный ввод для смещения даты: ${text}`);
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

            const flacon = user.medications.flacons[state.selectedFlaconIndex];

            // Проверка существования флакона
            if (!flacon) {
                bot.sendMessage(chatId, 'Ошибка: не удалось найти выбранный флакон. Пожалуйста, попробуйте снова.');
                state.step = null;
                return;
            }

            try {
                // Сдвигаем дату во всех дозах
                flacon.doses.forEach(dose => {
                    let date = moment(dose.scheduledAt).tz(userTimezone);
                    date.add(days, 'days');
                    dose.scheduledAt = date.toDate();
                });

                // Сдвигаем startDate в schedule.details
                flacon.schedule.details.startDate = moment(flacon.schedule.details.startDate).add(days, 'days').toDate();

                // Сохраняем изменения в базе данных
                await user.save();

                // Сбрасываем состояние
                state.step = null;

                // Отправляем подтверждение пользователю
                bot.sendMessage(chatId, 'Дата приема смещена.', {
                    reply_markup: {
                        keyboard: [
                            ['Изменить количество'],
                            ['Изменить время/дату приема'],
                            ['Показать график приема'],
                            ['Изменить состояние дозы'],
                            ['Удалить'],
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
            const date = parseDate(text, userTimezone);
            if (!date) {
                bot.sendMessage(chatId, 'Пожалуйста, введите корректную дату в формате ДД.ММ.ГГГГ (например, 10.10.2024):');
            } else {
                state.newScheduleDate = date;
                state.step = 'change_schedule_time';
                bot.sendMessage(chatId, 'Введите время приема в формате ЧЧ:ММ (например, 08:00):');
            }
        } else if (state.step === 'change_schedule_time') {
            const time = parseTime(text);
            if (!time) {
                bot.sendMessage(chatId, 'Пожалуйста, введите корректное время в формате ЧЧ:ММ (например, 08:00):');
            } else {
                const flacon = user.medications.flacons[state.selectedFlaconIndex];
                if (!flacon) {
                    bot.sendMessage(chatId, 'Ошибка: не удалось найти выбранные флаконы. Попробуйте снова.');
                    state.step = null;
                    return;
                }

                state.newScheduleDate.hour(time.hours).minute(time.minutes).second(0).millisecond(0);

                // Обновляем расписание флаконов
                flacon.schedule.type = state.newScheduleType;
                flacon.schedule.details.startDate = state.newScheduleDate.toDate();

                // Пересчитываем дозы
                let currentDate = moment(state.newScheduleDate);
                flacon.doses = [];

                for (let i = 0; i < flacon.quantity; i++) {
                    flacon.doses.push({
                        doseNumber: i + 1,
                        taken: false,
                        takenAt: null,
                        scheduledAt: currentDate.toDate(),
                    });

                    if (flacon.schedule.type === 'daily') {
                        currentDate.add(1, 'day');
                    } else if (flacon.schedule.type === 'weekly') {
                        currentDate.add(1, 'week');
                    } else if (flacon.schedule.type === 'monthly') {
                        currentDate.add(1, 'month');
                    } else if (flacon.schedule.type === 'manual') {
                        // Для ручного ввода не меняем дату
                    }
                }

                await user.save();

                state.step = null;

                bot.sendMessage(chatId, 'График приема обновлен.', {
                    reply_markup: {
                        keyboard: [
                            ['Изменить количество'],
                            ['Изменить время/дату приема'],
                            ['Показать график приема'],
                            ['Изменить состояние дозы'],
                            ['Удалить'],
                            ['Назад'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });
            }
        }
    } else if (text === 'Назад') {
        bot.sendMessage(chatId, 'Главное меню:', generateMainMenu());
    }
};

module.exports.handleCallbackQuery = async (bot, query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const user = await User.findOne({ chatId });
    const userTimezone = user.timezone || 'Etc/GMT-3'
    if (!userStates[chatId]) {
        userStates[chatId] = { step: null, module: null };
    }

    const state = userStates[chatId];

    if (data.startsWith('flacon_name_')) {
        const name = data.substring('flacon_name_'.length);
        state.flacon = { name: name };
        state.step = 'add_flacon_quantity';
        bot.sendMessage(chatId, 'Сколько флаконов у вас есть?');
    } else if (data.startsWith('flacon_schedule_')) {
        const scheduleType = data.substring('flacon_schedule_'.length);
        state.scheduleType = scheduleType;
        if (scheduleType === 'manual') {
            state.step = 'add_flacon_manual_datetime';
            bot.sendMessage(
                chatId,
                'Введите дату и время приема в формате ДД.ММ.ГГГГ ЧЧ:ММ (например, 10.10.2024 08:00):'
            );
        } else {
            state.step = 'add_flacon_schedule_date';
            bot.sendMessage(chatId, 'Введите стартовую дату приема в формате ДД.ММ.ГГГГ (например, 10.10.2024):');
        }
    } else if (data.startsWith('flacon_action_')) {
        const index = parseInt(data.substring('flacon_action_'.length));
        state.selectedFlaconIndex = index;
        const flacon = user.medications.flacons[index];
        const flaconActionsMenu = generateFlaconActionsMenu(flacon);
        bot.sendMessage(chatId, `Действия для флаконов: ${flacon.name}`, flaconActionsMenu);
    } else if (data.startsWith('toggle_flacon_dose_')) {
        const doseIndex = parseInt(data.substring('toggle_flacon_dose_'.length));
        const flacon = user.medications.flacons[state.selectedFlaconIndex];

        if (!state.editedDoses) {
            // Клонируем дозы для редактирования
            state.editedDoses = flacon.doses.map((dose) => {
                if (typeof dose.toObject === 'function') {
                    return dose.toObject();
                } else {
                    return { ...dose };
                }
            });
        }

        // Переключаем состояние дозы
        state.editedDoses[doseIndex].taken = !state.editedDoses[doseIndex].taken;

        // Обновляем меню доз
        const dosesMenu = generateFlaconDosesMenu(flacon, state.editedDoses, userTimezone);
        bot.editMessageReplyMarkup(dosesMenu.reply_markup, {
            chat_id: chatId,
            message_id: query.message.message_id,
        });
    } else if (data.startsWith('change_schedule_')) {
        const scheduleType = data.substring('change_schedule_'.length);
        state.newScheduleType = scheduleType;
        state.step = 'change_schedule_date';
        bot.sendMessage(chatId, 'Введите новую стартовую дату приема в формате ДД.ММ.ГГГГ (например, 10.10.2024):');
    }
};

const saveFlacon = async (bot, chatId, flaconData) => {
    const user = await User.findOne({ chatId });
    if (!user.medications) user.medications = {};
    if (!user.medications.flacons) user.medications.flacons = [];

    const doses = [];
    let currentDate = moment(flaconData.schedule.details.startDate);

    for (let i = 0; i < flaconData.quantity; i++) {
        doses.push({
            doseNumber: i + 1,
            taken: false,
            takenAt: null,
            scheduledAt: currentDate.toDate(),
        });

        if (flaconData.schedule.type === 'daily') {
            currentDate.add(1, 'day');
        } else if (flaconData.schedule.type === 'weekly') {
            currentDate.add(1, 'week');
        } else if (flaconData.schedule.type === 'monthly') {
            currentDate.add(1, 'month');
        } else if (flaconData.schedule.type === 'manual') {
            // Для ручного ввода не меняем дату
        }
    }

    user.medications.flacons.push({
        name: flaconData.name,
        quantity: flaconData.quantity,
        doses: doses,
        schedule: flaconData.schedule,
        lastUpdated: new Date(),
    });

    await user.save();

    bot.sendMessage(chatId, 'Флаконы успешно добавлены.');

    userStates[chatId] = { module: 'flacons', step: null };

    bot.sendMessage(chatId, 'Выберите действие:', {
        reply_markup: {
            keyboard: [
                ['Добавить флаконы'],
                ['Назад'],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
        },
    });

    const flaconsMenu = await generateFlaconsMenu(user);
    bot.sendMessage(chatId, flaconsMenu.text, flaconsMenu.options);
};

