# SelfPay — Full Auth Flow Reference

## Tech Stack
- **Backend**: Node.js, Express, MongoDB, Firebase Admin SDK, Stripe
- **Frontend**: React (Vite/Next.js), Firebase Client SDK
- **App**: Flutter, Firebase Client SDK (FlutterFire)

---

## Roles & Access

| Role | Platform | How Created |
|------|----------|-------------|
| `superadmin` | Web | Seeder script |
| `chain_manager` | Web | Self-register + Stripe |
| `branch_manager` | Web | Invited by chain_manager |
| `store_manager` | Web | Self-register + Stripe |
| `customer` | App | Phone OTP / Google |

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/chain/register` | Public | Register chain manager |
| POST | `/api/auth/store/register` | Public | Register store manager |
| POST | `/api/auth/branch/invite` | chain_manager | Invite branch manager |
| POST | `/api/auth/branch/activate` | Public (token) | Activate branch account |
| POST | `/api/auth/login` | Public | Web login (session cookie) |
| POST | `/api/auth/logout` | Authenticated | Web logout |
| GET | `/api/auth/me` | Authenticated | Get current user |
| GET | `/api/auth/me/subscription` | chain/store | Get subscription info |
| POST | `/api/auth/me/change-plan` | chain/store | Change plan tier |
| POST | `/api/auth/customer/verify` | Bearer | Phone OTP |
| POST | `/api/auth/customer/social` | Bearer | Google Sign-In |
| POST | `/api/auth/customer/logout` | customer | App logout |

---

## Auth Flows

### 1. Superadmin (seeder only)
```bash
node scripts/seed-superadmin.js
# Then login via Web Login flow
```

### 2. Chain Manager Register
```
Frontend Form → POST /api/auth/chain/register → get checkoutUrl → redirect to Stripe
```
```json
// POST /api/auth/chain/register
{
  "email": "owner@mychain.com",
  "password": "MyPass@123",
  "businessName": "My Chain",
  "phone": "+971501234567",
  "plan": "basic"       // basic | standard | pro
}
// → 201 { checkoutUrl: "https://checkout.stripe.com/..." }
```

### 3. Store Manager Register
```json
// POST /api/auth/store/register
{
  "email": "owner@mystore.com",
  "password": "MyPass@123",
  "storeName": "My Store",
  "name": "John",
  "phone": "+971501234567",
  "storeAddress": "123 Main St",
  "plan": "basic"
}
// → 201 { checkoutUrl: "https://checkout.stripe.com/..." }
```

### 4. Branch Manager Invite (chain_manager logged in)
```json
// POST /api/auth/branch/invite
// Header: Cookie: session=...  (auto-sent)
{
  "branchEmail": "branch@email.com",
  "branchName": "Downtown Branch",
  "branchAddress": "456 Oak Ave"
}
// → Email sent with activation link
```

### 5. Branch Manager Activate (public page: /activate?token=...)
```json
// POST /api/auth/branch/activate
{
  "token": "uuid-from-email-link",
  "password": "MyPass@123",
  "name": "Branch Manager Name",
  "phone": "+971509876543"
}
// → 200 { user: {...} }
```

### 6. Web Login (all web roles)
```js
// Step 1: Firebase Client SDK
import { signInWithEmailAndPassword } from 'firebase/auth'
const cred = await signInWithEmailAndPassword(auth, email, password)
const idToken = await cred.user.getIdToken()

// Step 2: Send to backend
// POST /api/auth/login
// Body: { "idToken": "..." }
// → Sets httpOnly session cookie + returns { role, uid }

// Step 3: Redirect by role
// superadmin     → /admin/dashboard
// chain_manager  → /chain/dashboard
// branch_manager → /branch/dashboard
// store_manager  → /store/dashboard
```

### 7. Route Protection
```js
// On every protected page load:
const res = await fetch('/api/auth/me', { credentials: 'include' })
if (!res.ok) return redirect('/login')
const { data } = await res.json()
// data.role → check if allowed on this page
```

### 8. Logout
```js
await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
// → Clears cookie, revokes tokens
// → Redirect to /login
```

### 9. Customer Auth (App only)
```
Phone OTP:  Flutter FirebaseAuth.verifyPhoneNumber → signInWithCredential
            → POST /api/auth/customer/verify (Bearer idToken)

Google:     Flutter GoogleSignIn → FirebaseAuth.signInWithCredential
            → POST /api/auth/customer/social (Bearer idToken)
```

---

## Frontend Pages

```
/login                  → Web Login (all roles)
/register/chain         → Chain Manager signup + Stripe
/register/store         → Store Manager signup + Stripe
/activate?token=...     → Branch Manager activation
/dashboard              → Post-checkout landing
/chain/dashboard        → Chain Manager dashboard
/chain/branches         → Manage/invite branches
/branch/dashboard       → Branch Manager dashboard
/store/dashboard        → Store Manager dashboard
/admin/dashboard        → SuperAdmin dashboard
/settings/subscription  → View/change plan
```

## Firebase Config (Frontend)
```js
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "YOUR_WEB_API_KEY",
  authDomain: "koutix-official.firebaseapp.com",
  projectId: "koutix-official",
}
export const auth = getAuth(initializeApp(firebaseConfig))
```

## Env Vars Required
```
STRIPE_CHAIN_PRICE_BASIC, STRIPE_CHAIN_PRICE_STANDARD, STRIPE_CHAIN_PRICE_PRO
STRIPE_STORE_PRICE_BASIC, STRIPE_STORE_PRICE_STANDARD, STRIPE_STORE_PRICE_PRO
STRIPE_WEBHOOK_SECRET, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, WEB_URL
```
