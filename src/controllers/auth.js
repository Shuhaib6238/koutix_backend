// ============================================================
// SelfPay — Auth Controller
// ============================================================
const crypto = require('crypto')
const Stripe = require('stripe')
const { admin, setUserClaims, deleteFirebaseUser, revokeUserTokens } = require('../config/firebase')
const { ChainManager, BranchManager, StoreManager, Customer, InviteToken } = require('../models')
const { sendInviteEmail } = require('../services/notification/email')
const { resolvePriceId } = require('../utils/stripe')
const logger = require('../config/logger')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })
const WEB_URL = process.env.WEB_URL || 'http://localhost:3000'

// ── Rollback helper ──────────────────────────────────────
async function safeDeleteFirebaseUser(uid) {
  try {
    await deleteFirebaseUser(uid)
  } catch (e) {
    logger.error(`Rollback: failed to delete Firebase user ${uid}:`, e.message)
  }
}

// ══════════════════════════════════════════════════════════
// [1] POST /api/auth/chain/register
// ══════════════════════════════════════════════════════════
async function registerChain(req, res, next) {
  let firebaseUid = null
  try {
    const { email, password, businessName, phone, plan } = req.body

    // Validate plan before anything else
    const priceId = resolvePriceId('chain', plan)

    // 1. Check MongoDB BEFORE Firebase
    const existing = await ChainManager.findOne({ email })
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' })
    }

    // 2. Create Firebase user
    const fbUser = await admin.auth().createUser({ email, password, displayName: businessName })
    firebaseUid = fbUser.uid

    // 3. Set custom claims
    await setUserClaims(firebaseUid, { role: 'chain_manager' })

    // 4. Create Stripe customer
    const customer = await stripe.customers.create({ email, name: businessName })

    // 5. Create Checkout Session (redirect-based)
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 14 },
      success_url: `${WEB_URL}/dashboard?checkout=success`,
      cancel_url: `${WEB_URL}/register?checkout=cancelled`,
      metadata: {
        firebaseUid,
        userType: 'chain_manager',
        plan,
      },
    })

    // 6. Save to MongoDB (subscriptionStatus = pending until webhook confirms)
    const chainManager = await ChainManager.create({
      email,
      firebaseUid,
      businessName,
      phone,
      plan,
      stripeCustomerId: customer.id,
      subscriptionStatus: 'pending',
    })

    logger.info(`Chain registered: ${businessName} (${email}) — plan: ${plan}`)
    return res.status(201).json({
      success: true,
      data: { user: chainManager, checkoutUrl: session.url },
      message: 'Chain registered. Complete payment to activate.',
    })
  } catch (err) {
    if (firebaseUid) {
      await safeDeleteFirebaseUser(firebaseUid)
    }
    next(err)
  }
}

// ══════════════════════════════════════════════════════════
// [2] POST /api/auth/branch/invite
// ══════════════════════════════════════════════════════════
async function inviteBranch(req, res, next) {
  try {
    const { branchEmail, branchName, branchAddress } = req.body
    const chainManager = req.user

    // Check no active invite
    const existingInvite = await InviteToken.findOne({
      email: branchEmail, used: false, expiresAt: { $gt: new Date() },
    })
    if (existingInvite) {
      return res.status(409).json({ success: false, message: 'An active invite already exists for this email' })
    }

    // Check no existing active branch manager
    const existingBranch = await BranchManager.findOne({ email: branchEmail, isActive: true })
    if (existingBranch) {
      return res.status(409).json({ success: false, message: 'A branch manager with this email already exists' })
    }

    // Create token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000)

    await InviteToken.create({
      token,
      email: branchEmail,
      chainId: chainManager._id,
      branchName,
      expiresAt,
    })

    // Create inactive branch manager
    await BranchManager.findOneAndUpdate(
      { email: branchEmail, chainId: chainManager._id },
      {
        email: branchEmail,
        chainId: chainManager._id,
        branchName,
        branchAddress,
        isActive: false,
      },
      { upsert: true, new: true }
    )

    // Send invite email
    const activationUrl = `${WEB_URL}/activate?token=${token}`
    await sendInviteEmail({
      to: branchEmail,
      managerName: branchName,
      storeName: chainManager.businessName,
      role: 'Branch Manager',
      inviteToken: token,
      inviterName: chainManager.businessName,
    })

    logger.info(`Branch invite sent: ${branchEmail} by ${chainManager.email}`)
    return res.status(200).json({
      success: true,
      data: { activationUrl },
      message: 'Invitation sent successfully',
    })
  } catch (err) {
    next(err)
  }
}

// ══════════════════════════════════════════════════════════
// [3] POST /api/auth/branch/activate
// ══════════════════════════════════════════════════════════
async function activateBranch(req, res, next) {
  let firebaseUid = null
  try {
    const { token, password, name, phone } = req.body

    const invite = await InviteToken.findOne({ token, used: false })
    if (!invite) {
      return res.status(400).json({ success: false, message: 'Invite token is invalid' })
    }
    if (invite.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'Invite token has expired' })
    }

    const branchManager = await BranchManager.findOne({
      email: invite.email, chainId: invite.chainId, isActive: false,
    })
    if (!branchManager) {
      return res.status(400).json({ success: false, message: 'Branch manager record not found' })
    }

    const fbUser = await admin.auth().createUser({
      email: invite.email, password, displayName: name,
    })
    firebaseUid = fbUser.uid

    await setUserClaims(firebaseUid, {
      role: 'branch_manager',
      chainId: invite.chainId.toString(),
    })

    branchManager.firebaseUid = firebaseUid
    branchManager.name = name
    branchManager.phone = phone
    branchManager.isActive = true
    branchManager.activatedAt = new Date()
    await branchManager.save()

    await ChainManager.findByIdAndUpdate(invite.chainId, {
      $addToSet: { branches: branchManager._id },
    })

    invite.used = true
    invite.usedAt = new Date()
    await invite.save()

    logger.info(`Branch activated: ${invite.email} as ${name}`)
    return res.status(200).json({
      success: true,
      data: { user: branchManager },
      message: 'Account activated. You can now log in.',
    })
  } catch (err) {
    if (firebaseUid) {
      await safeDeleteFirebaseUser(firebaseUid)
    }
    next(err)
  }
}

// ══════════════════════════════════════════════════════════
// [4] POST /api/auth/store/register
// ══════════════════════════════════════════════════════════
async function registerStore(req, res, next) {
  let firebaseUid = null
  try {
    const { email, password, storeName, name, phone, storeAddress, plan } = req.body

    // Validate plan before anything else
    const priceId = resolvePriceId('store', plan)

    const existing = await StoreManager.findOne({ email })
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' })
    }

    const fbUser = await admin.auth().createUser({ email, password, displayName: name })
    firebaseUid = fbUser.uid

    await setUserClaims(firebaseUid, { role: 'store_manager' })

    const customer = await stripe.customers.create({ email, name: storeName })

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 14 },
      success_url: `${WEB_URL}/dashboard?checkout=success`,
      cancel_url: `${WEB_URL}/register?checkout=cancelled`,
      metadata: {
        firebaseUid,
        userType: 'store_manager',
        plan,
      },
    })

    const storeManager = await StoreManager.create({
      email,
      firebaseUid,
      name,
      phone,
      storeName,
      storeAddress,
      plan,
      stripeCustomerId: customer.id,
      subscriptionStatus: 'pending',
    })

    logger.info(`Store registered: ${storeName} (${email}) — plan: ${plan}`)
    return res.status(201).json({
      success: true,
      data: { user: storeManager, checkoutUrl: session.url },
      message: 'Store registered. Complete payment to activate.',
    })
  } catch (err) {
    if (firebaseUid) {
      await safeDeleteFirebaseUser(firebaseUid)
    }
    next(err)
  }
}

// ══════════════════════════════════════════════════════════
// [5] POST /api/auth/login  (web — session cookie)
// ══════════════════════════════════════════════════════════
async function webLogin(req, res, next) {
  try {
    const { idToken } = req.body

    const decoded = await admin.auth().verifyIdToken(idToken)

    const webRoles = ['superadmin', 'chain_manager', 'branch_manager', 'store_manager']
    if (!decoded.role || !webRoles.includes(decoded.role)) {
      return res.status(403).json({ success: false, message: 'This account cannot access the web dashboard' })
    }

    const expiresIn = 5 * 24 * 60 * 60 * 1000
    const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn })

    res.cookie('session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: expiresIn,
    })

    return res.status(200).json({
      success: true,
      data: { role: decoded.role, uid: decoded.uid },
      message: 'Login successful',
    })
  } catch (err) {
    next(err)
  }
}

// ══════════════════════════════════════════════════════════
// [6] POST /api/auth/logout
// ══════════════════════════════════════════════════════════
async function webLogout(req, res, next) {
  try {
    await revokeUserTokens(req.uid)
    res.clearCookie('session')
    return res.status(200).json({ success: true, message: 'Logged out' })
  } catch (err) {
    next(err)
  }
}

// ══════════════════════════════════════════════════════════
// [7] POST /api/auth/customer/verify  (phone OTP)
// ══════════════════════════════════════════════════════════
async function customerVerify(req, res, next) {
  try {
    const decoded = await admin.auth().verifyIdToken(
      req.headers.authorization?.split(' ')[1]
    )

    if (!decoded.role || decoded.role !== 'customer') {
      await setUserClaims(decoded.uid, { role: 'customer' })
    }

    const customer = await Customer.findOneAndUpdate(
      { firebaseUid: decoded.uid },
      {
        firebaseUid: decoded.uid,
        phone: decoded.phone_number || null,
        email: decoded.email || null,
        name: decoded.name || decoded.phone_number || 'Customer',
        authProvider: 'phone',
        isActive: true,
      },
      { upsert: true, new: true }
    )

    logger.info(`Customer verified (phone): ${customer.phone}`)
    return res.status(200).json({
      success: true,
      data: { user: customer },
      message: 'Phone verified successfully',
    })
  } catch (err) {
    next(err)
  }
}

// ══════════════════════════════════════════════════════════
// [8] POST /api/auth/customer/social  (Google Sign-In)
// ══════════════════════════════════════════════════════════
async function customerSocial(req, res, next) {
  try {
    const decoded = await admin.auth().verifyIdToken(
      req.headers.authorization?.split(' ')[1]
    )

    if (!decoded.role || decoded.role !== 'customer') {
      await setUserClaims(decoded.uid, { role: 'customer' })
    }

    const customer = await Customer.findOneAndUpdate(
      { firebaseUid: decoded.uid },
      {
        firebaseUid: decoded.uid,
        email: decoded.email || null,
        name: decoded.name || decoded.email || 'Customer',
        photoUrl: decoded.picture || null,
        authProvider: 'google',
        isActive: true,
      },
      { upsert: true, new: true }
    )

    logger.info(`Customer verified (Google): ${customer.email}`)
    return res.status(200).json({
      success: true,
      data: { user: customer },
      message: 'Google sign-in successful',
    })
  } catch (err) {
    next(err)
  }
}

// ══════════════════════════════════════════════════════════
// [9] GET /api/auth/me
// ══════════════════════════════════════════════════════════
function getMe(req, res) {
  return res.status(200).json({
    success: true,
    data: { user: req.user, role: req.userRole },
  })
}

// ══════════════════════════════════════════════════════════
// [10] GET /api/auth/me/subscription
// ══════════════════════════════════════════════════════════
function getSubscription(req, res) {
  const user = req.user
  return res.status(200).json({
    success: true,
    data: {
      plan: user.plan || null,
      subscriptionStatus: user.subscriptionStatus || null,
      stripeCustomerId: user.stripeCustomerId || null,
      stripeSubscriptionId: user.stripeSubscriptionId || null,
    },
  })
}

// ══════════════════════════════════════════════════════════
// [11] POST /api/auth/me/change-plan
// ══════════════════════════════════════════════════════════
async function changePlan(req, res, next) {
  try {
    const { plan } = req.body
    const user = req.user
    const role = req.userRole

    const userType = role === 'chain_manager' ? 'chain' : 'store'
    const newPriceId = resolvePriceId(userType, plan)

    if (!user.stripeSubscriptionId) {
      return res.status(400).json({ success: false, message: 'No active subscription found' })
    }

    // Get current subscription
    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId)
    const currentItemId = subscription.items.data[0].id

    // Update with proration
    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      items: [{ id: currentItemId, price: newPriceId }],
      proration_behavior: 'create_prorations',
    })

    // Update MongoDB
    const Model = role === 'chain_manager' ? ChainManager : StoreManager
    await Model.findByIdAndUpdate(user._id, { plan })

    logger.info(`Plan changed: ${user.email} → ${plan}`)
    return res.status(200).json({
      success: true,
      data: { plan },
      message: `Plan changed to ${plan}`,
    })
  } catch (err) {
    next(err)
  }
}

// ══════════════════════════════════════════════════════════
// [12] POST /api/auth/customer/logout
// ══════════════════════════════════════════════════════════
async function customerLogout(req, res, next) {
  try {
    await revokeUserTokens(req.uid)
    return res.status(200).json({ success: true, message: 'Logged out' })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  registerChain,
  inviteBranch,
  activateBranch,
  registerStore,
  webLogin,
  webLogout,
  customerVerify,
  customerSocial,
  getMe,
  getSubscription,
  changePlan,
  customerLogout,
}

