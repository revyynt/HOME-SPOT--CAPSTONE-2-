# Home-Spot — Apartment Booking & Management System

Vanilla HTML/CSS/JS front end with Firebase (Firestore + Auth) and a PayMongo
payment bridge. No build step: every page loads the Firebase SDK straight from
the CDN.

> **Before deploying:** read [Security notes](#-security-notes). The Firestore
> rules and the API server in this repo were hardened recently, and rotating the
> PayMongo keys is a required manual step.

## File Structure

```
/
├── index.html                      # Public landing page
├── property-detail.html            # Room detail + inquiry/reservation forms
├── start.html                      # Dev launcher (navigation hub)
├── admin-login.html                # Admin / Super Admin login
├── admin-dashboard.html            # Admin dashboard
├── super-admin-dashboard.html      # Platform management (superadmin only)
├── tenant-login.html               # Tenant sign-in
├── tenant-portal.html              # Tenant portal (payments, chat, profile)
├── paymongo-api-server.js          # Local payment bridge (dev)
├── set-room.js                     # Room availability CLI (requires admin token)
├── firebase.json                   # Hosting / Functions / Firestore config
├── firestore.rules                 # Per-collection security rules
├── .env.example                    # Copy to .env and fill in
├── assets/
│   ├── css/style.css
│   └── js/
│       ├── firebase-service.js     # Firebase init + auth helpers (single source)
│       ├── main.js                 # Landing page + admin list rendering
│       ├── property-detail.js      # Room detail logic
│       └── paymongo-service.js     # Payment client (no secret key)
└── functions/index.js              # Cloud Functions v2 (PayMongo webhook)
```

## Getting Started

### 1. Configure secrets

```bash
cp .env.example .env    # Windows: copy .env.example .env
```

Fill in `PAYMONGO_SECRET_KEY` and `PAYMONGO_PUBLIC_KEY` from the
[PayMongo dashboard](https://developers.paymongo.com). `.env` is gitignored and
must never be committed.

### 2. Start the payment bridge

```bash
npm start        # node paymongo-api-server.js 5050
```

The server refuses to start if `PAYMONGO_SECRET_KEY` is missing, and rejects any
`/api/*` request that does not carry a valid Firebase ID token.

### 3. Serve the pages

```bash
npx http-server -p 5050 -c-1
# or
python -m http.server 5050
```

Open <http://localhost:5050>.

### 4. Deploy (optional)

```bash
npm --prefix functions install
firebase functions:secrets:set PAYMONGO_SECRET_KEY
firebase functions:secrets:set WEBHOOK_SECRET
firebase deploy
```

## Architecture

| Concern | Where it lives |
|---|---|
| Auth | Firebase Auth. Roles live in `users/{uid}.role` |
| Data | Firestore: `rooms`, `reservations`, `messages`, `tenants`, `payments`, `users` |
| Payments | Client → `paymongo-api-server.js` → PayMongo |
| Payment truth | `functions.paymongoWebhook` writes `payments` (the only writer) |

### Firestore collections

| Collection | Written by | Read by |
|---|---|---|
| `rooms` | Admin | Everyone (public inventory) |
| `reservations` | Public form (constrained shape) | Admin |
| `messages` | Tenant + Admin | Participant + Admin |
| `tenants` | Admin | Admin + the tenant themself |
| `payments` | Webhook only | Admin + the tenant themself |
| `users` | Admin / self-service | Owner + Admin |

## Security Notes

- **`firestore.rules` denies by default.** Every collection is matched
  explicitly; unmatched paths fall through to `allow read, write: if false`.
- **Roles cannot be self-assigned.** Creating a `users/{uid}` document requires
  an existing admin, and the role must be `tenant`. Only a superadmin can change
  roles.
- **No plaintext passwords.** Tenants authenticate through Firebase Auth. The
  dashboard creates the Auth account and hands the temporary password to the
  tenant once; it is never persisted in Firestore.
- **Page guards.** `admin-dashboard.html`, `super-admin-dashboard.html`, and
  `tenant-portal.html` all verify a live Firebase session before rendering.
- **Payment calls are proxied.** The browser never holds the PayMongo secret key
  and never talks to PayMongo directly.
- **Client-side balance edits are denied.** A tenant cannot mark their own
  account paid; the webhook is authoritative.

## Room Availability CLI

```bash
# get an admin token from the browser console while signed in:
#   await firebaseService.getIdToken()

export FIREBASE_ID_TOKEN=<token>
node set-room.js                  # list
node set-room.js 3                # Triple Occupancy Room -> 3
node set-room.js commercial 1     # Commercial Space -> 1
```

## License

Capstone Project — Apartment Booking & Management System
© 2026 Home-Spot. All rights reserved.
