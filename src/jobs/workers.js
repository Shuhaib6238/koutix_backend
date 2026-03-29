// ============================================================
// KOUTIX — BullMQ Workers
// ============================================================
const { Worker } = require('bullmq')
const { getRedis } = require('../config/redis')
const logger = require('../config/logger')

// ── POS Sync Worker ───────────────────────────────────────
function createPosSyncWorker() {
  return new Worker(
    'pos-sync',
    async (job) => {
      const { storeId } = job.data
      logger.info(`[POS Sync] Starting job ${job.id} for store ${storeId}`)

      const redis   = getRedis()
      const jobKey  = `sync-job:${storeId}:${job.id}`

      await redis.setex(jobKey, 3600, JSON.stringify({
        jobId:     job.id,
        status:    'running',
        progress:  0,
        log:       [`Job started at ${new Date().toISOString()}`],
        startedAt: new Date().toISOString(),
      }))

      try {
        const { Store }         = require('../models')
        const { syncInventory } = require('../services/pos')
        const { decryptObject } = require('../utils/encryption')

        const store = await Store.findById(storeId)
        if (!store || store.posConnector === 'none' || !store.posCredentialsEncrypted) {
          throw new Error('Store POS not configured')
        }

        const credentials = decryptObject(store.posCredentialsEncrypted)

        const { productsUpdated, errors } = await syncInventory(
          store.posConnector,
          credentials,
          storeId,
          async (progress, log) => {
            await redis.setex(jobKey, 3600, JSON.stringify({
              jobId: job.id, status: 'running', progress, log,
              startedAt: new Date().toISOString(),
            }))
            await job.updateProgress(progress)
          }
        )

        await Store.findByIdAndUpdate(storeId, { lastPosSyncAt: new Date() })

        const result = {
          jobId: job.id, status: 'completed', progress: 100,
          productsUpdated, errors,
          startedAt:   new Date().toISOString(),
          completedAt: new Date().toISOString(),
        }

        const historyKey = `sync-history:${storeId}`
        await redis.lpush(historyKey, JSON.stringify(result))
        await redis.ltrim(historyKey, 0, 49)
        await redis.setex(jobKey, 3600, JSON.stringify(result))

        logger.info(`[POS Sync] Job ${job.id} completed: ${productsUpdated} products updated`)
        return result
      } catch (e) {
        const errResult = {
          jobId: job.id, status: 'failed', progress: 0,
          error:       e.message,
          startedAt:   new Date().toISOString(),
          completedAt: new Date().toISOString(),
        }
        await redis.setex(jobKey, 3600, JSON.stringify(errResult))
        throw e
      }
    },
    { connection: getRedis(), concurrency: 3 }
  )
}

// ── Notification Worker ───────────────────────────────────
function createNotificationWorker() {
  return new Worker(
    'notifications',
    async (job) => {
      if (job.name === 'low-stock-alert') {
        const { productId, storeId } = job.data
        const { Product, Store, User } = require('../models')
        const { sendPushNotification } = require('../config/firebase')

        const [product, store] = await Promise.all([
          Product.findById(productId),
          Store.findById(storeId),
        ])
        if (!product || !store) {
          return
        }

        if (store.managerId) {
          const manager = await User.findById(store.managerId)
          if (manager?.fcmToken) {
            await sendPushNotification({
              token: manager.fcmToken,
              title: '⚠️ Low Stock Alert',
              body:  `${product.name} — only ${product.stock} left in ${store.name}`,
              data:  { productId, storeId, type: 'low_stock' },
            })
          }
        }

        logger.info(`[Low Stock Alert] ${product.name} (${product.stock} left) in ${store.name}`)
      }

      if (job.name === 'send-email') {
        const { sendTransactionalEmail } = require('../services/notification/email')
        await sendTransactionalEmail(job.data)
        logger.info(`[Email] Sent to ${job.data.to}: ${job.data.subject}`)
      }
    },
    { connection: getRedis(), concurrency: 10 }
  )
}

// ── Receipt Worker ────────────────────────────────────────
function createReceiptWorker() {
  return new Worker(
    'receipts',
    async (job) => {
      const { orderId } = job.data
      const { Order }   = require('../models')
      const QRCode      = require('qrcode')
      const { generateReceiptPDF } = require('../services/storage/receipt')

      const order = await Order.findById(orderId)
      if (!order) {
        throw new Error(`Order ${orderId} not found`)
      }

      const { url }    = await generateReceiptPDF(order)
      const qrData     = JSON.stringify({ orderId: order._id, orderNumber: order.orderNumber, total: order.total })
      const qrCode     = await QRCode.toDataURL(qrData)

      await Order.findByIdAndUpdate(orderId, { receiptUrl: url, qrCode })
      logger.info(`[Receipt] Generated for order ${order.orderNumber}`)
    },
    { connection: getRedis(), concurrency: 5 }
  )
}

// ── Start all workers ─────────────────────────────────────
function startWorkers() {
  const posSyncWorker   = createPosSyncWorker()
  const notifWorker     = createNotificationWorker()
  const receiptWorker   = createReceiptWorker()

  const handleError = (name) => (err) => logger.error(`[Worker:${name}] Error:`, err)

  posSyncWorker.on('failed',   (job, err) => logger.error(`[POS Sync] Job ${job?.id} failed:`, err))
  notifWorker.on('failed',     (job, err) => logger.error(`[Notification] Job ${job?.id} failed:`, err))
  receiptWorker.on('failed',   (job, err) => logger.error(`[Receipt] Job ${job?.id} failed:`, err))

  posSyncWorker.on('error',  handleError('pos-sync'))
  notifWorker.on('error',    handleError('notifications'))
  receiptWorker.on('error',  handleError('receipts'))

  logger.info('✅ BullMQ workers started (pos-sync, notifications, receipts)')
}

module.exports = { startWorkers }
