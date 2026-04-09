// ============================================================
// KOUTIX — POS Connection Routes
// ============================================================
const { Router } = require('express')
const {
  authenticate,
  requireBranchManager,
  webhookLimiter,
} = require('../middleware')
const {
  posConnect,
  posStatus,
  posTest,
  posDisconnect,
  posWebhookReceiver,
  posEvents,
} = require('../controllers/posConnection')

const router = Router()

// ── Authenticated routes (branch manager+) ───────────────
router.post('/connect',      authenticate, requireBranchManager, posConnect)
router.get('/status',        authenticate, requireBranchManager, posStatus)
router.post('/test',         authenticate, requireBranchManager, posTest)
router.delete('/disconnect', authenticate, requireBranchManager, posDisconnect)
router.get('/events',        authenticate, requireBranchManager, posEvents)

// ── Public webhook receiver (NO auth — validated by X-Webhook-Secret) ──
router.post('/webhook/:branchId/:posType', webhookLimiter, posWebhookReceiver)

module.exports = router
