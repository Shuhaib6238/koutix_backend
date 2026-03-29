// ============================================================
// KOUTIX — POS Controller
// ============================================================
const { Store } = require('../models')
const { encryptObject } = require('../utils/encryption')
const { success, error, getPaginationParams } = require('../utils')
const { getRedis } = require('../config/redis')
const logger = require('../config/logger')

const CONNECTORS = [
  { id: 'odoo',       name: 'Odoo',       logo: 'odoo.png',       fields: ['url','db','username','apiKey'] },
  { id: 'lightspeed', name: 'Lightspeed', logo: 'lightspeed.png', fields: ['accountId','apiKey'] },
  { id: 'square',     name: 'Square',     logo: 'square.png',     fields: ['accessToken','locationId'] },
]

async function getConnectors(req, res, next) {
  try {
    return success(res, CONNECTORS)
  } catch (err) { next(err) }
}

async function connectPos(req, res, next) {
  try {
    const { storeId } = req.params
    const { connector, credentials } = req.body

    const store = await Store.findByIdAndUpdate(
      storeId,
      {
        posConnector:            connector,
        posCredentialsEncrypted: encryptObject(credentials),
      },
      { new: true }
    )
    if (!store) return error(res, 'Store not found', 404)

    logger.info(`POS connected: ${connector} for store ${storeId}`)
    return success(res, { connected: true, connector }, 200, `${connector} connected successfully`)
  } catch (err) { next(err) }
}

async function disconnectPos(req, res, next) {
  try {
    const store = await Store.findByIdAndUpdate(
      req.params.storeId,
      { posConnector: 'none', posCredentialsEncrypted: undefined },
      { new: true }
    )
    if (!store) return error(res, 'Store not found', 404)
    return success(res, null, 200, 'POS disconnected')
  } catch (err) { next(err) }
}

async function getSyncHistory(req, res, next) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query)
    const redis = getRedis()
    const key = `sync-history:${req.params.storeId}`

    const raw = await redis.lrange(key, skip, skip + limit - 1)
    const history = raw.map((r) => JSON.parse(r))
    const total = await redis.llen(key)

    return res.json({
      success: true,
      data: history,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (err) { next(err) }
}

async function getJobStatus(req, res, next) {
  try {
    const { storeId, jobId } = req.params
    const redis = getRedis()
    const raw = await redis.get(`sync-job:${storeId}:${jobId}`)
    if (!raw) return error(res, 'Job not found', 404)
    return success(res, JSON.parse(raw))
  } catch (err) { next(err) }
}

module.exports = { getConnectors, connectPos, disconnectPos, getSyncHistory, getJobStatus }
