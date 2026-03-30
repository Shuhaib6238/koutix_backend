// ============================================================
// KOUTIX — Users Controller
// ============================================================
const crypto = require('crypto')
const { User, Store } = require('../models')
const { success, successList, error, getPaginationParams, generateInviteToken } = require('../utils')
const { sendInviteEmail } = require('../services/notification/email')
const { revokeUserTokens } = require('../config/firebase')
const logger = require('../config/logger')

async function inviteUser(req, res, next) {
  try {
    const { email, role, storeId } = req.body
    const inviter = req.user

    const existing = await User.findOne({ email, isActive: true })
    if (existing) {
      return error(res, 'User with this email already exists and is active', 409)
    }

    let storeName
    if (storeId) {
      const store = await Store.findById(storeId)
      if (!store) {
        return error(res, 'Store not found', 404)
      }
      storeName = store.name
    }

    const token = generateInviteToken()
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex')

    await User.findOneAndUpdate(
      { email },
      {
        email,
        role,
        storeId:       storeId || undefined,
        chainId:       inviter.chainId,
        isActive:      false,
        inviteToken:   hashedToken,
        inviteExpires: new Date(Date.now() + 48 * 60 * 60 * 1000),
        name:          email,
      },
      { upsert: true, new: true }
    )

    await sendInviteEmail({
      to:          email,
      storeName,
      role:        role === 'chainManager' ? 'Chain Manager' : 'Branch Manager',
      inviteToken: token,
      inviterName: inviter.name,
    })

    logger.info(`Invite sent: ${email} as ${role} by ${inviter.email}`)
    return success(res, { inviteToken: token }, 200, 'Invitation sent')
  } catch (err) { next(err) }
}

async function resendInvite(req, res, next) {
  try {
    const user = await User.findById(req.params.id)
    if (!user || user.isActive) {
      return error(res, 'User not found or already active', 400)
    }

    const token = generateInviteToken()
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex')

    user.inviteToken   = hashedToken
    user.inviteExpires = new Date(Date.now() + 48 * 60 * 60 * 1000)
    await user.save()

    const store = user.storeId ? await Store.findById(user.storeId) : null

    await sendInviteEmail({
      to:          user.email,
      storeName:   store?.name,
      role:        user.role === 'chainManager' ? 'Chain Manager' : 'Branch Manager',
      inviteToken: token,
    })

    return success(res, null, 200, 'Invite resent')
  } catch (err) { next(err) }
}

async function deactivateUser(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true })
    if (!user) {
      return error(res, 'User not found', 404)
    }
    if (user.firebaseUid) {
      await revokeUserTokens(user.firebaseUid)
    }
    return success(res, user)
  } catch (err) { next(err) }
}

async function activateUser(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true })
    if (!user) {
      return error(res, 'User not found', 404)
    }
    return success(res, user)
  } catch (err) { next(err) }
}

async function getChainUsers(req, res, next) {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query)
    const [users, total] = await Promise.all([
      User.find({ chainId: req.params.chainId }).sort(sort).skip(skip).limit(limit).select('-inviteToken'),
      User.countDocuments({ chainId: req.params.chainId }),
    ])
    return successList(res, users, { page, limit, total })
  } catch (err) { next(err) }
}

async function getStoreUsers(req, res, next) {
  try {
    const users = await User.find({ storeId: req.params.storeId }).select('-inviteToken')
    return success(res, users)
  } catch (err) { next(err) }
}

async function updateFcmToken(req, res, next) {
  try {
    const { fcmToken } = req.body
    await User.findByIdAndUpdate(req.user._id, { fcmToken })
    return success(res, null, 200, 'FCM token updated')
  } catch (err) { next(err) }
}

module.exports = { inviteUser, resendInvite, deactivateUser, activateUser, getChainUsers, getStoreUsers, updateFcmToken }

// ============================================================
// KOUTIX — POS Controller
// ============================================================
