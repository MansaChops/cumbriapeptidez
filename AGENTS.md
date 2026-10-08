# AGENTS.md

Guide for AI agents and developers working on this codebase. **Continue from [PLAN.md](./PLAN.md).**
Milestones 1 (product surface) and 2 (database & catalogue) are complete. Milestone 3 has started:
admin sign-in with Netlify Identity roles guards `/admin` and every admin API. Continue with the
rest of milestone 3.

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
  data/fixtures.ts        DEMO DATA: sample customers/orders for the admin Dashboard/Orders screens
                          and the demo seed. The storefront never reads it
  data/content.ts         Editable copy: homepage, reasons, FAQs, legal pages (drafts)
  lib/catalogue.ts        Catalogue types, categories, price/qty helpers, orderRef() (ORD-NNNNN)
  lib/cart.ts             Persistent basket (localStorage, variantId + qty only) + useCatalogue()
  server/catalogue.ts     Server functions: getCatalogue, getProduct, validateBasket
  server/admin.ts         Server function: getAdminSession (Identity user + role)
  lib/order-form.ts       Builds + submits the customer-order Netlify Forms payload
  lib/demo-orders.ts      DEMO: in-memory order edits so the packing workflow is clickable
  components/store/       ProductCard, Summary, LegalPage
  components/admin/       ui.tsx (badges, Panel, fmtDate), charts.tsx (SVG area chart, BarList)
  routes/
    __root.tsx            HTML shell, global meta, 404 + 500 (StatusPage)
    _store.tsx            Storefront layout; loader = getCatalogue(), children use useCatalogue()
    _store/*.tsx          /, shop, product.$slug, cart, checkout, order-confirmed, about, contact, legal
    admin.tsx             Admin layout + server-side guard (redirects to /admin/login)
    admin_.login.tsx      /admin/login (Identity login, invite + password-reset callbacks)
    admin.products.tsx    Live catalogue + image upload;  admin.data.tsx: demo data
    admin.dashboard.tsx, admin.orders.index.tsx, admin.orders.$orderNumber.tsx (sample data)
    sitemap[.]xml.ts      Server route generating sitemap.xml
db/schema.ts              Drizzle schema: all tables, enums, sequences (see README › Database)
netlify/database/migrations/  Generated SQL migrations (never edit a deployed one)
netlify/functions/
  orders.mts              POST /api/orders → lib/orders.placeOrder, then Slack
  order-status.mts        POST /api/order-status (order number + email must match)
  admin-demo-data.mts     /api/admin/demo-data: GET counts, POST seed, DELETE remove (confirmed)
  admin-products.mts      /api/admin/products (+ /:id/image upload/delete)
  media.mts               GET /media/products/:product/:file → Blobs (Image CDN source)
  retry-notifications.mts Scheduled (every minute): retries failed Slack sends with backoff
netlify/lib/              Server-only: catalogue, orders, demo-data, images, auth, slack
scripts/seed-demo.ts      pnpm db:seed-demo (refuses production without ALLOW_PRODUCTION_SEED=1)
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

- The basket stores only `{variantId, quantity}`. Display prices come from the server-loaded
  catalogue; `/api/orders` re-prices from the database inside the order transaction.
- Product and variant IDs are stable text keys (`prod_1`, `var_1_1`) because saved baskets and
  existing order items use them. Money is integer pence everywhere in the database.
- Order numbers are **never** generated client-side. Postgres assigns them from `order_number_seq`
  (default on `orders.number`), shown as `ORD-<n>` by `orderRef()` in `src/lib/catalogue.ts`.
  Orders placed before this were shown as `CP-YYYYMMDD-0NNNNN`; `parseOrderRef()` accepts both.
  The browser sends a `checkoutId` (UUID per details+basket); a repeat returns the saved order.
- `placeOrder()` locks the variant rows (`FOR UPDATE`, ID order), validates, inserts the order
  (`ON CONFLICT (checkout_id) DO NOTHING`), decrements stock with a `stock >= qty` guard and writes
  ORDER movements, items, a PENDING `manual` payment and the Slack outbox row in one transaction.
  Stock is reserved at order time. Restocking on cancellation is milestone 5.
- `is_demo` is set only by the demo seed. Demo removal deletes flagged rows, children first, and
  keeps flagged rows still referenced by real ones. A real order by a demo customer's email flips
  that customer to real.
- Server-only code lives in `netlify/lib/`. Browser code reaches it only via `src/server/*`
  server functions or `/api/*` functions. Don't import `db/` or `netlify/lib/` from components.
- Admin APIs check the Identity user server-side (`requireAdmin`), with roles from
  `app_metadata.roles` (`owner`, `admin`, `packer`, `viewer`), and require a same-site `Origin`
  on writes. The `/admin` layout guard is for UX; the API guard is the real one.
- Uploaded images: content-addressed keys in the `product-images` store, served by `media.mts`,
  always requested through the Image CDN via `img('/media/products/…')`.
- The local `netlify dev` database is PGlite with a single shared session: concurrent
  transactions interleave there. Test concurrency against a real Postgres.
- Checkout = `/api/orders` (DB + Slack) **then** a Netlify Forms `customer-order` submission built
  from the server's response (`src/lib/order-form.ts`, skeleton `public/order-form.html`; keep their
  field names in sync). The confirmation page is shown only after both succeed. The form is what
  emails the owner (configured in the Netlify UI). Orders are saved with payment `PENDING`
  until Stripe lands (milestone 4). Nothing on the storefront ever marks an order paid.
- Slack is sent after the order commits, via `context.waitUntil`. Failures are written to
  `notifications` and retried. They never fail the order. A send first claims the row
  (`SENDING` with a 2-minute lease) so overlapping runs can't double-send. Credentials: either
  `SLACK_WEBHOOK_URL`, or `SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID`. Slack messages carry name, email,
  phone, town/postcode, items and totals (owner's request), not the full address.
- Legal pages are separate static routes (`shipping.tsx`, etc.) sharing `LegalPage`, which keeps
  links type-safe.
- Admin "Coming next" nav items are intentionally inert until their milestone ships.
- `/admin` requires a Netlify Identity user with an admin role. Dashboard and Orders still show
  fixture data; connect them to the database in milestone 5.
