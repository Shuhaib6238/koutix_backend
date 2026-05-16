# KOUTIX Backend — Architecture Diagram

## 🏗️ System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATIONS                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Web Browser  │  │ Mobile App   │  │ POS Systems (Integration)│  │
│  │   (React)    │  │  (React)     │  │  LS Retail / SAP        │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │ │
                HTTP REST API │ │ WebSocket (Socket.io)
                              ▼ ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    KOUTIX EXPRESS SERVER                            │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ MIDDLEWARE LAYER                                              │  │
│  │ ├─ Authentication (Firebase + JWT)                           │  │
│  │ ├─ CORS & Security (Helmet, Express-mongo-sanitize)         │  │
│  │ ├─ Rate Limiting (express-rate-limit)                       │  │
│  │ ├─ Body Parsing & Validation (Zod)                          │  │
│  │ └─ Error Handling & Logging (Morgan, Winston)               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ ROUTING LAYER (/api/v1/*)                                    │  │
│  │ ├─ /auth        (Login, Register, Logout)                    │  │
│  │ ├─ /users       (User Management)                            │  │
│  │ ├─ /stores      (Store CRUD)                                 │  │
│  │ ├─ /products    (Product Catalog)                            │  │
│  │ ├─ /orders      (Order Processing)                           │  │
│  │ ├─ /promotions  (Discounts & Promotions)                    │  │
│  │ ├─ /pos         (POS Integration)                            │  │
│  │ ├─ /admin       (Admin Dashboard)                            │  │
│  │ ├─ /stats       (Analytics)                                  │  │
│  │ └─ /webhooks    (Webhook Handlers)                           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ CONTROLLER LAYER                                              │  │
│  │ ├─ Handles requests from routes                              │  │
│  │ ├─ Validates input (Zod schemas)                             │  │
│  │ ├─ Orchestrates business logic                               │  │
│  │ └─ Returns JSON responses                                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │
┌─────────────────────────────┴──────────────────────────────────────┐
│             SERVICE & BUSINESS LOGIC LAYER                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ Admin Service    │  │ POS Service      │  │ Payment Service │  │
│  │                  │  │ • LSRetail       │  │ (Stripe)        │  │
│  │ • User mgmt      │  │ • SAP Commerce   │  │ • Charge        │  │
│  │ • Invitations    │  │ • Sync products  │  │ • Refund        │  │
│  │ • Analytics      │  │ • Sync orders    │  │ • Webhook       │  │
│  └──────────────────┘  └──────────────────┘  └─────────────────┘  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ Email Service    │  │ Storage Service  │  │ Notification    │  │
│  │                  │  │ (AWS S3)         │  │                 │  │
│  │ • Nodemailer     │  │ • Receipts       │  │ • Email         │  │
│  │ • Resend API     │  │ • Documents      │  │ • Socket.io     │  │
│  │ • Templates      │  │ • QR Codes       │  │ • Real-time     │  │
│  └──────────────────┘  └──────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │
┌─────────────────────────────┴──────────────────────────────────────┐
│                    DATA ACCESS LAYER                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ MongoDB          │  │ Redis Cache      │  │ Background Jobs │  │
│  │ (Mongoose)       │  │ (ioredis)        │  │ (BullMQ)        │  │
│  │                  │  │                  │  │                 │  │
│  │ Collections:     │  │ • Session tokens │  │ • POS pull job  │  │
│  │ • Users          │  │ • Cache data     │  │ • Email queue   │  │
│  │ • Stores         │  │ • Rate limits    │  │ • Webhook queue │  │
│  │ • Products       │  │ • Real-time data │  │ • Sync queue    │  │
│  │ • Orders         │  └──────────────────┘  └─────────────────┘  │
│  │ • Promotions     │                                              │
│  │ • POS Events     │                                              │
│  │ • Logs           │                                              │
│  └──────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │
┌─────────────────────────────┴──────────────────────────────────────┐
│                  EXTERNAL INTEGRATIONS                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ Firebase Admin   │  │ Stripe API       │  │ AWS Services    │  │
│  │                  │  │                  │  │                 │  │
│  │ • Authentication │  │ • Payment        │  │ • S3 (Storage)  │  │
│  │ • JWT tokens     │  │ • Webhooks       │  │ • CloudFront    │  │
│  │ • Custom claims  │  │ • Invoice        │  │ • CDN           │  │
│  └──────────────────┘  └──────────────────┘  └─────────────────┘  │
│  ┌──────────────────┐  ┌──────────────────┐                        │
│  │ POS Systems      │  │ Email Providers  │                        │
│  │                  │  │                  │                        │
│  │ • LS Retail      │  │ • SMTP (custom)  │                        │
│  │ • SAP Commerce   │  │ • Resend API     │                        │
│  │ • Webhooks       │  │ • Nodemailer     │                        │
│  └──────────────────┘  └──────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📡 Request-Response Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. CLIENT REQUEST                                                   │
│    POST /api/v1/orders                                              │
│    {                                                                │
│      "storeId": "123",                                              │
│      "customerId": "456",                                           │
│      "items": [...]                                                 │
│    }                                                                │
└─────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. MIDDLEWARE                                                       │
│    ├─ Parse request body (express.json)                             │
│    ├─ Verify JWT token (Firebase Auth)                              │
│    ├─ Rate limit check                                              │
│    └─ Validate against Zod schema                                   │
└─────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. ROUTER (orders.js)                                               │
│    Routes to appropriate controller method                          │
└─────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. CONTROLLER (orders.js controller)                                │
│    ├─ Extract request data                                          │
│    ├─ Call service methods                                          │
│    └─ Format response                                               │
└─────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. SERVICE LAYER                                                    │
│    ├─ Create order in MongoDB                                       │
│    ├─ Update inventory (POS adapter)                                │
│    ├─ Process payment (Stripe)                                      │
│    ├─ Add to email queue (BullMQ)                                   │
│    └─ Cache order (Redis)                                           │
└─────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. DATA ACCESS LAYER                                                │
│    ├─ Save to MongoDB                                               │
│    ├─ Update Redis cache                                            │
│    └─ Queue background job                                          │
└─────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7. RESPONSE TO CLIENT                                               │
│    {                                                                │
│      "success": true,                                               │
│      "data": {                                                      │
│        "orderId": "789",                                            │
│        "status": "pending",                                         │
│        "total": 99.99                                               │
│      }                                                              │
│    }                                                                │
└─────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 8. BACKGROUND PROCESSING                                            │
│    ├─ Email job (send confirmation)                                 │
│    ├─ Sync with POS system                                          │
│    └─ Webhook to external systems                                   │
└─────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 9. REAL-TIME UPDATE                                                 │
│    Socket.io broadcast to admin room:                               │
│    { event: "order.created", data: {...} }                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔌 POS System Integration (Adapter Pattern)

```
┌─────────────────┐
│ POS Adapter     │
│ Factory         │
└────────┬────────┘
         │
         ├─────────────────────┬─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
    ┌────────────┐      ┌────────────┐      ┌────────────┐
    │LS Retail   │      │SAP         │      │Custom POS  │
    │Adapter     │      │Commerce    │      │Adapter     │
    │            │      │Adapter     │      │            │
    │ • Sync     │      │ • Sync     │      │ • Sync     │
    │ • Pull     │      │ • Pull     │      │ • Pull     │
    │ • Push     │      │ • Push     │      │ • Push     │
    └────────────┘      └────────────┘      └────────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │ Base Adapter       │
                    │ (Interface)        │
                    │ • Connect()        │
                    │ • GetInventory()   │
                    │ • SyncProducts()   │
                    │ • SyncOrders()     │
                    └────────────────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │ Service Layer      │
                    │ (Business Logic)   │
                    └────────────────────┘
```

---

## 🎯 User Role Hierarchy

```
                    ┌──────────────┐
                    │ SuperAdmin   │
                    │ (Full Access)│
                    └──────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
         ┌────────┐  ┌──────────┐  ┌──────────┐
         │Chain   │  │Branch    │  │Custom    │
         │Manager │  │Manager   │  │Support   │
         │        │  │          │  │          │
         │Multi   │  │Single    │  │Help &    │
         │Store   │  │Branch    │  │Analytics │
         └────────┘  └──────────┘  └──────────┘
              │            │
              ▼            ▼
         ┌─────────────────────────┐
         │ Store Manager           │
         │ (POS Operations)        │
         └─────────────────────────┘
              │
              ▼
         ┌─────────────────────────┐
         │ End Customer            │
         │ (Shopping & Orders)     │
         └─────────────────────────┘
```

---

## 🔄 Data Flow: POS Sync

```
┌──────────────────┐
│ Scheduled Job    │
│ (BullMQ)         │
│ Every 5 minutes  │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────┐
│ posPull.job.js           │
│ Trigger sync             │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Adapter Factory          │
│ Get appropriate adapter  │
└────────┬─────────────────┘
         │
         ├──────► LS Retail Adapter
         │        ├─ Connect to API
         │        ├─ Pull inventory
         │        ├─ Pull orders
         │        └─ Return data
         │
         └──────► SAP Adapter
                  ├─ Connect to API
                  ├─ Pull inventory
                  ├─ Pull orders
                  └─ Return data
                       │
                       ▼
                ┌──────────────────┐
                │ Process Data     │
                │ • Validate       │
                │ • Transform      │
                │ • Merge          │
                └────────┬─────────┘
                         │
                         ▼
                ┌──────────────────┐
                │ Update MongoDB   │
                │ • Products       │
                │ • Inventory      │
                │ • Orders         │
                └────────┬─────────┘
                         │
                         ▼
                ┌──────────────────┐
                │ Cache to Redis   │
                │ Invalidate cache │
                └────────┬─────────┘
                         │
                         ▼
                ┌──────────────────┐
                │ Broadcast Update │
                │ Socket.io Event  │
                │ to Admin Room    │
                └──────────────────┘
```

---

## 🔐 Authentication Flow

```
┌─────────────────────┐
│ Client Login        │
│ Email + Password    │
└────────┬────────────┘
         │
         ▼
┌──────────────────────────────┐
│ POST /api/v1/auth/login      │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Controller (auth.js)         │
│ • Validate input             │
│ • Find user in MongoDB       │
│ • Compare password (bcrypt)  │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Firebase Admin SDK           │
│ Create custom token with:    │
│ • userId                     │
│ • role (superadmin, etc)     │
│ • permissions (custom claims)│
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Response to Client           │
│ {                            │
│   "token": "JWT_TOKEN",      │
│   "user": {...},             │
│   "expiresIn": 3600          │
│ }                            │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Client Stores Token          │
│ • LocalStorage               │
│ • Cookie (httpOnly)          │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Future Requests              │
│ Authorization: Bearer TOKEN  │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Middleware (Firebase verify) │
│ • Validate token signature   │
│ • Check expiration           │
│ • Extract user claims        │
│ • Attach to req.user         │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Controller Access             │
│ req.user available            │
│ Continue processing...        │
└──────────────────────────────┘
```

---

## 📊 Database Schema Overview

```
USERS COLLECTION
├─ id (ObjectId)
├─ email
├─ password (hashed)
├─ firstName
├─ lastName
├─ role (ENUM: superadmin, chain_manager, branch_manager, store_manager, customer)
├─ permissions (Array)
├─ stores (Array of store IDs)
├─ createdAt
└─ updatedAt

STORES COLLECTION
├─ id (ObjectId)
├─ name
├─ address
├─ city
├─ country
├─ manager (User ID)
├─ chainId (for multi-branch)
├─ inventory (ref to Inventory)
├─ posConnection (ref to PosConnection)
├─ status (ENUM: active, inactive)
├─ createdAt
└─ updatedAt

PRODUCTS COLLECTION
├─ id (ObjectId)
├─ sku
├─ name
├─ description
├─ price
├─ cost
├─ category
├─ image
├─ stores (Array of store IDs)
├─ variants (Array)
├─ createdAt
└─ updatedAt

ORDERS COLLECTION
├─ id (ObjectId)
├─ orderId (unique)
├─ customerId (or email for guest)
├─ storeId
├─ items (Array)
│   ├─ productId
│   ├─ quantity
│   ├─ price
│   └─ subtotal
├─ subtotal
├─ tax
├─ discount
├─ total
├─ status (ENUM: pending, processing, completed, cancelled)
├─ paymentMethod
├─ paymentStatus
├─ createdAt
└─ updatedAt

POS_CONNECTIONS COLLECTION
├─ id (ObjectId)
├─ storeId
├─ posType (ENUM: lsretail, sap, custom)
├─ credentials (encrypted)
├─ endpoint
├─ apiKey (encrypted)
├─ status (ENUM: connected, disconnected, error)
├─ lastSync
├─ syncInterval
└─ updatedAt

INVITE_TOKENS COLLECTION
├─ id (ObjectId)
├─ token (unique)
├─ email
├─ role
├─ createdBy (User ID)
├─ expiresAt
├─ used
├─ usedAt
└─ createdAt
```

---

## 🚀 Deployment Architecture

```
┌─────────────────────────────────────────────┐
│ Production Environment                      │
│                                             │
│ ┌──────────────────────────────────────┐   │
│ │ Load Balancer / API Gateway          │   │
│ │ (AWS ALB / API Gateway)              │   │
│ └────────────────┬─────────────────────┘   │
│                  │                          │
│    ┌─────────────┼─────────────┐           │
│    │             │             │           │
│    ▼             ▼             ▼           │
│ ┌──────┐    ┌──────┐    ┌──────┐          │
│ │Node  │    │Node  │    │Node  │          │
│ │Pod 1 │    │Pod 2 │    │Pod 3 │          │
│ └──────┘    └──────┘    └──────┘          │
│ (Kubernetes / ECS Cluster)                 │
│                  │                          │
│    ┌─────────────┼─────────────┐           │
│    │             │             │           │
│    ▼             ▼             ▼           │
│ ┌────────────────────────────────────┐    │
│ │ MongoDB Atlas (Cloud)              │    │
│ │ • Replica set                      │    │
│ │ • Backups                          │    │
│ │ • High availability                │    │
│ └────────────────────────────────────┘    │
│                                            │
│ ┌────────────────────────────────────┐    │
│ │ Redis Cloud / ElastiCache          │    │
│ │ • Session cache                    │    │
│ │ • Rate limit counters              │    │
│ │ • Real-time data                   │    │
│ └────────────────────────────────────┘    │
│                                            │
│ ┌────────────────────────────────────┐    │
│ │ AWS Services                       │    │
│ │ • S3 (File storage)                │    │
│ │ • CloudFront (CDN)                 │    │
│ │ • SQS (Message queue)              │    │
│ │ • SES (Email sending)              │    │
│ └────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

---

**Version:** 1.0  
**Last Updated:** 2025  
**Project:** KOUTIX Backend Architecture
