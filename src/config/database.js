// ============================================================
// KOUTIX — MongoDB Connection
// ============================================================
const mongoose = require('mongoose')
const logger = require('./logger')

async function connectDB() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set')

  mongoose.set('strictQuery', true)

  mongoose.connection.on('connected', () => logger.info('✅ MongoDB connected'))
  mongoose.connection.on('disconnected', () => logger.warn('⚠️  MongoDB disconnected'))
  mongoose.connection.on('error', (err) => logger.error('MongoDB error:', err))

  await mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4,
  })
}

async function disconnectDB() {
  await mongoose.disconnect()
}

module.exports = { connectDB, disconnectDB }
