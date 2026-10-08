# AGENTS.md

Guide for AI agents and developers working on this codebase. **Continue from [PLAN.md](./PLAN.md).**
Milestone 1 (product surface) is complete. Start with milestone 2.

## Project

Cumbria Peptides is a UK peptide e-commerce store with an admin dashboard built for manual fulfilment. The
core flow is: customer pays → server creates the order → Slack/SMS/Sheets/email notifications →
owner packs by hand → shipped → completed.

**Architecture rule:** Netlify Database is the single source of truth. Slack, SMS, email and
Google Sheets are downstream and best-effort (outbox + retries). They must never block or cancel
an order.

## Stack

TanStack Start (React 19, TanStack Router file routes, SSR), Vite 7, Tailwind CSS 4, and
TypeScript strict, deployed on Netlify. Package manager: pnpm.

## Layout

```
src/
  config/site.ts          Brand, contact, currency, shipping rules, formatMoney(), img() CDN helper
  data/fixtures.ts        DEMO DATA: products/variants, customers, orders, movements, sales.
                          The only stub module; replace with DB queries in milestone 2
  data/content.ts         Editable copy: homepage, reasons, FAQs, legal pages (drafts)
  lib/cart.ts             Persistent basket (localStorage, variantId + qty only; prices re-derived)
  lib/order-form.ts       Builds + submits the customer-order Netlify Forms payload
  lib/demo-orders.ts      DEMO: in-memory order edits so the packing workflow is clickable
  components/store/       ProductCard, Summary, LegalPage
  components/admin/       ui.tsx (badges, Panel, fmtDate), charts.tsx (SVG area chart, BarList)
  routes/
    __root.tsx            HTML shell, global meta, 404 + 500 (StatusPage)
    _store.tsx            Storefront layout (header, footer); child routes under _store/
    _store/*.tsx          /, shop, product.$slug, cart, checkout, order-confirmed, about, contact, legal
    admin.tsx             Admin layout (sidebar / mobile bottom tabs); redirects /admin → dashboard
    admin.dashboard.tsx, admin.orders.index.tsx, admin.orders.$orderNumber.tsx
    sitemap[.]xml.ts      Server route generating sitemap.xml
db/schema.ts              Drizzle schema: orders, order_items, notifications (outbox)
netlify/functions/
  orders.mts              POST /api/orders: re-prices basket, saves order, queues + sends Slack
  retry-notifications.mts Scheduled (every minute): retries failed Slack sends with backoff
netlify/lib/slack.ts      Slack incoming-webhook message + delivery (SLACK_WEBHOOK_URL)
public/
  img/                    Generated product/hero imagery (always served via /.netlify/images)
  contact-form.html       Netlify Forms skeleton for the React contact form
  order-form.html         Netlify Forms skeleton for the customer-order submission
```

## Conventions

- Design tokens live in `src/styles.css` (`@theme`): paper/ink neutrals, verdigris accent, and
  oxblood/amber for alerts. Use the `.label` (mono eyebrow), `.btn`, `.btn-primary`, `.btn-ghost`
  and `.field` classes. Use `font-display` for headings.
- Always reference images through `img()` from `src/config/site.ts` (Netlify Image CDN, webp).
- Animations: `.rise` with an inline `--d` delay. Animate transform/opacity only. Reduced motion
  is respected.
- Brand name comes from `site.name`. Never hard-code it.
- **Compliance:** never write copy that claims health, medical, weight-loss, performance or
  similar outcomes. Product descriptions are owner-entered. Placeholders only describe format and
  storage.
- Admin pages must stay usable on mobile (cards instead of tables below `md`).

## Non-obvious decisions

- The basket stores only `{variantId, quantity}`. Prices and stock are recomputed from the
  catalogue, and must be re-validated server-side at checkout (milestone 4).
- Order numbers are **never** generated client-side. `/api/orders` assigns them from the
  `order_number_seq` Postgres sequence, formatted `CP-YYYYMMDD-NNNNNN` (UK date + sequence) by
  `orderRef()` in `netlify/lib/slack.ts`. The browser sends a `checkoutId` (UUID per details+basket);
  a repeat with the same ID returns the saved order instead of creating another.
- Checkout = `/api/orders` (DB + Slack) **then** a Netlify Forms `customer-order` submission built
  from the server's response (`src/lib/order-form.ts`, skeleton `public/order-form.html`; keep their
  field names in sync). The confirmation page is shown only after both succeed. The form is what
  emails the owner (configured in the Netlify UI). Orders are saved with payment `PENDING`
  until Stripe lands (milestone 4). Stock is checked but not yet decremented.
- Slack is sent after the order commits, via `context.waitUntil`. Failures are written to
  `notifications` and retried. They never fail the order. Slack messages carry name, email,
  phone, town/postcode, items and totals (owner's request), not the full address.
- Legal pages are separate static routes (`shipping.tsx`, etc.) sharing `LegalPage`, which keeps
  links type-safe.
- Admin "Coming next" nav items are intentionally inert until their milestone ships.
- `/admin` is **not yet protected**. It shows demo data only. Authentication (Netlify Identity +
  roles) is milestone 3 and must land before real data is connected.
