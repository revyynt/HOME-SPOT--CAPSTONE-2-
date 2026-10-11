# Switching to your own Firebase project (dev)

Use this to develop against your own Firebase project without committing its ID,
and to unblock work when you don't have deploy rights on `capstoneapt-b5681`.

Nothing here is committed to git. Delete the local file when you're done.

## Where the project ID lives

There is more than one place, and they must agree or the app half-works:

| What                | Where                                              | Committed?                               |
| ------------------- | -------------------------------------------------- | ---------------------------------------- |
| Browser (the app)   | `assets/js/firebase-config.local.js`               | **No** — gitignored override             |
| Browser (default)   | `assets/js/firebase-service.js`                    | Yes — leave pointing at the real project |
| API bridge + CLIs   | `.env` → `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY` | **No** — gitignored                      |
| Firebase CLI target | `.firebaserc`                                      | Yes — switch locally, don't commit       |
| Service worker      | `firebase-messaging-sw.js`                         | Yes — see note below                     |

## Steps

**1. Create the project.** In the Firebase console: add project → create. Then
Firestore Database → Create database (production or test mode either way).

**2. Turn on Email/Password auth.** Authentication → Sign-in method → Email/Password → Enable.
Without this, no one can sign in as admin or tenant, and you cannot create the
first admin account.

**3. Add a Web app.** Project settings → General → Your apps → Web → register.
Copy the `firebaseConfig` values.

**4. Point the browser at it.**

```bash
copy assets\js\firebase-config.local.example.js assets\js\firebase-config.local.js
```

Paste your `firebaseConfig` into the copy. `firebase-service.js` picks it up
automatically and logs which project it is using. The committed default is
untouched, so `git status` stays clean.

**5. Point the server and CLIs at it.** In `.env` (gitignored):

```
FIREBASE_PROJECT_ID=your-project
FIREBASE_API_KEY=AIza...        # your web API key
```

`set-room.js` and `seed-units.js` read `FIREBASE_PROJECT_ID` from the
environment, so they follow automatically.

**6. Deploy rules and indexes to YOUR project.** This is the step that was
failing:

```bash
firebase login
firebase use --add            # pick your project, give it an alias
firebase deploy --only firestore:rules,firestore:indexes
```

If you prefer not to let the CLI edit `.firebaserc`, deploy directly:

```bash
firebase deploy --project your-project-id --only firestore:rules,firestore:indexes
```

Without this, **every** Firestore read is denied. `firestore.rules` ends with a
catch-all `allow read, write: if false`, so the app will load but every page will
show empty data — including the Building tab.

**7. Seed some data.** A fresh project has nothing in it. Sign in at
`admin-login.html`, open the **Building** tab, and use **Add Units** — it writes
through the signed-in session, so no token is needed:

> admin-dashboard.html → Building → Add Units → floors × units-per-floor → Create Units

For offline/bulk seeding there is also a CLI (`npm run seed-units -- 3 4`),
which needs an admin ID token. Run `node check-auth.js` first if a write is
refused — it distinguishes an expired token, a revoked account, and a missing
`users/{uid}` role document.

**8. Create the first admin.** Sign in at `admin-login.html`. You need an
account with a `users/{uid}` document whose `role` is `admin` or `superadmin`.
The catch-all rule denies creating that from the browser, so seed it once by
hand in the Firestore console:

```
users/<your-uid>   { name: "Dev Admin", email: "you@example.com", role: "superadmin" }
```

Get your uid from Authentication → Users after creating the email/password
user. (A `superadmin` satisfies the admin dashboard too — the role hierarchy is
mirrored between `firestore.rules` and the page guard.)

**9. Restart the API bridge** so it picks up the new `.env`:

```bash
npm start
```

## Points of confusion

**A Firebase web API key is public by design.** It's not a secret and it is
already in this repo. What protects your data is `firestore.rules` — which is
exactly why step 6 is not optional.

**`firebase-messaging-sw.js` is not updated and does not matter.** It is never
registered by any page, so it does nothing. If you later wire up push
notifications, move it under the same override or import the shared config.

**PayMongo webhooks still point at the real project.** The Cloud Function
`paymongoWebhook` runs wherever you deployed it. If you deploy functions to
your project, register a new webhook URL in the PayMongo dashboard; if you
don't deploy functions, webhook-driven payment confirmation will not arrive in
your project, and the tenant portal will show payments stuck at "Awaiting
confirmation" because nothing writes the `payments` collection.

That last point matters for payments specifically: the portal derives a
tenant's balance from the webhook-written `payments` collection. On a fresh
project with no webhook wired up, payments will not reconcile.

## Reverting

```bash
del assets\js\firebase-config.local.js
firebase use capstoneapt-b5681
```

and restore `FIREBASE_PROJECT_ID` in `.env`. The committed files never changed,
so there is nothing to revert in git.
