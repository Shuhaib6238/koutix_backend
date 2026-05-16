// ============================================================
// KOUTIX — Payment Service (Stripe + Checkout.com)
// Per-store gateways — money goes directly to store
// ============================================================
const Stripe = require('stripe')
const axios = require('axios')
const { decrypt } = require('../../utils/encryption')
const { Store } = require('../../models')
const { verifyHmacSignature } = require('../../utils')

// ── Get decrypted gateway config ─────────────────────────
async function getGatewayConfig(storeId) {
  const store = await Store.findById(storeId)
  if (!store?.gatewayConfig) {
    throw new Error('Store payment gateway not configured')
  }

  const { provider, secretKeyEncrypted, webhookSecretEncrypted } = store.gatewayConfig
  if (!provider) {
    throw new Error('Store payment gateway provider not set')
  }
  if (!secretKeyEncrypted) {
    throw new Error('Store payment gateway secret key is missing — please reconfigure the gateway')
  }

  return {
    provider,
    secretKey:     decrypt(secretKeyEncrypted),
    webhookSecret: webhookSecretEncrypted ? decrypt(webhookSecretEncrypted) : null,
    store,
  }
}

// ── Create Payment Session ────────────────────────────────
async function createPaymentSession({
  storeId, orderId, orderNumber,
  amount, currency, customerName, description, items,
}) {
  const { provider, secretKey } = await getGatewayConfig(storeId)

  if (provider === 'stripe') {
    return createStripeSession({ secretKey, storeId, orderId, orderNumber, amount, currency, description })
  } else {
    return createCheckoutSession({ secretKey, storeId, orderId, orderNumber, amount, currency, customerName, description, items })
  }
}

// ── Create PaymentIntent (for flutter_stripe Payment Sheet) ──
async function createPaymentIntent({
  storeId, orderId, orderNumber,
  amount, currency, customerEmail, customerName, description,
}) {
  const { provider, secretKey, store } = await getGatewayConfig(storeId)

  if (provider !== 'stripe') {
    throw new Error('Payment Sheet is only supported with Stripe gateway')
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2024-04-10' })

  // 1. Create or retrieve Stripe Customer
  const customers = await stripe.customers.list({ email: customerEmail, limit: 1 })
  let customer = customers.data[0]
  if (!customer) {
    customer = await stripe.customers.create({
      email: customerEmail,
      name: customerName,
      metadata: { source: 'koutix_customer_app' },
    })
  }

  // 2. Create Ephemeral Key for the customer
  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: customer.id },
    { apiVersion: '2024-04-10' }
  )

  // 3. Create PaymentIntent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: currency.toLowerCase(),
    customer: customer.id,
    description,
    metadata: {
      orderId,
      orderNumber,
      storeId,
      type: 'customer_checkout',
    },
    automatic_payment_methods: { enabled: true },
  })

  return {
    paymentIntentId:    paymentIntent.id,
    clientSecret:       paymentIntent.client_secret,
    ephemeralKey:       ephemeralKey.secret,
    customerId:         customer.id,
    publishableKey:     store.gatewayConfig?.publicKeyEncrypted
                          ? decrypt(store.gatewayConfig.publicKeyEncrypted)
                          : process.env.STRIPE_PUBLISHABLE_KEY,
  }
}

// ── Stripe Session ────────────────────────────────────────
async function createStripeSession({ secretKey, storeId, orderId, orderNumber, amount, currency, description }) {
  const stripe = new Stripe(secretKey, { apiVersion: '2024-04-10' })
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: currency.toLowerCase(),
        product_data: { name: description },
        unit_amount: Math.round(amount * 100),
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${appUrl}/payment/success?orderId=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${appUrl}/payment/cancel?orderId=${orderId}`,
    metadata:    { orderId, orderNumber, storeId },
  })

  return {
    sessionId:  session.id,
    paymentUrl: session.url,
    provider:   'stripe',
    expiresAt:  new Date(Date.now() + 30 * 60 * 1000),
  }
}

// ── Checkout.com Session ──────────────────────────────────
async function createCheckoutSession({ secretKey, storeId, orderId, orderNumber, amount, currency, customerName, description, items }) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  // Map Koutix items to Checkout.com products
  const products = (items || []).map((item) => ({
    name:     item.productName || item.name,
    quantity: item.quantity,
    price:    Math.round(item.price * 100),
  }))

  const response = await axios.post(
    'https://api.checkout.com/payment-links',
    {
      amount:      Math.round(amount * 100),
      currency:    currency.toUpperCase(),
      description,
      reference:   orderNumber,
      customer:    { name: customerName },
      products, // Added itemized billing
      success_url: `${appUrl}/payment/success?orderId=${orderId}`,
      failure_url: `${appUrl}/payment/cancel?orderId=${orderId}`,
      metadata:    { orderId, storeId },
    },
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    }
  )

  return {
    sessionId:  response.data.id,
    paymentUrl: response.data._links?.redirect?.href,
    provider:   'checkout',
    expiresAt:  new Date(Date.now() + 30 * 60 * 1000),
  }
}

// ── Verify Stripe Webhook ─────────────────────────────────
async function verifyStripeWebhook(rawBody, signature, storeId) {
  const { secretKey, webhookSecret } = await getGatewayConfig(storeId)
  const stripe = new Stripe(secretKey, { apiVersion: '2024-04-10' })
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
}

// ── Verify Checkout.com Webhook ───────────────────────────
async function verifyCheckoutWebhook(rawBody, signature, storeId) {
  const { webhookSecret } = await getGatewayConfig(storeId)
  const isValid = verifyHmacSignature(rawBody, signature, webhookSecret)
  if (!isValid) {
    throw new Error('Invalid webhook signature')
  }
  return JSON.parse(rawBody.toString())
}

// ── Stripe Subscription Session ───────────────────────────
async function createSubscriptionCheckoutSession({ chainId, chainName, email, plan }) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  const priceKey = `STRIPE_PRICE_${plan.toUpperCase()}`
  const priceId  = process.env[priceKey]

  if (!priceId || priceId === 'price_...') {
    throw new Error(`Stripe Price ID for plan "${plan}" is not configured in .env`)
  }

  // 1. Create or get customer
  const customer = await stripe.customers.create({
    email,
    name: chainName,
    metadata: { chainId: chainId.toString() },
  })

  // 2. Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${appUrl}/billing/cancel`,
    metadata:    { chainId: chainId.toString() },
  })

  return {
    customerId: customer.id,
    checkoutUrl: session.url,
  }
}

// ── Verify a session at the gateway (post-redirect check) ─
async function verifyPaymentSession(storeId, sessionOrPaymentId) {
  const { provider, secretKey } = await getGatewayConfig(storeId)

  if (provider === 'stripe') {
    const stripe = new Stripe(secretKey, { apiVersion: '2024-04-10' })
    const session = await stripe.checkout.sessions.retrieve(sessionOrPaymentId)
    return {
      paid:             session.payment_status === 'paid',
      paymentReference: session.payment_intent || session.id,
      raw:              { status: session.payment_status },
    }
  }

  // Checkout.com
  const response = await axios.get(
    `https://api.checkout.com/payments/${sessionOrPaymentId}`,
    { headers: { Authorization: `Bearer ${secretKey}` } }
  )
  const status = response.data.status
  return {
    paid:             ['Authorized', 'Captured', 'Paid'].includes(status),
    paymentReference: response.data.id,
    raw:              { status },
  }
}

// ── Refund ────────────────────────────────────────────────
async function refundPayment(storeId, paymentReference, amount, _currency) {
  const { provider, secretKey } = await getGatewayConfig(storeId)

  if (provider === 'stripe') {
    const stripe = new Stripe(secretKey, { apiVersion: '2024-04-10' })
    const refund = await stripe.refunds.create({
      payment_intent: paymentReference,
      amount: Math.round(amount * 100),
    })
    return { refundId: refund.id }
  } else {
    const response = await axios.post(
      `https://api.checkout.com/payments/${paymentReference}/refunds`,
      { amount: Math.round(amount * 100), reference: `REFUND-${Date.now()}` },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    )
    return { refundId: response.data.action_id }
  }
}

module.exports = {
  createPaymentSession,
  createPaymentIntent,
  createSubscriptionCheckoutSession,
  verifyStripeWebhook,
  verifyCheckoutWebhook,
  verifyPaymentSession,
  refundPayment,
}
