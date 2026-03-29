# KOUTIX Backend API

> **Pure Node.js + Express.js** backend for the KOUTIX Retail SaaS Platform.  
> No TypeScript — plain JavaScript (CommonJS) throughout.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Quick Start](#quick-start)
3. [Environment Variables](#environment-variables)
4. [Project Structure](#project-structure)
5. [API Reference](#api-reference)
6. [Authentication](#authentication)
7. [Payment Flow](#payment-flow)
8. [POS Sync](#pos-sync)
9. [BullMQ Jobs](#bullmq-jobs)
10. [Security](#security)
11. [Testing](#testing)
12. [Deployment](#deployment)

---

## Tech Stack

| Layer           | Technology                            |
|-----------------|---------------------------------------|
| Runtime         | Node.js 20                            |
| Framework       | Express.js 4                          |
| Language        | JavaScript (CommonJS — no TypeScript) |
| Database        | MongoDB Atlas (Mongoose 8)            |
| Cache / Queue   | Redis (ioredis) + BullMQ 5            |
| Auth            | Firebase Admin SDK                    |
| Push            | Firebase Cloud Messaging (FCM)        |
| Payments        | Stripe + Checkout.com (per-store)     |
| Email           | Resend (invites only)                 |
| Storage         | AWS S3 + CloudFront                   |
| PDF             | PDFKit                                |
| Validation      | Zod                                   |
| Logging         | Winston                               |
| Tests           | Jest + Supertest                      |
| Dev server      | Nodemon                               |
| Container       | Docker + Docker Compose               |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env
# → Fill in MONGODB_URI, REDIS_URL, Firebase, AWS, Stripe, Resend

# 3. Start MongoDB + Redis (Docker)
docker compose up mongo redis -d

# 4. Run development server (hot reload)
npm run dev

# API is live at:
curl http://localhost:5000/health
```

### Full stack with Docker Compose

```bash
# Production build
docker compose up --build

# Development with hot reload
docker compose --profile dev up
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values.

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 5000) |
| `MONGODB_URI` | ✅ | MongoDB Atlas connection string |
| `REDIS_URL` | ✅ | Redis connection URL |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | ✅ | Path to Firebase service account JSON |
| `ENCRYPTION_KEY` | ✅ | **Exactly 32 characters** — AES-256 key |
| `ENCRYPTION_IV` | ✅ | **Exactly 16 characters** — AES-256 IV |
| `STRIPE_SECRET_KEY` | ✅ | Platform Stripe key (subscriptions) |
| `RESEND_API_KEY` | ✅ | For invite emails |
| `AWS_ACCESS_KEY_ID` | ✅ | S3 uploads |
| `AWS_SECRET_ACCESS_KEY` | ✅ | S3 uploads |
| `S3_BUCKET_NAME` | ✅ | S3 bucket name |
| `APP_URL` | ✅ | Frontend URL for payment redirects |

> ⚠️ **Never commit `.env` or `firebase-service-account.json`** — both are in `.gitignore`.

---

## Project Structure

```
src/
├── server.js               # Entry point — bootstrap DB, Redis, Firebase, workers
├── app.js                  # Express app — middleware, routes, error handlers
│
├── config/
│   ├── database.js         # MongoDB connection (Mongoose)
│   ├── redis.js            # ioredis connection + cache helpers
│   ├── firebase.js         # Firebase Admin SDK + FCM push + custom claims
│   └── logger.js           # Winston structured logging
│
├── models/
│   └── index.js            # All 6 Mongoose schemas:
│                           #   User, Chain, Store, Product, Order, Promotion
│
├── middleware/
│   └── index.js            # authenticate, requireRole guards, IDOR protection,
│                           #   rate limiters, errorHandler, notFound, AppError
│
├── validators/
│   └── index.js            # All Zod schemas + validate() middleware factory
│
├── controllers/
│   ├── auth.js             # Register chain/store, invite flow, profile
│   ├── stores.js           # Store CRUD, payment gateway setup, stats, invite
│   ├── products.js         # Product CRUD, barcode lookup, stock adjust, bulk
│   ├── orders.js           # Create order (atomic stock), lifecycle, refund, receipt
│   ├── promotions.js       # Promotion CRUD, toggle, discount calculation
│   ├── admin.js            # Platform stats, revenue analytics, user management
│   ├── webhooks.js         # Stripe + Checkout.com HMAC-verified handlers
│   ├── users.js            # Invite, resend, deactivate, FCM token
│   └── pos.js              # Connect/disconnect POS, sync history, job status
│
├── routes/
│   ├── auth.js             # /auth/*
│   ├── stores.js           # /stores/*
│   ├── products.js         # /stores/:storeId/products/* (mergeParams)
│   ├── orders.js           # /orders/*
│   ├── promotions.js       # /promotions/*
│   ├── admin.js            # /admin/*
│   ├── webhooks.js         # /webhooks/:provider/:storeId
│   ├── users.js            # /users/*
│   └── pos.js              # /pos/*
│
├── services/
│   ├── payment/
│   │   └── index.js        # Stripe + Checkout.com sessions, refunds
│   ├── pos/
│   │   └── index.js        # Odoo / Lightspeed / Square sync connectors
│   ├── notification/
│   │   └── email.js        # Resend invite + transactional emails
│   └── storage/
│       ├── receipt.js      # PDFKit receipt generation + S3 upload
│       └── upload.js       # Multer + S3 upload middleware
│
├── jobs/
│   ├── queues.js           # BullMQ queue instances + job creator helpers
│   └── workers.js          # POS sync, notification, receipt workers
│
└── utils/
    ├── index.js            # success/error helpers, VAT calc, HMAC, pagination
    └── encryption.js       # AES-256-CBC encrypt/decrypt for gateway keys
```

---

## API Reference

### Base URL
```
http://localhost:5000/api/v1
```

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/register/chain` | ❌ | Register a chain manager |
| `POST` | `/auth/register/store` | ❌ | Register standalone store |
| `GET`  | `/auth/invite/verify/:token` | ❌ | Verify invite token |
| `POST` | `/auth/invite/accept/:token` | ❌ | Accept invite, set password |
| `GET`  | `/auth/me` | ✅ | Get current user |
| `PATCH`| `/auth/me` | ✅ | Update profile |
| `POST` | `/auth/change-password` | ✅ | Change password |

### Stores

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET`  | `/stores` | Any staff | List stores (scoped by role) |
| `POST` | `/stores` | chainManager+ | Create store |
| `GET`  | `/stores/:id` | Any | Get store detail |
| `PATCH`| `/stores/:id` | Any staff | Update store |
| `PUT`  | `/stores/:storeId/payment-gateway` | branchManager+ | Set gateway keys |
| `GET`  | `/stores/:storeId/stats` | Any | Revenue / orders stats |
| `POST` | `/stores/:storeId/invite` | chainManager | Invite branch manager |
| `GET`  | `/stores/:storeId/pos/status` | Any | POS connection status |
| `POST` | `/stores/:storeId/pos/sync` | branchManager | Trigger POS sync |
| `PATCH`| `/stores/:id/approve` | superAdmin | Approve store |
| `PATCH`| `/stores/:id/reject` | superAdmin | Reject store |
| `PATCH`| `/stores/:id/suspend` | superAdmin | Suspend store |

### Products (store-scoped)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/stores/:storeId/products` | List products (search, filter) |
| `POST` | `/stores/:storeId/products` | Create product |
| `GET`  | `/stores/:storeId/products/categories` | List categories |
| `GET`  | `/stores/:storeId/products/low-stock` | Low stock alerts |
| `GET`  | `/stores/:storeId/products/barcode/:barcode` | Barcode scan lookup |
| `GET`  | `/stores/:storeId/products/:id` | Get product |
| `PATCH`| `/stores/:storeId/products/:id` | Update product |
| `DELETE`| `/stores/:storeId/products/:id` | Soft delete |
| `POST` | `/stores/:storeId/products/:id/stock-adjust` | Adjust stock (±delta) |
| `POST` | `/stores/:storeId/products/bulk-price` | Bulk price update |

### Orders

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/orders` | Create order — atomic stock deduction + payment session |
| `GET`  | `/orders` | List orders (scoped by role) |
| `GET`  | `/orders/:id` | Get order |
| `PATCH`| `/orders/:id/status` | Update order status |
| `POST` | `/orders/:id/refund` | Initiate refund + restore stock |
| `GET`  | `/orders/:id/receipt` | Get PDF receipt URL + QR code |

### Webhooks (no auth — HMAC verified)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhooks/stripe/:storeId` | Stripe events (HMAC verified) |
| `POST` | `/webhooks/checkout/:storeId` | Checkout.com events (HMAC verified) |

### Admin (superAdmin only unless noted)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/admin/stats` | Platform KPIs |
| `GET`  | `/admin/analytics/revenue` | Revenue time series (chainManager+) |
| `GET`  | `/admin/analytics/top-stores` | Top stores by revenue (chainManager+) |
| `GET`  | `/admin/users` | All users |
| `PATCH`| `/admin/users/:id/role` | Change user role |
| `PATCH`| `/admin/users/:id/deactivate` | Deactivate user |
| `GET`  | `/admin/chains` | All chains |
| `GET`  | `/admin/stores/pending` | Stores awaiting approval |

---

## Authentication

All protected routes require:
```
Authorization: Bearer <Firebase ID Token>
```

The token is verified by `firebase-admin`. On verification, the user record is fetched from MongoDB and attached to `req.user`.

### Custom Firebase Claims (set by backend)
```json
{ "role": "branchManager", "storeId": "...", "chainId": "..." }
```

### Role hierarchy

```
superAdmin   → full access to everything
chainManager → own chain's stores, users, promotions
branchManager → own store only (orders, inventory, POS)
customer     → own orders only
```

---

## Payment Flow

```
1. POST /orders          ← app sends cart
2. Atomic stock deduct  ← MongoDB transaction
3. createPaymentSession ← backend calls store's gateway (Stripe or Checkout.com)
4. Returns paymentUrl   ← app opens in WebView
5. Customer pays        ← on hosted payment page
6. POST /webhooks/...   ← gateway calls backend (HMAC verified)
7. markOrderPaid()      ← order status → paid, receipt PDF generated
8. FCM push             ← customer gets notification with QR code
```

**Key security rule:** Store gateway keys are AES-256 encrypted in MongoDB.
The raw secret key is never exposed to the frontend — only decrypted server-side.

---

## POS Sync

```bash
# Connect a POS
POST /api/v1/pos/stores/:storeId/connect
{ "connector": "odoo", "credentials": { "url": "...", "db": "...", "username": "...", "apiKey": "..." } }

# Trigger sync (creates BullMQ job)
POST /api/v1/stores/:storeId/pos/sync

# Poll job status (every 2 seconds until done)
GET /api/v1/pos/stores/:storeId/jobs/:jobId

# View sync history
GET /api/v1/pos/stores/:storeId/sync-history
```

Supported connectors: **Odoo** (JSON-RPC), **Lightspeed** (REST API), **Square** (v2 API)

---

## BullMQ Jobs

| Queue | Job name | Trigger | Action |
|---|---|---|---|
| `pos-sync` | `sync-inventory` | Manual / scheduled | Fetch + upsert products from POS |
| `notifications` | `low-stock-alert` | Stock ≤ threshold | FCM push to store manager |
| `notifications` | `send-email` | Invite flow | Resend transactional email |
| `receipts` | `generate-receipt` | Order paid | Build PDF + upload to S3 |

Workers auto-start when the server boots. Each worker stores job status in Redis for real-time polling.

---

## Security

| Protection | Implementation |
|---|---|
| **Auth** | Firebase ID token verified on every request |
| **IDOR** | `canAccessStore` + `canAccessChain` middleware — checks role + ownership |
| **NoSQL injection** | `express-mongo-sanitize` strips `$` operators from req.body/query |
| **Rate limiting** | 100 req / 15min general · 10 req / 15min on auth routes |
| **Security headers** | `helmet` — CSP, X-Frame-Options, HSTS, etc. |
| **Encryption** | AES-256-CBC for all payment gateway keys stored in DB |
| **Webhook integrity** | HMAC-SHA256 verified (`crypto.timingSafeEqual`) for Stripe + Checkout.com |
| **Passwords** | Firebase handles all password hashing — never stored in our DB |
| **CORS** | Strict origin whitelist in production |

---

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

Tests use:
- **Jest** — test runner
- **Supertest** — HTTP integration testing
- **jest.mock()** — Firebase Admin and Redis are mocked (no external dependencies needed)

### Running tests without MongoDB
Set `MONGODB_URI` to a local instance or use `mongodb-memory-server`:
```bash
npm install --save-dev mongodb-memory-server
```

---

## Deployment

### AWS ECS (recommended for production)

```bash
# 1. Build and push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
docker build -t koutix-api .
docker tag koutix-api:latest $ECR_URI/koutix-api:latest
docker push $ECR_URI/koutix-api:latest

# 2. Update ECS service
aws ecs update-service --cluster koutix --service koutix-api --force-new-deployment
```

### Required infrastructure
- **ECS Fargate** — runs the container
- **MongoDB Atlas** — M10+ for production workloads
- **ElastiCache Redis** — r7g.medium or larger
- **S3 + CloudFront** — media storage + CDN
- **AWS Secrets Manager** — store `.env` values securely

### Environment variables in ECS
Use AWS Secrets Manager or Parameter Store to inject env vars into the ECS task definition — never bake secrets into the Docker image.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with nodemon (hot reload) |
| `npm start` | Start production server |
| `npm test` | Run Jest tests |
| `npm run test:watch` | Jest in watch mode |
| `npm run test:coverage` | Coverage report |
| `npm run lint` | ESLint check |
