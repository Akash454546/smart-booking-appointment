/**
 * Seed script — run once to populate the database with sample doctors.
 * Usage: node seed.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Doctor = require('./server/models/Doctor');
const User = require('./server/models/User');

const doctors = [
  {
    name: 'Dr. Aisha Patel',
    specialization: 'Cardiology',
    email: 'aisha.patel@clinic.com',
    phone: '9876543210',
    availableDays: ['Monday', 'Wednesday', 'Friday'],
    slotDuration: 30,
    startTime: '09:00',
    endTime: '17:00'
  },
  {
    name: 'Dr. Rajesh Kumar',
    specialization: 'Dermatology',
    email: 'rajesh.kumar@clinic.com',
    phone: '9876543211',
    availableDays: ['Monday', 'Tuesday', 'Thursday', 'Saturday'],
    slotDuration: 20,
    startTime: '10:00',
    endTime: '16:00'
  },
  {
    name: 'Dr. Priya Sharma',
    specialization: 'Pediatrics',
    email: 'priya.sharma@clinic.com',
    phone: '9876543212',
    availableDays: ['Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    slotDuration: 30,
    startTime: '08:00',
    endTime: '14:00'
  },
  {
    name: 'Dr. Vikram Singh',
    specialization: 'Orthopedics',
    email: 'vikram.singh@clinic.com',
    phone: '9876543213',
    availableDays: ['Monday', 'Wednesday', 'Friday', 'Saturday'],
    slotDuration: 30,
    startTime: '09:00',
    endTime: '18:00'
  },
  {
    name: 'Dr. Meera Desai',
    specialization: 'Neurology',
    email: 'meera.desai@clinic.com',
    phone: '9876543214',
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    slotDuration: 45,
    startTime: '10:00',
    endTime: '16:00'
  },
  {
    name: 'Dr. Arjun Reddy',
    specialization: 'General Medicine',
    email: 'arjun.reddy@clinic.com',
    phone: '9876543215',
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    slotDuration: 20,
    startTime: '08:00',
    endTime: '20:00'
  }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await Doctor.deleteMany({});
    console.log('Cleared existing doctors');

    // Insert doctors
    const inserted = await Doctor.insertMany(doctors);
    console.log(`Inserted ${inserted.length} doctors`);

    // Create a demo patient account
    const existingUser = await User.findOne({ email: 'patient@demo.com' });
    if (!existingUser) {
      await User.create({
        name: 'Demo Patient',
        email: 'patient@demo.com',
        phone: '1234567890',
        passwordHash: 'password123',
        role: 'patient'
      });
      console.log('Created demo patient (patient@demo.com / password123)');
    }

    console.log('\nSeed complete!');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
