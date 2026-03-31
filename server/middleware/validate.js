/**
 * Generic validation middleware factory.
 * Takes a Joi-like check function and returns Express middleware.
 * We use simple manual validation here to avoid extra deps.
 */

function validateBooking(req, res, next) {
  const { doctorId, date, timeSlot } = req.body;
  const errors = [];

  if (!doctorId) errors.push('doctorId is required');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('date must be YYYY-MM-DD');
  if (!timeSlot) errors.push('timeSlot is required');

  if (errors.length) return res.status(400).json({ errors });
  next();
}

function validateRegistration(req, res, next) {
  const { name, email, password, phone } = req.body;
  const errors = [];

  if (!name || name.trim().length < 2) errors.push('Name must be at least 2 characters');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Valid email is required');
  if (!password || password.length < 6) errors.push('Password must be at least 6 characters');
  if (!phone) errors.push('Phone is required');

  if (errors.length) return res.status(400).json({ errors });
  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body;
  const errors = [];

  