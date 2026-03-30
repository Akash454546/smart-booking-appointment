const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const auth = require('../middleware/auth');
const { validateBooking } = require('../middleware/validate');

router.post('/book', auth, validateBooking, appointmentController.bookAppointment);
router.put('/cancel/:id', auth, appointmentController.cancelAppointment);
router.put('/reschedule/:id', auth, appointmentController.rescheduleAppointment);
router.get('/all', auth, appointmentController.getAllAppointments);
router.get('/:userId', auth, appointmentController.getUserAppointments);

module.exports = router;
