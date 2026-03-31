const mongoose = require('mongoose');

const timeSlotSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  slot: { type: String, required: true }, // e.g. "09:00-09:30"
  isBooked: { type: Boolean, default: false }
});

timeSlotSchema.index({ doctorId: 1, date: 1, slot: 1 }, { unique: true });

module.exports = mongoose.model('TimeSlot', timeSlotSchema);