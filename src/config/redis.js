// ============================================================
// KOUTIX — Redis Connection (ioredis)
// ============================================================
const Redis = require('ioredis')
const logger = require('./logger')

let redisClient = null

async function connectRedis() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379'

  redisClient = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times) => {
      if (times > 10) {
        logger.error('Redis: too many retries, giving up')
        return null
      }
      return Math.min(times * 100, 3000)
    },
  })

  redisClient.on('connect', () => logger.info('✅ Redis connected'))
  redisClient.on('error', (err) => logger.error('Redis error:', err))
  redisClient.on('reconnecting', () => logger.warn('Redis reconnecting…'))

  await redisClient.ping()
  return redisClient
}

function getRedis() {
  if (!redisClient) {
    throw new Error('Redis not initialized — call connectRedis() first')
  }
  return redisClient
}

async function disconnectRedis() {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
  }
}

// Simple cache helpers
const cache = {
  async get(key) {
    const redis = getRedis()
    const val = await redis.get(key)
    return val ? JSON.parse(val) : null
  },

  async set(key, value, ttlSeconds = 300) {
    const redis = getRedis()
    await redis.setex(key, ttlSeconds, JSON.stringify(value))
  },

  async del(...keys) {
    const redis = getRedis()
    if (keys.length) {
      await redis.del(...keys)
    }
  },

  async invalidatePattern(pattern) {
    const redis = getRedis()
    const keys = await redis.keys(pattern)
    if (keys.length) {
      await redis.del(...keys)
    }
  },
}

module.exports = { connectRedis, getRedis, disconnectRedis, cache }
