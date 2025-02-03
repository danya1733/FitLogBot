// models/user.js
const mongoose = require('mongoose');

const doseSchema = new mongoose.Schema({
  doseNumber: Number,
  taken: Boolean,
  takenAt: Date,
  scheduledAt: Date,
  status: String, // Добавлено поле status
});

const syringeSchema = new mongoose.Schema({
  name: String,
  quantity: Number,
  dosesPerPen: Number,
  doses: [doseSchema],
  schedule: {
    type: { type: String },
    details: {
      startDate: Date,
      time: String,
    },
  },
  lastUpdated: Date,
});

const tabletSchema = new mongoose.Schema({
  name: String,
  quantity: Number,
  doses: [doseSchema],
  schedule: {
    type: { type: String },
    details: {
      startDate: Date,
      time: String,
    },
  },
  lastUpdated: Date,
});

const flaconSchema = new mongoose.Schema({
  name: String,
  quantity: Number,
  doses: [doseSchema],
  schedule: {
    type: { type: String },
    details: {
      startDate: Date,
      time: String,
    },
  },
  lastUpdated: Date,
});

const medicationsSchema = new mongoose.Schema({
  syringes: [syringeSchema],
  tablets: [tabletSchema],
  flacons: [flaconSchema],
});

const weightEntrySchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now,
  },
  weight: {
    type: Number,
    required: true,
  },
  note: {
    type: String,
    maxlength: 5,
  },
});

const pendingReminderSchema = new mongoose.Schema({
  messageId: Number,
  data: [
    {
      medicationType: String,
      medicationIndex: Number,
      doseNumber: Number,
      medicationName: String,
      status: String, // Поле status внутри данных напоминания
    },
  ], // Изменено с Object на массив объектов
  createdAt: { type: Date, default: Date.now },
});

const userSchema = new mongoose.Schema(
  {
    chatId: { type: Number, required: true, unique: true },
    gender: String,
    weight: Number,
    goal: Number,
    height: Number,
    age: Number,
    activityLevel: String,
    subscribed: Boolean,
    weights: [weightEntrySchema],
    medications: medicationsSchema,
    timezone: { type: String, default: 'Etc/GMT-3' },
    pendingReminders: [pendingReminderSchema],
  },
  { timestamps: true },
);

const User = mongoose.model('User', userSchema);

module.exports = User;
