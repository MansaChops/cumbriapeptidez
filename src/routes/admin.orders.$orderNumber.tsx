import { useState } from 'react'
import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { ArrowLeft, Check, CheckCircle2, Printer, RotateCcw, Truck, XCircle } from 'lucide-react'
import { formatMoney, site } from '@/config/site'
import { findCustomer, orderSubtotal, orderTotal, orderUnits, type FulfilmentStatus, type NotificationRecord, type Order } from '@/data/fixtures'
import { orderActions, useOrders } from '@/lib/demo-orders'
import { IntegrationDot, Panel, PaymentBadge, StatusBadge, fmtDate } from '@/components/admin/ui'

export const Route = createFileRoute('/admin/orders/$orderNumber')({
  loader: ({ params }) => {
    if (!/^ORD-\d+$/.test(params.orderNumber)) throw notFound()
    return params.orderNumber
  },
  component: OrderPage,
})

const FLOW: Array<FulfilmentStatus> = ['NEW', 'PACKING', 'PACKED', 'SHIPPED', 'COMPLETED']

function OrderPage() {
  const orderNumber = Route.useLoaderData()
  const order = useOrders().find((o) => o.orderNumber === orderNumber)
  if (!order) return <p className="p-10 text-center text-ink-3">Order {orderNumber} not found.</p>
  const c = findCustomer(order.customerId)

  return (
    <>
      <div className="no-print mx-auto max-w-[1400px] px-4 md:px-8 py-6 md:py-8">
        <Link to="/admin/orders" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft size={15} /> Orders
        </Link>
        <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-mono text-3xl md:text-4xl font-medium tracking-tight">{order.orderNumber}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-2">
              <StatusBadge status={order.fulfilmentStatus} />
              <PaymentBadge status={order.paymentStatus} />
              <span>Placed {fmtDate(order.createdAt)}</span>
            </div>
          </div>
          <button className="btn btn-ghost !py-2 text-sm" onClick={() => window.print()}>
            <Printer size={15} /> Print packing slip
          </button>
        </header>

        <Stepper status={order.fulfilmentStatus} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="grid gap-6 content-start">
            <Workflow order={order} />
            <Items order={order} />
            <Notes order={order} />
          </div>
          <div className="grid gap-6 content-start">
            <Panel title="Customer">
              <div className="px-5 pb-5 text-sm grid gap-4">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-ink-2">{c.email}</p>
                  <p className="text-ink-2">{c.phone}</p>
                </div>
                <div className="border-t border-line pt-4">
                  <p className="label text-ink-3 mb-1.5">Delivery address</p>
                  <address className="not-italic leading-relaxed">{c.name}<br />{c.address}<br />{c.city}<br />{c.postcode}<br />{c.country}</address>
                </div>
                {order.trackingNumber && (
                  <div className="border-t border-line pt-4">
                    <p className="label text-ink-3 mb-1.5">Tracking</p>
                    <p className="font-mono">{order.trackingNumber}</p>
                  </div>
                )}
                <div className="border-t border-line pt-4">
                  <p className="label text-ink-3 mb-1.5">Payment</p>
                  <p className="font-mono text-xs text-ink-2">Stripe · {order.stripePaymentId}</p>
                </div>
              </div>
            </Panel>
            <Integrations order={order} />
            <Panel title="Inventory movements">
              <ul className="border-t border-line divide-y divide-line text-sm">
                {order.items.map((i) => (
                  <li key={i.sku} className="flex justify-between px-5 py-2.5">
                    <span className="font-mono text-xs">{i.sku}</span>
                    <span className="text-ink-3 text-xs">ORDER {order.orderNumber}</span>
                    <span className="font-mono text-oxblood">−{i.quantity}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Timeline">
              <ol className="px-5 pb-5 grid gap-4">
                {[...order.timeline].reverse().map((t, i) => (
                  <li key={i} className="grid grid-cols-[12px_1fr] gap-3 text-sm">
                    <span className={`mt-1.5 w-2 h-2 rounded-full ${i === 0 ? 'bg-verdigris' : 'bg-line'}`} />
                    <span>
                      {t.label}
                      <span className="block text-xs text-ink-3">{fmtDate(t.at)} · {t.actor}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>
        </div>
      </div>
      <PackingSlip order={order} />
    </>
  )
}

function Stepper({ status }: { status: FulfilmentStatus }) {
  const idx = FLOW.indexOf(status)
  if (idx < 0) return null
  return (
    <ol className="mt-6 grid grid-cols-5 gap-1">
      {FLOW.map((s, i) => (
        <li key={s} className="grid gap-1.5">
          <span className={`h-1 rounded-full ${i <= idx ? 'bg-verdigris' : 'bg-line'}`} />
          <span className={`label text-[10px] ${i === idx ? 'text-ink' : 'text-ink-3'}`}>{s}</span>
        </li>
      ))}
    </ol>
  )
}

function Workflow({ order }: { order: Order }) {
  const c = findCustomer(order.customerId)
  const checks = [
    ...order.items.map((i) => ({ id: i.sku, label: `${i.productName} ${i.variantName} × ${i.quantity}`, sub: i.sku })),
    { id: 'qty', label: `Quantity verified (${orderUnits(order)} units)` },
    { id: 'addr', label: `Address verified — ${c.postcode}` },
    { id: 'seal', label: 'Package sealed' },
  ]
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [tracking, setTracking] = useState('')
  const allTicked = checks.every((x) => ticked.has(x.id))
  const toggle = (id: string) => setTicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const set = (to: FulfilmentStatus, extra?: Partial<Order>) => orderActions.setStatus(order.orderNumber, to, extra)
  const cancellable = ['NEW', 'PACKING', 'PACKED'].includes(order.fulfilmentStatus)

  return (
    <Panel className="overflow-hidden">
      <div className="p-5 md:p-6">
        {order.fulfilmentStatus === 'NEW' && (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-display text-3xl">Ready to pack</p>
              <p className="text-sm text-ink-2 mt-1">{orderUnits(order)} units across {order.items.length} lines. Starting will notify #packing on Slack.</p>
            </div>
            <button className="btn btn-primary !px-8 !py-4 w-full sm:w-auto" onClick={() => set('PACKING')}>Start packing</button>
          </div>
        )}

        {order.fulfilmentStatus === 'PACKING' && (
          <>
            <div className="flex items-baseline justify-between">
              <p className="font-display text-3xl">Packing checklist</p>
              <span className="font-mono text-sm text-ink-3">{ticked.size}/{checks.length}</span>
            </div>
            <ul className="mt-4 grid gap-2">
              {checks.map((x) => {
                const on = ticked.has(x.id)
                return (
                  <li key={x.id}>
                    <button
                      onClick={() => toggle(x.id)}
                      className={`w-full flex items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition ${on ? 'border-verdigris bg-verdigris-soft/60' : 'border-line hover:border-ink-3'}`}
                      aria-pressed={on}
                    >
                      <span className={`grid place-items-center w-6 h-6 rounded-md border shrink-0 transition ${on ? 'bg-verdigris border-verdigris text-paper' : 'border-ink-3'}`}>
                        {on && <Check size={15} strokeWidth={3} />}
                      </span>
                      <span className={`flex-1 ${on ? 'text-ink-2' : ''}`}>{x.label}</span>
                      {'sub' in x && <span className="font-mono text-xs text-ink-3">{x.sub}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
            <button className="btn btn-primary w-full mt-5 !py-4" disabled={!allTicked} onClick={() => set('PACKED')}>
              {allTicked ? 'Mark as packed' : 'Tick every item to mark packed'}
            </button>
          </>
        )}

        {order.fulfilmentStatus === 'PACKED' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (tracking.trim()) set('SHIPPED', { trackingNumber: tracking.trim().toUpperCase() })
            }}
          >
            <p className="font-display text-3xl">Packed — ready to ship</p>
            <p className="text-sm text-ink-2 mt-1">Enter the tracking number. The customer is emailed it when you mark shipped.</p>
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <input className="field font-mono uppercase" placeholder="e.g. QA 1234 5678 9GB" value={tracking} onChange={(e) => setTracking(e.target.value)} />
              <button className="btn btn-primary !py-3 shrink-0" disabled={!tracking.trim()}><Truck size={16} /> Mark as shipped</button>
            </div>
          </form>
        )}

        {order.fulfilmentStatus === 'SHIPPED' && (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-display text-3xl">On its way</p>
              <p className="text-sm text-ink-2 mt-1">Tracking <span className="font-mono">{order.trackingNumber}</span>. Mark completed once delivered.</p>
            </div>
            <button className="btn btn-primary w-full sm:w-auto" onClick={() => set('COMPLETED')}><CheckCircle2 size={16} /> Mark completed</button>
          </div>
        )}

        {['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(order.fulfilmentStatus) && (
          <p className="font-display text-3xl">
            {order.fulfilmentStatus === 'COMPLETED' ? 'Order completed' : order.fulfilmentStatus === 'CANCELLED' ? 'Order cancelled' : 'Order refunded'}
            <span className="block font-sans text-sm text-ink-2 mt-1">No further fulfilment actions.</span>
          </p>
        )}
      </div>

      {(cancellable || order.paymentStatus === 'PAID') && (
        <div className="flex flex-wrap gap-2 border-t border-line bg-paper/50 px-5 py-3">
          {cancellable && (
            <button
              className="inline-flex items-center gap-1.5 text-sm text-oxblood hover:underline"
              onClick={() => confirm(`Cancel ${order.orderNumber}? Stock will be returned.`) && set('CANCELLED')}
            >
              <XCircle size={15} /> Cancel order
            </button>
          )}
          {order.paymentStatus === 'PAID' && (
            <button className="inline-flex items-center gap-1.5 text-sm text-ink-3 ml-auto cursor-not-allowed" title="Stripe refunds connect in the payments milestone" disabled>
              <RotateCcw size={15} /> Refund order
            </button>
          )}
        </div>
      )}
    </Panel>
  )
}

function Items({ order }: { order: Order }) {
  return (
    <Panel title={`Items · ${orderUnits(order)} units`}>
      <table className="w-full text-sm border-t border-line">
        <thead className="label text-ink-3 text-left">
          <tr><th className="font-normal px-5 py-2.5">Product</th><th className="font-normal">SKU</th><th className="font-normal text-center">Qty</th><th className="font-normal text-right hidden sm:table-cell">Unit</th><th className="font-normal text-right px-5">Total</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {order.items.map((i) => (
            <tr key={i.sku}>
              <td className="px-5 py-3">{i.productName} <span className="text-ink-3">{i.variantName}</span></td>
              <td className="font-mono text-xs">{i.sku}</td>
              <td className="text-center font-mono">{i.quantity}</td>
              <td className="text-right hidden sm:table-cell">{formatMoney(i.unitPrice)}</td>
              <td className="text-right px-5">{formatMoney(i.unitPrice * i.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="border-t border-line px-5 py-4 grid gap-1.5 text-sm ml-auto max-w-xs">
        <div className="flex justify-between"><dt className="text-ink-2">Subtotal</dt><dd>{formatMoney(orderSubtotal(order))}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-2">Shipping</dt><dd>{order.shipping ? formatMoney(order.shipping) : 'Free'}</dd></div>
        <div className="flex justify-between font-medium text-base pt-1"><dt>Total</dt><dd>{formatMoney(orderTotal(order))}</dd></div>
      </dl>
    </Panel>
  )
}

function Notes({ order }: { order: Order }) {
  const [note, setNote] = useState('')
  return (
    <Panel title="Notes">
      <div className="px-5 pb-5 grid gap-4 text-sm">
        <div>
          <p className="label text-ink-3 mb-1">Customer note</p>
          <p className={order.notes ? '' : 'text-ink-3'}>{order.notes ?? 'None'}</p>
        </div>
        <div className="border-t border-line pt-4">
          <p className="label text-ink-3 mb-1">Admin notes · internal only</p>
          {order.adminNotes && <p className="whitespace-pre-line mb-3">{order.adminNotes}</p>}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (note.trim()) {
                orderActions.addNote(order.orderNumber, note.trim())
                setNote('')
              }
            }}
          >
            <input className="field !py-2 text-sm" placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            <button className="btn btn-ghost !py-2 text-sm shrink-0" disabled={!note.trim()}>Add note</button>
          </form>
        </div>
      </div>
    </Panel>
  )
}

const typeLabel: Record<NotificationRecord['type'], string> = {
  SLACK_NEW_ORDER: 'Slack · #new-orders',
  SLACK_STATUS: 'Slack · status update',
  SMS_ADMIN: 'SMS · admin alert',
  SHEETS_SYNC: 'Google Sheets · ORDERS',
  EMAIL_CONFIRMATION: 'Email · confirmation',
  EMAIL_SHIPPED: 'Email · shipped',
}
const retryLabel: Partial<Record<NotificationRecord['type'], string>> = {
  SMS_ADMIN: 'Resend SMS',
  SHEETS_SYNC: 'Resync Google Sheet',
  SLACK_NEW_ORDER: 'Resend to Slack',
  EMAIL_CONFIRMATION: 'Resend email',
}

function Integrations({ order }: { order: Order }) {
  return (
    <Panel title="Notifications & sync">
      <ul className="border-t border-line divide-y divide-line">
        {order.notifications.map((n, i) => (
          <li key={i} className="px-5 py-3 text-sm">
            <div className="flex items-center gap-3">
              <IntegrationDot status={n.status} />
              <span className="flex-1">{typeLabel[n.type]}</span>
              <span className="text-xs text-ink-3">{n.status === 'SENT' ? fmtDate(n.at) : `${n.status.toLowerCase()} · ${n.attempts} tries`}</span>
            </div>
            {n.status !== 'SENT' && (
              <div className="mt-2 ml-5 rounded-lg bg-oxblood-soft/60 px-3 py-2">
                <p className="text-xs text-oxblood">{n.error}</p>
                <button onClick={() => orderActions.retry(order.orderNumber, n.type)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-ink hover:underline">
                  <RotateCcw size={12} /> {retryLabel[n.type] ?? 'Retry'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function PackingSlip({ order }: { order: Order }) {
  const c = findCustomer(order.customerId)
  return (
    <section className="hidden print:block p-10 text-ink font-sans text-sm">
      <div className="flex justify-between items-start border-b border-ink pb-5">
        <div>
          <p className="font-display text-3xl">{site.name}</p>
          <p className="text-xs mt-1">{site.address}</p>
        </div>
        <div className="text-right">
          <p className="label">Packing slip</p>
          <p className="font-mono text-2xl mt-1">{order.orderNumber}</p>
          <p className="text-xs">{fmtDate(order.createdAt, false)}</p>
        </div>
      </div>
      <div className="mt-6">
        <p className="label mb-1">Deliver to</p>
        <address className="not-italic text-base leading-relaxed">{c.name}<br />{c.address}<br />{c.city}<br />{c.postcode}<br />{c.country}</address>
      </div>
      <table className="w-full mt-8 border-collapse">
        <thead><tr className="label text-left border-b border-ink"><th className="py-2 w-8">✓</th><th className="py-2 font-normal">Product</th><th className="py-2 font-normal">SKU</th><th className="py-2 font-normal text-right">Qty</th></tr></thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.sku} className="border-b border-line">
              <td className="py-3"><span className="inline-block w-4 h-4 border border-ink" /></td>
              <td className="py-3">{i.productName} {i.variantName}</td>
              <td className="py-3 font-mono">{i.sku}</td>
              <td className="py-3 text-right font-mono text-base">{i.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-8 grid gap-2">
        {['Quantity verified', 'Address verified', 'Package sealed'].map((l) => (
          <p key={l} className="flex items-center gap-3"><span className="inline-block w-4 h-4 border border-ink" /> {l}</p>
        ))}
      </div>
      {order.notes && <p className="mt-8 border-t border-line pt-4"><span className="label">Customer note: </span>{order.notes}</p>}
      <p className="mt-10 text-xs text-ink-3">Packed by: ____________________ Date: ____________</p>
    </section>
  )
}
