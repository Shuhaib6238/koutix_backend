// ============================================================
// SelfPay — Auth Routes
// ============================================================
const { Router } = require('express')
const { authenticate, requireRole, authLimiter } = require('../middleware')
const { validate, chainRegisterSchema, storeRegisterSchema, branchInviteSchema, branchActivateSchema, webLoginSchema, changePlanSchema } = require('../validators')
const authCtrl = require('../controllers/auth')

const router = Router()

// ── Public routes ─────────────────────────────────────────
router.post('/chain/register',   authLimiter, validate(chainRegisterSchema),   authCtrl.registerChain)
router.post('/store/register',   authLimiter, validate(storeRegisterSchema),   authCtrl.registerStore)
router.post('/branch/activate',  authLimiter, validate(branchActivateSchema),  authCtrl.activateBranch)
router.post('/login',            authLimiter, validate(webLoginSchema),        authCtrl.webLogin)

// ── Protected: chain_manager only ─────────────────────────
router.post('/branch/invite', authenticate, requireRole('chain_manager'), validate(branchInviteSchema), authCtrl.inviteBranch)

// ── Protected: any authenticated web role ─────────────────
router.get('/me',     authenticate, authCtrl.getMe)
router.patch('/me',   authenticate, authCtrl.updateProfile)
router.post('/logout', authenticate, authCtrl.webLogout)

// ── Subscription management ──────────────────────────────
router.get('/me/subscription',  authenticate, requireRole('chain_manager', 'store_manager'), authCtrl.getSubscription)
router.post('/me/change-plan',  authenticate, requireRole('chain_manager', 'store_manager'), validate(changePlanSchema), authCtrl.changePlan)

// ── Customer (app only — Bearer token) ────────────────────
router.post('/customer/verify',  authCtrl.customerVerify)
router.post('/customer/social',  authCtrl.customerSocial)
router.post('/customer/logout',  authenticate, authCtrl.customerLogout)
router.get('/customer/me',       authenticate, requireRole('customer'), authCtrl.getMe)
router.post('/customer/profile', authenticate, requireRole('customer'), authCtrl.updateCustomerProfile)

module.exports = router
