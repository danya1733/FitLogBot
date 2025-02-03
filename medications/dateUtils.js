const moment = require('moment-timezone');

/**
 * Парсит строку времени в формате ЧЧ:ММ с учетом часового пояса.
 */
const parseTime = (text) => {
    if (typeof text !== 'string') return null;
    const timeRegex = /^\d{2}:\d{2}$/; // Строгое соответствие формату ЧЧ:ММ
    if (!timeRegex.test(text)) return null;

    const parts = text.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    if (isNaN(hours) || isNaN(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    return { hours, minutes };
};

/**
 * Парсит строку даты в формате ДД.ММ.ГГГГ с учетом часового пояса.
 */
const parseDate = (text, timezone) => {
    if (typeof text !== 'string') return null;

    const parts = text.split('.');
    if (parts.length !== 3) return null;

    const dayStr = parts[0];
    const monthStr = parts[1];
    const yearStr = parts[2];

    // Проверяем, что каждая часть содержит только цифры и имеет правильную длину
    const dayRegex = /^\d{1,2}$/;    // Позволяет день от 1 до 31
    const monthRegex = /^\d{1,2}$/;  // Позволяет месяц от 1 до 12
    const yearRegex = /^\d{4}$/;     // Год должен состоять из 4 цифр

    if (!dayRegex.test(dayStr) || !monthRegex.test(monthStr) || !yearRegex.test(yearStr)) {
        return null;
    }

    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10) - 1; // Месяцы в JavaScript начинаются с 0
    const year = parseInt(yearStr, 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    // Создаем объект moment в заданном часовом поясе
    const date = moment.tz({
        year: year,
        month: month,
        day: day,
    }, timezone);

    // Проверяем корректность даты
    if (!date.isValid() || date.date() !== day || date.month() !== month || date.year() !== year) {
        return null;
    }

    return date;
};
/**
 * Парсит строку даты и времени в формате ДД.ММ.ГГГГ ЧЧ:ММ с учетом часового пояса.
 */
const parseDateTime = (text, timezone) => {
    if (typeof text !== 'string') return null;
    const parts = text.trim().split(' ');

    if (parts.length !== 2) return null; // Требуются и дата, и время

    const [datePart, timePart] = parts;

    if (!datePart || !timePart) return null;

    const date = parseDate(datePart, timezone);
    const time = parseTime(timePart);

    if (!date || !time) return null;

    date.hour(time.hours).minute(time.minutes).second(0).millisecond(0);

    // Проверяем корректность даты и времени
    if (!date.isValid()) {
        return null;
    }

    return date;
};

module.exports = {
    parseTime,
    parseDate,
    parseDateTime,
};
