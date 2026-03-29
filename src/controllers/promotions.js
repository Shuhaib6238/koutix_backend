// ============================================================
// KOUTIX — Promotions Controller
// ============================================================
const { Promotion } = require('../models')
const { success, successList, error, getPaginationParams } = require('../utils')
const { cache } = require('../config/redis')

async function getPromotions(req, res, next) {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query)
    const { status, storeId } = req.query
    const user = req.user
    const now = new Date()

    const filter = {}
    if (user.role === 'chainManager') filter.chainId = user.chainId
    else if (user.role === 'branchManager') {
      filter.$or = [{ storeId: user.storeId }, { chainId: user.chainId }]
    }

    if (storeId) filter.storeId = storeId
    if (status === 'active')    { filter.isActive = true; filter.startsAt = { $lte: now }; filter.endsAt = { $gte: now } }
    if (status === 'scheduled') { filter.startsAt = { $gt: now } }
    if (status === 'expired')   { filter.endsAt = { $lt: now } }

    const [promotions, total] = await Promise.all([
      Promotion.find(filter).sort(sort).skip(skip).limit(limit),
      Promotion.countDocuments(filter),
    ])
    return successList(res, promotions, { page, limit, total })
  } catch (err) { next(err) }
}

async function getPromotion(req, res, next) {
  try {
    const promo = await Promotion.findById(req.params.id)
    if (!promo) return error(res, 'Promotion not found', 404)
    return success(res, promo)
  } catch (err) { next(err) }
}

async function createPromotion(req, res, next) {
  try {
    const user = req.user
    const promo = await Promotion.create({
      ...req.body,
      chainId:  user.chainId,
      startsAt: new Date(req.body.startsAt),
      endsAt:   new Date(req.body.endsAt),
    })
    await cache.invalidatePattern('promotions:*')
    return success(res, promo, 201, 'Promotion created')
  } catch (err) { next(err) }
}

async function updatePromotion(req, res, next) {
  try {
    const allowed = ['title','description','value','minOrderAmount','maxUses','startsAt','endsAt','isActive','productIds','categoryIds']
    const updates = {}
    allowed.forEach((k) => { if (k in req.body) updates[k] = req.body[k] })
    if (updates.startsAt) updates.startsAt = new Date(updates.startsAt)
    if (updates.endsAt)   updates.endsAt   = new Date(updates.endsAt)

    const promo = await Promotion.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    if (!promo) return error(res, 'Promotion not found', 404)
    await cache.invalidatePattern('promotions:*')
    return success(res, promo)
  } catch (err) { next(err) }
}

async function deletePromotion(req, res, next) {
  try {
    const promo = await Promotion.findByIdAndDelete(req.params.id)
    if (!promo) return error(res, 'Promotion not found', 404)
    await cache.invalidatePattern('promotions:*')
    return success(res, null, 200, 'Promotion deleted')
  } catch (err) { next(err) }
}

async function togglePromotion(req, res, next) {
  try {
    const { isActive } = req.body
    const promo = await Promotion.findByIdAndUpdate(req.params.id, { isActive }, { new: true })
    if (!promo) return error(res, 'Promotion not found', 404)
    return success(res, promo)
  } catch (err) { next(err) }
}

function applyPromotion(promo, orderTotal) {
  if (promo.minOrderAmount && orderTotal < promo.minOrderAmount) return 0
  if (promo.type === 'percentage') return orderTotal * (promo.value / 100)
  if (promo.type === 'fixed')      return Math.min(promo.value, orderTotal)
  return 0
}

module.exports = { getPromotions, getPromotion, createPromotion, updatePromotion, deletePromotion, togglePromotion, applyPromotion }
