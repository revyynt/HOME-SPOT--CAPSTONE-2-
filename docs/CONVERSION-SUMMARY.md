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
- The **Listings** and **Reviews** tabs on `admin-dashboard.html` are still
  static markup. (Tenant Payments is now live — see below.)
- Several UI areas still contain placeholder copy in `super-admin-dashboard.html`
  and `start.html`.
- The **balance is only as current as the webhook.** The portal derives what is
  owed from the `payments` collection plus a staff-set `tenants.amountDue`. If a
  PayMongo webhook is lost, the tenant's view stays at its last confirmed value
  until someone reconciles it. The admin **Tenant Payments** tab now shows the
  raw ledger, so a missed event is visible to staff; watch the `functions` logs
  for webhook failures.

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
