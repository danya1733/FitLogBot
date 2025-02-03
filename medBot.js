// medBot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment-timezone'); // Добавляем импорт moment
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

const startCommand = require('./commands/start');
const bmiCommand = require('./commands/bmi');
const setDataCommand = require('./commands/setdata');
const showDataCommand = require('./commands/showdata');
const deleteDataCommand = require('./commands/deletedata');
const updateDataCommand = require('./commands/updatedata');
const cancelCommand = require('./commands/cancel');
const helpCommand = require('./commands/help');
const messageHandler = require('./handlers/messageHandler');
const userStates = require('./states');
const caloriesCommand = require('./commands/calories');
const mailingCommand = require('./commands/mailing');
const { generateGraph } = require('./commands/generateGraph');
const manageSubscribe = require('./commands/manageSubscribe');
const mainMenu = require('./commands/mainMenu');
const User = require('./models/user'); // Подключение модели User
const aboutDeveloper = require('./commands/aboutDeveloper');
// Деструктурируем методы из setTimezoneCommand
const { setTimezone, handleCallback, handleManualTimezoneInput } = require('./commands/setTimezone');


const syringesHandler = require('./medications/syringesHandler');
const tabletsHandler = require('./medications/tabletsHandler');
const flaconsHandler = require('./medications/flaconsHandler');
const {
  generateMainMenu,
  generateDataMenu,
  generateMedicationsMenu,
} = require('./commands/mainMenu');


// Импортируем функции из scheduler.js
const { startScheduler, handleDoseAction, handleCombinedDoseAction } = require('./scheduler');

// Подключение к базе данных через Mongoose
require('./db'); // Предполагается, что это инициализирует подключение через Mongoose

// Запуск планировщика после инициализации бота и подключения к базе данных
startScheduler(bot);

// Обработчик polling_error для более подробного логирования
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Команда /start
bot.onText(/\/start/, (msg) => {
  delete userStates[msg.chat.id]; // Сброс состояния
  startCommand(bot, msg);
});

// Обработка callback_query
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  console.log(`bot.on('callback_query'): data=${data}, chatId=${chatId}`);

  // Обработка новых callback_data для установки часового пояса
  if (
    data.startsWith('set_timezone_') ||
    data === 'choose_timezone' ||
    data === 'input_timezone' ||
    data === 'back_to_timezone_options'
  ) {
    handleCallback(bot, query);
    return;
  }

  // Остальная обработка callback_query
  if (userStates[chatId]) {
    if (userStates[chatId].module === 'syringes') {
      syringesHandler.handleCallbackQuery(bot, query);
    } else if (userStates[chatId].module === 'tablets') {
      tabletsHandler.handleCallbackQuery(bot, query);
    } else if (userStates[chatId].module === 'flacons') {
      flaconsHandler.handleCallbackQuery(bot, query);
    }
  }

  // Обработка callback_data для уведомлений 'taken_' и 'delay_'
  if (data.startsWith('taken_') || data.startsWith('delay_')) {
    await handleDoseAction(bot, query);
    return;
  }

  // Обработка callback_data для комбинированных уведомлений 'status_' и 'confirm_changes'
  if (data.startsWith('status_') || data === 'confirm_changes') {
    await handleCombinedDoseAction(bot, query);
    return;
  }
});

// Обработка сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  console.log(`bot.on('message'): text=${text}, chatId=${chatId}`);

  // Проверка, находится ли пользователь в процессе установки часового пояса
  if (
    userStates[chatId] &&
    userStates[chatId].module === 'setTimezone' &&
    userStates[chatId].step === 'input_manual'
  ) {
    await handleManualTimezoneInput(bot, msg);
    return;
  }

  // Обработка команды "О разработчике"
  if (text === 'О разработчике') {
    delete userStates[chatId];
    await aboutDeveloper(bot, msg); // Вызываем модуль
    return;
  }

  // Обработка команды "Установить часовой пояс"
  if (text === 'Установить часовой пояс') {
    delete userStates[chatId];
    setTimezone(bot, msg);
    return;
  }

  // Обработка команды "Ввести данные"
  if (text === 'Ввести данные') {
    delete userStates[chatId];
    setDataCommand(bot, msg);
    return;
  }

  // Обработка команды "Изменить данные"
  if (text === 'Изменить данные') {
    delete userStates[chatId];
    updateDataCommand(bot, msg);
    return;
  }

  // Обработка команды "Рассчитать ИМТ"
  if (text === 'Рассчитать ИМТ') {
    delete userStates[chatId];
    bmiCommand(bot, msg);
    return;
  }

  if (text === 'states') {
    console.log(userStates);
  }

  // Обработка команды "Рассчитать калории"
  if (text === 'Рассчитать калории') {
    delete userStates[chatId];
    caloriesCommand(bot, msg);
    return;
  }

  // Обработка команды "Показать мои данные"
  if (text === 'Показать мои данные') {
    delete userStates[chatId];
    showDataCommand(bot, msg);
    return;
  }

  // Обработка команды "Удалить мои данные"
  if (text === 'Удалить мои данные') {
    delete userStates[chatId];
    deleteDataCommand(bot, msg);
    return;
  }

  // Обработка команды "Помощь"
  if (text === 'Помощь') {
    delete userStates[chatId];
    helpCommand(bot, msg);
    return;
  }

  // Обработка команды "/mailing"
  if (text === '/mailing') {
    delete userStates[chatId];
    mailingCommand(bot, msg, userStates);
    return;
  }

  // Обработка команды "Подписаться на рассылку"
  if (text === 'Подписаться на рассылку') {
    delete userStates[chatId];
    manageSubscribe(bot, msg, true); // true для подписки
    return;
  }

  // Обработка команды "Отписаться от рассылки"
  if (text === 'Отписаться от рассылки') {
    delete userStates[chatId];
    manageSubscribe(bot, msg, false); // false для отписки
    return;
  }

  // Обработка команды "Вернуться в главное меню"
  if (text === 'Вернуться в главное меню') {
    delete userStates[chatId];
    const user = await User.findOne({ chatId: chatId });
    bot.sendMessage(
      chatId,
      'Главное меню:',
      mainMenu.generateMainMenu(user ? user.subscribed : false),
    );
    return;
  }

  // Обработка команды "Работа с личными данными"
  if (text === 'Работа с личными данными') {
    delete userStates[chatId];
    bot.sendMessage(chatId, 'Выберите действие:', mainMenu.generateDataMenu());
    return;
  }

  // Команда "Отрисовать график" для построения и отправки графика
  if (text === 'Отрисовать график') {
    await generateGraph(bot, chatId);
    return;
  }

  // Работа с медикаментами
  if (text === 'Работа с медикаментами') {
    delete userStates[chatId];
    userStates[chatId] = { module: 'medications', step: null };
    bot.sendMessage(chatId, 'Выберите категорию медикаментов:', generateMedicationsMenu());
    return;
  }

  if (text === 'Шприц-ручки') {
    syringesHandler.handleMessage(bot, msg);
    return;
  }

  if (text === 'Таблетки') {
    tabletsHandler.handleMessage(bot, msg);
    return;
  }

  if (text === 'Флаконы') {
    flaconsHandler.handleMessage(bot, msg);
    return;
  }

  // Глобальная обработка кнопки "Назад"
  if (text === 'Назад') {
    // Проверяем, есть ли состояние пользователя
    if (
      !userStates[chatId] ||
      (userStates[chatId].module === null && userStates[chatId].step === null)
    ) {
      // Если состояния нет, отправляем в главное меню
      const user = await User.findOne({ chatId: chatId });
      bot.sendMessage(
        chatId,
        'Главное меню:',
        mainMenu.generateMainMenu(user ? user.subscribed : false),
      );
    }
  }

  // Обработка кнопки "Назад" внутри модуля "medications"
  if (userStates[chatId] && userStates[chatId].module === 'medications') {
    if (text === 'Назад') {
      delete userStates[chatId];
      const user = await User.findOne({ chatId: chatId });
      bot.sendMessage(
        chatId,
        'Главное меню:',
        mainMenu.generateMainMenu(user ? user.subscribed : false),
      );
      return;
    }
  }

  // Если пользователь находится внутри какого-либо модуля, передаем управление соответствующему обработчику
  if (userStates[chatId]) {
    if (userStates[chatId].module === 'syringes') {
      syringesHandler.handleMessage(bot, msg);
      return;
    } else if (userStates[chatId].module === 'tablets') {
      tabletsHandler.handleMessage(bot, msg);
      return;
    } else if (userStates[chatId].module === 'flacons') {
      flaconsHandler.handleMessage(bot, msg);
      return;
    }
  }

  // Если нет специальных условий, передаем сообщение в общий обработчик
  messageHandler(bot, msg);
});
