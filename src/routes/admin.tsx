import { Link, Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { logout } from '@netlify/identity'
import {
  BarChart3,
  Boxes,
  ClipboardList,
  Database,
  LayoutGrid,
  LogOut,
  Package,
  Plug,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react'
import { img, site } from '@/config/site'
import { useOrders } from '@/lib/demo-orders'
import { getAdminSession, type AdminSession } from '@/server/admin'

export const Route = createFileRoute('/admin')({
  // Every /admin page requires a Netlify Identity user with an admin role, checked on the server.
  // The admin API functions check again independently, so this is not the only guard.
  beforeLoad: async ({ location }): Promise<{ admin: AdminSession }> => {
    const admin = await getAdminSession()
    if (!admin) throw redirect({ to: '/admin/login', search: { next: location.pathname } })
    if (location.pathname === '/admin' || location.pathname === '/admin/') throw redirect({ to: '/admin/dashboard' })
    return { admin }
  },
  head: () => ({ meta: [{ title: `Admin — ${site.name}` }, { name: 'robots', content: 'noindex, nofollow' }] }),
  component: AdminLayout,
})

const live = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/data', label: 'Demo data', icon: Database },
] as const

const upcoming = [
  { label: 'Inventory', icon: Boxes },
  { label: 'Customers', icon: Users },
  { label: 'Analytics', icon: BarChart3 },
  { label: 'Integrations', icon: Plug },
  { label: 'Logs', icon: ScrollText },
  { label: 'Settings', icon: Settings },
]

const signOut = async () => {
  await logout().catch(() => {})
  window.location.href = '/admin/login'
}

function AdminLayout() {
  const { admin } = Route.useRouteContext()
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
          <p className="font-medium truncate" title={admin.email}>{admin.email}</p>
          <p className="text-ink-3 capitalize">{admin.role.toLowerCase()}</p>
          <button onClick={signOut} className="mt-2 inline-flex items-center gap-1.5 text-ink-2 hover:text-ink"><LogOut size={13} /> Sign out</button>
        </div>
      </aside>

      <div className="min-w-0 pb-20 md:pb-0">
        <div className="no-print bg-amber-soft text-ink-2 text-xs px-5 py-2 flex flex-wrap gap-x-2">
          <strong className="font-medium text-ink">Sample screens.</strong>
          Dashboard and Orders still show fictional sample orders until the orders milestone. Products and Demo data read the live database.
        </div>
        <div className="no-print md:hidden flex items-center justify-between gap-3 border-b border-line px-4 py-2 text-xs">
          <span className="truncate text-ink-2">{admin.email} · <span className="capitalize">{admin.role.toLowerCase()}</span></span>
          <button onClick={signOut} className="inline-flex items-center gap-1.5 text-ink-2"><LogOut size={13} /> Sign out</button>
        </div>
        <Outlet />
      </div>

      {/* Mobile bottom tabs */}
      <nav className="no-print md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-paper/95 backdrop-blur grid grid-cols-5 text-[11px]">
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
