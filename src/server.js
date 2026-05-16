// ============================================================
// KOUTIX — Server Entry Point
// ============================================================
require('dotenv').config()
const { createServer } = require('http')
const { Server }       = require('socket.io')

const app                          = require('./app')
const { connectDB }                = require('./config/database')
const { connectRedis, disconnectRedis } = require('./config/redis')
const { initFirebaseAdmin }        = require('./config/firebase')
const { socketAuthMiddleware }     = require('./middleware')
const { startWorkers }             = require('./jobs/workers')
const logger                       = require('./config/logger')

const PORT = parseInt(process.env.PORT || '5000', 10)

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin:      process.env.WEB_URL || '*',
    credentials: true,
  },
})

// Namespace: /admin — require superadmin cookie auth in handshake
io.of('/admin').use(socketAuthMiddleware).on('connection', (socket) => {
  socket.join('superadmin-room')
  logger.info(`Admin joined room: ${socket.user.email}`)
})

// Export io for use in controllers
module.exports.io = io

async function bootstrap() {
  try {
    // Connect all services
    await connectDB()
    await connectRedis()
    initFirebaseAdmin()
    startWorkers()

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 KOUTIX API running on port ${PORT} [${process.env.NODE_ENV}]`)
    })

    // ── Graceful shutdown ────────────────────────────────
    const shutdown = (signal) => {
      logger.info(`${signal} received — shutting down gracefully`)
      httpServer.close(async () => {
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
