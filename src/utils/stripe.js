// ============================================================
// SelfPay — Stripe Plan Resolver
// ============================================================

const PLAN_PRICE_MAP = {
  chain: {
    basic:    process.env.STRIPE_CHAIN_PRICE_BASIC,
    standard: process.env.STRIPE_CHAIN_PRICE_STANDARD,
    pro:      process.env.STRIPE_CHAIN_PRICE_PRO,
  },
  store: {
    basic:    process.env.STRIPE_STORE_PRICE_BASIC,
    standard: process.env.STRIPE_STORE_PRICE_STANDARD,
    pro:      process.env.STRIPE_STORE_PRICE_PRO,
  },
}

function resolvePriceId(userType, plan) {
  const priceId = PLAN_PRICE_MAP[userType]?.[plan]
  if (!priceId) {
    throw new Error(`Invalid plan '${plan}' for userType '${userType}'`)
  }
  return priceId
}

module.exports = { resolvePriceId, PLAN_PRICE_MAP }
