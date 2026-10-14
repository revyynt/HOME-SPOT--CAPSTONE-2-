# Quick Start

For the full architecture and deployment guide, see [README.md](../README.md).

## Run the frontend

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.
3. Install and start:

   ```sh
   npm install
   npm run dev
   ```

Open <http://localhost:5173>.

## Set up Supabase

Link the Supabase CLI to the project and apply the migrations:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Set `PAYMONGO_SECRET_KEY`, `WEBHOOK_SECRET`, and `ALLOWED_ORIGINS` as Supabase
Edge Function secrets, then deploy `create-tenant`, `delete-tenant`,
`paymongo-api`, and `paymongo-webhook`. Register the webhook URL in PayMongo as
documented in the root README. Deploy the `site` function after publishing the
frontend as described below.

Create an initial staff account in Supabase Auth and assign its trusted
`app_metadata.role` to `superadmin` using a secure administrative method. The
admin dashboard can create tenant accounts after the first staff account is
configured. Disable public signups in Supabase Auth settings.

## Deploy static files

After linking the Supabase CLI and running `supabase db push`, copy the
publishing template, set your project URL and a server-side secret key, and
publish the site:

```sh
cp .env.publish.example .env.publish.local
npm run deploy:supabase-site
supabase functions deploy site
```

The multi-page Vite site is uploaded to the public `homespot-site` Storage
bucket and served from
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/site/`.

For local Edge Functions, serve with
`supabase functions serve --env-file .env.functions.local` using a separate
local functions env file. Never put server-side secrets in `.env.local` or a
`VITE_` variable.
