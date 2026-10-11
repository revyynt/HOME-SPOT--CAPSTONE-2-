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
├── building.html                   # Public 3D building tour (no occupancy data)
├── start.html                      # Dev launcher (navigation hub)
├── admin-login.html                # The one sign-in form (staff + tenant)
├── admin-dashboard.html            # Admin dashboard (rooms, reservations, tenants,
│                                  #   messages, tenant-payments, reviews)
├── super-admin-dashboard.html      # Platform management (superadmin only)
├── tenant-login.html               # Redirect stub -> admin-login.html
├── tenant-portal.html              # Tenant portal (payments, chat, profile)
├── paymongo-api-server.js          # Local payment bridge (dev)
├── set-room.js                     # Room availability CLI (requires admin token)
├── seed-units.js                   # Seeds `units` for the 3D building view
├── firebase.json                   # Hosting / Functions / Firestore config
├── firestore.rules                 # Per-collection security rules
├── firestore.indexes.json          # Composite indexes for the live queries
├── .env.example                    # Copy to .env and fill in
├── docs/
│   ├── QUICKSTART.md               # First-time setup
│   ├── DEV-SWITCH-PROJECT.md       # Point the app at your own Firebase project
│   └── CONVERSION-SUMMARY.md       # What is built, what is still stubbed
├── assets/
│   ├── img/                        # All images, kebab-case
│   ├── css/
│   │   ├── style.css               # Shared styles
│   │   └── tenant-portal.css
│   └── js/                         # See "Source layout" below
├── lib/                            # CommonJS, shared by the Cloud Function + tests
│   └── ledger.js                   # Rent balance arithmetic
├── tests/                          # node:test suites
├── functions/index.js              # Cloud Functions (PayMongo webhook)
└── eslint.config.mjs               # Includes the homespot/* custom rules
```

Every page is a static HTML file that loads ES modules. There is no build step
and no bundler — edit a file and reload. Images live only under
`assets/img/`; a structural test enforces that so a stray root-level photo can
never leak into the published tree.

## Getting Started

> **Using your own Firebase project instead of `capstoneapt-b5681`?** See
> [docs/DEV-SWITCH-PROJECT.md](docs/DEV-SWITCH-PROJECT.md) — it covers the
> browser override, the `.env` variables, deploying the rules, and creating the
> first admin. Nothing in that flow has to be committed.

### 1. Configure secrets

```bash
cp .env.example .env    # Windows: copy .env.example .env
```

Fill in `PAYMONGO_SECRET_KEY` and `PAYMONGO_PUBLIC_KEY` from the
[PayMongo dashboard](https://developers.paymongo.com), and set `WEBHOOK_SECRET`
to any long random string — the server refuses to start without it, because an
unguarded webhook endpoint lets a browser fabricate payment events. `.env` is
gitignored and must never be committed.

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

| Concern       | Where it lives                                                                  |
| ------------- | ------------------------------------------------------------------------------- |
| Auth          | Firebase Auth. Roles live in `users/{uid}.role`                                 |
| Data          | Firestore: `rooms`, `reservations`, `messages`, `tenants`, `payments`, `users`  |
| Payments      | Client → `paymongo-api-server.js` → PayMongo                                    |
| Payment truth | `functions.paymongoWebhook` writes `payments` and recomputes the tenant balance |

### Firestore collections

| Collection     | Written by                      | Read by                                      |
| -------------- | ------------------------------- | -------------------------------------------- |
| `rooms`        | Admin                           | Everyone (public inventory)                  |
| `reservations` | Public form (constrained shape) | Admin                                        |
| `units`        | `seed-units.js` / Admin         | Everyone (floor plan only — never occupancy) |
| `messages`     | Tenant + Admin                  | Participant + Admin                          |
| `tenants`      | Admin                           | Admin + the tenant themself                  |
| `payments`     | Webhook only                    | Admin + the tenant themself                  |
| `users`        | Admin / self-service            | Owner + Admin                                |

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
│   ├── payment-verification.js  Webhook corroboration + balance derivation
│   ├── building-viewer.js      Three.js x-ray building renderer
│   ├── units.js                Unit layout maths + occupancy derivation
│   ├── login-routing.js        Post-sign-in destination per role
│   ├── booking.js          Reservation approval + availability decisions
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

| Test file                                         | Guards                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/format\|rooms\|qr\|payment-return.test.js` | Pure logic, including every payment-redirect branch                                                                                                                                                                                                                                                                                                                         |
| `tests/payment-verification.test.js`              | Webhook corroboration: a forged `?payment=success` stays Pending, cross-tenant and stale payments never confirm, the balance never comes from `localStorage`                                                                                                                                                                                                                |
| `tests/payment-flow.test.js`                      | Walks all four PayMongo return paths through the real modules; asserts a redirect alone never moves a balance and the webhook closes the loop                                                                                                                                                                                                                               |
| `tests/ledger.test.js`                            | Balance arithmetic: idempotent recompute, a voided payment restores the balance, an overpayment floors at 0                                                                                                                                                                                                                                                                 |
| `tests/booking.test.js`                           | Approval decisions: refuses an already-decided request and a full room, never decrements below zero; `Converted` is terminal                                                                                                                                                                                                                                                |
| `tests/booking-race.test.js`                      | Concurrent approval: a second approve of the same request is refused, the last slot cannot be taken twice, and a full room cannot be overbooked                                                                                                                                                                                                                             |
| `tests/units.test.js`                             | 3D building layout: floors stack, units never overlap, output is deterministic, and occupancy derives correctly from tenants vs reservations                                                                                                                                                                                                                                |
| `tests/login-routing.test.js`                     | Post-sign-in routing: every role lands somewhere real, a legacy tenant with no role still reaches the portal, and an unknown role never falls through to the tenant view                                                                                                                                                                                                    |
| `tests/structure.test.js`                         | Div/script balance, orphaned tab panes, import resolution, module load order, a single Firebase config, no inline scripts, inline-handler ratchet, no dynamic inline handlers built in JS, role-hierarchy parity with the rules, no client-side "paid" claim, the webhook owns the balance, exactly one login form, only real composite indexes, units never leak occupancy |
| `tests/smoke.test.js`                             | The DOM layer evaluates and behaves under a DOM stub                                                                                                                                                                                                                                                                                                                        |
| `tests/secrets.test.js`                           | No committed keys; fails CI if one reappears; the API bridge refuses to boot without `WEBHOOK_SECRET`                                                                                                                                                                                                                                                                       |

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
- **One sign-in form.** `admin-login.html` serves everyone and routes by role:
  staff from `users/{uid}.role`, tenants from their `tenants` profile. An
  account with neither is signed out rather than left half-authenticated.
  `tenant-login.html` is a redirect stub so old links still resolve.
- **Payment calls are proxied.** The browser never holds the PayMongo secret key
  and never talks to PayMongo directly.
- **Client-side balance edits are denied.** A tenant cannot mark their own
  account paid. `tenants.amountDue` is written by staff and by the webhook's
  `reconcileTenantBalance` only; the browser has no write path to it.
- **The PayMongo redirect is treated as a claim, not proof.** Anyone can type
  `?payment=success` into the URL bar, so every return path records `Pending`
  and the portal derives what is owed from the webhook-written `payments`
  collection. An attempt stays "Awaiting confirmation" until a webhook record
  matching payer + amount + checkout window arrives.
- **A tenant may edit only their own contact details.** `firestore.rules`
  restricts a self-update on `tenants/{uid}` to `name`, `phone`,
  `emergencyContact`, and `updatedAt` — rent, balance, status, and role are not
  reachable from a browser.
- **No dynamic inline event handlers.** Values reach controls through `data-*`
  attributes and delegated listeners — including handlers generated inside JS,
  which `tests/structure.test.js` checks for.
- **`WEBHOOK_SECRET` is mandatory.** The dev bridge refuses to boot without it,
  so the webhook endpoint cannot be forged from a browser.
- **Room capacity is enforced atomically.** Approving a reservation reads the
  request and the room in one Firestore transaction and refuses if the request
  was already decided or no slot remains, so a double-click or two admins cannot
  overbook a room.
- **A request can only produce one tenant.** Onboarding from a reservation marks
  it `Converted` with the tenant's uid; `Converted` is terminal, so a repeat
  click cannot create a second account.
- **The 3D building never leaks occupancy.** `units` is world-readable so a
  visitor can see the floor plan, but unit documents hold only physical facts
  (number, floor, type) — never an availability flag. Occupancy is derived from
  `tenants`/`reservations` at render time, which are staff-only. The public tour
  (`building.html`) renders with occupancy suppressed and reads no PII
  collection. Guarded in `tests/structure.test.js`.

## 3D Building View

The admin dashboard's **Building** tab renders a Three.js model of the
building — one translucent box per unit, stacked by floor, with booked units
glowing red, units being onboarded amber, and free ones teal. Drag to orbit,
scroll to zoom, hover a room for its occupant, and toggle X-ray between the
glassy cutaway and a solid exterior.

The geometry is **generated from the `units` collection**, so there is no model
file to author and the building updates live as Firestore changes. The public
tour at `building.html` shows the same model without occupancy.

Seed units to get started:

```bash
export FIREBASE_ID_TOKEN=<token>   # from the admin console
npm run seed-units -- --floors 3 --per-floor 4
npm run seed-units -- --dry-run    # preview without writing
```

Assign a tenant to a unit via the optional **Unit ID** field on the
create-tenant form.

Geometry maths lives in `assets/js/lib/units.js` — pure and unit-tested — while
`assets/js/lib/building-viewer.js` only turns those numbers into meshes.

## Room Availability

Staff adjust availability from the admin dashboard's **Listings** tab, using the
−/n/+ stepper. Counts are validated (`clampAvailability`) so a room can never be
stored negative, fractional, or above a recorded capacity, and every write goes
through the one implementation in `room-availability.js`.

Approving a reservation decrements availability automatically inside a
transaction, so the stepper is for corrections rather than routine use.

### CLI (scripting / bulk reset)

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
