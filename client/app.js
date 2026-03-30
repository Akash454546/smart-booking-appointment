/* ================================================================
   SmartBook — Frontend Application (Vanilla JS)
   ================================================================ */

const API = ''; // same origin

// ==================== STATE ====================
let token = localStorage.getItem('token') || null;
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let allDoctors = [];
let selectedDoctor = null;
let selectedSlot = null;
let selectedDate = null;
let rescheduleApptId = null;
let rescheduleDocId = null;
let rescheduleSlot = null;

// ==================== HELPERS ====================
function headers(json = true) {
  const h = {};
  if (json) h['Content-Type'] = 'application/json';
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, { headers: headers(), ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

function $(id) { return document.getElementById(id); }
function showToast(msg, type = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ==================== AUTH STATE ====================
function updateAuthUI() {
  const isLoggedIn = !!token;
  $('btnShowLogin').style.display = isLoggedIn ? 'none' : '';
  $('btnShowRegister').style.display = isLoggedIn ? 'none' : '';
  $('btnLogout').style.display = isLoggedIn ? '' : 'none';
  $('userGreeting').style.display = isLoggedIn ? '' : 'none';
  if (isLoggedIn && currentUser) {
    $('userGreeting').textContent = `Hi, ${currentUser.name}`;
  }

  document.querySelectorAll('.auth-only').forEach(el => {
    el.style.display = isLoggedIn ? '' : 'none';
  });
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = (isLoggedIn && currentUser?.role === 'admin') ? '' : 'none';
  });
}

function setAuth(data) {
  token = data.token;
  currentUser = data.user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(currentUser));
  updateAuthUI();
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  updateAuthUI();
  navigateTo('home');
  showToast('Logged out', 'info');
}

// ==================== NAVIGATION ====================
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = $(`page-${page}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const link = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (link) link.classList.add('active');

  // Close mobile menu
  $('navLinks').classList.remove('open');

  // Load data based on page
  if (page === 'doctors') loadDoctors();
  if (page === 'appointments' && token) loadAppointments();
  if (page === 'admin' && token) loadAdminAppointments();
}

// ==================== DOCTORS ====================
async function loadDoctors() {
  const grid = $('doctorsGrid');
  grid.innerHTML = '<div class="loading">Loading doctors...</div>';

  try {
    const search = $('searchDoctor').value;
    const spec = $('filterSpecialization').value;
    let q = '/api/doctors?';
    if (search) q += `search=${encodeURIComponent(search)}&`;
    if (spec) q += `specialization=${encodeURIComponent(spec)}`;

    allDoctors = await api(q);
    renderDoctors(allDoctors);
    populateSpecFilter(allDoctors);
  } catch (err) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128542;</div>Failed to load doctors.</div>';
  }
}

function populateSpecFilter(doctors) {
  const sel = $('filterSpecialization');
  const specs = [...new Set(doctors.map(d => d.specialization))].sort();
  const current = sel.value;
  sel.innerHTML = '<option value="">All Specializations</option>';
  specs.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    if (s === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

function renderDoctors(doctors) {
  const grid = $('doctorsGrid');
  if (!doctors.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128269;</div>No doctors found.</div>';
    return;
  }

  grid.innerHTML = doctors.map(d => `
    <div class="doctor-card" onclick="selectDoctor('${d._id}')">
      <div class="doctor-avatar">${d.name.charAt(0)}</div>
      <h3>${escapeHtml(d.name)}</h3>
      <span class="specialization">${escapeHtml(d.specialization)}</span>
      <p class="info">&#128197; ${d.availableDays.join(', ')}</p>
      <p class="info">&#128336; ${d.startTime} - ${d.endTime} &middot; ${d.slotDuration}min slots</p>
    </div>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

function selectDoctor(id) {
  if (!token) {
    showToast('Please login to book an appointment', 'error');
    $('loginModal').classList.add('show');
    return;
  }

  selectedDoctor = allDoctors.find(d => d._id === id);
  if (!selectedDoctor) return;

  $('doctorsGrid').parentElement.style.display = 'none';
  const section = $('bookingSection');
  section.style.display = 'block';

  $('bookingHeader').innerHTML = `
    <h3>${escapeHtml(selectedDoctor.name)}</h3>
    <span class="specialization">${escapeHtml(selectedDoctor.specialization)}</span>
    <p class="info" style="margin-top:0.5rem;">&#128197; ${selectedDoctor.availableDays.join(', ')} &middot; ${selectedDoctor.startTime} - ${selectedDoctor.endTime}</p>
  `;

  // Set min date to today
  const today = new Date().toISOString().split('T')[0];
  $('bookingDate').min = today;
  $('bookingDate').value = '';
  $('slotsGrid').innerHTML = '<p class="muted">Pick a date to see available slots.</p>';
  $('bookingConfirm').style.display = 'none';
  $('bookingError').textContent = '';
  $('bookingSuccess').textContent = '';
  selectedSlot = null;
  selectedDate = null;
}

async function loadSlots(doctorId, date) {
  const grid = $('slotsGrid');
  grid.innerHTML = '<div class="loading">Loading slots...</div>';
  $('bookingConfirm').style.display = 'none';
  $('bookingError').textContent = '';
  $('bookingSuccess').textContent = '';
  selectedSlot = null;

  try {
    const data = await api(`/api/doctors/${doctorId}/slots?date=${date}`);
    if (data.message) {
      grid.innerHTML = `<p class="muted">${escapeHtml(data.message)}</p>`;
      return;
    }

    if (!data.slots || !data.slots.length) {
      grid.innerHTML = '<p class="muted">No slots for this date.</p>';
      return;
    }

    grid.innerHTML = data.slots.map(s => {
      const disabled = !s.available ? 'disabled' : '';
      const cls = s.isPast ? 'past' : (s.isBooked ? '' : '');
      const label = s.isBooked ? `${s.slot} (Booked)` : (s.isPast ? `${s.slot} (Past)` : s.slot);
      return `<button class="slot-btn ${cls}" ${disabled} onclick="pickSlot(this, '${s.slot}')">${label}</button>`;
    }).join('');
  } catch (err) {
    grid.innerHTML = '<p class="muted">Failed to load slots.</p>';
  }
}

function pickSlot(btn, slot) {
  document.querySelectorAll('#slotsGrid .slot-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedSlot = slot;
  selectedDate = $('bookingDate').value;

  $('bookingSummary').textContent = `Book ${selectedDoctor.name} on ${selectedDate} at ${selectedSlot}?`;
  $('bookingConfirm').style.display = 'flex';
}

async function confirmBooking() {
  const btn = $('btnConfirmBooking');
  btn.disabled = true;
  btn.textContent = 'Booking...';
  $('bookingError').textContent = '';
  $('bookingSuccess').textContent = '';

  try {
    await api('/api/appointments/book', {
      method: 'POST',
      body: JSON.stringify({
        doctorId: selectedDoctor._id,
        date: selectedDate,
        timeSlot: selectedSlot
      })
    });

    $('bookingSuccess').textContent = 'Appointment booked successfully!';
    $('bookingConfirm').style.display = 'none';
    showToast('Appointment booked!', 'success');

    // Refresh slots
    loadSlots(selectedDoctor._id, selectedDate);
  } catch (err) {
    $('bookingError').textContent = err.error || 'Booking failed.';
    showToast(err.error || 'Booking failed', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm Booking';
  }
}

// ==================== APPOINTMENTS ====================
let apptPage = 1;
async function loadAppointments(page = 1) {
  apptPage = page;
  const list = $('appointmentsList');
  list.innerHTML = '<div class="loading">Loading appointments...</div>';

  try {
    const status = $('filterStatus').value;
    let q = `/api/appointments/${currentUser.id}?page=${page}&limit=10`;
    if (status) q += `&status=${status}`;

    const data = await api(q);
    renderAppointments(data, list, $('appointmentsPagination'), page, false);
  } catch (err) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128542;</div>Failed to load appointments.</div>';
  }
}

function renderAppointments(data, container, pagContainer, page, isAdmin) {
  if (!data.appointments.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128197;</div>No appointments found.</div>';
    pagContainer.innerHTML = '';
    return;
  }

  container.innerHTML = data.appointments.map(a => {
    const doc = a.doctorId || {};
    const statusClass = `status-${a.status}`;
    const canCancel = a.status === 'upcoming';
    const canReschedule = a.status === 'upcoming';
    const patient = a.patientId || {};

    return `
      <div class="appointment-card">
        <div class="appt-info">
          <h4>${escapeHtml(doc.name || 'Doctor')} ${isAdmin ? `— Patient: ${escapeHtml(patient.name || '')}` : ''}</h4>
          <p>${escapeHtml(doc.specialization || '')} &middot; ${a.date} &middot; ${a.timeSlot}</p>
          <span class="status-badge ${statusClass}">${a.status}</span>
        </div>
        <div class="appt-actions">
          ${canReschedule ? `<button class="btn btn-outline btn-sm" onclick="openReschedule('${a._id}', '${doc._id || a.doctorId || ''}')">Reschedule</button>` : ''}
          ${canCancel ? `<button class="btn btn-danger btn-sm" onclick="cancelAppointment('${a._id}')">Cancel</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Pagination
  const totalPages = Math.ceil(data.total / data.limit);
  if (totalPages > 1) {
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="${i === page ? 'active' : ''}" onclick="${isAdmin ? 'loadAdminAppointments' : 'loadAppointments'}(${i})">${i}</button>`;
    }
    pagContainer.innerHTML = html;
  } else {
    pagContainer.innerHTML = '';
  }
}

async function cancelAppointment(id) {
  if (!confirm('Cancel this appointment?')) return;
  try {
    await api(`/api/appointments/cancel/${id}`, { method: 'PUT' });
    showToast('Appointment cancelled', 'success');
    loadAppointments(apptPage);
  } catch (err) {
    showToast(err.error || 'Failed to cancel', 'error');
  }
}

// ==================== RESCHEDULE ====================
function openReschedule(apptId, docId) {
  rescheduleApptId = apptId;
  rescheduleDocId = docId;
  rescheduleSlot = null;

  $('rescheduleDate').value = '';
  $('rescheduleDate').min = new Date().toISOString().split('T')[0];
  $('rescheduleSlotsContainer').innerHTML = '<p class="muted">Pick a new date.</p>';
  $('rescheduleError').textContent = '';
  $('btnConfirmReschedule').disabled = true;
  $('rescheduleModal').classList.add('show');
}

async function loadRescheduleSlots(date) {
  const grid = $('rescheduleSlotsContainer');
  grid.innerHTML = '<div class="loading">Loading...</div>';
  rescheduleSlot = null;
  $('btnConfirmReschedule').disabled = true;

  try {
    const data = await api(`/api/doctors/${rescheduleDocId}/slots?date=${date}`);
    if (!data.slots || !data.slots.length || data.message) {
      grid.innerHTML = `<p class="muted">${data.message || 'No slots.'}</p>`;
      return;
    }

    grid.innerHTML = data.slots.map(s => {
      const disabled = !s.available ? 'disabled' : '';
      const label = s.isBooked ? `${s.slot} (Booked)` : (s.isPast ? `${s.slot} (Past)` : s.slot);
      return `<button class="slot-btn" ${disabled} onclick="pickRescheduleSlot(this, '${s.slot}')">${label}</button>`;
    }).join('');
  } catch {
    grid.innerHTML = '<p class="muted">Failed to load slots.</p>';
  }
}

function pickRescheduleSlot(btn, slot) {
  $('rescheduleSlotsContainer').querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  rescheduleSlot = slot;
  $('btnConfirmReschedule').disabled = false;
}

async function confirmReschedule() {
  const date = $('rescheduleDate').value;
  if (!date || !rescheduleSlot) return;
  $('rescheduleError').textContent = '';

  try {
    await api(`/api/appointments/reschedule/${rescheduleApptId}`, {
      method: 'PUT',
      body: JSON.stringify({ date, timeSlot: rescheduleSlot })
    });
    $('rescheduleModal').classList.remove('show');
    showToast('Appointment rescheduled!', 'success');
    loadAppointments(apptPage);
  } catch (err) {
    $('rescheduleError').textContent = err.error || 'Reschedule failed.';
  }
}

// ==================== ADMIN ====================
let adminPage = 1;
async function loadAdminAppointments(page = 1) {
  adminPage = page;
  const list = $('adminAppointmentsList');
  list.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const data = await api(`/api/appointments/all?page=${page}&limit=20`);
    renderAppointments(data, list, $('adminPagination'), page, true);
  } catch {
    list.innerHTML = '<div class="empty-state">Failed to load.</div>';
  }
}

async function addDoctor(e) {
  e.preventDefault();
  $('addDoctorError').textContent = '';
  $('addDoctorSuccess').textContent = '';

  const days = [...$('docDays').querySelectorAll('input:checked')].map(c => c.value);
  if (!days.length) {
    $('addDoctorError').textContent = 'Select at least one available day.';
    return;
  }

  const body = {
    name: $('docName').value,
    specialization: $('docSpec').value,
    email: $('docEmail').value,
    phone: $('docPhone').value,
    availableDays: days,
    startTime: $('docStart').value || '09:00',
    endTime: $('docEnd').value || '17:00',
    slotDuration: Number($('docSlotDur').value) || 30
  };

  try {
    await api('/api/doctors', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    $('addDoctorSuccess').textContent = 'Doctor added!';
    showToast('Doctor added', 'success');
    e.target.reset();
  } catch (err) {
    $('addDoctorError').textContent = err.error || err.details || 'Failed.';
  }
}

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();

  // Navigation
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const page = link.dataset.page;
      if ((page === 'appointments' || page === 'admin') && !token) {
        showToast('Please login first', 'error');
        $('loginModal').classList.add('show');
        return;
      }
      navigateTo(page);
    });
  });

  // Hamburger
  $('hamburger').addEventListener('click', () => {
    $('navLinks').classList.toggle('open');
  });

  // Auth buttons
  $('btnShowLogin').addEventListener('click', () => $('loginModal').classList.add('show'));
  $('btnShowRegister').addEventListener('click', () => $('registerModal').classList.add('show'));
  $('btnLogout').addEventListener('click', logout);

  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.close;
      $(id).classList.remove('show');
    });
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('show');
    });
  });

  // Login
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginError').textContent = '';
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: $('loginEmail').value,
          password: $('loginPassword').value
        })
      });
      setAuth(data);
      $('loginModal').classList.remove('show');
      showToast('Welcome back!', 'success');
    } catch (err) {
      $('loginError').textContent = err.error || 'Login failed.';
    }
  });

  // Register
  $('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('registerError').textContent = '';
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: $('regName').value,
          email: $('regEmail').value,
          phone: $('regPhone').value,
          password: $('regPassword').value
        })
      });
      setAuth(data);
      $('registerModal').classList.remove('show');
      showToast('Account created!', 'success');
    } catch (err) {
      $('registerError').textContent = err.error || err.errors?.join(', ') || 'Registration failed.';
    }
  });

  // Doctor search / filter
  let searchTimer;
  $('searchDoctor').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadDoctors, 400);
  });
  $('filterSpecialization').addEventListener('change', loadDoctors);

  // Back to doctors
  $('btnBackToDoctors').addEventListener('click', () => {
    $('bookingSection').style.display = 'none';
    $('doctorsGrid').parentElement.style.display = '';
  });

  // Date picker for booking
  $('bookingDate').addEventListener('change', () => {
    const date = $('bookingDate').value;
    if (date && selectedDoctor) loadSlots(selectedDoctor._id, date);
  });

  // Confirm booking
  $('btnConfirmBooking').addEventListener('click', confirmBooking);

  // Appointment status filter
  $('filterStatus').addEventListener('change', () => loadAppointments(1));

  // Reschedule
  $('rescheduleDate').addEventListener('change', () => {
    const date = $('rescheduleDate').value;
    if (date) loadRescheduleSlots(date);
  });
  $('btnConfirmReschedule').addEventListener('click', confirmReschedule);

  // Admin: Add Doctor
  $('addDoctorForm').addEventListener('submit', addDoctor);
});