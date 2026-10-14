# Home-Spot — Apartment Booking & Management System

Home-Spot is a multi-page HTML/CSS/JavaScript application built with Vite and
React. Supabase provides Auth, Postgres-backed app data, Realtime, and Edge
Functions. PayMongo payments and the public static frontend are served through
Supabase Edge Functions, with frontend files stored in a public Supabase Storage
bucket.

The Supabase project is configured for a fresh start; existing Firebase users
and data are not migrated.

## Getting Started

### Configure the frontend

Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. Keep service-role/secret keys out of all
`VITE_` variables and browser code. `.env.local` is gitignored.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open <http://localhost:5173>. Create a local production preview with
`npm run build`; Vite writes the static site to `dist/`.

### Prepare Supabase

Install the Supabase CLI, link the project, then apply the schema:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migrations create the `app_documents` table, row-level security policies,
Realtime publication, initial public room records, and a public Storage bucket
for the frontend assets.

Set Edge Function secrets in the Supabase project; never commit these values:

```sh
supabase secrets set PAYMONGO_SECRET_KEY=YOUR_PAYMONGO_SECRET_KEY
supabase secrets set WEBHOOK_SECRET=YOUR_LONG_RANDOM_WEBHOOK_SECRET
supabase secrets set ALLOWED_ORIGINS=https://YOUR_HOSTED_DOMAIN
```

Deploy the functions:

```sh
supabase functions deploy create-tenant
supabase functions deploy delete-tenant
supabase functions deploy paymongo-api
supabase functions deploy paymongo-webhook
```

Configure PayMongo to call
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/paymongo-webhook?secret=YOUR_LONG_RANDOM_WEBHOOK_SECRET`.
Set the same secret in Supabase. In production, set `ALLOWED_ORIGINS` to the
exact website origin(s), comma-separated if there is more than one.

Create the first staff account in Supabase Auth, then assign its trusted
`app_metadata.role` to `superadmin` from a trusted administrative environment.
Disable public signups in the Supabase Auth settings; staff and tenant accounts
are provisioned by trusted administrators. Do not assign roles through
user-editable `user_metadata`. After that, staff can create tenant accounts
from the admin dashboard.

### Local Edge Function testing

For local functions, copy `.env.functions.example` to `.env.functions.local`
and fill the server-side values. Keep browser-safe values in `.env.local`.

```sh
cp .env.functions.example .env.functions.local
supabase start
supabase functions serve --env-file .env.functions.local
```

## Deployment

Link the Supabase CLI to your project and apply the database migrations first.
Copy `.env.publish.example` to `.env.publish.local`, set the project URL and
server-side key there, and build/upload the static files to the `homespot-site`
Storage bucket:

```sh
cp .env.publish.example .env.publish.local
npm run deploy:supabase-site
supabase functions deploy site
```

The publish script reads `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or
`SUPABASE_SERVICE_ROLE_KEY`) from `.env.publish.local`. These privileged
values are used only by the local publisher and must never be added to a
`VITE_` variable or browser code. The public site URL is
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/site/`; page routes and
assets are served from that path.

## Architecture

| Concern          | Implementation                                                    |
| ---------------- | ----------------------------------------------------------------- |
| Frontend         | Vite multi-page build; React powers live room availability badges |
| Authentication   | Supabase Auth; staff and tenant roles use trusted `app_metadata`  |
| Application data | `public.app_documents` JSONB table, protected by RLS              |
| Live updates     | Supabase Realtime                                                 |
| Tenant creation  | `create-tenant` Edge Function with service-role access            |
| Payments         | Browser → `paymongo-api` Edge Function → PayMongo                 |
| Payment records  | `paymongo-webhook` Edge Function writes authoritative records     |
| Static hosting   | Public Storage bucket served through the `site` Edge Function     |

The document adapter in `assets/js/supabase-service.js` preserves the
application's collection/document interface while storing data in Postgres.
Public room reads and reservation/inquiry submissions are constrained by RLS;
tenant data visibility is scoped to the signed-in identity. Browser clients
cannot write payment records or change tenant balances.

## Source Layout

```text
assets/js/
├── supabase-service.js       Supabase client, auth, data adapter, Realtime
├── paymongo-service.js       Supabase Edge Function payment client
├── main.js                   Shared page initialization
├── lib/                      Pure utilities and tested payment-return logic
├── render/                   Reservations, messages, tabs, and toast UI
└── pages/                    Page-specific modules; availability-badges.jsx is React
supabase/
├── config.toml
├── migrations/               Schema and RLS
└── functions/                Site, tenant, and PayMongo Edge Functions
scripts/
└── publish-site.mjs          Uploads the Vite build to Supabase Storage
tests/                        node:test suites
```

## Development and Validation

```sh
npm run dev
npm run check       # lint, tests, and production build
npm test
npm run lint
npm run format:check
```

All environment files are gitignored. Supabase publishable keys are intended
for browser use; Supabase secret/service-role keys and PayMongo secret keys
must remain server-side.
