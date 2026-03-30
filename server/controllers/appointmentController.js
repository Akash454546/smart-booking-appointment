const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');

exports.bookAppointment = async (req, res) => {
  try {
    const { doctorId, date, timeSlot } = req.body;
    const patientId = req.user.id;

    // Check doctor exists
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });

    // Check if the date falls on doctor's available days
    const dayName = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
    if (!doctor.availableDays.includes(dayName)) {
      return res.status(400).json({ error: `Doctor not available on ${dayName}.` });
    }

    // Prevent past date bookings
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    if (date < todayStr) {
      return res.status(400).json({ error: 'Cannot book appointments in the past.' });
    }

    // Prevent past time slot bookings for today
    if (date === todayStr) {
      const [slotStart] = timeSlot.split('-');
      const [h, m] = slotStart.split(':').map(Number);
      const slotTime = new Date(now);
      slotTime.setHours(h, m, 0, 0);
      if (slotTime <= now) {
        return res.status(400).json({ error: 'Cannot book a past time slot.' });
      }
    }

    // Conflict check: ensure no active booking on same doctor/date/slot
    const conflict = await Appointment.findOne({
      doctorId,
      date,
      timeSlot,
      status: { $ne: 'cancelled' }
    });
    if (conflict) {
      return res.status(409).json({ error: 'This time slot is already booked.' });
    }

    const appointment = await Appointment.create({
      doctorId,
      patientId,
      date,
      timeSlot,
      status: 'upcoming'
    });

    res.status(201).json(appointment);
  } catch (err) {
    // Handle MongoDB duplicate key error as double-booking
    if (err.code === 11000) {
      return res.status(409).json({ error: 'This time slot is already booked.' });
    }
    res.status(500).json({ error: 'Booking failed.', details: err.message });
  }
};

exports.cancelAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found.' });

    // Only the patient or an admin can cancel
    if (appointment.patientId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to cancel this appointment.' });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ error: 'Appointment is already cancelled.' });
    }

    appointment.status = 'cancelled';
    await appointment.save();

    res.json({ message: 'Appointment cancelled.', appointment });
  } catch (err) {
    res.status(500).json({ error: 'Cancellation failed.', details: err.message });
  }
};

exports.rescheduleAppointment = async (req, res) => {
  try {
    const { date, timeSlot } = req.body;
    if (!date || !timeSlot) {
      return res.status(400).json({ error: 'New date and timeSlot are required.' });
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found.' });

    if (appointment.patientId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to reschedule this appointment.' });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot reschedule a cancelled appointment.' });
    }

    // Check conflict on new slot
    const conflict = await Appointment.findOne({
      doctorId: appointment.doctorId,
      date,
      timeSlot,
      status: { $ne: 'cancelled' }
    });
    if (conflict) {
      return res.status(409).json({ error: 'New time slot is already booked.' });
    }

    appointment.date = date;
    appointment.timeSlot = timeSlot;
    await appointment.save();

    res.json({ message: 'Appointment rescheduled.', appointment });
  } catch (err) {
    res.status(500).json({ error: 'Reschedule failed.', details: err.message });
  }
};

exports.getUserAppointments = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    // Patients can only view their own
    if (req.user.role === 'patient' && req.user.id !== userId) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    const filter = { patientId: userId };
    if (status) filter.status = status;

    const total = await Appointment.countDocuments(filter);
    const appointments = await Appointment.find(filter)
      .populate('doctorId', 'name specialization')
      .sort({ date: -1, timeSlot: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ total, page: Number(page), limit: Number(limit), appointments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch appointments.', details: err.message });
  }
};

exports.getAllAppointments = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total = await Appointment.countDocuments();
    const appointments = await Appointment.find()
      .populate('doctorId', 'name specialization')
      .populate('patientId', 'name email')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ total, page: Number(page), limit: Number(limit), appointments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch appointments.', details: err.message });
  }
};