// ============================================================
// SelfPay — Webhooks Controller (HMAC verified)
// ============================================================
const Stripe = require('stripe')
const QRCode = require('qrcode')
const { Order, Store, User, Product, ChainManager, StoreManager } = require('../models')
const { verifyStripeWebhook, verifyCheckoutWebhook } = require('../services/payment')
const { generateReceiptPDF } = require('../services/storage/receipt')
const { sendPushNotification } = require('../config/firebase')
const logger = require('../config/logger')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })

// ── POST /webhooks/stripe/:storeId ───────────────────────
async function handleStripeWebhook(req, res, next) {
  try {
    const { storeId } = req.params
    const signature = req.headers['stripe-signature']

    if (!signature) {
      return res.status(400).json({ success: false, message: 'Missing stripe-signature header' })
    }

    let event
    try {
      event = await verifyStripeWebhook(req.body, signature, storeId)
    } catch {
      logger.warn(`Stripe webhook signature invalid for store ${storeId}`)
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' })
    }

    // Respond immediately
    res.status(200).json({ received: true })

    setImmediate(() =>
      processStripeEvent(event, storeId).catch((e) =>
        logger.error(`Stripe webhook processing error for store ${storeId}:`, e)
      )
    )
  } catch (err) {
    next(err)
  }
}

async function processStripeEvent(event, storeId) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.payment_status === 'paid') {
        await markOrderPaid({
          sessionId:        session.id,
          paymentReference: session.payment_intent,
          amount:           (session.amount_total || 0) / 100,
        })
      }
      break
    }
    case 'payment_intent.succeeded': {
      const pi = event.data.object
      if (pi.metadata?.type === 'customer_checkout') {
        await markOrderPaid({
          sessionId:        pi.id,      // we stored the PaymentIntent ID as the session ID
          paymentReference: pi.id,
          amount:           (pi.amount || 0) / 100,
        })
      }
      break
    }
    case 'checkout.session.expired': {
      const session = event.data.object
      await cancelOrderBySession(session.id)
      break
    }
    case 'charge.refunded': {
      const charge = event.data.object
      logger.info(`Refund confirmed for charge ${charge.id} on store ${storeId}`)
      break
    }
    default:
      logger.debug(`Unhandled Stripe event: ${event.type}`)
  }
}

// ── POST /webhooks/checkout/:storeId ─────────────────────
async function handleCheckoutWebhook(req, res, next) {
  try {
    const { storeId } = req.params
    const signature = req.headers['cko-signature']

    if (!signature) {
      return res.status(400).json({ success: false, message: 'Missing cko-signature header' })
    }

    let payload
    try {
      payload = await verifyCheckoutWebhook(req.body, signature, storeId)
    } catch {
      logger.warn(`Checkout.com webhook signature invalid for store ${storeId}`)
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' })
    }

    res.status(200).json({ received: true })

    setImmediate(() =>
      processCheckoutEvent(payload, storeId).catch((e) =>
        logger.error(`Checkout webhook processing error for store ${storeId}:`, e)
      )
    )
  } catch (err) {
    next(err)
  }
}

async function processCheckoutEvent(payload, _storeId) {
  const type = payload.type

  if (type === 'payment_approved' || type === 'payment_captured' || type === 'payment_link_paid') {
    const data = payload.data
    const reference = data.reference || data.payment_reference
    const order = await Order.findOne({ orderNumber: reference })
    if (order) {
      await markOrderPaid({
        sessionId:        order.paymentSessionId || data.id || '',
        paymentReference: data.action_id || data.payment_id || data.id,
        amount:           (data.amount || 0) / 100,
      })
    }
  }

  if (type === 'payment_declined' || type === 'payment_expired' || type === 'payment_link_expired') {
    const data = payload.data
    const reference = data.reference || data.payment_reference
    const order = await Order.findOne({ orderNumber: reference })
    if (order) {
      await cancelOrderBySession(order.paymentSessionId || data.id || '')
    }
  }
}

// ── Shared: mark order paid ───────────────────────────────
async function markOrderPaid({ sessionId, paymentReference }) {
  const order = await Order.findOneAndUpdate(
    { paymentSessionId: sessionId, status: 'payment_pending' },
    { status: 'paid', paymentReference, paidAt: new Date() },
    { new: true }
  )

  if (!order) {
    logger.warn(`No pending order found for session ${sessionId}`)
    return
  }

  await Store.findByIdAndUpdate(order.storeId, { $inc: { totalRevenue: order.total } })

  // Generate receipt + QR code
  try {
    const { url } = await generateReceiptPDF(order)
    const qrData = JSON.stringify({ orderId: order._id, orderNumber: order.orderNumber, total: order.total })
    const qrCode = await QRCode.toDataURL(qrData)
    await Order.findByIdAndUpdate(order._id, { receiptUrl: url, qrCode })
  } catch (e) {
    logger.error('Receipt generation failed:', e)
  }

  // FCM to customer
  const customer = await User.findById(order.customerId)
  if (customer?.fcmToken) {
    await sendPushNotification({
      token: customer.fcmToken,
      title: '✅ Payment Confirmed!',
      body:  `Order ${order.orderNumber} — $${order.total.toFixed(2)}. Show QR at exit.`,
      data:  { orderId: order._id.toString(), type: 'payment_confirmed' },
    })
  }

  logger.info(`Order paid: ${order.orderNumber} ($${order.total}) — ref: ${paymentReference}`)
}

// ── Shared: cancel order by session ──────────────────────
async function cancelOrderBySession(sessionId) {
  const order = await Order.findOneAndUpdate(
    { paymentSessionId: sessionId, status: 'payment_pending' },
    { status: 'cancelled' },
    { new: true }
  )
  if (!order) {
    return
  }

  // Restore stock
  await Promise.all(
    order.items.map((item) =>
      Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } })
    )
  )

  const customer = await User.findById(order.customerId)
  if (customer?.fcmToken) {
    await sendPushNotification({
      token: customer.fcmToken,
      title: '❌ Payment Failed',
      body:  `Order ${order.orderNumber} was not completed. Your cart has been restored.`,
      data:  { orderId: order._id.toString(), type: 'payment_failed' },
    })
  }

  logger.info(`Order cancelled (payment expired/failed): ${order.orderNumber}`)
}

// ── POST /webhooks/stripe/subscription ────────────────────
function handleSubscriptionWebhook(req, res) {
  const sig = req.headers['stripe-signature']
  let event

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    logger.warn(`Subscription webhook signature failed: ${err.message}`)
    return res.status(400).json({ success: false, message: 'Invalid signature' })
  }

  // Respond immediately
  res.status(200).json({ received: true })

  setImmediate(() =>
    processSubscriptionEvent(event).catch((e) =>
      logger.error('Subscription webhook error:', e)
    )
  )
}

async function processSubscriptionEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode !== 'subscription') {
        return
      }

      const { firebaseUid, userType, plan } = session.metadata || {}
      if (!firebaseUid || !userType) {
        return
      }

      const Model = userType === 'chain_manager' ? ChainManager : StoreManager
      await Model.findOneAndUpdate(
        { firebaseUid },
        {
          stripeSubscriptionId: session.subscription,
          subscriptionStatus: 'trialing',
          plan: plan || 'basic',
        }
      )
      logger.info(`Subscription activated for ${userType}: ${firebaseUid} (${plan})`)
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object
      const customerId = sub.customer

      // Try both models
      let user = await ChainManager.findOne({ stripeCustomerId: customerId })
      if (!user) {
        user = await StoreManager.findOne({ stripeCustomerId: customerId })
      }
      if (!user) {
        return
      }

      user.subscriptionStatus = sub.status
      await user.save()
      logger.info(`Subscription updated: ${user.email} → ${sub.status}`)
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object
      const customerId = sub.customer

      let user = await ChainManager.findOne({ stripeCustomerId: customerId })
      if (!user) {
        user = await StoreManager.findOne({ stripeCustomerId: customerId })
      }
      if (!user) {
        return
      }

      user.subscriptionStatus = 'cancelled'
      await user.save()
      logger.info(`Subscription cancelled: ${user.email}`)
      break
    }

    default:
      logger.debug(`Unhandled subscription event: ${event.type}`)
  }
}

module.exports = { handleStripeWebhook, handleCheckoutWebhook, handleSubscriptionWebhook }
