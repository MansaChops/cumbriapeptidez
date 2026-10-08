import { Link, Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutGrid,
  Package,
  Plug,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react'
import { img, site } from '@/config/site'
import { useOrders } from '@/lib/demo-orders'

export const Route = createFileRoute('/admin')({
  beforeLoad: ({ location }) => {
    if (location.pathname === '/admin' || location.pathname === '/admin/') throw redirect({ to: '/admin/dashboard' })
  },
  head: () => ({ meta: [{ title: `Admin — ${site.name}` }, { name: 'robots', content: 'noindex, nofollow' }] }),
  component: AdminLayout,
})

const live = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
] as const

const upcoming = [
  { label: 'Products', icon: Package },
  { label: 'Inventory', icon: Boxes },
  { label: 'Customers', icon: Users },
  { label: 'Analytics', icon: BarChart3 },
  { label: 'Integrations', icon: Plug },
  { label: 'Logs', icon: ScrollText },
  { label: 'Settings', icon: Settings },
]

function AdminLayout() {
  const orders = useOrders()
  const toPack = orders.filter((o) => o.fulfilmentStatus === 'NEW' || o.fulfilmentStatus === 'PACKING').length

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr] bg-paper">
      <aside className="no-print hidden md:flex flex-col border-r border-line bg-paper-2/60 px-4 py-5 sticky top-0 h-screen">
        <Link to="/" className="flex items-center gap-2.5 px-2">
          <img src={img(site.logoMark, 80, 80)} alt="" width={36} height={36} className="size-9 rounded-lg" />
          <span className="grid leading-tight">
            <span className="font-display text-lg">{site.name}</span>
            <span className="label text-ink-3">Admin</span>
          </span>
        </Link>
        <nav className="mt-8 grid gap-0.5 text-sm">
          {live.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-ink-2 hover:bg-card hover:text-ink"
              activeProps={{ className: '!bg-card !text-ink shadow-[0_1px_0_var(--color-line)]' }}
            >
              <Icon size={17} />
              {label}
              {to === '/admin/orders' && toPack > 0 && (
                <span className="ml-auto rounded-full bg-verdigris px-1.5 font-mono text-[10px] text-paper">{toPack}</span>
              )}
            </Link>
          ))}
          <p className="label text-ink-3 px-2.5 mt-6 mb-2">Coming next</p>
          {upcoming.map(({ label, icon: Icon }) => (
            <span key={label} className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-ink-3/80 cursor-default" title="Planned in the roadmap">
              <Icon size={17} />
              {label}
            </span>
          ))}
        </nav>
        <div className="mt-auto rounded-xl border border-line bg-card p-3 text-xs">
          <p className="font-medium">Owner</p>
          <p className="text-ink-3">Demo session</p>
        </div>
      </aside>

      <div className="min-w-0 pb-20 md:pb-0">
        <div className="no-print bg-amber-soft text-ink-2 text-xs px-5 py-2 flex flex-wrap gap-x-2">
          <strong className="font-medium text-ink">Demo data.</strong>
          Orders and customers below are fictional. Sign-in, roles and live data connect in the next milestones.
        </div>
        <Outlet />
      </div>

      {/* Mobile bottom tabs */}
      <nav className="no-print md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-paper/95 backdrop-blur grid grid-cols-3 text-[11px]">
        {live.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="flex flex-col items-center gap-1 py-2.5 text-ink-3" activeProps={{ className: '!text-ink' }}>
            <Icon size={20} />
            {label}
          </Link>
        ))}
        <Link to="/" className="flex flex-col items-center gap-1 py-2.5 text-ink-3">
          <img src={img(site.logoMark, 48, 48)} alt="" width={20} height={20} className="size-5 rounded" />
          Storefront
        </Link>
      </nav>
    </div>
  )
}
