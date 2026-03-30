const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const auth = require('../middleware/auth');

router.get('/', doctorController.getAllDoctors);
router.get('/:id', doctorController.getDoctorById);
router.get('/:id/slots', doctorController.getAvailableSlots);
router.post('/', auth, doctorController.createDoctor); // admin-only in production

module.exports = router;
