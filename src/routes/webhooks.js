// ============================================================
// SelfPay — Webhook Routes (raw body, no auth, HMAC verified)
// ============================================================
const { Router } = require('express')
const { webhookLimiter } = require('../middleware')
const webhookCtrl = require('../controllers/webhooks')

const router = Router()
router.use(webhookLimiter)

// Raw body already set in app.js for /api/v1/webhooks/*
router.post('/stripe/:storeId',   webhookCtrl.handleStripeWebhook)
router.post('/checkout/:storeId', webhookCtrl.handleCheckoutWebhook)

// Subscription lifecycle webhook (platform-level)
router.post('/stripe/subscription', webhookCtrl.handleSubscriptionWebhook)

module.exports = router
