#!/usr/bin/env node
/* eslint-disable no-console */
// ============================================================
// SelfPay — Superadmin Seeder
// Run: node scripts/seed-superadmin.js
// ============================================================
require('dotenv').config()

const mongoose = require('mongoose')
const { initFirebaseAdmin, admin, setUserClaims } = require('../src/config/firebase')

const SUPERADMIN_EMAIL    = process.env.SUPERADMIN_EMAIL
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD

async function seed() {
  if (!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD) {
    console.error('❌ Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in .env')
    process.exit(1)
  }

  // Connect to MongoDB
  await mongoose.connect(process.env.MONGODB_URI)
  console.log('✅ MongoDB connected')

  // Init Firebase
  initFirebaseAdmin()

  // Require model AFTER mongoose connect
  const SuperAdmin = require('../src/models/SuperAdmin')

  let uid

  // Create or get Firebase user
  try {
    const existingUser = await admin.auth().getUserByEmail(SUPERADMIN_EMAIL)
    uid = existingUser.uid
    console.log(`ℹ️  Firebase user already exists: ${uid}`)
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      const newUser = await admin.auth().createUser({
        email: SUPERADMIN_EMAIL,
        password: SUPERADMIN_PASSWORD,
        displayName: 'Super Admin',
      })
      uid = newUser.uid
      console.log(`✅ Firebase user created: ${uid}`)
    } else {
      throw err
    }
  }

  // Set custom claims
  await setUserClaims(uid, { role: 'superadmin' })
  console.log('✅ Custom claims set: { role: \'superadmin\' }')

  // Upsert in MongoDB
  await SuperAdmin.findOneAndUpdate(
    { email: SUPERADMIN_EMAIL },
    {
      email: SUPERADMIN_EMAIL,
      firebaseUid: uid,
      role: 'superadmin',
      isActive: true,
    },
    { upsert: true, new: true }
  )
  console.log('✅ SuperAdmin record upserted in MongoDB')

  await mongoose.disconnect()
  console.log('\n🎉 Superadmin seeded successfully!')
  console.log(`   Email:    ${SUPERADMIN_EMAIL}`)
  console.log('   Password: (as set in .env)')
  process.exit(0)
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
