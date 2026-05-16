# KOUTIX Backend — Complete Architecture Structure

## 📋 Overview
**Type:** Node.js REST API + Real-time WebSocket Server  
**Framework:** Express.js  
**Database:** MongoDB (Mongoose ODM)  
**Cache:** Redis (via ioredis)  
**Auth:** JWT + Cookie-based (Firebase Admin)  
**Real-time:** Socket.io  
**Payment:** Stripe  
**Storage:** AWS S3  
**Queue:** BullMQ  
**Email:** Nodemailer + Resend  

---

## 🏗️ Project Structure

```
koutix-backend/
├── src/
│   ├── server.js                 # HTTP + WebSocket entry point
│   ├── app.js                    # Express app configuration
│   │
│   ├── config/              
    # Configuration files
│   │   ├── database.js           # MongoDB connection
│   │   ├── redis.js              # Redis connection
│   │   ├── firebase.js           # Firebase Admin SDK
│   │   ├── logger.js             # Winston logging
│   │   └── firebase-service-account.json
│   |
│   ├── middleware/               # Express middleware
│   │   └── index.js              # Auth, error handling, rate limiting
│   │
│   ├── models/                   # MongoDB Schemas (Mongoose)
│   │   ├── index.js              # Model exports
│   │   ├── Customer.js           # Customer profile
│   │   ├── SuperAdmin.js         # Super admin user
│   │   ├── BranchManager.js      # Branch manager role
│   │   ├── ChainManager.js       # Chain/multi-branch manager
│   │   ├── StoreManager.js       # Single store manager
│   │   ├── InviteToken.js        # Email invite tokens
│   │   ├── PosEvent.js           # POS system events
│   │   └── [other domain models]
│   │
│   ├── controllers/              # Route handlers + business logic
│   │   ├── auth.js               # Authentication (login, signup, logout)
│   │   ├── users.js              # User management
│   │   ├── stores.js             # Store CRUD & management
│   │   ├── products.js           # Product catalog
│   │   ├── orders.js             # Order processing
│   │   ├── promotions.js         # Discount & promotion management
│   │   ├── pos.js                # POS integration endpoints
│   │   ├── posConnection.js      # POS connection setup
│   │   ├── admin.js              # Admin dashboard APIs
│   │   ├── webhooks.js           # Webhook handlers
│   │   └── [other domains]
│   │
│   ├── routes/                   # Express route definitions
│   │   ├── auth.js               # POST /api/v1/auth/*
│   │   ├── users.js              # GET/POST /api/v1/users/*
│   │   ├── stores.js             # GET/POST /api/v1/stores/*
│   │   ├── products.js           # GET/POST /api/v1/products/*
│   │   ├── orders.js             # GET/POST /api/v1/orders/*
│   │   ├── promotions.js         # GET/POST /api/v1/promotions/*
│   │   ├── pos.js                # GET/POST /api/v1/pos/*
│   │   ├── posConnection.js      # POST /api/v1/pos-connection/*
│   │   ├── admin.js              # GET/POST /api/v1/admin/*
│   │   ├── stats.js              # GET /api/v1/stats/*
│   │   ├── webhooks.js           # POST /api/v1/webhooks/*
│   │   └── [other routes]
│   │
│   ├── services/                 # Business logic & external integrations
│   │   ├── admin.service.js      # Admin operations
│   │   ├── pos/
│   │   │   ├── index.js          # POS service factory
│   │   │   └── posSync.service.js# POS data synchronization
│   │   ├── payment/
│   │   │   └── index.js          # Stripe payment integration
│   │   ├── notification/
│   │   │   └── email.js          # Email notifications
│   │   ├── storage/
│   │   │   ├── upload.js         # AWS S3 file upload
│   │   │   └── receipt.js        # Receipt generation & storage
│   │   └── [other services]
│   │
│   ├── adapters/                 # POS system adapters (Strategy pattern)
│   │   ├── AdapterFactory.js     # Factory for creating adapters
│   │   ├── BaseAdapter.js        # Abstract base class
│   │   ├── LSRetailAdapter.js    # LS Retail POS adapter
│   │   └── SAPAdapter.js         # SAP Commerce adapter
│   │
│   ├── jobs/                     # Background jobs & queues
│   │   ├── queues.js             # BullMQ queue definitions
│   │   ├── workers.js            # Job processors
│   │   └── posPull.job.js        # Sync POS data periodically
│   │
│   ├── utils/                    # Utility functions
│   │   ├── index.js              # Common utilities
│   │   ├── encryption.js         # Encryption/decryption helpers
│   │   └── stripe.js             # Stripe utility functions
│   │
│   ├── validators/               # Input validation (Zod schemas)
│   │   ├── index.js              # Exported validators
│   │   └── admin.validators.js   # Admin request validators
│   │
│   └── constants/                # Enums & constants (if exists)
│
├── .env                          # Environment variables (not in git)
├── .env.example                  # Example env file
├── .eslintrc.js                  # ESLint configuration
├── docker-compose.yml            # Docker services (MongoDB, Redis)
├── nodemon.json                  # Nodemon dev config
├── package.json                  # Dependencies & scripts
├── jest.config.js                # Jest test configuration
└── README.md

```

---

## 🔌 Key Architectural Patterns

### 1. **MVC Architecture**
- **Models** → Mongoose schemas with validation
- **Views** → JSON responses (REST API)
- **Controllers** → Route handlers with business logic

### 2. **Service Layer**
External integrations abstracted into services:
- `admin.service.js` - Admin operations
- `posSync.service.js` - POS data synchronization
- `email.js` - Email notifications
- `upload.js` - AWS S3 storage

### 3. **Adapter Pattern (POS Systems)**
Multiple POS systems supported via adapter pattern:
```
AdapterFactory.js
├── LSRetailAdapter.js (LS Retail POS)
├── SAPAdapter.js (SAP Commerce)
└── BaseAdapter.js (Interface)
```

### 4. **Queue/Job System (BullMQ)**
Background job processing:
- `posPull.job.js` - Periodic POS data sync
- `queues.js` - Queue definitions
- `workers.js` - Job processors

### 5. **Real-time Communication (Socket.io)**
WebSocket namespace: `/admin`
- Admin-only authenticated namespace
- Broadcasts to `superadmin-room`

---

## 👥 User Role Models

```
Users/Employees:
├── SuperAdmin
│   └── Full system access + analytics
│
├── ChainManager
│   └── Multi-branch management (>1 store)
│
├── BranchManager
│   └── Single branch management
│
├── StoreManager
│   └── Single store POS operations
│
└── Customer
    └── Retail customer account
```

---

## 📡 API Endpoints Structure

```
/api/v1/

├── /auth/
│   ├── POST   /register           # Create new account
│   ├── POST   /login              # Login
│   ├── POST   /logout             # Logout
│   ├── POST   /refresh-token      # Refresh JWT
│   └── POST   /verify-email       # Email verification
│
├── /users/
│   ├── GET    /:id                # Get user profile
│   ├── PUT    /:id                # Update profile
│   ├── POST   /                   # Create user (admin)
│   └── GET    /                   # List users (admin)
│
├── /stores/
│   ├── GET    /                   # List stores
│   ├── POST   /                   # Create store
│   ├── GET    /:id                # Store details
│   ├── PUT    /:id                # Update store
│   └── DELETE /:id                # Delete store
│
├── /products/
│   ├── GET    /                   # List products
│   ├── POST   /                   # Create product
│   ├── GET    /:id                # Product details
│   ├── PUT    /:id                # Update product
│   └── DELETE /:id                # Delete product
│
├── /orders/
│   ├── GET    /                   # List orders
│   ├── POST   /                   # Create order
│   ├── GET    /:id                # Order details
│   ├── PUT    /:id                # Update order status
│   └── DELETE /:id                # Cancel order
│
├── /promotions/
│   ├── GET    /                   # List promotions
│   ├── POST   /                   # Create promotion
│   ├── GET    /:id                # Promotion details
│   └── PUT    /:id                # Update promotion
│
├── /pos/
│   ├── GET    /                   # POS status
│   ├── POST   /sync               # Manual sync
│   ├── GET    /inventory          # Stock levels
│   └── POST   /transaction        # Record transaction
│
├── /pos-connection/
│   ├── POST   /setup              # Configure POS connection
│   ├── GET    /status             # Connection status
│   └── POST   /test               # Test connection
│
├── /admin/
│   ├── GET    /dashboard          # Admin dashboard
│   ├── GET    /analytics          # System analytics
│   ├── GET    /users              # All users list
│   ├── GET    /stores             # All stores
│   └── POST   /invite             # Invite user
│
├── /stats/
│   ├── GET    /sales              # Sales statistics
│   ├── GET    /traffic            # User traffic
│   └── GET    /revenue            # Revenue reports
│
└── /webhooks/
    ├── POST   /stripe             # Stripe events
    ├── POST   /pos-system         # POS events
    └── POST   /email-events       # Email provider events
```

---

## 🔐 Security Features

✅ **Helmet.js** - HTTP security headers  
✅ **Express rate-limiting** - DDoS protection  
✅ **MongoDB sanitization** - NoSQL injection prevention  
✅ **CORS** - Origin validation  
✅ **Cookie parser** - Secure cookie handling  
✅ **Firebase authentication** - JWT + custom claims  
✅ **bcryptjs** - Password hashing  
✅ **Zod validation** - Input schema validation  

---

## 🔄 Data Flow Example: Order Creation

```
1. POST /api/v1/orders
   ├── Express middleware (auth, validation)
   │
2. Route handler (orders.js route)
   ├── Call controller method
   │
3. Controller (orders.js controller)
   ├── Validate input (Zod schema)
   ├── Call service layer
   │
4. Service layer
   ├── Create order in MongoDB
   ├── Update inventory (via POS adapter)
   ├── Process payment (Stripe service)
   ├── Send notification (email service)
   │
5. Response
   ├── JSON with order details
   └── Broadcast via Socket.io to admin room
```

---

## 📦 Key Dependencies

| Package | Purpose |
|---------|---------|
| **express** | Web framework |
| **mongoose** | MongoDB ODM |
| **ioredis** | Redis client |
| **firebase-admin** | Auth & real-time database |
| **stripe** | Payment processing |
| **@aws-sdk/client-s3** | AWS S3 file storage |
| **bullmq** | Job queue system |
| **socket.io** | Real-time WebSocket |
| **bcryptjs** | Password hashing |
| **zod** | Schema validation |
| **winston** | Logging |
| **nodemailer** | Email (SMTP) |
| **resend** | Email (transactional) |
| **pdfkit** | PDF generation |
| **qrcode** | QR code generation |
| **helmet** | Security headers |
| **cors** | Cross-origin requests |
| **morgan** | HTTP request logging |

---

## 🚀 Startup Flow

```
1. server.js bootstrap()
   ├── Load .env variables
   ├── Create Express app (app.js)
   ├── Create HTTP server
   ├── Initialize Socket.io
   │
2. Connect services
   ├── connectDB() → MongoDB
   ├── connectRedis() → Redis cache
   ├── initFirebaseAdmin() → Firebase
   │
3. Start HTTP server
   ├── Listen on PORT (default 5000)
   │
4. Graceful shutdown
   ├── SIGTERM/SIGINT handlers
   ├── Close connections
   └── Exit process
```

---

## 🔧 Development Commands

```bash
# Start development server (with auto-reload)
npm run dev

# Start production server
npm start

# Run tests
npm test

# Watch tests
npm test:watch

# Test coverage
npm test:coverage

# Lint code
npm run lint
```

---

## 📊 Database Models (MongoDB Collections)

### Key Collections:

```
Users/
├── superadmins
├── branch_managers
├── chain_managers
├── store_managers
└── customers

Retail/
├── stores
├── products
├── inventory
└── promotions

Orders/
├── orders
├── order_items
└── payments

POS/
├── pos_connections
├── pos_events
└── pos_sync_logs

Tokens/
└── invite_tokens

Logs/
├── activity_logs
└── error_logs
```

---

## 🎯 Key Features

✅ **Multi-tenant** - Support multiple stores/chains  
✅ **POS Integration** - LS Retail, SAP adapters  
✅ **Real-time** - Socket.io admin notifications  
✅ **Payment Processing** - Stripe integration  
✅ **Email Notifications** - Nodemailer + Resend  
✅ **File Storage** - AWS S3  
✅ **Background Jobs** - BullMQ queue system  
✅ **Analytics** - Sales, traffic, revenue stats  
✅ **Role-based access** - SuperAdmin, ChainManager, BranchManager, StoreManager, Customer  
✅ **Webhook handling** - Stripe, POS systems, email providers  

---

## 📝 Environment Variables

Required in `.env`:

```
# Server
NODE_ENV=development
PORT=5000
WEB_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb://localhost:27017/koutix

# Redis
REDIS_URL=redis://localhost:6379

# Firebase
FIREBASE_PROJECT_ID=your-project
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...

# JWT
JWT_SECRET=your-secret

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# AWS S3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=koutix-assets

# Email
SMTP_HOST=...
SMTP_USER=...
SMTP_PASSWORD=...
RESEND_API_KEY=...

# POS Systems
LSRETAIL_API_KEY=...
SAP_API_KEY=...
```

---

## 🔗 Integration Points

```
External Services:
├── MongoDB Atlas (Cloud DB)
├── Redis Cloud (Caching)
├── Firebase (Authentication)
├── Stripe (Payment processing)
├── AWS S3 (File storage)
├── Nodemailer/Resend (Email)
├── POS Systems (LS Retail, SAP)
└── Socket.io (Real-time)
```

---

**Generated:** 2025  
**Project:** KOUTIX Retail SaaS Backend
