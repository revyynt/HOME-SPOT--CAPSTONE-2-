# Quick Start

> Superseded by [README.md](./README.md), which is the maintained guide.
> This file is kept only because `start.html` links to it.

## TL;DR

```bash
copy .env.example .env    # add PayMongo keys
npm start                 # payment bridge on :5050
npx http-server -p 5050 -c-1
```

Open <http://localhost:5050>.

## First-time setup

1. **Create the staff accounts.** The roles live in Firestore at
   `users/{uid}`, where `{uid}` is the Firebase Auth user ID. Sign in once via
   Firebase Auth (or the admin console), then create the documents:

   ```json
   // users/{your-admin-uid}
   { "email": "you@example.com", "name": "Your Name", "role": "superadmin" }
   ```

   Until a `users/{uid}` document with `role` exists, that account will be
   redirected away from every dashboard.

2. **Create tenant accounts from the admin dashboard**, not by hand. It creates
   the Firebase Auth account, shows you a one-time temporary password, and links
   the Firestore profile. Never add a `password` field to a `tenants` document —
   `firestore.rules` rejects the write.

## Deploying

```bash
npm --prefix functions install
firebase functions:secrets:set PAYMONGO_SECRET_KEY
firebase functions:secrets:set WEBHOOK_SECRET
firebase deploy
```