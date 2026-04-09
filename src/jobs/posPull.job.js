// ============================================================
// KOUTIX — POS Pull BullMQ Job (repeating sync for api_pull)
// ============================================================
const { Queue, Worker } = require('bullmq')
const { getRedis } = require('../config/redis')
const { Store } = require('../models')
const { pullFromAPI } = require('../services/pos/posSync.service')
const { addEmailJob } = require('./queues')
const logger = require('../config/logger')

const QUEUE_NAME = 'pos-pull'

let posPullQueue = null

function getPosPullQueue() {
  if (!posPullQueue) {
    posPullQueue = new Queue(QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 1,                           // we handle retries ourselves
        removeOnComplete: { count: 200 },
        removeOnFail:     { count: 100 },
      },
    })
  }
  return posPullQueue
}

// ── Track consecutive failures per branch ─────────────────
const failureCountMap = new Map()

// ── Worker ────────────────────────────────────────────────
function createPosPullWorker() {
  return new Worker(
    QUEUE_NAME,
    async (job) => {
      const { storeId } = job.data
      logger.info(`[POS Pull Job] Running for store ${storeId}`)

      try {
        const branch = await Store.findById(storeId)
        if (!branch) {
          logger.warn(`[POS Pull Job] Store ${storeId} not found — removing job`)
          await removePosPullJob(storeId)
          return
        }

        // Skip if no longer connected or method changed
        if (
          branch.posConnection?.status !== 'connected' ||
          branch.posConnection?.method !== 'api_pull'
        ) {
          logger.info(`[POS Pull Job] Store ${storeId} no longer using api_pull — removing job`)
          await removePosPullJob(storeId)
          return
        }

        const result = await pullFromAPI(branch)

        if (result.success) {
          // Reset failure counter on success
          failureCountMap.delete(storeId)
          logger.info(`[POS Pull Job] Store ${storeId}: sync success (${result.synced} events)`)
        } else {
          // Increment failure counter
          const failures = (failureCountMap.get(storeId) || 0) + 1
          failureCountMap.set(storeId, failures)

          logger.error(`[POS Pull Job] Store ${storeId}: sync failed (attempt ${failures}/3) — ${result.message}`)

          if (failures >= 3) {
            // Set status to error and send alert email
            await Store.findByIdAndUpdate(storeId, {
              'posConnection.status':           'error',
              'posConnection.lastErrorMessage': `3 consecutive failures: ${result.message}`,
            })

            failureCountMap.delete(storeId)

            // Send email alert to branch manager
            try {
              const manager = await getBranchManagerEmail(branch)
              if (manager) {
                await addEmailJob({
                  to:      manager.email,
                  subject: `⚠️ POS Connection Error — ${branch.name}`,
                  html:    buildErrorEmailHtml(branch.name, result.message),
                })
              }
            } catch (emailErr) {
              logger.error(`[POS Pull Job] Failed to send alert email for store ${storeId}:`, emailErr.message)
            }

            // Remove the repeating job
            await removePosPullJob(storeId)
            logger.error(`[POS Pull Job] Store ${storeId}: marked as error after 3 consecutive failures`)
          }
        }
      } catch (err) {
        logger.error(`[POS Pull Job] Unhandled error for store ${storeId}:`, err.message)
        // Don't crash — BullMQ will handle the job failure
      }
    },
    { connection: getRedis(), concurrency: 5 }
  )
}

// ── Schedule a repeating job for a branch ─────────────────
async function schedulePosPullJob(storeId, intervalSeconds) {
  const queue = getPosPullQueue()
  const jobId = `pos-pull:${storeId}`

  // Remove existing job first (if any)
  await removePosPullJob(storeId)

  const intervalMs = (intervalSeconds || 300) * 1000 // default 5 minutes

  await queue.add(
    'pull',
    { storeId },
    {
      jobId,
      repeat: {
        every: intervalMs,
      },
    }
  )

  logger.info(`[POS Pull Job] Scheduled for store ${storeId} every ${intervalSeconds || 300}s`)
}

// ── Remove a repeating job for a branch ──────────────────
async function removePosPullJob(storeId) {
  const queue = getPosPullQueue()
  const jobId = `pos-pull:${storeId}`

  try {
    // Remove repeating jobs
    const repeatableJobs = await queue.getRepeatableJobs()
    for (const rj of repeatableJobs) {
      if (rj.id === jobId || rj.name === 'pull') {
        // Check if this job matches our store
        const matchKey = rj.key
        if (matchKey && matchKey.includes(jobId)) {
          await queue.removeRepeatableByKey(rj.key)
        }
      }
    }

    // Also try removing by job ID
    const job = await queue.getJob(jobId)
    if (job) {
      await job.remove()
    }

    failureCountMap.delete(storeId)
    logger.info(`[POS Pull Job] Removed for store ${storeId}`)
  } catch (err) {
    logger.warn(`[POS Pull Job] Error removing job for store ${storeId}:`, err.message)
  }
}

// ── Initialize: load all connected api_pull branches ─────
async function initializePosPullJobs() {
  try {
    const branches = await Store.find({
      'posConnection.status': 'connected',
      'posConnection.method': 'api_pull',
    })

    logger.info(`[POS Pull Job] Found ${branches.length} branches for api_pull scheduling`)

    for (const branch of branches) {
      await schedulePosPullJob(
        branch._id.toString(),
        branch.posConnection.pullIntervalSeconds || 300
      )
    }

    logger.info(`[POS Pull Job] ✅ Initialized ${branches.length} repeating pull jobs`)
  } catch (err) {
    logger.error('[POS Pull Job] Failed to initialize pull jobs:', err.message)
  }
}

// ── Helper: find branch manager email ────────────────────
async function getBranchManagerEmail(branch) {
  try {
    const { BranchManager } = require('../models')
    // Try to find via managerId on the store, or find by chainId
    if (branch.managerId) {
      const { User } = require('../models')
      return await User.findById(branch.managerId)
    }
    // Fallback: find branch manager linked to this chain
    const manager = await BranchManager.findOne({
      chainId: branch.chainId,
      isActive: true,
    })
    return manager
  } catch {
    return null
  }
}

// ── Helper: error email HTML ─────────────────────────────
function buildErrorEmailHtml(storeName, errorMessage) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;">
          <tr>
            <td style="background:#050505;padding:32px 40px;text-align:center;">
              <span style="font-family:Arial,sans-serif;font-size:26px;font-weight:900;color:#FFFFFF;letter-spacing:-1px;">
                KOUT<span style="color:#00E5A0;">IX</span>
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#DC2626;">
                ⚠️ POS Connection Error
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#6B7280;line-height:1.6;">
                The POS connection for <strong>${storeName || 'your store'}</strong> has failed
                <strong>3 consecutive times</strong> and has been automatically disabled.
              </p>
              <table cellpadding="0" cellspacing="0" style="background:#FEF2F2;border-radius:10px;border:1px solid #FECACA;width:100%;margin-bottom:24px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0;font-size:13px;color:#991B1B;line-height:1.5;">
                      <strong>Error:</strong> ${errorMessage || 'Unknown error'}
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:14px;color:#6B7280;line-height:1.6;">
                Please check your POS credentials and reconnect from the dashboard.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:24px 40px;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;">
                KOUTIX — Retail SaaS Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

module.exports = {
  getPosPullQueue,
  createPosPullWorker,
  schedulePosPullJob,
  removePosPullJob,
  initializePosPullJobs,
}
