/* eslint-disable no-console */
require('dotenv').config()
const mongoose = require('mongoose')
const { SuperAdmin, ChainManager, BranchManager, StoreManager, Customer, User, Chain, Store, Product, Order, Promotion } = require('./src/models')

async function fixAllIndexes() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb+srv://koutixofficial_db_user:mQf5V9Q8CeoctIJM@cluster0.gnge9lm.mongodb.net/?appName=Cluster0'
    await mongoose.connect(uri)
    console.log('Connected to MongoDB')

    const models = [
      SuperAdmin, ChainManager, BranchManager, StoreManager, Customer,
      User, Chain, Store, Product, Order, Promotion
    ]

    console.log('Synchronizing indexes (this drops orphaned indexes and builds missing ones)...')

    for (const Model of models) {
      if (!Model) {
        continue
      }
      
      console.log(`Syncing indexes for: ${Model.modelName}...`)

      await Model.cleanIndexes()

      await Model.syncIndexes()
      
      console.log(`✅ Synced ${Model.modelName}`)
    }

    console.log('All indexes synchronized successfully.')
    process.exit(0)
  } catch (err) {
    console.error('Error synchronizing indexes:', err)
    process.exit(1)
  }
}

fixAllIndexes()
