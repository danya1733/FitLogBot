const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const Chart = require('chart.js');
const ChartDataLabels = require('chartjs-plugin-datalabels'); // Импортируем плагин
const User = require('../models/user');

// Регистрируем плагин данных
Chart.register(ChartDataLabels);

async function generateGraph(bot, chatId) {
    try {
        const user = await User.findOne({ chatId });

        if (!user || !user.weights || user.weights.length === 0) {
            return bot.sendMessage(chatId, 'У вас недостаточно данных для построения графика.');
        }

        // Сортируем веса по дате для корректного отображения
        user.weights.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Извлекаем данные для графика
        const weights = user.weights.map(entry => entry.weight);
        const dates = user.weights.map(entry => moment(entry.date).format('DD.MM')); // Форматируем даты
        const notes = user.weights.map(entry => entry.note); // Извлекаем заметки

        // Проверка корректности дат
        console.log("Преобразованные даты:", dates);

        // Вычисление аналитики
        const totalWeightChange = weights[weights.length - 1] - weights[0];
        const percentageChange = ((totalWeightChange / weights[0]) * 100).toFixed(1);

        let goalProgress;
        if (user.goal && (weights[0] - user.goal) !== 0) {
            goalProgress = ((weights[0] - weights[weights.length - 1]) / (weights[0] - user.goal) * 100).toFixed(1);
        } else {
            goalProgress = "цель не задана или недостижима";
        }

        const totalDays = moment(user.weights[user.weights.length - 1].date).diff(moment(user.weights[0].date), 'days');
        const totalWeeks = totalDays / 7;
        const avgWeeklyChange = totalWeeks > 0 ? (totalWeightChange / totalWeeks).toFixed(2) : "недостаточно данных";

        const heightInMeters = user.height / 100;
        const bmi = (weights[weights.length - 1] / (heightInMeters ** 2)).toFixed(1);

        const remainingToGoal = user.goal
            ? (weights[weights.length - 1] - user.goal).toFixed(1)
            : null;

        let goalMessage;
        if (user.goal) {
            const differenceToGoal = weights[weights.length - 1] - user.goal; // Разница текущего веса и цели

            if (differenceToGoal > 0) {
                goalMessage = `Осталось до цели: ${differenceToGoal.toFixed(1)} кг`;
            } else if (differenceToGoal < 0) {
                goalMessage = `Вы перевыполнили план на ${Math.abs(differenceToGoal).toFixed(1)} кг!`;
            } else {
                goalMessage = `Поздравляем! Вы достигли цели!`;
            }
        } else {
            goalMessage = "Цель не задана";
        }
        // Отправка аналитического сообщения
        const analysisMessage = `
Общие изменения веса: ${totalWeightChange.toFixed(1)} кг
Процент прохождения до цели: ${goalProgress}%
Процент изменения веса: ${percentageChange}%
Текущий ИМТ (BMI): ${bmi}
Текущая цель: ${user.goal ? `${user.goal} кг` : "не задана"}
Среднее изменение веса в неделю: ${avgWeeklyChange} кг
${goalMessage}
        `;
        await bot.sendMessage(chatId, analysisMessage);

        // Настройка Chart.js
        const width = 800; // ширина в пикселях
        const height = 600; // высота в пикселях
        const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

        // Подготовка массивов для стилей точек
        const pointSizes = notes.map(note => note ? 8 : 5); // Больший радиус для точек с заметкой
        const pointBackgroundColors = notes.map(note => note ? '#FF5733' : '#FF6347'); // Цвет для точек
        const pointBorderColors = notes.map(note => '#000'); // Обводка для всех точек

        // Конфигурация графика
        const configuration = {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Вес (кг)',
                    data: weights,
                    fill: false,
                    borderColor: '#ff6347',
                    backgroundColor: '#FF5733',
                    tension: 0.1,
                    pointRadius: pointSizes, // Размер точек
                    pointHoverRadius: pointSizes.map(size => size + 2),
                    pointBackgroundColor: pointBackgroundColors,
                    pointBorderColor: pointBorderColors,
                    // Можно добавить pointBorderWidth, если нужна более толстая обводка

                    // Добавляем 'datalabels' только для этого датасета
                    datalabels: {
                        // Отображать метки только для точек с заметками
                        display: function (context) {
                            const index = context.dataIndex;
                            return notes[index] ? true : false;
                        },
                        align: 'top',
                        anchor: 'end',
                        backgroundColor: '#ffffffaa',
                        borderRadius: 4,
                        padding: 4,
                        font: {
                            size: 12,
                            weight: 'bold'
                        },
                        formatter: function (value, context) {
                            const index = context.dataIndex;
                            return notes[index] ? notes[index] : '';
                        }
                    }
                },
                // Добавление линии цели, если она задана
                ...(user.goal ? [{
                    label: 'Цель (кг)',
                    data: Array(weights.length).fill(user.goal),
                    borderColor: '#4A90E2',
                    borderDash: [10, 5],
                    fill: false,
                    pointRadius: 0, // Без точек
                    borderWidth: 2,
                    datalabels: { display: false } // Отключаем datalabels для линии цели
                }] : [])
                ]
            },
            options: {
                responsive: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'График изменения веса',
                        font: {
                            size: 24
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            font: {
                                size: 16
                            }
                        }
                    },
                    datalabels: { // Глобальные настройки datalabels (отключены)
                        display: false // Отключаем глобальное отображение, настройка производится в датасетах
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const index = context.dataIndex;
                                const weight = context.parsed.y;
                                const note = user.weights[index].note;
                                if (note) {
                                    return `Вес: ${weight} кг (Заметка: ${note})`;
                                }
                                return `Вес: ${weight} кг`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Дата',
                            font: {
                                size: 18
                            }
                        },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: 10
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Вес (кг)',
                            font: {
                                size: 18
                            }
                        },
                        beginAtZero: false,
                        suggestedMin: Math.min(...weights) - 5,
                        suggestedMax: Math.max(...weights) + 5,
                        ticks: {
                            stepSize: 5
                        }
                    }
                }
            },
            plugins: [ChartDataLabels] // Добавляем плагин datalabels
        };

        // Генерация изображения графика
        const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration, 'image/png');

        // Убедимся, что директория для графиков существует
        const dirPath = path.resolve(__dirname, '../graphs');
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // Сохранение графика как изображения
        const imagePath = path.join(dirPath, `${chatId}_graph.png`);
        fs.writeFileSync(imagePath, imageBuffer);
        console.log(`График успешно сохранен по пути: ${imagePath}`);

        // Отправка изображения пользователю
        const stream = fs.createReadStream(imagePath);
        await bot.sendPhoto(chatId, stream, { caption: 'Ваш график веса', contentType: 'image/png' });

        // Асинхронное удаление файла
        fs.unlink(imagePath, (err) => {
            if (err) console.error('Ошибка при удалении файла:', err);
            else console.log(`Файл ${imagePath} успешно удален.`);
        });
    } catch (error) {
        console.error('Ошибка при генерации графика:', error);
        await bot.sendMessage(chatId, 'Произошла ошибка при построении графика.');
    }
}

module.exports = {
    generateGraph
};
