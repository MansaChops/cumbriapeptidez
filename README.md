# Cumbria Peptides — e-commerce & order management

A UK peptide storefront with an admin dashboard for running manual fulfilment. Customers browse,
add items to their basket and check out; the owner gets notified, packs each order by hand using
a guided checklist and printable packing slip, and marks it shipped with tracking.

> Brand name, logo and contact details live in `src/config/site.ts`.

## What's live now

**Storefront:** `/`, `/shop`, `/product/:slug`, `/cart`, `/checkout`, `/order-confirmed`, `/about`,
`/contact`, `/shipping`, `/refunds`, `/terms`, `/privacy`, `/disclaimer`, plus a 404 page, an error
page, `sitemap.xml` and `robots.txt`.

**Admin:** `/admin/dashboard`, `/admin/orders`, `/admin/orders/:orderNumber`. These cover the
packing workflow, integration status and retries, the timeline, and the printable packing slip.

Products, orders and customers currently come from **demo data** in `src/data/fixtures.ts`. Every
record there is fictional. Checkout ends at a clearly labelled preview confirmation, and no payment
is taken yet.

## Tech

- TanStack Start (React 19, file-based routing, SSR) on Netlify
- Tailwind CSS 4, Instrument Serif and IBM Plex
- Netlify Forms (contact form) and Netlify Image CDN (all product imagery)
- Planned: Netlify Database (Postgres + Drizzle), Netlify Identity, Stripe, Slack, Twilio,
  Google Sheets, and transactional email

## Run locally

```bash
pnpm install
netlify dev        # or: pnpm dev
```

Copy `.env.example` to `.env` when integrations are added. No variables are needed for the
current demo.

## Roadmap

See [PLAN.md](./PLAN.md). Next up: database and catalogue, authentication and roles, Stripe
checkout with idempotent webhooks, then the Slack/SMS/email outbox and the Google Sheets sync.

## Before going live

All legal pages and product descriptions are drafts. Have them reviewed by a UK legal or
regulatory adviser, then edit them in `src/data/content.ts` (an admin editor is planned in
milestone 11).
