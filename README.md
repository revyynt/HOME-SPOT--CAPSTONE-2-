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
│   ├── img/                        # All images, kebab-case
│   ├── css/
│   │   ├── style.css               # Shared styles
│   │   ├── tenant-portal.css
│   │   └── tenant-login.css
│   └── js/                         # See "Source layout" below
├── tests/                          # node:test suites
├── docs/
│   ├── QUICKSTART.md               # First-time setup
│   └── CONVERSION-SUMMARY.md       # What is built, what is still stubbed
├── functions/index.js              # Cloud Functions (PayMongo webhook)
└── eslint.config.mjs               # Includes the homespot/* custom rules
```

Every page is a static HTML file that loads ES modules. There is no build step
and no bundler — edit a file and reload. Images live only under
`assets/img/`; a structural test enforces that so a stray root-level photo can
never leak into the published tree.

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

| Concern       | Where it lives                                                                 |
| ------------- | ------------------------------------------------------------------------------ |
| Auth          | Firebase Auth. Roles live in `users/{uid}.role`                                |
| Data          | Firestore: `rooms`, `reservations`, `messages`, `tenants`, `payments`, `users` |
| Payments      | Client → `paymongo-api-server.js` → PayMongo                                   |
| Payment truth | `functions.paymongoWebhook` writes `payments` (the only writer)                |

### Firestore collections

| Collection     | Written by                      | Read by                     |
| -------------- | ------------------------------- | --------------------------- |
| `rooms`        | Admin                           | Everyone (public inventory) |
| `reservations` | Public form (constrained shape) | Admin                       |
| `messages`     | Tenant + Admin                  | Participant + Admin         |
| `tenants`      | Admin                           | Admin + the tenant themself |
| `payments`     | Webhook only                    | Admin + the tenant themself |
| `users`        | Admin / self-service            | Owner + Admin               |

### Source layout

```
assets/js/
├── firebase-service.js   Sole owner of the Firebase config + auth helpers
├── room-availability.js  Single implementation of setRoomAvailability
├── main.js               Thin entry: initialises only what the page contains
├── lib/                  Pure, DOM-free — directly unit-testable
│   ├── format.js           escapeHtml, formatPHP, initials, avatarGradient
│   ├── rooms.js            normalizeRoomDocId, resolveRoom
│   ├── qr.js               buildQrPhPayload
│   ├── payment-return.js   Payment-redirect state machine
│   ├── guard.js            Page-level auth guard
│   ├── session.js          Staff logout + mobile back-button guard
│   └── dom.js              byId, onClick, attr
├── render/               toast, tabs, reservations, messages
└── pages/                One module per page
```

Two rules keep this from drifting:

- **`lib/` must stay pure** — no DOM, no Firebase, no network. That is what lets
  `node --test` import the exact code the browser runs.
- **Pages delegate, they don't assign to `window`.** Module scope is invisible
  to inline `onclick`, so controls use `data-*` attributes. ESLint enforces
  this with the custom `homespot/no-global-leak` rule.

## Development

```bash
npm run check        # lint + test
npm test             # unit, structural, smoke, and secret-scan tests
npm run lint         # ESLint
npm run format       # Prettier
```

| Test file                                         | Guards                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/format\|rooms\|qr\|payment-return.test.js` | Pure logic, including every payment-redirect branch                                                                                               |
| `tests/structure.test.js`                         | Div/script balance, orphaned tab panes, import resolution, module load order, a single Firebase config, no inline scripts, inline-handler ratchet |
| `tests/smoke.test.js`                             | The DOM layer evaluates and behaves under a DOM stub                                                                                              |
| `tests/secrets.test.js`                           | No committed keys; fails CI if one reappears                                                                                                      |

`tests/structure.test.js` is the safety net for refactoring: if an edit breaks
markup, an import path, or module ordering, the suite fails before the page
does.

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
