# Conversion Summary

Home-Spot retains its original multi-page screens and workflows while using
Vite, React for live room availability badges, and Supabase for its backend.
Supabase Storage and an Edge Function serve the static frontend.

## Current Architecture

- Supabase Auth manages staff and tenant sign-in. Trusted roles are stored in
  `app_metadata`.
- Supabase Postgres stores the existing Firebase-shaped records in
  `public.app_documents`; RLS policies control reads and writes.
- Supabase Realtime drives live room availability and dashboard updates.
- Edge Functions provision tenants, proxy PayMongo requests, and record
  webhook events.
- A public Supabase Storage bucket stores the Vite build; the `site` Edge
  Function serves page routes and assets.

The project starts fresh on Supabase. Existing Firebase accounts, Firestore
data, and Firebase Functions are not migrated.

## Remaining Product Work

- Several super-admin statistics and management actions are still placeholders.
- Some admin tabs are static UI rather than data-backed workflows.
- Tenant profile editing is not yet persisted.
- The QR modal flow is not wired into the active rent-payment form; payment
  completion must always be confirmed by PayMongo.
- Webhook payment records are authoritative; balance changes remain an
  administrative reconciliation task.

## Verification

Run `npm run check` for lint, tests, and the production build. Apply
`supabase/migrations/` to the target project and configure/deploy the Edge
Functions before testing authenticated or payment workflows end-to-end.
