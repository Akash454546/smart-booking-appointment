const Doctor = require('../models/Doctor');
const TimeSlot = require('../models/TimeSlot');
const Appointment = require('../models/Appointment');

// Generate time slots for a doctor on a given date
function generateSlots(startTime, endTime, durationMin) {
  const slots = [];
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  let current = startH * 60 + startM;
  const end = endH * 60 + endM;

  while (current + durationMin <= end) {
    const from = `${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`;
    const to = `${String(Math.floor((current + durationMin) / 60)).padStart(2, '0')}:${String((current + durationMin) % 60).padStart(2, '0')}`;
    slots.push(`${from}-${to}`);
    current += durationMin;
  }
  return slots;
}

exports.getAllDoctors = async (req, res) => {
  try {
    const { specialization, search } = req.query;
    const filter = {};

    if (specialization) {
      filter.specialization = { $regex: specialization, $options: 'i' };
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { specialization: { $regex: search, $options: 'i' } }
      ];
    }

    const doctors = await Doctor.find(filter).sort({ name: 1 });
    res.json(doctors);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch doctors.', details: err.message });
  }
};

exports.getDoctorById = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
    res.json(doctor);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch doctor.', details: err.message });
  }
};

exports.getAvailableSlots = async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date query param required (YYYY-MM-DD).' });
    }

    const doctor = await Doctor.findById(id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });

    // Check if the date falls on an available day
    const dayName = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
    if (!doctor.availableDays.includes(dayName)) {
      return res.json({ slots: [], message: `Doctor not available on ${dayName}.` });
    }

    // Generate all possible slots
    const allSlots = generateSlots(doctor.startTime, doctor.endTime, doctor.slotDuration);

    // Find booked slots (non-cancelled appointments)
    const bookedAppointments = await Appointment.find({
      doctorId: id,
      date,
      status: { $ne: 'cancelled' }
    });
    const bookedSet = new Set(bookedAppointments.map(a => a.timeSlot));

    // Filter out past slots if date is today
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const slots = allSlots.map(slot => {
      const isBooked = bookedSet.has(slot);
      let isPast = false;

      if (date === todayStr) {
        const [slotStart] = slot.split('-');
        const [h, m] = slotStart.split(':').map(Number);
        const slotTime = new Date(now);
        slotTime.setHours(h, m, 0, 0);
        isPast = slotTime <= now;
      } else if (date < todayStr) {
        isPast = true;
      }

      return { slot, isBooked, isPast, available: !isBooked && !isPast };
    });

    res.json({ doctor: doctor.name, date, slots });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch slots.', details: err.message });
  }
};
exports.createDoctor = async (req, res) => {
  try {
    const doctor = await Doctor.create(req.body);
    res.status(201).json(doctor);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create doctor.', details: err.message });
  }
};

