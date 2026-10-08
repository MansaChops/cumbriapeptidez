import { and, eq, inArray, lte, or } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { notifications, orderItems, orders, productVariants, products } from '../../db/schema.js'
import { formatMoney, site } from '../../src/config/site.js'
import { orderRef } from '../../src/lib/catalogue.js'

// Backoff between delivery attempts, matching the outbox plan (1m, 4m, 16m, 1h, 4h).
const BACKOFF_MINUTES = [1, 4, 16, 60, 240]
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1
const SEND_LEASE_MS = 2 * 60_000

const money = (pence: number) => formatMoney(pence / 100)

// Slack is a packing feed: who ordered, how to reach them, and what to pack. The full address
// stays in the database (and the Netlify Forms submission).
async function buildMessage(orderId: number) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
  const items = await db
    .select({ item: orderItems, preOrder: products.preOrder })
    .from(orderItems)
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(orderItems.id)
  const ref = orderRef(order.number)
  const lines = items.map(
    ({ item: i, preOrder }) =>
      `• ${i.quantity} × ${i.productName} ${i.variantName} \`${i.sku}\` — ${money(i.unitPricePence * i.quantity)}${preOrder ? ' — *PRE-ORDER, ships separately*' : ''}`,
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
 * Sends a message with whichever Slack credentials are configured: an incoming webhook
 * (SLACK_WEBHOOK_URL), or a bot token plus channel (SLACK_BOT_TOKEN + SLACK_CHANNEL_ID, using
 * chat.postMessage). Credentials stay server-side and are never included in errors.
 */
async function postToSlack(message: Record<string, unknown>) {
  const webhook = process.env.SLACK_WEBHOOK_URL
  const token = process.env.SLACK_BOT_TOKEN
  const channel = process.env.SLACK_CHANNEL_ID
  if (webhook) {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`Slack webhook responded ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return
  }
  if (!token || !channel) {
    throw new Error(token ? 'SLACK_CHANNEL_ID is not set (needed with SLACK_BOT_TOKEN)' : 'Slack is not configured: set SLACK_WEBHOOK_URL, or SLACK_BOT_TOKEN and SLACK_CHANNEL_ID')
  }
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel, ...message }),
    signal: AbortSignal.timeout(8000),
  })
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!res.ok || !body.ok) throw new Error(`Slack chat.postMessage failed: ${body.error ?? `HTTP ${res.status}`}`)
}

/**
 * Attempts one delivery of a Slack notification and records the outcome. Never throws:
 * Slack is downstream of the order and must not affect it.
 */
export async function deliverSlack(notificationId: number) {
  // Claim the notification first, so overlapping runs (the order request and the scheduled retry)
  // never both send it. The claim expires after SEND_LEASE_MS in case a run dies mid-send.
  const [n] = await db
    .update(notifications)
    .set({ status: 'SENDING', nextAttemptAt: new Date(Date.now() + SEND_LEASE_MS) })
    .where(
      and(
        eq(notifications.id, notificationId),
        or(inArray(notifications.status, ['PENDING', 'RETRYING']), and(eq(notifications.status, 'SENDING'), lte(notifications.nextAttemptAt, new Date()))),
      ),
    )
    .returning()
  if (!n) return

  const attempts = n.attempts + 1
  try {
    await postToSlack(await buildMessage(n.orderId))
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
    .where(
      and(
        eq(notifications.channel, 'slack'),
        inArray(notifications.status, ['RETRYING', 'SENDING']),
        lte(notifications.nextAttemptAt, new Date()),
      ),
    )
