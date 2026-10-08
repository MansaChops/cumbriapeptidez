import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Download, Search } from 'lucide-react'
import { formatMoney } from '@/config/site'
import { findCustomer, orderTotal, orderUnits, type FulfilmentStatus, type PaymentStatus } from '@/data/fixtures'
import { useOrders } from '@/lib/demo-orders'
import { PaymentBadge, StatusBadge, fmtDate } from '@/components/admin/ui'

const STATUSES: Array<FulfilmentStatus> = ['NEW', 'PACKING', 'PACKED', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED']
const PAYMENTS: Array<PaymentStatus> = ['PAID', 'PENDING', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']
type Sort = 'newest' | 'oldest' | 'highest' | 'lowest'
type OrdersSearch = { q?: string; status?: FulfilmentStatus; payment?: PaymentStatus; sort?: Sort }

export const Route = createFileRoute('/admin/orders/')({
  validateSearch: (s: Record<string, unknown>): OrdersSearch => ({
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    status: STATUSES.includes(s.status as FulfilmentStatus) ? (s.status as FulfilmentStatus) : undefined,
    payment: PAYMENTS.includes(s.payment as PaymentStatus) ? (s.payment as PaymentStatus) : undefined,
    sort: ['oldest', 'highest', 'lowest'].includes(s.sort as string) ? (s.sort as Sort) : undefined,
  }),
  component: Orders,
})

function Orders() {
  const all = useOrders()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/admin/orders/' })
  const set = (p: Partial<OrdersSearch>) => navigate({ search: (prev) => ({ ...prev, ...p }), replace: true })

  const q = search.q?.toLowerCase().trim()
  const rows = all
    .map((o) => ({ o, c: findCustomer(o.customerId) }))
    .filter(({ o, c }) => {
      if (search.status && o.fulfilmentStatus !== search.status) return false
      if (search.payment && o.paymentStatus !== search.payment) return false
      if (!q) return true
      const hay = [o.orderNumber, c.name, c.email, c.phone.replace(/\s/g, ''), ...o.items.flatMap((i) => [i.sku, i.productName])].join(' ').toLowerCase()
      return hay.includes(q.replace(/\s/g, '')) || hay.includes(q)
    })
    .sort((a, b) => {
      if (search.sort === 'oldest') return a.o.createdAt.localeCompare(b.o.createdAt)
      if (search.sort === 'highest') return orderTotal(b.o) - orderTotal(a.o)
      if (search.sort === 'lowest') return orderTotal(a.o) - orderTotal(b.o)
      return b.o.createdAt.localeCompare(a.o.createdAt)
    })

  const count = (s?: FulfilmentStatus) => all.filter((o) => !s || o.fulfilmentStatus === s).length

  return (
    <div className="mx-auto max-w-[1400px] px-4 md:px-8 py-6 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink-3">Order management</p>
          <h1 className="font-display text-4xl md:text-5xl mt-1">Orders</h1>
        </div>
        <button className="btn btn-ghost !py-2 text-sm" disabled title="CSV exports arrive with the reporting milestone">
          <Download size={15} /> Export CSV
        </button>
      </header>

      <div className="mt-6 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto">
        <div className="flex gap-1 min-w-max border-b border-line">
          {([undefined, ...STATUSES] as const).map((s) => (
            <button
              key={s ?? 'all'}
              onClick={() => set({ status: s })}
              className={`px-3 py-2.5 text-sm border-b-2 -mb-px transition ${search.status === s ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}
            >
              {s ? s[0] + s.slice(1).toLowerCase() : 'All'} <span className="font-mono text-[11px] text-ink-3 ml-0.5">{count(s)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="relative flex-1 min-w-60">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field pl-9 !py-2.5 text-sm" placeholder="Order no., name, email, phone, SKU or product" defaultValue={search.q} onChange={(e) => set({ q: e.target.value || undefined })} />
        </label>
        <select className="field !w-auto !py-2.5 text-sm" value={search.payment ?? ''} onChange={(e) => set({ payment: (e.target.value || undefined) as PaymentStatus })} aria-label="Payment status">
          <option value="">Any payment</option>
          {PAYMENTS.map((p) => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
        </select>
        <select className="field !w-auto !py-2.5 text-sm" value={search.sort ?? 'newest'} onChange={(e) => set({ sort: e.target.value === 'newest' ? undefined : (e.target.value as Sort) })} aria-label="Sort">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="highest">Highest value</option>
          <option value="lowest">Lowest value</option>
        </select>
      </div>

      {/* Desktop table */}
      <div className="mt-4 hidden md:block rounded-2xl border border-line bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="label text-ink-3 text-left border-b border-line">
              <th className="font-normal px-5 py-3">Order</th>
              <th className="font-normal py-3">Customer</th>
              <th className="font-normal py-3">Items</th>
              <th className="font-normal py-3">Payment</th>
              <th className="font-normal py-3">Status</th>
              <th className="font-normal py-3 text-right px-5">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ o, c }) => (
              <tr key={o.id} className="hover:bg-paper/60 cursor-pointer" onClick={() => navigate({ to: '/admin/orders/$orderNumber', params: { orderNumber: o.orderNumber } })}>
                <td className="px-5 py-3.5">
                  <Link to="/admin/orders/$orderNumber" params={{ orderNumber: o.orderNumber }} className="font-mono font-medium hover:text-verdigris">{o.orderNumber}</Link>
                  <p className="text-xs text-ink-3">{fmtDate(o.createdAt)}</p>
                </td>
                <td>{c.name}<p className="text-xs text-ink-3">{c.city}</p></td>
                <td className="max-w-72">
                  <p className="truncate">{o.items.map((i) => `${i.productName} ${i.variantName} ×${i.quantity}`).join(', ')}</p>
                  <p className="text-xs text-ink-3">{orderUnits(o)} units</p>
                </td>
                <td><PaymentBadge status={o.paymentStatus} /></td>
                <td><StatusBadge status={o.fulfilmentStatus} /></td>
                <td className="text-right px-5 font-medium">{formatMoney(orderTotal(o))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty />}
      </div>

      {/* Mobile cards */}
      <ul className="mt-4 md:hidden grid gap-2">
        {rows.map(({ o, c }) => (
          <li key={o.id}>
            <Link to="/admin/orders/$orderNumber" params={{ orderNumber: o.orderNumber }} className="block rounded-xl border border-line bg-card p-4 active:bg-paper-2">
              <div className="flex justify-between items-center">
                <span className="font-mono font-medium">{o.orderNumber}</span>
                <StatusBadge status={o.fulfilmentStatus} />
              </div>
              <p className="mt-2 text-sm">{c.name} · <span className="text-ink-3">{fmtDate(o.createdAt)}</span></p>
              <p className="text-xs text-ink-3 truncate mt-0.5">{o.items.map((i) => `${i.productName} ×${i.quantity}`).join(', ')}</p>
              <div className="mt-3 flex justify-between items-center">
                <PaymentBadge status={o.paymentStatus} />
                <span className="font-medium">{formatMoney(orderTotal(o))}</span>
              </div>
            </Link>
          </li>
        ))}
        {!rows.length && <Empty />}
      </ul>
    </div>
  )
}

function Empty() {
  return <p className="py-16 text-center text-ink-3 text-sm">No orders match these filters.</p>
}
