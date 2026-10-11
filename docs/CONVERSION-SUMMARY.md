# Conversion Summary

> For architecture and the full guide see [README.md](../README.md). This file
> records what is built and — more usefully — what is still stubbed.

## What this project is

A plain HTML/CSS/JavaScript apartment booking and management system backed by
Firebase (Firestore + Auth), with PayMongo handling rent payments through a
small local Node bridge.

There is **no build step**. The Firebase SDK is loaded from the CDN at runtime,
and every page is a static file.

## Pages

| Page                         | Audience           |
| ---------------------------- | ------------------ |
| `index.html`                 | Public             |
| `property-detail.html`       | Public             |
| `start.html`                 | Dev launcher       |
| `admin-login.html`           | Admin / superadmin |
| `admin-dashboard.html`       | Admin              |
| `super-admin-dashboard.html` | Superadmin         |
| `tenant-login.html`          | Tenant             |
| `tenant-portal.html`         | Tenant             |

## Known gaps

These are real and still open:

- `super-admin-dashboard.html` renders hardcoded statistics and has inert
  buttons (maintenance toggle, backup, add/edit admin).
- The **Reviews** tab on `admin-dashboard.html` is still static markup.
- Several UI areas still contain placeholder copy in `super-admin-dashboard.html`
  and `start.html`.
- **Room capacity is read-only.** Availability is admin-editable, but total
  capacity still lives in the hardcoded `roomsData` array in
  `property-detail.js`, so prices and capacities can drift from Firestore. The
  dashboard _displays_ a `capacity` field if one exists on the room document,
  but nothing writes it.
- The **balance is only as current as the webhook.** The portal derives what is
  owed from the `payments` collection plus a staff-set `tenants.amountDue`. If a
  PayMongo webhook is lost, the tenant's view stays at its last confirmed value
  until someone reconciles it. The admin **Tenant Payments** tab now shows the
  raw ledger, so a missed event is visible to staff; watch the `functions` logs
  for webhook failures.

### Room availability is admin-editable

The **Listings** tab used to render invented listings — "Single Occupancy Room,
2/4, ₱5,500/mo" for a system that actually has two rooms — with inert
Edit/View/Add buttons. It is now a Firestore-backed availability table driven by
`onSnapshot`, with a −/n/+ stepper per room.

Writes go through the single existing implementation in
`room-availability.js` (`setRoomAvailability`); the dashboard deliberately opens
no second write path for `rooms`. Counts are normalised by
`clampAvailability` in `lib/booking.js`, so a room can never be stored negative,
fractional, or above a recorded capacity.

`firestore.rules` needed no change — `rooms` was already `allow write: if
isAdmin()`. The `set-room.js` CLI remains useful for scripting and bulk resets,
but it is no longer the only way to set availability.

The **Overview** tab is live too: Total Listings and Active Bookings now come
from the `rooms` snapshot, and Recent Activity is built from real reservation
decisions rather than a static "New booking confirmed — 2 hours ago" list.

### Payment state is server-authoritative

A tenant returning from PayMongo lands on a URL they control
(`?payment=success&amount=…`). That redirect is treated as a **claim**, not proof:

- Every return path records its outcome as `Pending`, never `Paid`.
- `lib/payment-return.js` resolves the scenario (which the
  `tests/payment-flow.test.js` walkthrough covers for all four shapes);
  `lib/payment-verification.js` matches the attempt to a webhook record by
  payer, amount, and a window anchored to when the checkout was created.
- The history table shows local-only attempts as **"Awaiting confirmation"** and
  the receipt renders amber until the webhook reports an outcome.
- `tests/structure.test.js` fails the build if any return path reintroduces
  `status: 'Paid'`, or if the balance is seeded from `localStorage`.

### The webhook owns the balance

`functions.paymongoWebhook` calls `reconcileTenantBalance` after recording a
payment. It **recomputes** `tenants.amountDue` from the payment ledger
(`lib/ledger.js`) in a transaction, rather than decrementing by the event amount.
That makes a retried delivery idempotent, restores the balance when a payment is
voided, and floors an overpayment at 0 instead of going negative.

The browser never writes `amountDue`; `firestore.rules` denies it. A tenant may
edit only `name`, `phone`, and `emergencyContact` on their own document.

### What changed in the admin dashboard

The **Tenant Payments** tab was static markup with invented names and amounts. It
now shows two live tables driven by `onSnapshot`:

- **Tenant Balances** — each tenant's `amountDue` as reconciled by the webhook.
- **Payment Ledger** — every event PayMongo has reported, including failures.

The hardcoded "View Payment" / "View Due Date" modals and their `data-open-modal`
triggers were removed with the rows that used them.

### Reservation approval is atomic and exactly-once

`approveReservation` runs the decision and the write in a **single Firestore
transaction**: it reads the request and the room, refuses if the request was
already decided or the room is full, then writes `status: 'Approved'` and
`rooms.available - 1` together.

This replaces an update-then-decrement pair that was not atomic. That pair had
two real bugs, both now closed:

- **Double-approve.** Two admins (or one double-click) could both approve the
  same request and decrement availability twice. Firestore serializes the
  transaction, so the second one re-reads `Approved` and is refused.
- **Approving into a full room.** Nothing checked that a slot remained, so an
  admin could approve a request for a room at 0 availability and silently
  overbook it. It is now refused.

`declineReservation` is likewise guarded so it cannot re-decide an
already-processed request or overwrite an approval.

`assets/js/lib/booking.js` holds the decision logic (`canApprove`,
`canDecline`, `nextAvailability`); `tests/booking.test.js` and
`tests/booking-race.test.js` cover the branches and the concurrency scenarios.

The **public reservation form** also reads availability before writing a request
(`public-forms.js`), so an obviously-impossible request is not queued. That check
is advisory and client-side — the transaction above is the actual guarantee.

Still open in the booking flow: there is no _hold_ — a pending request does not
reserve a slot, so several visitors can request the last one and all but the
winner must be declined manually.

### The reservation → tenant handoff used to be unreachable

The dashboard queried `where('status', '==', 'Pending')`. An approved request
therefore disappeared from the list the instant it was approved — taking the
"Create Tenant Account" button (which only renders for `Approved`) with it.
Approving a request ended the flow: the only way to onboard someone was the
generic "Create Tenant" button, re-typed by hand and unlinked from the request.

The query now includes `Approved` as well as `Pending`, and the list is split
into **New Requests** and **Approved — awaiting tenant account**. Creating the
tenant from a request writes `reservations/{id}.status = 'Converted'` plus
`tenantUid`, so one approval cannot spawn a second tenant and the dashboard can
tell what has been onboarded. `Converted` requests leave the working list.

`tests/structure.test.js` guards both halves: the query must include `Approved`
(so the conversion branch cannot become unreachable again), and the tenant
creation must record the link.

### QR Ph flow was removed

`initiateQrPhFlow()` had no call sites, so the whole QR modal
(`showQrModal`/`confirmQrPayment`/`closeQrModal` and the "I Have Completed
Payment" button) was unreachable dead code. It has been deleted along with its
markup in `tenant-portal.html`.

It also marked a payment `Paid` on button press, with no gateway confirmation —
so keeping it reachable would have contradicted the server-authoritative payment
model above. QR Ph still settles through the normal hosted checkout, which
offers `qrph` as a payment method.

To bring QR Ph back as a first-class method, build it on
`lib/payment-verification.js` and the hosted checkout; do not reintroduce a
client-side "I paid" confirmation button.

### Indexes

`firestore.indexes.json` now carries the composite indexes the live queries
need — `messages` by `email` + `createdAt`, and `tenants` by `email` +
`createdAt`. Deploy them with `firebase deploy --only firestore:indexes`;
without them the chat and payments tables degrade to empty rather than erroring.
