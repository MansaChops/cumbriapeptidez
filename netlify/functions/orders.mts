import type { Config, Context } from '@netlify/functions'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db/index.js'
import { notifications, orderItems, orders } from '../../db/schema.js'
import { site } from '../../src/config/site.js'
import { findVariant, maxQty, qtyStep, unitPrice } from '../../src/data/fixtures.js'
import { deliverSlack, orderRef } from '../lib/slack.js'

const pence = (pounds: number) => Math.round(pounds * 100)

const OrderInput = z.object({
  checkoutId: z.uuid(),
  details: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.email().max(200),
    phone: z.string().trim().refine((v) => v.replace(/\D/g, '').length >= 10).pipe(z.string().max(30)),
    address: z.string().trim().min(4).max(200),
    city: z.string().trim().min(2).max(100),
    postcode: z.string().trim().regex(/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i),
    country: z.literal('United Kingdom'),
    notes: z.string().trim().max(500).default(''),
  }),
  items: z.array(z.object({ variantId: z.string().max(100), quantity: z.number().int().min(1).max(100) })).min(1).max(50),
})

/**
 * Places an order. The database is the source of truth: the order is committed first, then
 * Slack is notified on a best-effort basis. A Slack failure never fails the order; it is
 * recorded in the notifications outbox and retried by `retry-notifications`.
 */
export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })

  const parsed = OrderInput.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Please check your details and try again.' }, { status: 400 })
  const { checkoutId, details, items } = parsed.data

  // A retry of a checkout that already succeeded (e.g. the form submission failed afterwards)
  // gets the same order back, so the customer can never place it twice.
  const [existing] = await db.select().from(orders).where(eq(orders.checkoutId, checkoutId))
  if (existing) return orderResponse(existing, 200)

  // Prices and stock are always re-derived server-side; the browser only sends IDs and quantities.
  const lines = []
  for (const { variantId, quantity } of items) {
    const found = findVariant(variantId)
    if (!found || !found.product.active || !found.variant.active || quantity > maxQty(found.variant) || quantity % qtyStep(found.variant) !== 0) {
      return Response.json({ error: `${found?.product.name ?? 'An item'} is no longer available in that quantity.` }, { status: 409 })
    }
    lines.push({ variantId, quantity, product: found.product, variant: found.variant, unitPricePence: pence(unitPrice(found.variant)) })
  }
  const subtotalPence = lines.reduce((s, l) => s + l.unitPricePence * l.quantity, 0)
  const shippingPence = subtotalPence >= pence(site.shipping.freeOver) ? 0 : pence(site.shipping.standard)

  const created = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        checkoutId,
        customerName: details.name,
        email: details.email,
        phone: details.phone,
        address: details.address,
        city: details.city,
        postcode: details.postcode.toUpperCase(),
        country: details.country,
        notes: details.notes,
        subtotalPence,
        shippingPence,
        totalPence: subtotalPence + shippingPence,
      })
      .onConflictDoNothing({ target: orders.checkoutId })
      .returning()
    // A concurrent request with the same checkout ID won the race; it owns the order.
    if (!order) return null
    await tx.insert(orderItems).values(
      lines.map((l) => ({
        orderId: order.id,
        variantId: l.variantId,
        productName: l.product.name,
        variantName: l.variant.name,
        sku: l.variant.sku,
        quantity: l.quantity,
        unitPricePence: l.unitPricePence,
      })),
    )
    const [n] = await tx.insert(notifications).values({ orderId: order.id, channel: 'slack', event: 'order.created' }).returning({ id: notifications.id })
    return { order, notificationId: n.id }
  })

  if (!created) {
    const [order] = await db.select().from(orders).where(eq(orders.checkoutId, checkoutId))
    return orderResponse(order, 200)
  }

  // Send to Slack without holding up the customer's response.
  context.waitUntil(deliverSlack(created.notificationId))

  return orderResponse(created.order, 201)
}

// The saved, server-priced order. The browser copies this into the Netlify Forms submission, so
// the owner's notification always matches the database.
async function orderResponse(order: typeof orders.$inferSelect, status: number) {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(orderItems.id)
  return Response.json(
    {
      orderNumber: orderRef(order.number, order.createdAt),
      createdAt: order.createdAt.toISOString(),
      items: items.map((i) => ({
        variantId: i.variantId,
        name: i.productName,
        variant: i.variantName,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPricePence / 100,
        lineTotal: (i.unitPricePence * i.quantity) / 100,
      })),
      subtotal: order.subtotalPence / 100,
      shipping: order.shippingPence / 100,
      total: order.totalPence / 100,
    },
    { status },
  )
}

export const config: Config = {
  path: '/api/orders',
  method: 'POST',
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
