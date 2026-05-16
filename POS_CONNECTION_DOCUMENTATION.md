# KOUTIX POS Connection System
## Complete Technical Documentation

**Version:** 1.0  
**Date:** April 24, 2026  
**Project:** Koutix Backend

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Supported POS Types](#supported-pos-types)
3. [Data Model](#data-model)
4. [API Endpoints](#api-endpoints)
5. [Connection Flow](#connection-flow)
6. [API Pull Implementation](#api-pull-implementation)
7. [Webhook Implementation](#webhook-implementation)
8. [Adapter System](#adapter-system)
9. [Event Logging](#event-logging)
10. [Security & Encryption](#security--encryption)
11. [Error Handling](#error-handling)
12. [Complete Request/Response Examples](#complete-requestresponse-examples)

---

## Architecture Overview

The Koutix POS Connection system is a robust integration framework that synchronizes point-of-sale data from multiple POS vendors (LS Retail, SAP) into the Koutix platform. The system supports two synchronization methods:

1. **API Pull** - Koutix periodically pulls data from the POS API
2. **Webhook** - POS system pushes data directly to Koutix

The architecture ensures:
- Secure credential storage (AES encryption)
- Flexible authentication methods
- Reliable data synchronization
- Complete audit trail of all sync events
- Real-time status monitoring

---

## Supported POS Types

| POS Type | Description | Sync Methods | Status |
|----------|-------------|-------------|---------|
| **ls_retail** | LS Retail Point of Sale | api_pull, webhook | ✓ Active |
| **sap** | SAP ERP System | webhook | ✓ Active |
| **custom** | Custom Integration | api_pull, webhook | ✓ Active |

---

## Data Model

### Store.posConnection Schema

```javascript
{
  posType: {
    type: String,
    enum: ['ls_retail', 'sap', 'custom', null],
    default: null,
    description: 'The type of POS system connected'
  },
  
  method: {
    type: String,
    enum: ['api_pull', 'webhook', null],
    default: null,
    description: 'The synchronization method used'
  },
  
  status: {
    type: String,
    enum: ['disconnected', 'connected', 'error'],
    default: 'disconnected',
    description: 'Current connection status'
  },
  
  encryptedCredentials: {
    type: String,
    default: null,
    description: 'AES-256 encrypted credential object'
  },
  
  webhookSecret: {
    type: String,
    default: null,
    description: '32-byte hex string for webhook validation'
  },
  
  pullIntervalSeconds: {
    type: Number,
    default: 300,
    description: 'Interval (in seconds) for api_pull method'
  },
  
  lastSyncAt: {
    type: Date,
    default: null,
    description: 'Timestamp of last successful/failed sync'
  },
  
  lastSyncStatus: {
    type: String,
    enum: ['success', 'fail', null],
    default: null,
    description: 'Status of the last sync attempt'
  },
  
  lastErrorMessage: {
    type: String,
    default: null,
    description: 'Error message from last failed sync'
  }
}
```

---

## API Endpoints

### 1. Get Available Connectors
```
GET /api/pos/connectors
Authentication: Required
Authorization: Any authenticated user
```

**Response:**
```json
{
  "success": true,
  "data": ["ls_retail", "sap", "custom"]
}
```

---

### 2. Connect POS System
```
POST /api/pos/stores/:storeId/connect
Authentication: Required
Authorization: Branch Manager (or higher)
```

**Request Body:**
```json
{
  "posType": "ls_retail",
  "method": "api_pull",
  "credentials": {
    "baseUrl": "https://api.lsretail.com",
    "apiKey": "your-api-key"
  },
  "pullIntervalSeconds": 300
}
```

**Credentials Format by Type:**

**LS Retail (api_pull):**
```json
{
  "baseUrl": "https://api.lsretail.com",
  "apiKey": "token" // or username/password below
}
```

**LS Retail (alternative - basic auth):**
```json
{
  "baseUrl": "https://api.lsretail.com",
  "username": "user@example.com",
  "password": "secure_password"
}
```

**SAP (webhook):**
```json
{
  "sapServerUrl": "https://sap-system.com/notify"
}
```

**Response (api_pull):**
```json
{
  "success": true,
  "message": "POS connected successfully",
  "data": {
    "success": true,
    "posType": "ls_retail",
    "method": "api_pull",
    "status": "connected"
  }
}
```

**Response (webhook):**
```json
{
  "success": true,
  "message": "POS connected successfully",
  "data": {
    "success": true,
    "posType": "sap",
    "method": "webhook",
    "status": "connected",
    "webhookUrl": "https://api.koutix.com/api/pos/webhook/507f1f77bcf86cd799439011/sap",
    "webhookSecret": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
  }
}
```

---

### 3. Get Connection Status
```
GET /api/pos/status
Authentication: Required
Authorization: Branch Manager (or higher)
Query Params: storeId (optional, for superadmin/chain_manager)
```

**Response:**
```json
{
  "success": true,
  "data": {
    "posType": "ls_retail",
    "method": "api_pull",
    "status": "connected",
    "lastSyncAt": "2026-04-24T15:30:45.123Z",
    "lastSyncStatus": "success",
    "lastErrorMessage": null
  }
}
```

---

### 4. Test Connection
```
POST /api/pos/test
Authentication: Required
Authorization: Any authenticated user
```

**Request Body:**
```json
{
  "posType": "ls_retail",
  "method": "api_pull",
  "credentials": {
    "baseUrl": "https://api.lsretail.com",
    "apiKey": "your-api-key"
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Successfully connected to ls_retail API",
    "sampleData": {
      "TransactionID": "TXN123456",
      "Amount": 99.99,
      "Timestamp": "2026-04-24T15:30:45Z"
    }
  }
}
```

**Response (Failure):**
```json
{
  "success": false,
  "data": {
    "success": false,
    "message": "Connection test failed: Invalid API key"
  }
}
```

---

### 5. Disconnect POS
```
DELETE /api/pos/stores/:storeId/disconnect
Authentication: Required
Authorization: Branch Manager (or higher)
Query Params: storeId (optional, for superadmin/chain_manager)
```

**Response:**
```json
{
  "success": true,
  "message": "POS disconnected successfully",
  "data": null
}
```

---

### 6. Get Sync Events
```
GET /api/pos/events
Authentication: Required
Authorization: Branch Manager (or higher)
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "branchId": "507f1f77bcf86cd799439012",
      "posType": "ls_retail",
      "rawPayload": {
        "TransactionID": "TXN123456",
        "Amount": 99.99
      },
      "convertedPayload": {
        "transactionId": "TXN123456",
        "amount": 99.99,
        "timestamp": "2026-04-24T15:30:45Z"
      },
      "status": "success",
      "errorMessage": null,
      "receivedAt": "2026-04-24T15:30:45.123Z"
    }
  ]
}
```

---

## Connection Flow

### Phase 1: Validation
1. Verify POS type is valid (ls_retail, sap, custom)
2. Verify sync method is valid (api_pull, webhook)
3. Verify credentials object is present and valid

### Phase 2: Authentication
1. Verify user is authenticated
2. Verify user has branch_manager role or higher
3. Verify user has access to the specified store

### Phase 3: Connection Testing
**For api_pull:**
- Make real API call to POS endpoint
- Verify authentication works
- Verify API returns valid response

**For webhook:**
- If sapServerUrl provided, send test ping
- Verify server responds (even with error status)
- If no URL, assume ready to receive

### Phase 4: Credential Encryption
- Serialize credentials object to JSON
- Generate random AES-256 initialization vector (IV)
- Encrypt using AES-256-CBC with master key
- Store encrypted blob in database

### Phase 5: Webhook Secret Generation
- Generate 32 random bytes using crypto.randomBytes()
- Convert to hex string
- Store in database
- Return to client (only at connection time)

### Phase 6: Job Scheduling
**If api_pull:**
- Create BullMQ repeating job
- Set repeat pattern to every `pullIntervalSeconds`
- Job will call `pullFromAPI()` function

**If webhook:**
- No job needed
- Wait for incoming POST requests

### Phase 7: Response
**If api_pull:**
```json
{
  "status": "connected",
  "posType": "ls_retail",
  "method": "api_pull"
}
```

**If webhook:**
```json
{
  "status": "connected",
  "posType": "sap",
  "method": "webhook",
  "webhookUrl": "https://api.koutix.com/api/pos/webhook/...",
  "webhookSecret": "..."
}
```

---

## API Pull Implementation

### Triggered By
- BullMQ repeating job (every `pullIntervalSeconds`)
- Scheduler pulls from configured POS API

### Process Flow

```
1. Decrypt Credentials
   └─ Load encrypted credentials from database
   └─ Decrypt using AES-256-CBC
   └─ Extract baseUrl, apiKey, username, password

2. Calculate Time Window
   └─ If lastSyncAt exists: since = lastSyncAt (ISO 8601)
   └─ If no lastSyncAt: since = 24 hours ago

3. Build Authentication Header
   └─ If apiKey: Authorization: Bearer {apiKey}
   └─ If username/password: 
      └─ Create {username}:{password}
      └─ Base64 encode
      └─ Authorization: Basic {base64}

4. Make API Request
   ├─ Endpoint: {baseUrl}/sales
   ├─ Query params: since={since}
   ├─ Headers: Authorization, User-Agent, etc.
   └─ Timeout: 30 seconds

5. Parse Response
   └─ Handle array response: response.data[]
   └─ Handle object response: response.data.sales or .data
   └─ Extract transaction records

6. Convert Format
   └─ Pass raw records to adapter
   └─ Adapter converts to Koutix format
   └─ Returns { results: [...], errors: [...] }

7. Log Events
   ├─ For each successful conversion:
   │  ├─ Create PosEvent document
   │  ├─ Store raw + converted payload
   │  ├─ Set status: 'success'
   │  └─ Timestamp: now
   │
   └─ For each conversion error:
      ├─ Create PosEvent document
      ├─ Store raw payload + error message
      ├─ Set status: 'fail'
      └─ Timestamp: now

8. Update Store Record
   ├─ posConnection.lastSyncAt = now
   ├─ posConnection.lastSyncStatus = 'success'
   └─ posConnection.lastErrorMessage = null

9. Log Summary
   └─ [POS Pull] Store {id}: {count} events synced, {errors} errors
```

### Error Handling

**Decryption Error:**
```
├─ Log error
├─ Update lastSyncStatus: 'fail'
├─ Update lastErrorMessage: 'Failed to decrypt credentials'
└─ Return { success: false }
```

**API Call Error:**
```
├─ Log error with message
├─ Update lastSyncStatus: 'fail'
├─ Update lastErrorMessage: {error.message}
├─ Create PosEvent with status: 'fail'
└─ Return { success: false }
```

**Conversion Error:**
```
├─ For each failed record:
│  ├─ Create PosEvent with status: 'fail'
│  └─ Store errorMessage
├─ Count total errors
├─ Update lastErrorMessage if needed
└─ Continue processing
```

---

## Webhook Implementation

### Endpoint Details
```
POST /api/pos/webhook/:branchId/:posType
No Authentication Required (secret-based validation)
```

### Security Validation

**Step 1: Load Store**
- Find store by branchId
- Return 404 if not found

**Step 2: Validate Webhook Secret**
- Extract header: `x-webhook-secret`
- Compare with store.posConnection.webhookSecret
- Return 401 if mismatch or missing
- Log warning on failure

**Step 3: Validate POS Type**
- Verify posType in URL matches store.posConnection.posType
- Return 400 if mismatch

**Step 4: Validate Connection Status**
- Verify store.posConnection.status === 'connected'
- Return 400 if not connected

### Response Strategy

**Immediate Response (always 200):**
```json
{
  "success": true,
  "message": "Webhook received"
}
```

**Why 200?** 
- Prevents POS system from retrying
- Process is async, webhook doesn't wait for completion
- All processing happens after response sent

### Async Processing

**Process (via setImmediate):**
```
1. Call receiveWebhook() in background
2. Main request returns 200 immediately
3. Processing continues without client waiting

Error Handling:
├─ If webhook processing fails
├─ Log error (don't retry)
├─ Store error in PosEvent
└─ Update lastErrorMessage
```

### Webhook Payload Handling

**Input Format:**
```json
// Single object
{
  "VBELN": "DOC001",
  "Amount": 99.99,
  "CreatedAt": "2026-04-24T15:30:45Z"
}

// OR Array
[
  {
    "VBELN": "DOC001",
    "Amount": 99.99
  },
  {
    "VBELN": "DOC002",
    "Amount": 49.99
  }
]
```

**Processing:**
```
1. Normalize to array
   └─ If object: wrap in array
   └─ If array: use as-is

2. Convert with adapter
   └─ Pass array to adapter.convertMany()
   └─ Get { results: [...], errors: [...] }

3. Log events
   ├─ Successful conversions → PosEvent (status: 'success')
   └─ Failed conversions → PosEvent (status: 'fail')

4. Update store
   ├─ lastSyncAt = now
   ├─ lastSyncStatus = 'success' (if any results)
   └─ lastErrorMessage = error count (if any errors)
```

---

## Adapter System

### Architecture

The Adapter pattern provides a flexible way to handle different POS formats:

```
POS System → Raw Data → Adapter → Standardized Format → Koutix
```

### Available Adapters

| Adapter | File | Supports |
|---------|------|----------|
| **LSRetailAdapter** | `src/adapters/LSRetailAdapter.js` | LS Retail API format |
| **SAPAdapter** | `src/adapters/SAPAdapter.js` | SAP webhook format |
| **BaseAdapter** | `src/adapters/BaseAdapter.js` | Abstract base class |

### Adapter Interface

```javascript
class BaseAdapter {
  /**
   * Convert multiple POS records to Koutix format
   * @param {Array} records - Raw records from POS
   * @param {String} branchId - Store/branch ID
   * @returns {{ results: Array, errors: Array }}
   */
  convertMany(records, branchId) {
    // Returns both successful conversions and errors
  }

  /**
   * Remove sensitive fields from records
   * @param {Object} record - Raw POS record
   * @returns {Object} Sanitized record
   */
  sanitize(record) {
    // Remove passwords, secrets, etc.
  }
}
```

### Factory Pattern

```javascript
const AdapterFactory = {
  getAdapter(posType) {
    // Returns appropriate adapter instance
  },
  
  isSupported(posType) {
    // Check if type is supported
  },
  
  supportedTypes() {
    // List all supported types
  }
}
```

### Standardized Event Format

All adapters convert to:
```javascript
{
  transactionId: String,
  amount: Number,
  currency: String,
  timestamp: String (ISO 8601),
  items: Array,
  customer: {
    id: String,
    name: String,
    phone: String
  },
  metadata: Object
}
```

---

## Event Logging

### PosEvent Model

```javascript
{
  _id: ObjectId,
  
  branchId: ObjectId (ref: Store),
  posType: String ('ls_retail', 'sap', 'custom'),
  
  rawPayload: Object,
    └─ Original data from POS system
    └─ May contain sensitive fields
    └─ Preserved for debugging/audit
  
  convertedPayload: Object,
    └─ Standardized format
    └─ Ready for Koutix processing
    └─ Only for successful conversions
  
  status: String ('success' | 'fail'),
  
  errorMessage: String (if status === 'fail'),
    └─ Reason for conversion failure
    └─ e.g., "Missing required field: amount"
  
  receivedAt: Date,
  
  timestamps: {
    createdAt: Date,
    updatedAt: Date
  }
}
```

### Event Lifecycle

**Successful Sync:**
```
rawPayload: {transaction data from POS}
convertedPayload: {standardized format}
status: 'success'
errorMessage: null
```

**Failed Sync:**
```
rawPayload: {transaction data that failed}
convertedPayload: null/undefined
status: 'fail'
errorMessage: 'Validation error: amount is required'
```

**API Call Failure:**
```
rawPayload: {}
convertedPayload: null
status: 'fail'
errorMessage: 'API call failed: timeout after 30s'
```

### Querying Events

**Get recent events:**
```javascript
const events = await PosEvent.find({ branchId: storeId })
  .sort({ receivedAt: -1 })
  .limit(50)
  .lean()
```

**Find failures:**
```javascript
const failures = await PosEvent.find({ 
  branchId: storeId,
  status: 'fail'
})
```

**Get sync summary:**
```javascript
const summary = await PosEvent.aggregate([
  { $match: { branchId: storeId } },
  { $group: {
    _id: '$status',
    count: { $sum: 1 }
  }}
])
```

---

## Security & Encryption

### Credential Encryption

**Algorithm:** AES-256-CBC  
**Key Size:** 256 bits  
**IV:** Random 16 bytes per encryption

**Encryption Process:**
```
1. Get master encryption key from environment
   └─ process.env.ENCRYPTION_KEY

2. Serialize credentials to JSON string

3. Generate random IV (16 bytes)
   └─ crypto.randomBytes(16)

4. Create cipher with AES-256-CBC
   └─ crypto.createCipheriv(algorithm, key, iv)

5. Encrypt JSON
   └─ cipher.update(json, 'utf8', 'hex')
   └─ cipher.final('hex')

6. Store as: iv:encryptedData (hex:hex)
```

**Decryption Process:**
```
1. Extract IV and encrypted data
   └─ Split on first colon

2. Create decipher
   └─ crypto.createDecipheriv(algorithm, key, iv)

3. Decrypt
   └─ decipher.update(encrypted, 'hex', 'utf8')
   └─ decipher.final('utf8')

4. Parse JSON
   └─ JSON.parse(decrypted)
```

### Webhook Secret Validation

**Secret Generation:**
```javascript
const secret = crypto.randomBytes(32).toString('hex')
// Result: 64-character hex string
// Example: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

**Validation:**
```
1. Extract from request header: x-webhook-secret
2. Compare with database value
3. Return 401 if mismatch
4. Log warning on failure (for security monitoring)
```

### Credential Never Exposed

**In Responses:**
- Status endpoints return null for credentials
- Webhook endpoints never return secrets
- Connect response only returns webhookUrl + secret (at connection time)

**In Database:**
- Stored encrypted
- Never logged in plaintext
- Only decrypted when needed for API calls

**In Logs:**
- Error messages sanitize credentials
- API keys/passwords never logged
- Only top-level errors logged

---

## Error Handling

### Connection Test Failures

| Error | Status | Message |
|-------|--------|---------|
| Invalid POS type | 400 | "Invalid posType. Must be one of: ls_retail, sap, custom" |
| Invalid method | 400 | "Invalid method. Must be 'api_pull' or 'webhook'" |
| No credentials | 400 | "Credentials are required" |
| Store not found | 404 | "No store found for this branch manager" |
| Connection test failed | 400 | "Connection test failed: {error message}" |

### Sync Failures

| Scenario | Action | Storage |
|----------|--------|---------|
| Decryption fails | Log error | lastErrorMessage = 'Failed to decrypt credentials' |
| API timeout | Log error | lastErrorMessage = 'Timeout after 30s' |
| Invalid auth | Log error | lastErrorMessage = 'Unauthorized (401)' |
| Conversion error | Log & continue | PosEvent.errorMessage = specific error |
| Webhook invalid secret | Log warning | Return 401 |

### Recovery Strategies

**Auto-retry:**
- api_pull: Automatic next cycle (after pullIntervalSeconds)
- webhook: Depends on POS system implementation

**Manual Recovery:**
- View error message in status endpoint
- Review event logs for details
- Test connection again
- Disconnect and reconnect if needed

---

## Complete Request/Response Examples

### Example 1: Connect LS Retail via API Pull

**Request:**
```bash
curl -X POST https://api.koutix.com/api/pos/stores/507f1f77bcf86cd799439011/connect \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "posType": "ls_retail",
    "method": "api_pull",
    "credentials": {
      "baseUrl": "https://api.lsretail.com",
      "apiKey": "sk_test_1234567890abcdef"
    },
    "pullIntervalSeconds": 300
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "POS connected successfully",
  "data": {
    "success": true,
    "posType": "ls_retail",
    "method": "api_pull",
    "status": "connected"
  }
}
```

**Database State:**
```javascript
store.posConnection = {
  posType: "ls_retail",
  method: "api_pull",
  status: "connected",
  encryptedCredentials: "{encrypted}",
  webhookSecret: null,
  pullIntervalSeconds: 300,
  lastSyncAt: null,
  lastSyncStatus: null,
  lastErrorMessage: null
}
```

**BullMQ Job Created:**
- Job ID: `pos-pull:{storeId}`
- Repeat: Every 300 seconds
- Handler: `pullFromAPI()`

---

### Example 2: Connect SAP via Webhook

**Request:**
```bash
curl -X POST https://api.koutix.com/api/pos/stores/507f1f77bcf86cd799439011/connect \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "posType": "sap",
    "method": "webhook",
    "credentials": {
      "sapServerUrl": "https://sap.mycompany.com/notify"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "POS connected successfully",
  "data": {
    "success": true,
    "posType": "sap",
    "method": "webhook",
    "status": "connected",
    "webhookUrl": "https://api.koutix.com/api/pos/webhook/507f1f77bcf86cd799439011/sap",
    "webhookSecret": "8f2a6c9e1b3d5f7a9e2c4f6b8d0a2c4e6f8a0b2c4d6e8f0a2c4d6e8f0a2c4"
  }
}
```

**Database State:**
```javascript
store.posConnection = {
  posType: "sap",
  method: "webhook",
  status: "connected",
  encryptedCredentials: "{encrypted}",
  webhookSecret: "8f2a6c9e1b3d5f7a9e2c4f6b8d0a2c4e6f8a0b2c4d6e8f0a2c4d6e8f0a2c4",
  pullIntervalSeconds: undefined,
  lastSyncAt: null,
  lastSyncStatus: null,
  lastErrorMessage: null
}
```

**Configure SAP:**
- Webhook URL: `https://api.koutix.com/api/pos/webhook/507f1f77bcf86cd799439011/sap`
- Header: `x-webhook-secret: 8f2a6c9e1b3d5f7a9e2c4f6b8d0a2c4e6f8a0b2c4d6e8f0a2c4d6e8f0a2c4`

---

### Example 3: Webhook Payload

**SAP sends:**
```json
POST /api/pos/webhook/507f1f77bcf86cd799439011/sap
x-webhook-secret: 8f2a6c9e1b3d5f7a9e2c4f6b8d0a2c4e6f8a0b2c4d6e8f0a2c4d6e8f0a2c4

[
  {
    "VBELN": "0800123456",
    "FKART": "RV",
    "NETWR": 99.99,
    "WAERK": "USD",
    "ERDAT": "20260424",
    "ERZET": "153045",
    "BPDAT": {
      "NAME1": "John Doe",
      "TELF1": "+1234567890"
    }
  }
]
```

**Koutix Response (immediate):**
```json
{
  "success": true,
  "message": "Webhook received"
}
```

**Async Processing:**
1. Decrypt credentials (if needed)
2. Pass to SAPAdapter.convertMany()
3. Create PosEvent documents
4. Update store lastSyncAt/Status

**PosEvent Created:**
```javascript
{
  branchId: "507f1f77bcf86cd799439011",
  posType: "sap",
  rawPayload: {
    VBELN: "0800123456",
    FKART: "RV",
    NETWR: 99.99,
    WAERK: "USD",
    // ... full payload
  },
  convertedPayload: {
    transactionId: "0800123456",
    amount: 99.99,
    currency: "USD",
    timestamp: "2026-04-24T15:30:45Z",
    customer: {
      id: "CUST001",
      name: "John Doe",
      phone: "+1234567890"
    },
    items: [...]
  },
  status: "success",
  errorMessage: null,
  receivedAt: "2026-04-24T15:30:45.123Z"
}
```

---

### Example 4: Check Status

**Request:**
```bash
curl -X GET https://api.koutix.com/api/pos/status \
  -H "Authorization: Bearer {token}"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "posType": "ls_retail",
    "method": "api_pull",
    "status": "connected",
    "lastSyncAt": "2026-04-24T15:28:30.456Z",
    "lastSyncStatus": "success",
    "lastErrorMessage": null
  }
}
```

---

### Example 5: Disconnect

**Request:**
```bash
curl -X DELETE https://api.koutix.com/api/pos/stores/507f1f77bcf86cd799439011/disconnect \
  -H "Authorization: Bearer {token}"
```

**Response:**
```json
{
  "success": true,
  "message": "POS disconnected successfully",
  "data": null
}
```

**Database State (after):**
```javascript
store.posConnection = {
  posType: null,
  method: null,
  status: "disconnected",
  encryptedCredentials: null,
  webhookSecret: null,
  pullIntervalSeconds: undefined,
  lastSyncAt: "2026-04-24T15:28:30.456Z",  // preserved
  lastSyncStatus: "success",               // preserved
  lastErrorMessage: null
}
```

---

## Implementation Files

| File | Purpose |
|------|---------|
| `src/controllers/posConnection.js` | Main API endpoint handlers |
| `src/controllers/pos.js` | POS connection control logic |
| `src/services/pos/posSync.service.js` | Core sync logic (pull + webhook) |
| `src/adapters/BaseAdapter.js` | Abstract adapter class |
| `src/adapters/LSRetailAdapter.js` | LS Retail format converter |
| `src/adapters/SAPAdapter.js` | SAP format converter |
| `src/adapters/AdapterFactory.js` | Adapter factory pattern |
| `src/models/PosEvent.js` | Event logging model |
| `src/routes/pos.js` | API route definitions |
| `src/jobs/posPull.job.js` | BullMQ job handler |

---

## Summary

The Koutix POS Connection system provides:

✓ **Flexible Integration** - Support for multiple POS types and sync methods  
✓ **Secure Credentials** - AES-256 encryption for sensitive data  
✓ **Reliable Sync** - Both pull (scheduled) and push (webhook) methods  
✓ **Complete Audit Trail** - All events logged for troubleshooting  
✓ **Error Handling** - Comprehensive error messages and recovery  
✓ **Extensible Architecture** - Adapter pattern for new POS types  

---

**End of Documentation**
