const mongoose = require('mongoose');
require('dotenv').config(); // Убедитесь, что dotenv загружен

// Строка подключения из переменной окружения
const uri = process.env.MONGODB_URI;

mongoose.connect(uri)
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch((err) => {
        console.error('Error connecting to MongoDB:', err);
    });

module.exports = mongoose;
