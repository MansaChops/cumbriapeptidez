import { formatMoney } from '@/config/site'

export function Summary({ subtotal, shipping, total }: { subtotal: number; shipping: number; total: number }) {
  return (
    <dl className="grid gap-3 text-sm">
      <div className="flex justify-between"><dt className="text-ink-2">Subtotal</dt><dd>{formatMoney(subtotal)}</dd></div>
      <div className="flex justify-between">
        <dt className="text-ink-2">Delivery <span className="text-ink-3">(UK tracked)</span></dt>
        <dd>{shipping === 0 ? 'Free' : formatMoney(shipping)}</dd>
      </div>
      <div className="flex justify-between border-t border-line pt-3 text-base font-medium">
        <dt>Total</dt><dd>{formatMoney(total)}</dd>
      </div>
    </dl>
  )
}
