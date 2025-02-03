// medications/tabletsHandler.js

const User = require('../models/user');
const userStates = require('../states');
const moment = require('moment-timezone');

const { generateTabletsMenu, generateTabletActionsMenu, generateTabletDosesMenu, displayDateTime } = require('./menus');
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

    if (text === 'Таблетки') {
        state.module = 'tablets';
        state.step = null;

        bot.sendMessage(chatId, 'Выберите действие:', {
            reply_markup: {
                keyboard: [
                    ['Добавить таблетки'],
                    ['Назад'],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
            },
        });

        const tabletsMenu = await generateTabletsMenu(user);
        bot.sendMessage(chatId, tabletsMenu.text, tabletsMenu.options);
    } else if (state.module === 'tablets') {
        if (text === 'Добавить таблетки') {
            state.step = 'add_tablet_name';
            bot.sendMessage(chatId, 'Выберите название таблеток из предложенных или напишите его текстом.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Парацетамол 500мг', callback_data: 'tablet_name_Парацетамол 500мг' }],
                        [{ text: 'Ибупрофен 200мг', callback_data: 'tablet_name_Ибупрофен 200мг' }],
                    ],
                },
            });
        } else if (text === 'Назад') {
            if (state.step === null && state.selectedTabletIndex === undefined) {
                state.module = 'medications';
                state.step = null;
                bot.sendMessage(chatId, 'Выберите категорию медикаментов:', generateMedicationsMenu());
            } else if (state.selectedTabletIndex !== undefined && state.step === null) {
                delete state.selectedTabletIndex;
                state.step = null;

                bot.sendMessage(chatId, 'Выберите действие:', {
                    reply_markup: {
                        keyboard: [['Добавить таблетки'], ['Назад']],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });

                const tabletsMenu = await generateTabletsMenu(user);
                bot.sendMessage(chatId, tabletsMenu.text, tabletsMenu.options);
            } else if (state.step && state.step.startsWith('add_tablet_')) {
                state.step = null;
                state.tablet = null;

                bot.sendMessage(chatId, 'Добавление таблеток отменено.', {
                    reply_markup: {
                        keyboard: [['Добавить таблетки'], ['Назад']],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });
                // Возвращаем пользователя в меню таблеток
                const tabletsMenu = await generateTabletsMenu(user);
                bot.sendMessage(chatId, tabletsMenu.text, tabletsMenu.options);
            } else if (state.step) {
                state.step = null;

                const tablet = user.medications.tablets[state.selectedTabletIndex];
                const tabletActionsMenu = generateTabletActionsMenu(tablet);
                bot.sendMessage(chatId, `Действия для таблеток: ${tablet.name}`, tabletActionsMenu);
            }
        } else if (state.step === 'add_tablet_name') {
            state.tablet = { name: text };
            state.step = 'add_tablet_quantity';
            bot.sendMessage(chatId, 'Сколько таблеток у вас есть?');
        } else if (state.step === 'add_tablet_quantity') {
            // Регулярное выражение для проверки, что ввод состоит только из цифр
            const tabletQuantityRegex = /^\d+$/;

            // Удаляем пробелы в начале и конце строки
            const trimmedText = text.trim();

            // Парсим число
            const quantity = parseInt(trimmedText, 10);

            // Проверяем соответствие регулярному выражению и диапазон
            if (!tabletQuantityRegex.test(trimmedText) || isNaN(quantity) || quantity <= 0 || quantity > 30) {
                console.warn(`Некорректное количество таблеток: "${text}"`);
                bot.sendMessage(chatId, 'Пожалуйста, введите корректное количество таблеток (от 1 до 30).');
                return; // Прерываем дальнейшую обработку
            }

            // Установка количества таблеток и переход к следующему шагу
            state.tablet.quantity = quantity;
            state.step = 'add_tablet_schedule_type';
            bot.sendMessage(chatId, 'Когда вы должны принимать это лекарство?', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Ввести вручную', callback_data: 'tablet_schedule_manual' }],
                        [{ text: 'Ежедневно', callback_data: 'tablet_schedule_daily' }],
                        [{ text: 'Еженедельно', callback_data: 'tablet_schedule_weekly' }],
                        [{ text: 'Ежемесячно', callback_data: 'tablet_schedule_monthly' }],
                    ],
                },
            });
        } else if (state.step === 'add_tablet_manual_datetime') {
            const dateTime = parseDateTime(text, userTimezone);
            if (!dateTime) {
                bot.sendMessage(
                    chatId,
                    'Пожалуйста, введите дату и время в формате ДД.ММ.ГГГГ ЧЧ:ММ (например, 10.10.2024 08:00):'
                );
            } else {
                state.tablet.schedule = {
                    type: 'manual',
                    details: {
                        startDate: dateTime.toDate(),
                    },
                };
                await saveTablet(bot, chatId, state.tablet);
                state.step = null;
            }
        } else if (state.step === 'add_tablet_schedule_date') {
            const date = parseDate(text, userTimezone);
            if (!date) {
                bot.sendMessage(
                    chatId,
                    'Пожалуйста, введите корректную дату в формате ДД.ММ.ГГГГ (например, 10.10.2024):'
                );
            } else {
                state.scheduleDate = date;
                state.step = 'add_tablet_schedule_time';
                bot.sendMessage(chatId, 'Введите время приема в формате ЧЧ:ММ (например, 08:00):');
            }
        } else if (state.step === 'add_tablet_schedule_time') {
            const time = parseTime(text);
            if (!time) {
                bot.sendMessage(
                    chatId,
                    'Пожалуйста, введите корректное время в формате ЧЧ:ММ (например, 08:00):'
                );
            } else {
                state.scheduleDate.hour(time.hours).minute(time.minutes).second(0).millisecond(0);
                state.tablet.schedule = {
                    type: state.scheduleType,
                    details: {
                        startDate: state.scheduleDate.toDate(),
                    },
                };
                await saveTablet(bot, chatId, state.tablet);
                state.step = null;
            }
        } else if (state.selectedTabletIndex !== undefined && state.step === null) {
            const action = text;
            if (action === 'Изменить количество') {
                state.step = 'edit_quantity';
                bot.sendMessage(chatId, 'Введите новое количество таблеток:');
            } else if (action === 'Изменить время/дату приема') {
                state.step = 'edit_schedule';
                bot.sendMessage(chatId, 'Как вы хотите изменить время или дату приема?', {
                    reply_markup: {
                        keyboard: [
                            ['Изменить время'],
                            ['Сместить дату'],
                            ['Изменить график'],
                            ['Вернуться к таблеткам'],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });
            } else if (action === 'Показать график приема') {
                const tablet = user.medications.tablets[state.selectedTabletIndex];
                const doses = tablet.doses || [];
                if (doses.length === 0) {
                    bot.sendMessage(chatId, 'График приема отсутствует.');
                } else {
                    let scheduleText = 'График приема таблеток:\n';
                    doses.forEach((dose) => {
                        const statusText = dose.taken ? 'Принята' : 'Не принята';
                        const scheduledTime = displayDateTime(dose.scheduledAt, userTimezone);
                        scheduleText += `- ${scheduledTime}: ${statusText}\n`;
                    });
                    bot.sendMessage(chatId, scheduleText);
                }
            } else if (action === 'Изменить состояние дозы') {
                state.step = 'edit_doses';
                const tablet = user.medications.tablets[state.selectedTabletIndex];
                // Инициализируем editedDoses текущими дозами
                state.editedDoses = tablet.doses.map((dose) => {
                    if (typeof dose.toObject === 'function') {
                        return dose.toObject();
                    } else {
                        return { ...dose };
                    }
                });
                const dosesMenu = generateTabletDosesMenu(tablet, state.editedDoses, userTimezone);
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
                user.medications.tablets.splice(state.selectedTabletIndex, 1);
                await user.save();
                delete state.selectedTabletIndex;
                state.step = null;

                bot.sendMessage(chatId, 'Таблетки удалены.');

                bot.sendMessage(chatId, 'Выберите действие:', {
                    reply_markup: {
                        keyboard: [['Добавить таблетки'], ['Назад']],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });

                const tabletsMenu = await generateTabletsMenu(user);
                bot.sendMessage(chatId, tabletsMenu.text, tabletsMenu.options);
            } else if (action === 'Назад') {
                delete state.selectedTabletIndex;
                state.step = null;

                bot.sendMessage(chatId, 'Выберите действие:', {
                    reply_markup: {
                        keyboard: [['Добавить таблетки'], ['Назад']],
                        resize_keyboard: true,
                        one_time_keyboard: false,
                    },
                });

                const tabletsMenu = await generateTabletsMenu(user);
                bot.sendMessage(chatId, tabletsMenu.text, tabletsMenu.options);
            }
        } else if (state.step === 'edit_doses') {
            if (text === 'Сохранить') {
                const tablet = user.medications.tablets[state.selectedTabletIndex];
                if (state.editedDoses) {
                    tablet.doses = state.editedDoses;

                    // Обновляем количество таблеток на основе принятых доз
                    const dosesLeft = tablet.doses.filter((d) => !d.taken).length;
                    tablet.quantity = dosesLeft;

                    if (tablet.quantity === 0) {
                        // Удаляем таблетку из списка
                        user.medications.tablets.splice(state.selectedTabletIndex, 1);
                        delete state.selectedTabletIndex;
                        //Возвраащем пользователя в меню
                        bot.sendMessage(chatId, 'Все дозы приняты. Таблетки удалены из списка.', {
                            reply_markup: {
                                keyboard: [['Добавить таблетки'], ['Назад']],
                                resize_keyboard: true,
                                one_time_keyboard: false,
                            },
                        });
                        const tabletsMenu = await generateTabletsMenu(user);
                        bot.sendMessage(chatId, tabletsMenu.text, tabletsMenu.options);
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
                        user.medications.tablets.splice(state.selectedTabletIndex, 1); // Удаляем таблетку из массива
                        await user.save(); // Сохраняем изменения в базе данных

                        bot.sendMessage(chatId, 'Таблетка удалена, так как количество установлено на 0.', {
                            reply_markup: {
                                keyboard: [['Добавить таблетки'], ['Назад']],
                                resize_keyboard: true,
                                one_time_keyboard: false,
                            },
                        });
                        delete state.selectedTabletIndex;
                        state.step = null; // Сбрасываем состояние
                        const tabletsMenu = await generateTabletsMenu(user);
                        bot.sendMessage(chatId, tabletsMenu.text, tabletsMenu.options);
                        return;
                    } catch (error) {
                        console.error('Ошибка при удалении таблетки:', error);
                        bot.sendMessage(chatId, 'Произошла ошибка при удалении таблетки. Пожалуйста, попробуйте позже.');
                        return;
                    }
                }
                console.warn(`Некорректное количество таблеток: "${text}"`);
                bot.sendMessage(chatId, 'Пожалуйста, введите корректное количество таблеток (от 0 до 30).');
                return; // Прерываем дальнейшую обработку
            }

            const tablet = user.medications.tablets[state.selectedTabletIndex];

            // Проверка существования таблетки
            if (!tablet) {
                bot.sendMessage(chatId, 'Ошибка: не удалось найти выбранную таблетку. Пожалуйста, попробуйте снова.');
                state.step = null;
                return;
            }

            // Проверка, что новое количество не меньше количества уже принятых доз
            const takenDosesCount = tablet.doses.filter(dose => dose.taken).length;
            if (newQuantity < takenDosesCount) {
                bot.sendMessage(chatId, `Невозможно установить количество таблеток меньше количества уже принятых доз (${takenDosesCount}).`);
                return;
            }

            // Установка нового количества и переход к следующему шагу
            state.newQuantity = newQuantity;
            state.step = 'confirm_keep_start_date';

            // Получаем текущую стартовую дату и форматируем её
            const currentStartDate = displayDateTime(tablet.schedule.details.startDate, userTimezone);

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
                const tablet = user.medications.tablets[state.selectedTabletIndex];
                if (!tablet) {
                    bot.sendMessage(chatId, 'Ошибка: не удалось найти выбранную таблетку. Пожалуйста, попробуйте снова.');
                    state.step = null;
                    return;
                }

                try {
                    // Устанавливаем новое количество таблеток
                    tablet.quantity = state.newQuantity;

                    // Определяем количество доз, которые уже существуют
                    const existingDoses = tablet.doses.length;
                    const additionalDoses = state.newQuantity - existingDoses;

                    // Если новое количество больше текущего, добавляем новые дозы
                    if (additionalDoses > 0) {
                        let lastScheduledDate = tablet.schedule.details.startDate;
                        if (existingDoses > 0) {
                            const lastDose = tablet.doses[tablet.doses.length - 1];
                            lastScheduledDate = lastDose.scheduledAt;
                        }

                        let currentDate = moment(lastScheduledDate).tz(userTimezone);

                        for (let i = 0; i < additionalDoses; i++) {
                            // Увеличиваем дату в зависимости от типа расписания
                            if (tablet.schedule.type === 'daily') {
                                currentDate = currentDate.clone().add(1, 'day');
                            } else if (tablet.schedule.type === 'weekly') {
                                currentDate = currentDate.clone().add(1, 'week');
                            } else if (tablet.schedule.type === 'monthly') {
                                currentDate = currentDate.clone().add(1, 'month');
                            }

                            tablet.doses.push({
                                doseNumber: tablet.doses.length + 1,
                                taken: false,
                                takenAt: null,
                                scheduledAt: currentDate.toDate(),
                                status: 'scheduled', // Можно добавить статус, если требуется
                            });
                        }
                    } else if (additionalDoses < 0) {
                        // Если новое количество меньше, удаляем дозы с конца, но только те, которые не приняты
                        // Поскольку уже проверили, что newQuantity >= takenDosesCount, можно безопасно удалять
                        tablet.doses = tablet.doses.slice(0, state.newQuantity);
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
                    console.error('Ошибка при изменении количества таблеток:', error);
                    bot.sendMessage(chatId, 'Произошла ошибка при изменении количества таблеток. Пожалуйста, попробуйте позже.');
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
                const tablet = user.medications.tablets[state.selectedTabletIndex];
                if (!tablet) {
                    bot.sendMessage(chatId, 'Ошибка: не удалось найти выбранную таблетку. Пожалуйста, попробуйте снова.');
                    state.step = null;
                    return;
                }

                try {
                    // Устанавливаем новую стартовую дату с новым временем
                    state.newStartDate.hour(time.hours).minute(time.minutes).second(0).millisecond(0);
                    tablet.schedule.details.startDate = state.newStartDate.toDate();
                    tablet.quantity = state.newQuantity;

                    // Обнуляем все дозы
                    tablet.doses = [];

                    // Создаём новый график доз начиная с новой стартовой даты
                    let currentDate = moment(state.newStartDate).tz(userTimezone);
                    for (let i = 0; i < tablet.quantity; i++) {
                        tablet.doses.push({
                            doseNumber: i + 1,
                            taken: false,
                            takenAt: null,
                            scheduledAt: currentDate.toDate(),
                            status: 'scheduled', // Можно добавить статус, если требуется
                        });

                        // Увеличиваем дату в зависимости от типа расписания
                        if (tablet.schedule.type === 'daily') {
                            currentDate.add(1, 'day');
                        } else if (tablet.schedule.type === 'weekly') {
                            currentDate.add(1, 'week');
                        } else if (tablet.schedule.type === 'monthly') {
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
                    console.error('Ошибка при изменении количества таблеток:', error);
                    bot.sendMessage(chatId, 'Произошла ошибка при изменении количества таблеток. Пожалуйста, попробуйте позже.');
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
            } else if (text === 'Вернуться к таблеткам') {
                state.step = null;
                const tablet = user.medications.tablets[state.selectedTabletIndex];
                const tabletActionsMenu = generateTabletActionsMenu(tablet);
                bot.sendMessage(chatId, `Действия для таблеток: ${tablet.name}`, tabletActionsMenu);
            }
        } else if (state.step === 'edit_schedule_time') {
            const time = parseTime(text);
            if (!time) {
                bot.sendMessage(chatId, 'Пожалуйста, введите время в формате ЧЧ:ММ (например, 14:00):');
            } else {
                const tablet = user.medications.tablets[state.selectedTabletIndex];
                // Обновляем startDate в schedule.details
                let startDate = moment(tablet.schedule.details.startDate).tz(userTimezone);
                startDate.hour(time.hours).minute(time.minutes).second(0).millisecond(0);
                tablet.schedule.details.startDate = startDate.toDate();

                // Обновляем время во всех дозах
                tablet.doses.forEach(dose => {
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

            const tablet = user.medications.tablets[state.selectedTabletIndex];

            // Проверка существования таблетки
            if (!tablet) {
                bot.sendMessage(chatId, 'Ошибка: не удалось найти выбранную таблетку. Пожалуйста, попробуйте снова.');
                state.step = null;
                return;
            }

            try {
                // Сдвигаем дату во всех дозах
                tablet.doses.forEach(dose => {
                    let date = moment(dose.scheduledAt).tz(userTimezone);
                    date.add(days, 'days');
                    dose.scheduledAt = date.toDate();
                });

                // Сдвигаем startDate в schedule.details
                tablet.schedule.details.startDate = moment(tablet.schedule.details.startDate).add(days, 'days').toDate();

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
                const tablet = user.medications.tablets[state.selectedTabletIndex];
                if (!tablet) {
                    bot.sendMessage(chatId, 'Ошибка: не удалось найти выбранные таблетки. Попробуйте снова.');
                    state.step = null;
                    return;
                }

                state.newScheduleDate.hour(time.hours).minute(time.minutes).second(0).millisecond(0);

                // Обновляем расписание таблеток
                tablet.schedule.type = state.newScheduleType;
                tablet.schedule.details.startDate = state.newScheduleDate.toDate();

                // Пересчитываем дозы
                let currentDate = moment(state.newScheduleDate);
                tablet.doses = [];

                for (let i = 0; i < tablet.quantity; i++) {
                    tablet.doses.push({
                        doseNumber: i + 1,
                        taken: false,
                        takenAt: null,
                        scheduledAt: currentDate.toDate(),
                    });

                    if (tablet.schedule.type === 'daily') {
                        currentDate.add(1, 'day');
                    } else if (tablet.schedule.type === 'weekly') {
                        currentDate.add(1, 'week');
                    } else if (tablet.schedule.type === 'monthly') {
                        currentDate.add(1, 'month');
                    } else if (tablet.schedule.type === 'manual') {
                        // For manual schedule, we don't change the date
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

    if (data.startsWith('tablet_name_')) {
        const name = data.substring('tablet_name_'.length);
        state.tablet = { name: name };
        state.step = 'add_tablet_quantity';
        bot.sendMessage(chatId, 'Сколько таблеток у вас есть?');
    } else if (data.startsWith('tablet_schedule_')) {
        const scheduleType = data.substring('tablet_schedule_'.length);
        state.scheduleType = scheduleType;
        if (scheduleType === 'manual') {
            state.step = 'add_tablet_manual_datetime';
            bot.sendMessage(
                chatId,
                'Введите дату и время приема в формате ДД.ММ.ГГГГ ЧЧ:ММ (например, 10.10.2024 08:00):'
            );
        } else {
            state.step = 'add_tablet_schedule_date';
            bot.sendMessage(chatId, 'Введите стартовую дату приема в формате ДД.ММ.ГГГГ (например, 10.10.2024):');
        }
    } else if (data.startsWith('tablet_action_')) {
        const index = parseInt(data.substring('tablet_action_'.length));
        state.selectedTabletIndex = index;
        const tablet = user.medications.tablets[index];
        const tabletActionsMenu = generateTabletActionsMenu(tablet);
        bot.sendMessage(chatId, `Действия для таблеток: ${tablet.name}`, tabletActionsMenu);
    } else if (data.startsWith('toggle_tablet_dose_')) {
        const doseIndex = parseInt(data.substring('toggle_tablet_dose_'.length));
        const tablet = user.medications.tablets[state.selectedTabletIndex];

        if (!state.editedDoses) {
            // Клонируем дозы для редактирования
            state.editedDoses = tablet.doses.map((dose) => {
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
        const dosesMenu = generateTabletDosesMenu(tablet, state.editedDoses, userTimezone);
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

const saveTablet = async (bot, chatId, tabletData) => {
    const user = await User.findOne({ chatId });
    if (!user.medications) user.medications = {};
    if (!user.medications.tablets) user.medications.tablets = [];

    const doses = [];
    let currentDate = moment(tabletData.schedule.details.startDate);

    for (let i = 0; i < tabletData.quantity; i++) {
        doses.push({
            doseNumber: i + 1,
            taken: false,
            takenAt: null,
            scheduledAt: currentDate.toDate(),
        });

        if (tabletData.schedule.type === 'daily') {
            currentDate.add(1, 'day');
        } else if (tabletData.schedule.type === 'weekly') {
            currentDate.add(1, 'week');
        } else if (tabletData.schedule.type === 'monthly') {
            currentDate.add(1, 'month');
        } else if (tabletData.schedule.type === 'manual') {
            // Для ручного ввода не меняем дату
        }
    }

    user.medications.tablets.push({
        name: tabletData.name,
        quantity: tabletData.quantity,
        doses: doses,
        schedule: tabletData.schedule,
        lastUpdated: new Date(),
    });

    await user.save();

    bot.sendMessage(chatId, 'Таблетки успешно добавлены.');

    userStates[chatId] = { module: 'tablets', step: null };

    bot.sendMessage(chatId, 'Выберите действие:', {
        reply_markup: {
            keyboard: [
                ['Добавить таблетки'],
                ['Назад'],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
        },
    });

    const tabletsMenu = await generateTabletsMenu(user);
    bot.sendMessage(chatId, tabletsMenu.text, tabletsMenu.options);
};

