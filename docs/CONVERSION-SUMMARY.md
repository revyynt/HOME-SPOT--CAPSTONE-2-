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
- The **Listings**, **Tenant Payments**, and **Reviews** tabs on
  `admin-dashboard.html` are static markup, not Firestore-backed. The Tenant
  Payments rows still open modals from hardcoded names.
- Tenant chat in `tenant-portal.html` writes to Firestore but never reads
  messages back, so it is not actually realtime.
- `saveProfile()` in `tenant-portal.html` only shows an alert; it does not
  persist.
- `admin-edit-listing.html` was deleted as dead (0 bytes, never linked).
- The `dataconnect/` directory and `src/dataconnect-generated/` were deleted:
  they were the unmodified Firebase movie-review quickstart and no application
  code referenced them.
- Several UI areas still contain placeholder PII (`Juan Dela Cruz`,
  `+63 912 345 6789`, …).
- Payment QR codes are rendered by `api.qrserver.com`, which receives the
  amount and reference number.

### QR Ph flow is unreachable

`initiateQrPhFlow()` in `assets/js/pages/tenant-portal.js` has no call sites,
and it is the only thing that opens the QR modal. That makes `showQrModal()`,
`confirmQrPayment()`, and the "I Have Completed Payment" button unreachable too.

This needs a decision rather than a refactor: either wire the QR method up, or
delete the flow. Note that the unreachable path was also the one that marked a
payment `Paid` on button press, without gateway confirmation.

### Payment-redirect refactor is half-done

`checkUrlPaymentReturn()` still carries its own parameter parsing and scenario
cascade. The tested decision logic already exists in
`assets/js/lib/payment-return.js` and is covered by
`tests/payment-return.test.js` — only `interpretPaymentIntent()` has been
swapped in. Finishing this should be one change, verified by a manual
walkthrough of all four return paths (pending-session, card 3DS, hosted
success, hosted failure).
