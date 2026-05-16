// ============================================================
// KOUTIX — Clean non-POS-synced products
//
// Deletes any Product whose `posProductId` is unset, i.e. products
// that did NOT come from a POS sync (manual seeds, demo data, etc.).
// Running this leaves only the synced inventory behind.
//
// Usage:
//   node scripts/clean-non-pos-products.js                # all stores, dry run
//   node scripts/clean-non-pos-products.js --apply        # all stores, actually delete
//   node scripts/clean-non-pos-products.js --store=<id>   # one store only
// ============================================================
require('dotenv').config()
const mongoose = require('mongoose')
const { Product } = require('../src/models')

async function main() {
  const args  = process.argv.slice(2)
  const apply = args.includes('--apply')
  const storeArg = args.find((a) => a.startsWith('--store='))
  const storeId  = storeArg ? storeArg.split('=')[1] : null

  await mongoose.connect(process.env.MONGODB_URI)

  const filter = {
    $or: [
      { posProductId: { $exists: false } },
      { posProductId: null },
      { posProductId: '' },
    ],
  }
  if (storeId) {
    filter.storeId = new mongoose.Types.ObjectId(storeId)
  }

  const matches = await Product.find(filter).select('_id name sku storeId').lean()

  console.log(`Found ${matches.length} non-POS product(s)${storeId ? ` for store ${storeId}` : ''}.`)
  for (const p of matches) {
    console.log(`  - ${p.name} (${p.sku})  store=${p.storeId}`)
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to delete.')
    await mongoose.disconnect()
    return
  }

  const result = await Product.deleteMany(filter)
  console.log(`\nDeleted ${result.deletedCount} product(s).`)
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error('Failed:', err)
  try { await mongoose.disconnect() } catch (_) {}
  process.exit(1)
})
