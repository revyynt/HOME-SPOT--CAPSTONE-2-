# Conversion Summary

> Superseded by [README.md](./README.md), which is the maintained guide.
> This file is kept only because `start.html` links to it.

## What this project is

A plain HTML/CSS/JavaScript apartment booking and management system backed by
Firebase (Firestore + Auth), with PayMongo handling rent payments through a
small local Node bridge.

There is **no build step**. The Firebase SDK is loaded from the CDN at runtime,
and every page is a static file.

## Pages

| Page | Audience |
|---|---|
| `index.html` | Public |
| `property-detail.html` | Public |
| `start.html` | Dev launcher |
| `admin-login.html` | Admin / superadmin |
| `admin-dashboard.html` | Admin |
| `super-admin-dashboard.html` | Superadmin |
| `tenant-login.html` | Tenant |
| `tenant-portal.html` | Tenant |

## Known gaps

These are real and still open:

- `super-admin-dashboard.html` renders hardcoded statistics and has inert
  buttons (maintenance toggle, backup, add/edit admin).
- The **Listings**, **Tenant Payments**, and **Reviews** tabs on
  `admin-dashboard.html` are static markup, not Firestore-backed.
- Tenant chat in `tenant-portal.html` writes to Firestore but never reads
  messages back, so it is not actually realtime.
- `saveProfile()` in `tenant-portal.html` only shows an alert; it does not
  persist.
- `admin-edit-listing.html` is a 0-byte file and is not linked from anywhere.
- The `dataconnect/` directory is the unmodified Firebase movie-review
  quickstart and is not referenced by any application code.
- Several UI areas still contain placeholder PII (`Juan Dela Cruz`,
  `+63 912 345 6789`, …).
- Payment QR codes are rendered by `api.qrserver.com`, which receives the
  amount and reference number.