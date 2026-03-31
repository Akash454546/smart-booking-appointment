/*
╔═══════════════════════════════════════════════════════════════════════════╗
║  SMART BOOKING SYSTEM - COMPLETE SOLUTION                                ║
║  Fixes: (1) Data Persistence (doctor name on refresh)                   ║
║         (2) Double Booking Prevention                                     ║
╚═══════════════════════════════════════════════════════════════════════════╝

FILE 1: server/models/Appointment.js
─────────────────────────────────────────────────────────────────────────────

ISSUE: Without unique compound index, MongoDB doesn't prevent two users from
       booking the same doctor at the same time.

SOLUTION: Unique compound index on (doctorId, date, timeSlot) filtering only
          'upcoming' appointments allows:
          - Multiple users to book different slots ✓
          - Different users at different times ✓
          - Cancelled slots to be re-booked ✓
          - PREVENTS: Two users booking same doctor/date/slot ✗

KEY FEATURES:
✓ partialFilterExpression: { status: 'upcoming' } 
  → Only enforces uniqueness on active bookings
  → Allows cancelled slots to be rebooked
  
✓ unique: true 
  → MongoDB atomically enforces this at database level
  → No race condition possible
*/

const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  timeSlot: { type: String, required: true }, // e.g. "09:00-09:30"
  status: {
    type: String,
    enum: ['upcoming', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  createdAt: { type: Date, default: Date.now }
});

// ✓ UNIQUE COMPOUND INDEX FOR DOUBLE BOOKING PREVENTION
// Guarantees no two 'upcoming' appointments exist for same doctor/date/slot
appointmentSchema.index(
  { doctorId: 1, date: 1, timeSlot: 1 },
  { 
    unique: true,
    partialFilterExpression: { status: 'upcoming' }
  }
);

module.exports = mongoose.model('Appointment', appointmentSchema);


/*
═══════════════════════════════════════════════════════════════════════════════

FILE 2: server/controllers/appointmentController.js
─────────────────────────────────────────────────────────────────────────────

ISSUE 1: Data Persistence - Doctor name disappears on refresh
  Cause: Frontend fetches appointments but doesn't receive doctor details
  Fix: Use .populate('doctorId', 'name specialization')

ISSUE 2: Double Booking
  Cause: Race condition in booking logic
  Fix: Let MongoDB unique index handle atomically, catch error code 11000

PATTERN FOR ALL APPOINTMENT FETCHES:
  await Appointment.find(...)
    .populate('doctorId', 'name specialization')  ← Include this on EVERY fetch
    .populate('patientId', 'name email')           ← Also for admin views

PATTERN FOR BOOKING:
  try {
    const appointment = await Appointment.create({...});
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'This time slot is already booked.' });
    }
    throw err;
  }
  await appointment.populate('doctorId', 'name specialization');
*/

const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');

// BOOK AN APPOINTMENT
exports.bookAppointment = async (req, res) => {
  try {
    const { doctorId, date, timeSlot } = req.body;
    const patientId = req.user.id;

    // Step 1: Validate doctor exists
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found.' });
    }

    // Step 2: Check if doctor is available on requested day
    const dayName = new Date(date + 'T00:00:00')
      .toLocaleDateString('en-US', { weekday: 'long' });
    if (!doctor.availableDays.includes(dayName)) {
      return res.status(400).json({ 
        error: `Doctor not available on ${dayName}.` 
      });
    }

    // Step 3: Prevent booking in the past
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    if (date < todayStr) {
      return res.status(400).json({ 
        error: 'Cannot book appointments in the past.' 
      });
    }

    // Step 4: Prevent booking past time slots for today
    if (date === todayStr) {
      const [slotStart] = timeSlot.split('-');
      const [h, m] = slotStart.split(':').map(Number);
      const slotTime = new Date(now);
      slotTime.setHours(h, m, 0, 0);
      if (slotTime <= now) {
        return res.status(400).json({ 
          error: 'Cannot book a past time slot.' 
        });
      }
    }

    // Step 5: Create appointment
    // The unique index will ATOMICALLY prevent double bookings
    let appointment;
    try {
      appointment = await Appointment.create({
        doctorId,
        patientId,
        date,
        timeSlot,
        status: 'upcoming'
      });
    } catch (createErr) {
      // MongoDB returns code 11000 if duplicate key (unique index violation)
      if (createErr.code === 11000) {
        return res.status(409).json({ 
          error: 'This time slot is already booked.' 
        });
      }
      throw createErr;
    }

    // Step 6: Populate doctor details before sending to frontend
    await appointment.populate('doctorId', 'name specialization');
    
    res.status(201).json(appointment);
  } catch (err) {
    console.error('Booking error:', err.message);
    res.status(500).json({ 
      error: 'Booking failed.', 
      details: err.message 
    });
  }
};

// GET USER'S APPOINTMENTS (Fixes data persistence issue)
exports.getUserAppointments = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    // Patients can only view their own appointments
    if (req.user.role === 'patient' && req.user.id !== userId) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    const filter = { patientId: userId };
    if (status) filter.status = status;

    const total = await Appointment.countDocuments(filter);
    
    // ✓ KEY FIX: .populate('doctorId') ensures doctor details are included
    // This prevents "Doctor name disappears on refresh" bug
    const appointments = await Appointment.find(filter)
      .populate('doctorId', 'name specialization')
      .sort({ date: -1, timeSlot: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ 
      total, 
      page: Number(page), 
      limit: Number(limit), 
      appointments 
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to fetch appointments.', 
      details: err.message 
    });
  }
};

// CANCEL AN APPOINTMENT
exports.cancelAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    // Authorization: only patient or admin
    if (appointment.patientId.toString() !== req.user.id && 
        req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Not authorized to cancel this appointment.' 
      });
    }

    // Prevent cancelling already cancelled appointment
    if (appointment.status === 'cancelled') {
      return res.status(400).json({ 
        error: 'Appointment is already cancelled.' 
      });
    }

    // Change status to cancelled (doesn't delete the record)
    appointment.status = 'cancelled';
    await appointment.save();

    res.json({ message: 'Appointment cancelled.', appointment });
  } catch (err) {
    res.status(500).json({ 
      error: 'Cancellation failed.', 
      details: err.message 
    });
  }
};

// RESCHEDULE AN APPOINTMENT
exports.rescheduleAppointment = async (req, res) => {
  try {
    const { date, timeSlot } = req.body;
    
    if (!date || !timeSlot) {
      return res.status(400).json({ 
        error: 'New date and timeSlot are required.' 
      });
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    // Authorization
    if (appointment.patientId.toString() !== req.user.id && 
        req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Not authorized to reschedule this appointment.' 
      });
    }

    // Cannot reschedule cancelled appointments
    if (appointment.status === 'cancelled') {
      return res.status(400).json({ 
        error: 'Cannot reschedule a cancelled appointment.' 
      });
    }

    // Check if new slot conflicts with another appointment
    const conflict = await Appointment.findOne({
      doctorId: appointment.doctorId,
      date,
      timeSlot,
      status: { $ne: 'cancelled' },
      _id: { $ne: appointment._id } // Exclude current appointment
    });
    
    if (conflict) {
      return res.status(409).json({ 
        error: 'New time slot is already booked.' 
      });
    }

    // Update appointment with new slot
    appointment.date = date;
    appointment.timeSlot = timeSlot;
    await appointment.save();

    // ✓ Populate doctor details before returning
    await appointment.populate('doctorId', 'name specialization');
    
    res.json({ message: 'Appointment rescheduled.', appointment });
  } catch (err) {
    // Handle duplicate key if race condition occurs
    if (err.code === 11000) {
      return res.status(409).json({ 
        error: 'New time slot is already booked.' 
      });
    }
    res.status(500).json({ 
      error: 'Reschedule failed.', 
      details: err.message 
    });
  }
};

// GET ALL APPOINTMENTS (Admin view)
exports.getAllAppointments = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const total = await Appointment.countDocuments();
    
    // ✓ Populate both doctor AND patient details
    const appointments = await Appointment.find()
      .populate('doctorId', 'name specialization')
      .populate('patientId', 'name email')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ 
      total, 
      page: Number(page), 
      limit: Number(limit), 
      appointments 
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to fetch appointments.', 
      details: err.message 
    });
  }
};


/*
═══════════════════════════════════════════════════════════════════════════════

FILE 3: client/app.js (Relevant sections for appointment display)
─────────────────────────────────────────────────────────────────────────────

ISSUE: Doctor name shows during booking but disappears after refresh

ROOT CAUSE: Frontend tries to display doctor.name but appointment.doctorId 
            was an ID string, not the populated object

SOLUTION: Backend populates doctor data
         Frontend correctly extracts: a.doctorId.name

KEY PATTERN:
  const doc = a.doctorId || {};  ← a.doctorId is now { _id, name, specialization }
  doc.name                        ← Safely access name from populated object
  doc.specialization              ← Also available from populate
*/

// ✓ FETCH APPOINTMENTS (with populated doctor data)
async function loadAppointments(page = 1) {
  apptPage = page;
  const list = $('appointmentsList');
  list.innerHTML = '<div class="loading">Loading appointments...</div>';

  try {
    const status = $('filterStatus').value;
    let q = `/api/appointments/${currentUser.id}?page=${page}&limit=10`;
    if (status) q += `&status=${status}`;

    // Backend returns appointments with populated doctorId
    const data = await api(q);
    renderAppointments(data, list, $('appointmentsPagination'), page, false);
  } catch (err) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128542;</div>Failed to load appointments.</div>';
  }
}

// ✓ RENDER APPOINTMENTS (handle populated doctor object)
function renderAppointments(data, container, pagContainer, page, isAdmin) {
  if (!data.appointments.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128197;</div>No appointments found.</div>';
    pagContainer.innerHTML = '';
    return;
  }

  container.innerHTML = data.appointments.map(a => {
    // ✓ a.doctorId is now a populated object with { _id, name, specialization }
    // The || {} fallback handles edge cases where populate might fail
    const doc = a.doctorId || {};
    
    const statusClass = `status-${a.status}`;
    const canCancel = a.status === 'upcoming';
    const canReschedule = a.status === 'upcoming';
    const patient = a.patientId || {};

    return `
      <div class="appointment-card">
        <div class="appt-info">
          <!-- ✓ FIX: doc.name now displays correctly after refresh -->
          <h4>
            ${escapeHtml(doc.name || 'Doctor')} 
            ${isAdmin ? `— Patient: ${escapeHtml(patient.name || '')}` : ''}
          </h4>
          
          <!-- ✓ doc.specialization also available from populated data -->
          <p>
            ${escapeHtml(doc.specialization || '')} 
            &middot; ${a.date} 
            &middot; ${a.timeSlot}
          </p>
          
          <span class="status-badge ${statusClass}">${a.status}</span>
        </div>
        
        <div class="appt-actions">
          ${canReschedule ? `
            <button class="btn btn-outline btn-sm" 
                    onclick="openReschedule('${a._id}', '${doc._id || a.doctorId || ''}')">
              Reschedule
            </button>
          ` : ''}
          ${canCancel ? `
            <button class="btn btn-danger btn-sm" 
                    onclick="cancelAppointment('${a._id}')">
              Cancel
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  // PAGINATION
  const totalPages = Math.ceil(data.total / data.limit);
  if (totalPages > 1) {
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
      html += `
        <button class="${i === page ? 'active' : ''}" 
                onclick="${isAdmin ? 'loadAdminAppointments' : 'loadAppointments'}(${i})">
          ${i}
        </button>
      `;
    }
    pagContainer.innerHTML = html;
  } else {
    pagContainer.innerHTML = '';
  }
}


/*
═══════════════════════════════════════════════════════════════════════════════

VERIFICATION CHECKLIST
─────────────────────────────────────────────────────────────────────────────

✓ Data Persistence Fix:
  - Backend: All Appointment.find() queries use .populate('doctorId')
  - Frontend: Renders a.doctorId.name directly
  - Result: Doctor name persists after page refresh

✓ Double Booking Prevention:
  - Database: Unique compound index on (doctorId, date, timeSlot)
  - Controller: Catches error code 11000 and returns 409 Conflict
  - Result: MongoDB atomically prevents two users booking same slot

✓ Constraint Handle - Cancelled Status:
  - Index uses partialFilterExpression: { status: 'upcoming' }
  - Cancelled slots are NOT unique-constrained
  - Allows rebooking of cancelled slots ✓

✓ All Database Operations:
  - bookAppointment: Creates appointment, populates doctor
  - getUserAppointments: Fetches with .populate('doctorId')
  - rescheduleAppointment: Updates and populates doctor
  - getAllAppointments: Populates both doctor and patient
  - cancelAppointment: Works correctly

✓ Async/Await Pattern:
  - All database operations use async/await ✓
  - Error handling with try/catch ✓

═══════════════════════════════════════════════════════════════════════════════
*/
