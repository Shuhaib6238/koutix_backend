// ============================================================
// KOUTIX — BullMQ Queues
// ============================================================
const { Queue } = require('bullmq')
const { getRedis } = require('../config/redis')

let posSyncQueue      = null
let notificationQueue = null
let receiptQueue      = null

function getConnection() {
  return { connection: getRedis() }
}

function getPosSyncQueue() {
  if (!posSyncQueue) {
    posSyncQueue = new Queue('pos-sync', {
      ...getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail:     { count: 50 },
      },
    })
  }
  return posSyncQueue
}

function getNotificationQueue() {
  if (!notificationQueue) {
    notificationQueue = new Queue('notifications', {
      ...getConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 2000 },
        removeOnComplete: { count: 200 },
        removeOnFail:     { count: 100 },
      },
    })
  }
  return notificationQueue
}

function getReceiptQueue() {
  if (!receiptQueue) {
    receiptQueue = new Queue('receipts', {
      ...getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { count: 500 },
        removeOnFail:     { count: 100 },
      },
    })
  }
  return receiptQueue
}

// ── Job creators ──────────────────────────────────────────
async function addPosSyncJob(storeId) {
  return getPosSyncQueue().add('sync-inventory', { storeId }, {
    jobId: `pos-sync:${storeId}:${Date.now()}`,
  })
}

async function addLowStockAlertJob(productId, storeId) {
  return getNotificationQueue().add('low-stock-alert', { productId, storeId }, {
    jobId: `low-stock:${productId}`,
    deduplication: { id: `low-stock:${productId}` },
  })
}

async function addReceiptJob(orderId) {
  return getReceiptQueue().add('generate-receipt', { orderId }, {
    jobId: `receipt:${orderId}`,
  })
}

async function addEmailJob(data) {
  return getNotificationQueue().add('send-email', data)
}

module.exports = {
  getPosSyncQueue,
  getNotificationQueue,
  getReceiptQueue,
  addPosSyncJob,
  addLowStockAlertJob,
  addReceiptJob,
  addEmailJob,
}
