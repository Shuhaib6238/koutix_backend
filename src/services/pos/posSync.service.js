// ============================================================
// KOUTIX — POS Sync Service (LS Retail pull + SAP webhook)
// ============================================================
const axios = require('axios')
const { Store } = require('../../models')
const PosEvent = require('../../models/PosEvent')
const AdapterFactory = require('../../adapters/AdapterFactory')
const { decryptObject } = require('../../utils/encryption')
const logger = require('../../config/logger')

// ── Pull from API (LS Retail — api_pull method) ──────────
async function pullFromAPI(branch) {
  const adapter = AdapterFactory.getAdapter(branch.posConnection.posType)
  let credentials

  try {
    credentials = decryptObject(branch.posConnection.encryptedCredentials)
  } catch (err) {
    logger.error(`[POS Pull] Failed to decrypt credentials for store ${branch._id}:`, err.message)
    await markSyncResult(branch._id, 'fail', 'Failed to decrypt credentials')
    return { success: false, message: 'Failed to decrypt credentials' }
  }

  const { baseUrl, apiKey, username, password } = credentials
  const since = branch.posConnection.lastSyncAt
    ? branch.posConnection.lastSyncAt.toISOString()
    : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // default: last 24h

  try {
    // Build auth headers for LS Retail
    const headers = {}
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    } else if (username && password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
    }

    const response = await axios.get(`${baseUrl}/sales`, {
      params: { since },
      headers,
      timeout: 30000,
    })

    const rawSales = Array.isArray(response.data) ? response.data : (response.data?.sales || response.data?.data || [])
    const { results, errors } = adapter.convertMany(rawSales, branch._id.toString())

    // Log each successfully converted event
    for (const event of results) {
      await PosEvent.create({
        branchId:         branch._id,
        posType:          branch.posConnection.posType,
        rawPayload:       adapter.sanitize(rawSales.find(r => String(r.TransactionID) === event.transactionId) || {}),
        convertedPayload: event,
        status:           'success',
        receivedAt:       new Date(),
      })
    }

    // Log conversion errors
    for (const err of errors) {
      await PosEvent.create({
        branchId:     branch._id,
        posType:      branch.posConnection.posType,
        rawPayload:   adapter.sanitize(err.record),
        status:       'fail',
        errorMessage: err.error,
        receivedAt:   new Date(),
      })
    }

    // Update branch sync status
    await Store.findByIdAndUpdate(branch._id, {
      'posConnection.lastSyncAt':     new Date(),
      'posConnection.lastSyncStatus': 'success',
      'posConnection.lastErrorMessage': null,
    })

    logger.info(`[POS Pull] Store ${branch._id}: ${results.length} events synced, ${errors.length} errors`)
    return { success: true, synced: results.length, errors: errors.length }
  } catch (err) {
    logger.error(`[POS Pull] API call failed for store ${branch._id}:`, err.message)
    await markSyncResult(branch._id, 'fail', err.message)

    // Log failed event
    await PosEvent.create({
      branchId:     branch._id,
      posType:      branch.posConnection.posType,
      rawPayload:   {},
      status:       'fail',
      errorMessage: `API call failed: ${err.message}`,
      receivedAt:   new Date(),
    })

    return { success: false, message: err.message }
  }
}

// ── Receive Webhook (SAP — webhook method) ───────────────
async function receiveWebhook(branchId, rawPayload, posType) {
  const adapter = AdapterFactory.getAdapter(posType)

  try {
    // Handle both single object and array payloads
    const records = Array.isArray(rawPayload) ? rawPayload : [rawPayload]
    const { results, errors } = adapter.convertMany(records, branchId)

    // Log successful events
    for (const event of results) {
      await PosEvent.create({
        branchId,
        posType,
        rawPayload:       adapter.sanitize(records.find(r => String(r.VBELN) === event.transactionId) || {}),
        convertedPayload: event,
        status:           'success',
        receivedAt:       new Date(),
      })
    }

    // Log conversion errors
    for (const err of errors) {
      await PosEvent.create({
        branchId,
        posType,
        rawPayload:   adapter.sanitize(err.record),
        status:       'fail',
        errorMessage: err.error,
        receivedAt:   new Date(),
      })
    }

    // Update branch sync status
    await Store.findByIdAndUpdate(branchId, {
      'posConnection.lastSyncAt':       new Date(),
      'posConnection.lastSyncStatus':   results.length > 0 ? 'success' : 'fail',
      'posConnection.lastErrorMessage': errors.length > 0 ? `${errors.length} conversion errors` : null,
    })

    logger.info(`[POS Webhook] Store ${branchId}: ${results.length} events received, ${errors.length} errors`)
    return { success: true, processed: results.length, errors: errors.length }
  } catch (err) {
    logger.error(`[POS Webhook] Processing failed for store ${branchId}:`, err.message)

    await PosEvent.create({
      branchId,
      posType,
      rawPayload:   adapter.sanitize(rawPayload),
      status:       'fail',
      errorMessage: err.message,
      receivedAt:   new Date(),
    })

    await markSyncResult(branchId, 'fail', err.message)
    return { success: false, message: err.message }
  }
}

// ── Test Connection ──────────────────────────────────────
async function testConnection({ posType, method, credentials }) {
  try {
    if (method === 'api_pull') {
      // For LS Retail: make one real API call to verify connectivity
      const { baseUrl, apiKey, username, password } = credentials

      const headers = {}
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`
      } else if (username && password) {
        headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
      }

      const response = await axios.get(`${baseUrl}/sales`, {
        params: { since: new Date().toISOString(), limit: 1 },
        headers,
        timeout: 15000,
      })

      return {
        success:    true,
        message:    `Successfully connected to ${posType} API`,
        sampleData: response.data?.sales?.[0] || response.data?.data?.[0] || null,
      }
    } else if (method === 'webhook') {
      // For SAP: verify the URL is reachable by sending a test ping
      const { sapServerUrl } = credentials

      if (!sapServerUrl) {
        return { success: true, message: 'Webhook mode — no outbound URL to test. Ready to receive.' }
      }

      try {
        await axios.post(
          sapServerUrl,
          { test: true, source: 'koutix', timestamp: new Date().toISOString() },
          { timeout: 10000 }
        )
        return { success: true, message: `SAP server at ${sapServerUrl} is reachable` }
      } catch (err) {
        // If SAP returns an error but we got a response, the server is reachable
        if (err.response) {
          return {
            success: true,
            message: `SAP server responded with status ${err.response.status} — server is reachable`,
          }
        }
        return { success: false, message: `Cannot reach SAP server: ${err.message}` }
      }
    }

    return { success: true, message: `POS type ${posType} configured (no test available for custom)` }
  } catch (err) {
    return { success: false, message: `Connection test failed: ${err.message}` }
  }
}

// ── Helper: update sync result ───────────────────────────
async function markSyncResult(storeId, status, errorMessage = null) {
  const update = {
    'posConnection.lastSyncAt':       new Date(),
    'posConnection.lastSyncStatus':   status,
  }
  if (errorMessage) {
    update['posConnection.lastErrorMessage'] = errorMessage
  }
  await Store.findByIdAndUpdate(storeId, update)
}

module.exports = { pullFromAPI, receiveWebhook, testConnection }
