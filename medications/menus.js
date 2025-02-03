// medications/menus.js

const moment = require('moment-timezone');

const generateSyringesMenu = async (user) => {
    let text = 'Ваши шприц-ручки:\n';
    const syringes = user.medications && user.medications.syringes ? user.medications.syringes : [];
    if (syringes.length === 0) {
        text += 'У вас нет шприц-ручек.';
    } else {
        syringes.forEach((syringe, index) => {
            const dosesInCurrentPen = syringe.doses;
            const dosesLeftInCurrentPen = dosesInCurrentPen.filter((d) => !d.taken).length;
            const totalDosesInCurrentPen = dosesInCurrentPen.length;

            text += `- ${syringe.name} (остаток доз в текущей ручке: ${dosesLeftInCurrentPen} из ${totalDosesInCurrentPen}) — ${syringe.quantity} штук\n`;
        });
    }

    // Создаем inline кнопки для каждой шприц-ручки
    const buttons = syringes.map((syringe, index) => {
        return [{ text: syringe.name, callback_data: `syringe_action_${index}` }];
    });

    return {
        text: text,
        options: {
            reply_markup: {
                inline_keyboard: buttons,
            },
        },
    };
};

const generateSyringeActionsMenu = (syringe) => {
    return {
        reply_markup: {
            keyboard: [
                ['Изменить дозировки', 'Изменить количество'],
                ['Изменить время/дату приема', 'Удалить'],
                ['Назад'],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
        },
    };
};

const generateDosesMenu = (syringe, editedDoses, timezone) => {
    // Проверяем, что doses является массивом
    const doses = Array.isArray(editedDoses) ? editedDoses : (Array.isArray(syringe.doses) ? syringe.doses : []);
    const buttons = [];
    console.log(timezone);

    doses.forEach((dose, index) => {
        const doseStatus = dose.taken;
        const statusText = doseStatus ? 'Принята' : 'Не принята';
        const scheduledTime = displayDateTime(dose.scheduledAt, timezone);
        const doseNumber = dose.doseNumber !== undefined ? dose.doseNumber : index + 1;

        buttons.push([
            {
                text: `Доза ${doseNumber} (${scheduledTime}): ${statusText}`,
                callback_data: `toggle_dose_${index}`,
            },
        ]);
    });

    return {
        reply_markup: {
            inline_keyboard: buttons,
        },
    };
};

const generateTabletsMenu = async (user) => {
    let text = 'Ваши таблетки:\n';
    const tablets = user.medications && user.medications.tablets ? user.medications.tablets : [];
    if (tablets.length === 0) {
        text += 'У вас нет таблеток.';
    } else {
        tablets.forEach((tablet, index) => {
            const doses = tablet.doses || [];
            const dosesLeft = doses.filter((d) => !d.taken).length;
            const totalDoses = doses.length;

            text += `- ${tablet.name} (остаток доз: ${dosesLeft} из ${totalDoses}) — ${tablet.quantity} шт.\n`;
        });
    }

    const buttons = tablets.map((tablet, index) => {
        return [{ text: tablet.name, callback_data: `tablet_action_${index}` }];
    });

    return {
        text: text,
        options: {
            reply_markup: {
                inline_keyboard: buttons,
            },
        },
    };
};

const generateTabletActionsMenu = (tablet) => {
    return {
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
    };
};

const generateTabletDosesMenu = (tablet, editedDoses,timezone) => {
    const buttons = [];
    const doses = editedDoses || tablet.doses || [];
    doses.forEach((dose, index) => {
        const doseStatus = dose.taken;
        const statusText = doseStatus ? 'Принята' : 'Не принята';
        const scheduledTime = displayDateTime(dose.scheduledAt,timezone);
        const doseNumber = dose.doseNumber !== undefined ? dose.doseNumber : index + 1;

        buttons.push([
            {
                text: `Доза ${doseNumber} (${scheduledTime}): ${statusText}`,
                callback_data: `toggle_tablet_dose_${index}`,
            },
        ]);
    });

    return {
        reply_markup: {
            inline_keyboard: buttons,
        },
    };
}

// Меню для флаконов
const generateFlaconsMenu = async (user) => {
    let text = 'Ваши флаконы:\n';
    const flacons = user.medications && user.medications.flacons ? user.medications.flacons : [];
    if (flacons.length === 0) {
        text += 'У вас нет флаконов.';
    } else {
      flacons.forEach((flacon, index) => {
            const doses = flacon.doses || [];
            const dosesLeft = doses.filter((d) => !d.taken).length;
            const totalDoses = doses.length;

            text += `- ${flacon.name} (остаток доз: ${dosesLeft} из ${totalDoses}) — ${flacon.quantity} шт.\n`;
        });
    }

    const buttons = flacons.map((flacon, index) => {
        return [{ text: flacon.name, callback_data: `flacon_action_${index}` }];
    });

    return {
        text: text,
        options: {
            reply_markup: {
                inline_keyboard: buttons,
            },
        },
    };
};

const generateFlaconActionsMenu = (flacon) => {
    return {
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
    };
};

const generateFlaconDosesMenu = (flacon, editedDoses, timezone) => {
    const buttons = [];
    const doses = editedDoses || flacon.doses || [];
    doses.forEach((dose, index) => {
        const doseStatus = dose.taken;
        const statusText = doseStatus ? 'Принята' : 'Не принята';
        const scheduledTime = displayDateTime(dose.scheduledAt, timezone);
        const doseNumber = dose.doseNumber !== undefined ? dose.doseNumber : index + 1;

        buttons.push([
            {
                text: `Доза ${doseNumber} (${scheduledTime}): ${statusText}`,
                callback_data: `toggle_flacon_dose_${index}`,
            },
        ]);
    });

    return {
        reply_markup: {
            inline_keyboard: buttons,
        },
    };
};

const displayDateTime = (dateTime, timezone) => {
    console.log(timezone);

    if (!timezone) {
        console.error('Timezone is undefined in displayDateTime');
        timezone = 'Etc/GMT-3'; // Устанавливаем значение по умолчанию
    }
    return moment(dateTime).tz(timezone).format('DD.MM.YYYY HH:mm');
};


module.exports = {
    generateSyringesMenu,
    generateSyringeActionsMenu,
    generateDosesMenu,
    generateTabletsMenu,
    generateTabletActionsMenu,
    generateTabletDosesMenu,
    generateFlaconsMenu,
    generateFlaconActionsMenu,
    generateFlaconDosesMenu,
    displayDateTime,
};