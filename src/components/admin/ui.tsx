import type { FulfilmentStatus, IntegrationState, PaymentStatus } from '@/data/fixtures'

const fulfilmentTone: Record<FulfilmentStatus, string> = {
  NEW: 'bg-ink text-paper',
  PACKING: 'bg-amber-soft text-amber',
  PACKED: 'bg-verdigris-soft text-verdigris',
  SHIPPED: 'bg-verdigris text-paper',
  COMPLETED: 'bg-paper-2 text-ink-2',
  CANCELLED: 'bg-oxblood-soft text-oxblood',
  REFUNDED: 'bg-oxblood-soft text-oxblood',
}

const paymentTone: Record<PaymentStatus, string> = {
  PAID: 'text-verdigris',
  PENDING: 'text-amber',
  FAILED: 'text-oxblood',
  REFUNDED: 'text-oxblood',
  PARTIALLY_REFUNDED: 'text-amber',
}

export function StatusBadge({ status }: { status: FulfilmentStatus }) {
  return <span className={`label inline-flex rounded-full px-2.5 py-1 whitespace-nowrap ${fulfilmentTone[status]}`}>{status}</span>
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className={`label inline-flex items-center gap-1.5 whitespace-nowrap ${paymentTone[status]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status.replace('_', ' ')}
    </span>
  )
}

export function IntegrationDot({ status }: { status: IntegrationState }) {
  const tone = { SENT: 'bg-verdigris', FAILED: 'bg-oxblood', PENDING: 'bg-ink-3', RETRYING: 'bg-amber' }[status]
  return <span className={`inline-block w-2 h-2 rounded-full ${tone}`} title={status} />
}

export const fmtDate = (iso: string, withTime = true) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : { year: 'numeric' }),
    timeZone: 'Europe/London',
  }).format(new Date(iso))

export function Panel({ title, action, children, className = '' }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-card ${className}`}>
      {title && (
        <header className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="label text-ink-3">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
