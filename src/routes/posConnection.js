// ============================================================
// KOUTIX — POS Connection Routes
// ============================================================
const { Router } = require('express')
const {
  authenticate,
  requireBranchManager,
  webhookLimiter,
} = require('../middleware')
const { validate, posConnectSchema, posTestSchema } = require('../validators')
const {
  posConnect,
  posStatus,
  posTest,
  posDisconnect,
  posWebhookReceiver,
  posEvents,
  posDashboard,
  posSyncNow,
} = require('../controllers/posConnection')

const router = Router()

// ── Authenticated routes (branch manager+) ───────────────
router.post('/connect',      authenticate, requireBranchManager, validate(posConnectSchema), posConnect)
router.get('/status',        authenticate, requireBranchManager, posStatus)
router.post('/test',         authenticate, requireBranchManager, validate(posTestSchema),    posTest)
router.delete('/disconnect', authenticate, requireBranchManager, posDisconnect)
router.get('/events',        authenticate, requireBranchManager, posEvents)
router.get('/dashboard',     authenticate, requireBranchManager, posDashboard)
router.post('/sync-now',     authenticate, requireBranchManager, posSyncNow)

// ── Public webhook receiver (NO auth — validated by X-Webhook-Secret) ──
router.post('/webhook/:branchId/:posType', webhookLimiter, posWebhookReceiver)

module.exports = router
