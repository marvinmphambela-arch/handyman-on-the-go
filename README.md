# Handyman on the Go — starter application

Mobile-first Next.js + TypeScript + Tailwind CSS starter for the Gauteng home-services marketplace.

## Included
- Responsive landing page and service discovery
- FairPrice calculation contract requiring administrator-configured rates
- Initial Supabase schema foundation
- Environment variable template

## Run locally
Requires Node.js 20.9+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

## Supabase
1. Create a Supabase project.
2. Copy the project URL and anon/publishable key into `.env.local`.
3. Review `supabase/schema.sql` before applying it in the SQL Editor.
4. Add complete role-aware RLS policies and server-side transaction logic before enabling production writes.

## Project status
This is the first development scaffold, not a production-ready marketplace. Authentication, uploads, live bidding, bookings, admin workflows, notifications, payments and comprehensive RLS policies remain to be implemented and tested. No market price figures are supplied; FairPrice must use verified, admin-managed catalogue data.