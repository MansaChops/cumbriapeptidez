import { Link, createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { formatMoney } from '@/config/site'
import { customers, dailySales, findCustomer, orderTotal, products } from '@/data/fixtures'
import { useOrders } from '@/lib/demo-orders'
import { BarList, SalesChart } from '@/components/admin/charts'
import { IntegrationDot, Panel, StatusBadge, fmtDate } from '@/components/admin/ui'

export const Route = createFileRoute('/admin/dashboard')({
  component: Dashboard,
})

// Demo reporting assumptions — become editable cost settings in the reporting milestone.
const COST_RATIO = 0.38
const STRIPE_FEE = (total: number) => total * 0.015 + 0.2
const TODAY = '2026-10-07'

function Dashboard() {
  const orders = useOrders()
  const paid = orders.filter((o) => o.paymentStatus === 'PAID')
  const today = paid.filter((o) => o.createdAt.startsWith(TODAY))
  const month = paid.filter((o) => o.createdAt.startsWith(TODAY.slice(0, 7)))
  const monthRevenue = month.reduce((s, o) => s + orderTotal(o), 0)
  const profit = month.reduce((s, o) => s + orderTotal(o) * (1 - COST_RATIO) - STRIPE_FEE(orderTotal(o)) - o.shipping, 0)

  const lowStock = products.flatMap((p) => p.variants.filter((v) => v.stock <= v.lowStockThreshold).map((v) => ({ p, v })))
  const failures = orders.flatMap((o) => o.notifications.filter((n) => n.status !== 'SENT').map((n) => ({ o, n })))

  const units = new Map<string, { label: string; sub: string; value: number }>()
  paid.forEach((o) =>
    o.items.forEach((i) => {
      const k = i.sku
      const row = units.get(k) ?? { label: i.productName, sub: i.variantName, value: 0 }
      row.value += i.quantity
      units.set(k, row)
    }),
  )
  const top = [...units.values()].sort((a, b) => b.value - a.value).slice(0, 6)

  const kpis = [
    { k: 'Today’s orders', v: String(today.length), s: formatMoney(today.reduce((s, o) => s + orderTotal(o), 0)) + ' revenue' },
    { k: 'Awaiting packing', v: String(orders.filter((o) => o.fulfilmentStatus === 'NEW' || o.fulfilmentStatus === 'PACKING').length), s: 'NEW + PACKING' },
    { k: 'Awaiting shipment', v: String(orders.filter((o) => o.fulfilmentStatus === 'PACKED').length), s: 'Packed, not shipped' },
    { k: 'Low stock', v: String(lowStock.length), s: 'variants at threshold', warn: lowStock.length > 0 },
    { k: 'Revenue this month', v: formatMoney(monthRevenue), s: `${month.length} orders` },
    { k: 'Est. profit (month)', v: formatMoney(profit), s: `${((profit / monthRevenue) * 100).toFixed(1)}% margin` },
    { k: 'Products', v: String(products.filter((p) => p.active).length), s: `${products.reduce((n, p) => n + p.variants.length, 0)} variants` },
    { k: 'Customers', v: String(customers.length), s: 'guest checkout' },
  ]

  return (
    <div className="mx-auto max-w-[1400px] px-4 md:px-8 py-6 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink-3">Wednesday 7 October 2026</p>
          <h1 className="font-display text-4xl md:text-5xl mt-1">Good morning</h1>
        </div>
        <Link to="/admin/orders" search={{ status: 'NEW' }} className="btn btn-primary">
          Pack today’s orders <ArrowRight size={16} />
        </Link>
      </header>

      <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line rounded-2xl overflow-hidden">
        {kpis.map((k) => (
          <div key={k.k} className="bg-card p-4 md:p-5">
            <p className="label text-ink-3 flex items-center gap-1.5">
              {k.warn && <AlertTriangle size={12} className="text-amber" />}
              {k.k}
            </p>
            <p className={`font-display text-3xl md:text-4xl mt-2 ${k.warn ? 'text-amber' : ''}`}>{k.v}</p>
            <p className="text-xs text-ink-3 mt-1">{k.s}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Revenue · last 30 days" action={<span className="font-mono text-xs text-ink-2">{formatMoney(dailySales.reduce((s, d) => s + d.revenue, 0))}</span>}>
          <div className="px-3 pb-3">
            <SalesChart data={dailySales} />
          </div>
        </Panel>
        <Panel title="Top products · units sold">
          <div className="px-5 pb-5">
            <BarList rows={top} format={(n) => `${n} units`} />
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Recent orders" action={<Link to="/admin/orders" className="text-xs text-verdigris">View all</Link>}>
          <ul className="divide-y divide-line border-t border-line">
            {orders.slice(0, 6).map((o) => (
              <li key={o.id}>
                <Link to="/admin/orders/$orderNumber" params={{ orderNumber: o.orderNumber }} className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[7rem_1fr_7rem_6rem] items-center gap-3 px-5 py-3 hover:bg-paper/60">
                  <span className="font-mono text-sm">{o.orderNumber}</span>
                  <span className="text-sm truncate">{findCustomer(o.customerId).name} <span className="text-ink-3 hidden md:inline">· {fmtDate(o.createdAt)}</span></span>
                  <span className="hidden md:block"><StatusBadge status={o.fulfilmentStatus} /></span>
                  <span className="text-sm text-right font-medium">{formatMoney(orderTotal(o))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="grid gap-6 content-start">
          <Panel title="Low stock alerts">
            <ul className="divide-y divide-line border-t border-line">
              {lowStock.map(({ p, v }) => (
                <li key={v.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span>{p.name} <span className="text-ink-3">{v.name}</span><br /><span className="font-mono text-[11px] text-ink-3">{v.sku} · threshold {v.lowStockThreshold}</span></span>
                  <span className={`font-display text-2xl ${v.stock === 0 ? 'text-oxblood' : 'text-amber'}`}>{v.stock}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Notifications needing attention">
            {failures.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {failures.map(({ o, n }) => (
                  <li key={o.id + n.type}>
                    <Link to="/admin/orders/$orderNumber" params={{ orderNumber: o.orderNumber }} className="flex gap-3 px-5 py-3 text-sm hover:bg-paper/60">
                      <span className="pt-1.5"><IntegrationDot status={n.status} /></span>
                      <span>
                        <span className="font-mono">{o.orderNumber}</span> · {n.provider} {n.status.toLowerCase()}
                        <span className="block text-xs text-ink-3">{n.error}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-sm text-ink-3">All Slack, SMS, email and Sheets deliveries succeeded.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
