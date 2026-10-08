import { and, eq, lte } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { notifications, orderItems, orders } from '../../db/schema.js'
import { formatMoney, site } from '../../src/config/site.js'
import { findVariant } from '../../src/data/fixtures.js'

// Backoff between delivery attempts, matching the outbox plan (1m, 4m, 16m, 1h, 4h).
const BACKOFF_MINUTES = [1, 4, 16, 60, 240]
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1

// CP-YYYYMMDD-NNNNNN: the UK order date plus the Postgres sequence number. The sequence makes it
// unique; the date makes it readable.
export const orderRef = (n: number, createdAt: Date) =>
  `CP-${createdAt.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).replaceAll('-', '')}-${String(n).padStart(6, '0')}`
const money = (pence: number) => formatMoney(pence / 100)

// Slack is a packing feed: who ordered, how to reach them, and what to pack. The full address
// stays in the database (and the Netlify Forms submission).
async function buildMessage(orderId: number) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId))
  const ref = orderRef(order.number, order.createdAt)
  const isPreOrder = (variantId: string) => !!findVariant(variantId)?.product.preOrder
  const lines = items.map(
    (i) => `• ${i.quantity} × ${i.productName} ${i.variantName} \`${i.sku}\` — ${money(i.unitPricePence * i.quantity)}${isPreOrder(i.variantId) ? ' — *PRE-ORDER, ships separately*' : ''}`,
  )

  return {
    text: `New order ${ref} — ${money(order.totalPence)} from ${order.customerName}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `🛒 NEW ORDER ${ref}` } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Customer*\n${order.customerName}` },
          { type: 'mrkdwn', text: `*Deliver to*\n${order.city} ${order.postcode.toUpperCase()}` },
          { type: 'mrkdwn', text: `*Email*\n${order.email}` },
          { type: 'mrkdwn', text: `*Phone*\n${order.phone}` },
          { type: 'mrkdwn', text: `*Total*\n${money(order.totalPence)}` },
          { type: 'mrkdwn', text: `*Payment*\n${order.paymentStatus}` },
        ],
      },
      { type: 'section', text: { type: 'mrkdwn', text: `*Items*\n${lines.join('\n')}\n_Delivery: ${order.shippingPence ? money(order.shippingPence) : 'Free'}_` } },
      ...(order.notes ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Notes*\n${order.notes}` } }] : []),
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${site.name} · ${order.createdAt.toLocaleString(site.locale, { timeZone: 'Europe/London' })}` }] },
    ],
  }
}

/**
 * Attempts one delivery of a Slack notification and records the outcome. Never throws:
 * Slack is downstream of the order and must not affect it.
 */
export async function deliverSlack(notificationId: number) {
  const [n] = await db.select().from(notifications).where(eq(notifications.id, notificationId))
  if (!n || n.status === 'SENT') return

  const attempts = n.attempts + 1
  try {
    const url = process.env.SLACK_WEBHOOK_URL
    if (!url) throw new Error('SLACK_WEBHOOK_URL is not set')
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(await buildMessage(n.orderId)),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`Slack responded ${res.status}: ${(await res.text()).slice(0, 200)}`)
    await db.update(notifications).set({ status: 'SENT', attempts, sentAt: new Date(), lastError: null }).where(eq(notifications.id, n.id))
  } catch (err) {
    const delay = BACKOFF_MINUTES[attempts - 1]
    await db
      .update(notifications)
      .set({
        status: delay ? 'RETRYING' : 'FAILED',
        attempts,
        lastError: err instanceof Error ? err.message : String(err),
        nextAttemptAt: new Date(Date.now() + (delay ?? 0) * 60_000),
      })
      .where(eq(notifications.id, n.id))
      .catch((e) => console.error('Could not record Slack failure', e))
    console.error(`Slack notification ${n.id} failed (attempt ${attempts})`, err)
  }
}

export const dueSlackNotifications = () =>
  db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.channel, 'slack'), eq(notifications.status, 'RETRYING'), lte(notifications.nextAttemptAt, new Date())))
