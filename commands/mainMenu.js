// commands/mainMenu.js

module.exports = {
  generateMainMenu: (subscribed) => {
    const subscriptionButton = subscribed ? 'Отписаться от рассылки' : 'Подписаться на рассылку';

    return {
      reply_markup: {
        keyboard: [
          ['Работа с личными данными'],
          ['Работа с медикаментами'],
          ['Рассчитать ИМТ', 'Рассчитать калории', 'Отрисовать график'],
          [subscriptionButton],
          ['Установить часовой пояс'],
          ['О разработчике'],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    };
  },

  generateDataMenu: () => {
    return {
      reply_markup: {
        keyboard: [
          ['Ввести данные', 'Изменить данные'],
          ['Показать мои данные', 'Удалить мои данные'],
          ['Вернуться в главное меню'],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    };
  },

  generateMedicationsMenu: () => {
    return {
      reply_markup: {
        keyboard: [['Шприц-ручки', 'Флаконы', 'Таблетки'], ['Назад']],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    };
  },
};
