require('dotenv').config();
const mongoose = require('mongoose');
const Appointment = require('./server/models/Appointment');
const Doctor = require('./server/models/Doctor');
const User = require('./server/models/User');

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');

    // Drop and rebuild indexes
    try {
      await Appointment.collection.dropIndexes();
      console.log('Dropped existing indexes on Appointment');

      await Appointment.syncIndexes();
      console.log('✅ Rebuilt indexes on Appointment collection');
      console.log('Index on Appointment:', Appointment.collection.getIndexes());

      await Doctor.syncIndexes();
      console.log('✅ Rebuilt indexes on Doctor collection');

      await User.syncIndexes();
      console.log('✅ Rebuilt indexes on User collection');

      console.log('\n🎉 All indexes rebuilt successfully!');
      process.exit(0);
    } catch (err) {
      console.error('Error rebuilding indexes:', err.message);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
