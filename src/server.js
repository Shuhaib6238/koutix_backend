// ============================================================
// KOUTIX — Server Entry Point
// ============================================================
require('dotenv').config()

const app                          = require('./app')
const { connectDB }                = require('./config/database')
const { connectRedis, disconnectRedis } = require('./config/redis')
const { initFirebaseAdmin }        = require('./config/firebase')
const { startWorkers }             = require('./jobs/workers')
const logger                       = require('./config/logger')

const PORT = parseInt(process.env.PORT || '5000', 10)

async function bootstrap() {
  try {
    // Connect all services
    await connectDB()
    await connectRedis()
    initFirebaseAdmin()
    // startWorkers()

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`🚀 KOUTIX API running on port ${PORT} [${process.env.NODE_ENV}]`)
    })

    // ── Graceful shutdown ────────────────────────────────
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully`)
      server.close(async () => {
        await disconnectRedis()
        logger.info('Server closed')
        process.exit(0)
      })
      // Force kill after 10s
      setTimeout(() => {
        logger.error('Forced shutdown after timeout')
        process.exit(1)
      }, 10_000)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT',  () => shutdown('SIGINT'))

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection:', reason)
    })

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error)
      process.exit(1)
    })
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

bootstrap()
