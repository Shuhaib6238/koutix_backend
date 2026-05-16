// ============================================================
// KOUTIX — POS Sync Service (LS Retail pull + SAP webhook)
// ============================================================
const axios = require('axios')
const { Store, Product } = require('../../models')
const PosEvent = require('../../models/PosEvent')
const AdapterFactory = require('../../adapters/AdapterFactory')
const { decryptObject } = require('../../utils/encryption')
const logger = require('../../config/logger')

// ── Build the LS Retail sales URL — honors credentials.salesPath override ──
function buildSalesUrl(baseUrl, salesPath) {
  const trimmedBase = String(baseUrl).replace(/\/+$/, '')
  const path = (salesPath && String(salesPath).trim()) || '/sales'
  return `${trimmedBase}${path.startsWith('/') ? '' : '/'}${path}`
}

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

  const { baseUrl, apiKey, username, password, salesPath } = credentials
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

    const response = await axios.get(buildSalesUrl(baseUrl, salesPath), {
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

    // Upsert each unique product into the Product collection so the
    // dashboard / inventory mirrors what the POS is actually selling.
    const upsertResult = await upsertProductsFromEvents(branch._id, results)

    // Also pull the full product catalog (with stock levels). Best-effort —
    // a failure here shouldn't fail the sales sync.
    try {
      await pullProductsFromAPI(branch)
    } catch (err) {
      logger.warn(`[POS Pull] Catalog refresh failed for store ${branch._id}: ${err.message}`)
    }

    // Update branch sync status
    await Store.findByIdAndUpdate(branch._id, {
      'posConnection.lastSyncAt':     new Date(),
      'posConnection.lastSyncStatus': 'success',
      'posConnection.lastErrorMessage': null,
    })

    logger.info(`[POS Pull] Store ${branch._id}: ${results.length} events synced, ${errors.length} errors, ${upsertResult.upserted} products upserted (${upsertResult.skipped} skipped)`)
    return { success: true, synced: results.length, errors: errors.length, productsUpserted: upsertResult.upserted }
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

    // Upsert each unique product into the Product collection.
    const upsertResult = await upsertProductsFromEvents(branchId, results)

    // Update branch sync status
    await Store.findByIdAndUpdate(branchId, {
      'posConnection.lastSyncAt':       new Date(),
      'posConnection.lastSyncStatus':   results.length > 0 ? 'success' : 'fail',
      'posConnection.lastErrorMessage': errors.length > 0 ? `${errors.length} conversion errors` : null,
    })

    logger.info(`[POS Webhook] Store ${branchId}: ${results.length} events received, ${errors.length} errors, ${upsertResult.upserted} products upserted (${upsertResult.skipped} skipped)`)
    return { success: true, processed: results.length, errors: errors.length, productsUpserted: upsertResult.upserted }
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
  const creds = credentials || {}

  try {
    if (method === 'api_pull') {
      const { baseUrl, apiKey, username, password, salesPath } = creds

      if (!baseUrl) {
        return { success: false, message: 'baseUrl is required for api_pull mode' }
      }

      // 'custom' posType: skip live probe — we don't know its API shape
      if (posType === 'custom') {
        return {
          success: true,
          message: 'Custom POS configured. Live probe skipped — verify connectivity manually.',
        }
      }

      const headers = {}
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`
      } else if (username && password) {
        headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
      }

      const url = buildSalesUrl(baseUrl, salesPath)
      const response = await axios.get(url, {
        params: { since: new Date().toISOString(), limit: 1 },
        headers,
        timeout: 15000,
        validateStatus: (s) => s < 500, // treat 4xx as "reachable but unauthorized" — still a successful probe
      })

      if (response.status >= 400) {
        return {
          success: false,
          message: `${posType} API at ${url} responded with ${response.status}: ${response.statusText || 'check baseUrl/salesPath/credentials'}`,
        }
      }

      return {
        success:    true,
        message:    `Successfully connected to ${posType} API at ${url}`,
        sampleData: response.data?.sales?.[0] || response.data?.data?.[0] || null,
      }
    }

    if (method === 'webhook') {
      const { sapServerUrl } = creds

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
        if (err.response) {
          return {
            success: true,
            message: `SAP server responded with status ${err.response.status} — server is reachable`,
          }
        }
        return { success: false, message: `Cannot reach SAP server: ${err.message}` }
      }
    }

    return { success: false, message: `Unknown method: ${method}` }
  } catch (err) {
    return { success: false, message: `Connection test failed: ${err.message}` }
  }
}

// ── Pull products catalog from POS (api_pull) ────────────
// Hits the POS /products endpoint and upserts each item into the Product
// collection so the inventory page reflects what the POS knows about.
// Stock comes straight from the POS payload — this is the source of truth.
async function pullProductsFromAPI(branch) {
  let credentials
  try {
    credentials = decryptObject(branch.posConnection.encryptedCredentials)
  } catch (err) {
    logger.error(`[POS Pull-Products] Failed to decrypt credentials for store ${branch._id}:`, err.message)
    return { success: false, message: 'Failed to decrypt credentials' }
  }

  const { baseUrl, apiKey, username, password, productsPath } = credentials
  if (!baseUrl) {
    return { success: false, message: 'baseUrl is required' }
  }

  const trimmedBase = String(baseUrl).replace(/\/+$/, '')
  const path = (productsPath && String(productsPath).trim()) || '/products'
  const url = `${trimmedBase}${path.startsWith('/') ? '' : '/'}${path}`

  const headers = {}
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  } else if (username && password) {
    headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  }

  let products
  try {
    const response = await axios.get(url, { headers, timeout: 30000 })
    products = Array.isArray(response.data)
      ? response.data
      : (response.data?.products || response.data?.data || [])
  } catch (err) {
    logger.error(`[POS Pull-Products] API call failed for store ${branch._id}:`, err.message)
    return { success: false, message: err.message }
  }

  if (!Array.isArray(products) || products.length === 0) {
    return { success: true, upserted: 0, skipped: 0 }
  }

  let upserted = 0
  let skipped  = 0

  for (const p of products) {
    // Field aliases — different POS systems use different names.
    const code = String(
      p.id ?? p.posProductId ?? p.sku ?? p.code ?? p.ItemCode ?? ''
    ).trim()
    if (!code) {
      skipped++
      continue
    }

    const name     = String(p.name ?? p.ItemDescription ?? p.description ?? code)
    const price    = Number(p.price ?? p.UnitAmt ?? 0) || 0
    const stock    = Number(p.stock ?? p.quantity ?? p.qty ?? p.OnHand ?? 0) || 0
    const category = String(p.category ?? p.Category ?? 'POS Synced') || 'POS Synced'
    const barcode  = String(p.barcode ?? p.sku ?? code)

    try {
      await Product.findOneAndUpdate(
        { storeId: branch._id, posProductId: code },
        {
          $set: {
            name,
            price,
            stock,
            category,
          },
          $setOnInsert: {
            storeId:      branch._id,
            posProductId: code,
            sku:          code,
            barcode,
            isActive:     true,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      upserted++
    } catch (err) {
      if (err.code === 11000) {
        logger.warn(`[POS Pull-Products] Skipped "${code}" — sku/barcode collides with a non-POS product for store ${branch._id}`)
        skipped++
      } else {
        logger.error(`[POS Pull-Products] Upsert failed for "${code}":`, err.message)
        skipped++
      }
    }
  }

  logger.info(`[POS Pull-Products] Store ${branch._id}: ${upserted} products upserted (${skipped} skipped)`)
  return { success: true, upserted, skipped }
}

// ── Helper: upsert products from synced sales events ─────
// Each KoutixStandardEvent represents a single sold line item; multiple
// events can reference the same product. We dedupe on productId per call
// and upsert by { storeId, posProductId } so the inventory list mirrors
// what's actually sold through the POS. Stock is left untouched here —
// POS sales tell us flow, not absolute inventory.
async function upsertProductsFromEvents(branchId, events) {
  if (!events || !events.length) {
    return { upserted: 0, skipped: 0 }
  }

  const seen = new Set()
  let upserted = 0
  let skipped  = 0

  for (const event of events) {
    const code = String(event.productId || '').trim()
    if (!code || seen.has(code)) {
      continue
    }
    seen.add(code)

    try {
      await Product.findOneAndUpdate(
        { storeId: branchId, posProductId: code },
        {
          $set: {
            name:          event.productName || code,
            price:         Number(event.unitPrice) || 0,
          },
          $setOnInsert: {
            storeId:      branchId,
            posProductId: code,
            sku:          code,
            barcode:      code,
            category:     'POS Synced',
            stock:        0,
            isActive:     true,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      upserted++
    } catch (err) {
      // Duplicate-key on (storeId, sku) or (storeId, barcode) means a
      // pre-existing non-POS product already claims this code. Skip and warn.
      if (err.code === 11000) {
        logger.warn(`[POS Sync] Product upsert skipped — code "${code}" already exists for store ${branchId} (likely a manually-created product)`)
        skipped++
      } else {
        logger.error(`[POS Sync] Product upsert failed for code "${code}":`, err.message)
        skipped++
      }
    }
  }

  return { upserted, skipped }
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

module.exports = { pullFromAPI, pullProductsFromAPI, receiveWebhook, testConnection }
