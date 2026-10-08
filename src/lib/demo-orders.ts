import { useSyncExternalStore } from 'react'
import { orders as seed, type FulfilmentStatus, type NotificationRecord, type Order } from '@/data/fixtures'

/**
 * DEMO ONLY — holds order edits in browser memory so the packing workflow can be
 * clicked through end to end. Replaced by server functions + Netlify Database (with
 * audit log and inventory movements) in the orders milestone.
 */
let state: Array<Order> = seed
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const useOrders = () => useSyncExternalStore(subscribe, () => state, () => seed)

const now = () => new Date().toISOString()

const patch = (orderNumber: string, fn: (o: Order) => Partial<Order>) => {
  state = state.map((o) => (o.orderNumber === orderNumber ? { ...o, ...fn(o), updatedAt: now() } : o))
  emit()
}

export const orderActions = {
  setStatus(orderNumber: string, to: FulfilmentStatus, extra: Partial<Order> = {}) {
    patch(orderNumber, (o) => ({
      ...extra,
      fulfilmentStatus: to,
      timeline: [...o.timeline, { at: now(), label: `Status ${o.fulfilmentStatus} → ${to}${extra.trackingNumber ? ' · tracking added' : ''}`, actor: 'Owner' }],
      notifications: [
        ...o.notifications,
        { type: 'SLACK_STATUS', provider: 'Slack', status: 'SENT', at: now(), attempts: 1 },
        ...(to === 'SHIPPED' ? [{ type: 'EMAIL_SHIPPED', provider: 'Email', status: 'SENT', at: now(), attempts: 1 } as NotificationRecord] : []),
      ],
    }))
  },
  addNote(orderNumber: string, note: string) {
    patch(orderNumber, (o) => ({
      adminNotes: [o.adminNotes, note].filter(Boolean).join('\n'),
      timeline: [...o.timeline, { at: now(), label: 'Admin note added', actor: 'Owner' }],
    }))
  },
  retry(orderNumber: string, type: NotificationRecord['type']) {
    patch(orderNumber, (o) => ({
      notifications: o.notifications.map((n) => (n.type === type ? { ...n, status: 'SENT', error: undefined, at: now(), attempts: n.attempts + 1 } : n)),
      timeline: [...o.timeline, { at: now(), label: `Manual retry: ${type.replace(/_/g, ' ').toLowerCase()} succeeded`, actor: 'Owner' }],
    }))
  },
}
