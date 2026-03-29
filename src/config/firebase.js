// ============================================================
// KOUTIX — Firebase Admin SDK
// ============================================================
const admin = require('firebase-admin')
const logger = require('./logger')

function initFirebaseAdmin() {
  if (admin.apps.length > 0) return // Already initialized

  try {
    let serviceAccount

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      serviceAccount = require(require('path').resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH))
    } else {
      throw new Error('No Firebase credentials configured')
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })

    logger.info('✅ Firebase Admin initialized')
  } catch (error) {
    logger.error('Firebase Admin init failed:', error)
    throw error
  }
}

// ── Custom Claims ────────────────────────────────────────
async function setUserClaims(uid, claims) {
  await admin.auth().setCustomUserClaims(uid, claims)
}

async function getUserClaims(uid) {
  const user = await admin.auth().getUser(uid)
  return user.customClaims || {}
}

async function revokeUserTokens(uid) {
  await admin.auth().revokeRefreshTokens(uid)
}

async function deleteFirebaseUser(uid) {
  await admin.auth().deleteUser(uid)
}

async function verifyIdToken(token) {
  return admin.auth().verifyIdToken(token)
}

// ── FCM Push Notifications ───────────────────────────────
async function sendPushNotification({ token, title, body, data = {} }) {
  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      data,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    })
  } catch (error) {
    logger.error('FCM send failed:', error)
  }
}

async function sendMulticastNotification({ tokens, title, body, data = {} }) {
  if (!tokens.length) return
  try {
    const chunks = []
    for (let i = 0; i < tokens.length; i += 500) {
      chunks.push(tokens.slice(i, i + 500))
    }
    await Promise.all(
      chunks.map((chunk) =>
        admin.messaging().sendEachForMulticast({
          tokens: chunk,
          notification: { title, body },
          data,
          android: { priority: 'high' },
        })
      )
    )
  } catch (error) {
    logger.error('FCM multicast failed:', error)
  }
}

module.exports = {
  admin,
  initFirebaseAdmin,
  setUserClaims,
  getUserClaims,
  revokeUserTokens,
  deleteFirebaseUser,
  verifyIdToken,
  sendPushNotification,
  sendMulticastNotification,
}
