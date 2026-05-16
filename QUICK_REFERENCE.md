# KOUTIX Backend — Quick Reference Guide

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your credentials

# Start development server
npm run dev

# Start production
npm start

# Run tests
npm test
```

---

## 📂 Key File Locations

| File | Purpose |
|------|---------|
| `src/server.js` | HTTP + WebSocket entry point |
| `src/app.js` | Express configuration |
| `src/config/` | Database, Redis, Firebase, Logger config |
| `src/controllers/` | Route handlers & business logic |
| `src/routes/` | Express route definitions |
| `src/models/` | MongoDB Mongoose schemas |
| `src/services/` | External service integrations |
| `src/adapters/` | POS system adapters |
| `src/middleware/` | Auth, validation, error handling |
| `src/validators/` | Zod input validation schemas |
| `src/jobs/` | Background job definitions |
| `src/utils/` | Utility functions |

---

## 🔗 Key APIs Reference

### Authentication
```bash
POST   /api/v1/auth/register          # Create account
POST   /api/v1/auth/login             # Login
POST   /api/v1/auth/logout            # Logout
POST   /api/v1/auth/refresh-token     # Refresh JWT
POST   /api/v1/auth/verify-email      # Email verification
```

### Users
```bash
GET    /api/v1/users                  # List all users
POST   /api/v1/users                  # Create user
GET    /api/v1/users/:id              # Get user details
PUT    /api/v1/users/:id              # Update user
DELETE /api/v1/users/:id              # Delete user
```

### Stores
```bash
GET    /api/v1/stores                 # List stores
POST   /api/v1/stores                 # Create store
GET    /api/v1/stores/:id             # Store details
PUT    /api/v1/stores/:id             # Update store
DELETE /api/v1/stores/:id             # Delete store
```

### Products
```bash
GET    /api/v1/products               # List products
POST   /api/v1/products               # Create product
GET    /api/v1/products/:id           # Product details
PUT    /api/v1/products/:id           # Update product
DELETE /api/v1/products/:id           # Delete product
```

### Orders
```bash
GET    /api/v1/orders                 # List orders
POST   /api/v1/orders                 # Create order
GET    /api/v1/orders/:id             # Order details
PUT    /api/v1/orders/:id             # Update order status
DELETE /api/v1/orders/:id             # Cancel order
```

### Promotions
```bash
GET    /api/v1/promotions             # List promotions
POST   /api/v1/promotions             # Create promotion
GET    /api/v1/promotions/:id         # Promotion details
PUT    /api/v1/promotions/:id         # Update promotion
```

### POS Integration
```bash
GET    /api/v1/pos/                   # POS status
POST   /api/v1/pos/sync               # Manual sync
GET    /api/v1/pos/inventory          # Stock levels
POST   /api/v1/pos/transaction        # Record transaction

POST   /api/v1/pos-connection/setup   # Configure POS
GET    /api/v1/pos-connection/status  # Connection status
POST   /api/v1/pos-connection/test    # Test connection
```

### Admin
```bash
GET    /api/v1/admin/dashboard        # Dashboard data
GET    /api/v1/admin/analytics        # System analytics
GET    /api/v1/admin/users            # All users
GET    /api/v1/admin/stores           # All stores
POST   /api/v1/admin/invite           # Invite user
```

### Statistics
```bash
GET    /api/v1/stats/sales            # Sales data
GET    /api/v1/stats/traffic          # User traffic
GET    /api/v1/stats/revenue          # Revenue reports
```

---

## 🗄️ Database Models Quick Reference

### User Model
```javascript
{
  _id: ObjectId,
  email: String (unique),
  password: String (hashed),
  firstName: String,
  lastName: String,
  role: String (enum: superadmin, chain_manager, branch_manager, store_manager, customer),
  stores: [ObjectId], // Array of store IDs
  permissions: [String],
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Store Model
```javascript
{
  _id: ObjectId,
  name: String,
  address: String,
  city: String,
  country: String,
  managerId: ObjectId, // User reference
  chainId: ObjectId, // For multi-branch
  posConnection: ObjectId, // PosConnection reference
  inventory: Object,
  status: String (enum: active, inactive),
  createdAt: Date,
  updatedAt: Date
}
```

### Product Model
```javascript
{
  _id: ObjectId,
  sku: String (unique),
  name: String,
  description: String,
  price: Number,
  cost: Number,
  category: String,
  image: String (URL),
  stores: [ObjectId], // Which stores sell this
  variants: Array,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Order Model
```javascript
{
  _id: ObjectId,
  orderId: String (unique),
  customerId: String,
  storeId: ObjectId,
  items: [
    {
      productId: ObjectId,
      quantity: Number,
      price: Number,
      subtotal: Number
    }
  ],
  subtotal: Number,
  tax: Number,
  discount: Number,
  total: Number,
  status: String (enum: pending, processing, completed, cancelled),
  paymentMethod: String,
  paymentStatus: String,
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🔐 Common Security Headers

```javascript
// Added by helmet.js automatically
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000
Content-Security-Policy: ...
```

---

## 🧪 Testing Quick Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test:watch

# Run tests with coverage
npm test:coverage

# Run specific test file
npm test -- orders.test.js

# Run tests matching pattern
npm test -- --testNamePattern="should create order"
```

---

## 📝 Environment Variables Checklist

```
NODE_ENV=development
PORT=5000
WEB_URL=http://localhost:3000

MONGODB_URI=mongodb://...
REDIS_URL=redis://...

FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...

JWT_SECRET=your-secret-key

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=koutix-assets

SMTP_HOST=smtp.gmail.com
SMTP_USER=...
SMTP_PASSWORD=...

RESEND_API_KEY=...

LSRETAIL_API_KEY=...
SAP_API_KEY=...
```

---

## 🔄 Common Workflows

### Creating a New API Endpoint

1. **Create Route** (`src/routes/feature.js`)
   ```javascript
   router.get('/', authorize('admin'), featureController.list)
   ```

2. **Create Controller** (`src/controllers/feature.js`)
   ```javascript
   exports.list = async (req, res) => {
     const items = await featureService.list()
     res.json({ data: items })
   }
   ```

3. **Create Service** (`src/services/feature.service.js`)
   ```javascript
   exports.list = async () => {
     return await Feature.find()
   }
   ```

4. **Add to app.js**
   ```javascript
   app.use('/api/v1/features', require('./routes/feature'))
   ```

5. **Create Validator** (`src/validators/feature.validators.js`)
   ```javascript
   const createFeatureSchema = z.object({...})
   ```

### Adding a Background Job

1. **Define Job** (`src/jobs/myJob.job.js`)
2. **Add to Queue** (`src/jobs/queues.js`)
3. **Create Worker** (`src/jobs/workers.js`)
4. **Trigger Job** in controller/service

### Integrating with POS System

1. **Create Adapter** (`src/adapters/NewPosAdapter.js`)
   - Extend `BaseAdapter`
   - Implement required methods

2. **Register in Factory** (`src/adapters/AdapterFactory.js`)

3. **Use in Service** (`src/services/pos/index.js`)

---

## 🐛 Common Debugging Tips

### Enable Debug Logging
```bash
DEBUG=koutix:* npm run dev
```

### Check MongoDB Connection
```bash
# In MongoDB Atlas dashboard
# Check cluster health, connection details
# Verify IP whitelist includes your IP
```

### Test Redis Connection
```javascript
// In redis.js config file
redis.on('connect', () => logger.info('Redis connected'))
redis.on('error', (err) => logger.error('Redis error:', err))
```

### Firebase Auth Issues
```javascript
// Check Firebase service account JSON
// Verify credentials in .env
// Check custom claims setup
```

### Stripe Webhook Testing
```bash
# Using Stripe CLI
stripe listen --forward-to localhost:5000/api/v1/webhooks/stripe
stripe trigger payment_intent.succeeded
```

---

## 📊 Performance Optimization Tips

1. **Database Queries**
   - Use `.select()` to limit fields
   - Add `.lean()` for read-only queries
   - Implement pagination on list endpoints

2. **Caching**
   - Cache frequently accessed data in Redis
   - Implement cache invalidation on updates

3. **Rate Limiting**
   - Adjust limits in middleware/index.js
   - Different limits for different endpoints

4. **File Upload**
   - Compress images before S3
   - Use multipart uploads for large files

5. **API Response**
   - Use compression (already enabled)
   - Pagination for large datasets
   - Field selection to reduce payload

---

## 🔗 External API Documentation Links

- [Stripe API](https://stripe.com/docs/api)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [AWS S3 SDK](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/)
- [MongoDB](https://docs.mongodb.com/)
- [Redis](https://redis.io/commands/)
- [Socket.io](https://socket.io/docs/)

---

## 📞 Support & Resources

### Getting Help
1. Check existing code patterns
2. Review similar controllers/services
3. Check test files for usage examples
4. Read inline code comments

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| JWT Expired | Implement token refresh endpoint |
| MongoDB Connection Timeout | Increase connection timeout in .env |
| CORS Error | Add origin to allowedOrigins in app.js |
| Redis Connection Failed | Check REDIS_URL in .env |
| S3 Upload Failed | Verify AWS credentials & bucket permissions |
| Email Not Sending | Check SMTP credentials & provider limits |

---

## 🚀 Deployment Checklist

- [ ] Set all env variables in production
- [ ] Update WEB_URL for CORS
- [ ] Enable HTTPS/TLS
- [ ] Set NODE_ENV=production
- [ ] Update MongoDB connection string (Atlas)
- [ ] Configure Redis (ElastiCache or Redis Cloud)
- [ ] Set up Firebase credentials
- [ ] Configure AWS S3 bucket
- [ ] Set Stripe production keys
- [ ] Configure email provider
- [ ] Set up database backups
- [ ] Enable monitoring & logging
- [ ] Configure health check endpoint
- [ ] Set up error alerting
- [ ] Test all integrations

---

**Last Updated:** 2025  
**Project:** KOUTIX Backend  
