// ============================================================
// KOUTIX — POS Sync Service (Odoo, Lightspeed, Square)
// ============================================================
const axios = require('axios')
const { Product } = require('../../models')
const logger = require('../../config/logger')

// ── Main sync dispatcher ──────────────────────────────────
async function syncInventory(connector, credentials, storeId, onProgress) {
  switch (connector) {
    case 'odoo':       return syncOdoo(credentials, storeId, onProgress)
    case 'lightspeed': return syncLightspeed(credentials, storeId, onProgress)
    case 'square':     return syncSquare(credentials, storeId, onProgress)
    default:
      throw new Error(`Unknown POS connector: ${connector}`)
  }
}

// ── Odoo Connector ────────────────────────────────────────
async function syncOdoo(credentials, storeId, onProgress) {
  const { url, db, username, apiKey } = credentials
  const log = ['Connecting to Odoo…']
  await onProgress(5, log)

  const authResp = await axios.post(`${url}/web/dataset/call_kw`, {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model: 'res.users',
      method: 'authenticate',
      args: [db, username, apiKey, {}],
      kwargs: {},
    },
  })

  const uid = authResp.data?.result
  if (!uid) throw new Error('Odoo authentication failed')

  log.push(`Authenticated as UID ${uid}`)
  await onProgress(15, log)

  const productsResp = await axios.post(`${url}/web/dataset/call_kw`, {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model: 'product.product',
      method: 'search_read',
      args: [[['active', '=', true]]],
      kwargs: {
        fields: ['id','name','barcode','default_code','list_price','qty_available'],
        limit: 1000,
      },
    },
  })

  const odooProducts = productsResp.data?.result ?? []
  log.push(`Fetched ${odooProducts.length} products from Odoo`)
  await onProgress(40, log)

  return upsertProducts(
    odooProducts.map((p) => ({
      posProductId: String(p.id),
      barcode:      p.barcode || p.default_code || `ODOO-${p.id}`,
      name:         p.name,
      price:        p.list_price,
      stock:        Math.floor(p.qty_available),
      sku:          p.default_code || String(p.id),
    })),
    storeId, log, onProgress
  )
}

// ── Lightspeed Connector ──────────────────────────────────
async function syncLightspeed(credentials, storeId, onProgress) {
  const { accountId, apiKey } = credentials
  const log = ['Connecting to Lightspeed…']
  await onProgress(10, log)

  const response = await axios.get(
    `https://api.lightspeedapp.com/API/Account/${accountId}/Item.json`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: { limit: 1000, load_relations: '["ItemShops"]' },
    }
  )

  const items = response.data?.Item ?? []
  log.push(`Fetched ${items.length} items from Lightspeed`)
  await onProgress(40, log)

  return upsertProducts(
    items.map((item) => ({
      posProductId: item.itemID,
      barcode:      item.upc || item.customSku || `LS-${item.itemID}`,
      name:         item.description,
      price:        parseFloat(item.Prices?.ItemPrice?.[0]?.amount || '0'),
      stock:        parseInt(item.ItemShops?.ItemShop?.[0]?.qoh || '0'),
      sku:          item.customSku || item.itemID,
    })),
    storeId, log, onProgress
  )
}

// ── Square Connector ──────────────────────────────────────
async function syncSquare(credentials, storeId, onProgress) {
  const { accessToken, locationId } = credentials
  const log = ['Connecting to Square…']
  await onProgress(10, log)

  const [catalogResp, inventoryResp] = await Promise.all([
    axios.get('https://connect.squareup.com/v2/catalog/list', {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      params: { types: 'ITEM' },
    }),
    axios.post(
      'https://connect.squareup.com/v2/inventory/counts/batch-retrieve',
      { location_ids: [locationId], states: ['IN_STOCK'] },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    ),
  ])

  const squareItems = catalogResp.data?.objects ?? []
  const inventoryCounts = inventoryResp.data?.counts ?? []
  const inventoryMap = new Map(inventoryCounts.map((c) => [c.catalog_object_id, parseInt(c.quantity)]))

  log.push(`Fetched ${squareItems.length} items from Square`)
  await onProgress(40, log)

  const products = squareItems.flatMap((item) =>
    item.item_data.variations.map((v) => ({
      posProductId: v.id,
      barcode:      v.item_variation_data.sku || `SQ-${v.id}`,
      name:         item.item_data.name,
      price:        (v.item_variation_data.price_money?.amount || 0) / 100,
      stock:        inventoryMap.get(v.id) ?? 0,
      sku:          v.item_variation_data.sku || v.id,
    }))
  )

  return upsertProducts(products, storeId, log, onProgress)
}

// ── Shared bulk upsert ────────────────────────────────────
async function upsertProducts(products, storeId, log, onProgress) {
  let updated = 0
  let errors = 0
  const batchSize = 50

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize)
    const ops = batch.map((p) => ({
      updateOne: {
        filter: { storeId, barcode: p.barcode },
        update: {
          $set: {
            name:         p.name,
            price:        p.price,
            stock:        p.stock,
            sku:          p.sku,
            posProductId: p.posProductId,
            isActive:     true,
          },
          $setOnInsert: {
            storeId,
            category:          'General',
            lowStockThreshold: 5,
            unit:              'piece',
            vatIncluded:       true,
            images:            [],
            tags:              [],
          },
        },
        upsert: true,
      },
    }))

    try {
      const result = await Product.bulkWrite(ops)
      updated += result.modifiedCount + result.upsertedCount
    } catch (e) {
      errors++
      logger.error('Bulk write error during POS sync:', e)
    }

    const progress = 40 + Math.floor(((i + batchSize) / products.length) * 55)
    log.push(`Synced ${Math.min(i + batchSize, products.length)} / ${products.length} products`)
    await onProgress(Math.min(progress, 95), log)
  }

  log.push(`✅ Sync complete: ${updated} products updated, ${errors} errors`)
  await onProgress(100, log)

  return { productsUpdated: updated, errors }
}

module.exports = { syncInventory }
