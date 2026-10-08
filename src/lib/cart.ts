import { useSyncExternalStore } from 'react'
import { clampQty, findVariant, unitPrice } from '@/data/fixtures'
import { site } from '@/config/site'

/**
 * Persistent basket. Only variant IDs and quantities are stored in the browser —
 * names, prices and stock are always re-derived from the catalogue (and, once the
 * backend lands, re-validated server-side at checkout).
 */
export type CartLine = { variantId: string; quantity: number }

const KEY = 'cumbria.cart.v1'
const listeners = new Set<() => void>()
let lines: Array<CartLine> = []
let loaded = false

const load = () => {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    lines = JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    lines = []
  }
}

const commit = (next: Array<CartLine>) => {
  lines = next
    .map((l) => {
      const found = findVariant(l.variantId)
      return { ...l, quantity: found ? clampQty(found.variant, l.quantity) : 0 }
    })
    .filter((l) => l.quantity > 0)
  localStorage.setItem(KEY, JSON.stringify(lines))
  listeners.forEach((fn) => fn())
}

const EMPTY: Array<CartLine> = []
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const snapshot = () => {
  load()
  return lines
}

export const cart = {
  add(variantId: string, quantity = 1) {
    load()
    const existing = lines.find((l) => l.variantId === variantId)
    commit(
      existing
        ? lines.map((l) => (l.variantId === variantId ? { ...l, quantity: l.quantity + quantity } : l))
        : [...lines, { variantId, quantity }],
    )
  },
  set(variantId: string, quantity: number) {
    load()
    commit(lines.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)))
  },
  remove(variantId: string) {
    load()
    commit(lines.filter((l) => l.variantId !== variantId))
  },
  clear() {
    commit([])
  },
}

export function useCart() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => EMPTY)
  const items = raw.flatMap((line) => {
    const found = findVariant(line.variantId)
    if (!found) return []
    const price = unitPrice(found.variant)
    return [{ ...line, ...found, price, lineTotal: price * line.quantity }]
  })
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0)
  const shipping = subtotal === 0 || subtotal >= site.shipping.freeOver ? 0 : site.shipping.standard
  const count = items.reduce((s, i) => s + i.quantity, 0)
  return { items, subtotal, shipping, total: subtotal + shipping, count }
}
