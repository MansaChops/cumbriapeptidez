import { useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Lock, Pencil } from 'lucide-react'
import { formatMoney, img, site } from '@/config/site'
import { cart, useCart } from '@/lib/cart'
import { orderFormFields, submitOrderForm } from '@/lib/order-form'
import type { PlacedOrder } from '@/lib/order-form'
import { Summary } from '@/components/store/Summary'
import { PreOrderNotice, PreOrderTag } from '@/components/store/PreOrderNotice'

export const Route = createFileRoute('/_store/checkout')({
  head: () => ({ meta: [{ title: `Checkout — ${site.name}` }, { name: 'robots', content: 'noindex' }] }),
  component: Checkout,
})

const fields = [
  { name: 'name', label: 'Full name', autoComplete: 'name', span: 2 },
  { name: 'email', label: 'Email', autoComplete: 'email', type: 'email' },
  { name: 'phone', label: 'Phone number', autoComplete: 'tel', type: 'tel' },
  { name: 'address', label: 'Address', autoComplete: 'street-address', span: 2 },
  { name: 'city', label: 'Town / city', autoComplete: 'address-level2' },
  { name: 'postcode', label: 'Postcode', autoComplete: 'postal-code' },
] as const

type Details = Record<(typeof fields)[number]['name'] | 'country' | 'notes', string>
const empty: Details = { name: '', email: '', phone: '', address: '', city: '', postcode: '', country: 'United Kingdom', notes: '' }

const validate = (d: Details) => {
  const e: Partial<Record<keyof Details, string>> = {}
  if (d.name.trim().length < 2) e.name = 'Enter your full name'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = 'Enter a valid email address'
  if (d.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a valid phone number'
  if (d.address.trim().length < 4) e.address = 'Enter your street address'
  if (d.city.trim().length < 2) e.city = 'Enter your town or city'
  if (!/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i.test(d.postcode.trim())) e.postcode = 'Enter a valid UK postcode'
  return e
}

export const CHECKOUT_KEY = 'cumbria.lastCheckout'
const PENDING_KEY = 'cumbria.pendingCheckout'

type Basket = ReturnType<typeof useCart>

const validateBasket = ({ items, subtotal, shipping, total }: Basket) => {
  if (!items.length) return 'Your basket is empty.'
  const bad = items.find((i) => !Number.isInteger(i.quantity) || i.quantity < 1 || !(i.price > 0) || !Number.isFinite(i.lineTotal))
  if (bad) return `Please check the quantity of ${bad.product.name} in your basket.`
  if (![subtotal, shipping, total].every(Number.isFinite) || Math.abs(subtotal + shipping - total) > 0.005) return 'Your basket total could not be calculated. Please refresh and try again.'
  return ''
}

// One checkout ID per (details, basket). Retrying the same order reuses it, so the server returns
// the order it already saved instead of creating a duplicate. Changing anything starts a new one.
const checkoutIdFor = (d: Details, items: Basket['items']) => {
  const fingerprint = JSON.stringify([d, items.map((i) => [i.variantId, i.quantity])])
  try {
    const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null')
    if (saved?.fingerprint === fingerprint) return saved.id as string
  } catch {}
  const id = crypto.randomUUID()
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ fingerprint, id }))
  return id
}

function Checkout() {
  const basket = useCart()
  const { items, subtotal, shipping, total } = basket
  const navigate = useNavigate()
  const [step, setStep] = useState<'details' | 'review'>('details')
  const [d, setD] = useState<Details>(empty)
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({})
  const [confirmed, setConfirmed] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [placeError, setPlaceError] = useState('')
  // Blocks a second submission before React has re-rendered the disabled button.
  const submitting = useRef(false)

  if (!items.length) {
    return (
      <div className="mx-auto max-w-xl px-5 py-28 text-center">
        <h1 className="font-display text-5xl">Nothing to check out</h1>
        <p className="text-ink-2 mt-3">Your basket is empty.</p>
        <Link to="/shop" className="btn btn-primary mt-8">Shop products</Link>
      </div>
    )
  }

  const next = (e: React.FormEvent) => {
    e.preventDefault()
    const v = validate(d)
    setErrors(v)
    if (!Object.keys(v).length) {
      setStep('review')
      window.scrollTo({ top: 0 })
    }
  }

  // 1. /api/orders re-prices the basket, saves the order, assigns its number and notifies Slack.
  // 2. The saved order is submitted to Netlify Forms (customer-order), which emails the owner.
  // Only when both succeed is the basket cleared and the confirmation shown. Stripe payment slots
  // in here in the payments milestone.
  const placeOrder = async () => {
    if (submitting.current) return
    const v = validate(d)
    if (Object.keys(v).length) {
      setErrors(v)
      setStep('details')
      return
    }
    const basketError = validateBasket(basket)
    if (basketError) return setPlaceError(basketError)

    submitting.current = true
    setPlacing(true)
    setPlaceError('')
    const checkoutId = checkoutIdFor(d, items)
    let stage = 'saving the order'
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutId, details: d, items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.orderNumber) {
        throw Object.assign(new Error(data.error ?? 'We couldn’t place your order. Please try again.'), { status: res.status, body: data, customerMessage: !!data.error })
      }
      const order = data as PlacedOrder
      if (Math.abs(order.total - total) > 0.005) console.warn('[checkout] Server total differs from basket total', { basket: total, server: order.total })

      stage = 'sending the order to Netlify Forms'
      await submitOrderForm(orderFormFields(order, d))

      const preOrder = new Set(items.filter((i) => i.product.preOrder).map((i) => i.variantId))
      sessionStorage.setItem(
        CHECKOUT_KEY,
        JSON.stringify({
          orderNumber: order.orderNumber,
          createdAt: order.createdAt,
          details: d,
          items: order.items.map((i) => ({ name: i.name, variant: i.variant, quantity: i.quantity, total: i.lineTotal, preOrder: preOrder.has(i.variantId) })),
          subtotal: order.subtotal,
          shipping: order.shipping,
          total: order.total,
        }),
      )
      sessionStorage.removeItem(PENDING_KEY)
      await navigate({ to: '/order-confirmed' })
      cart.clear()
    } catch (err) {
      console.error(`[checkout] Order submission failed while ${stage}`, {
        checkoutId,
        error: err,
        status: (err as { status?: number }).status,
        response: (err as { body?: unknown }).body,
      })
      setPlaceError(
        err instanceof Error && (err as { customerMessage?: boolean }).customerMessage
          ? err.message
          : 'We couldn’t submit your order, so it has not been confirmed. Your basket and details are saved. Please try again, or contact us if it keeps happening.',
      )
      submitting.current = false
      setPlacing(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-5 pt-10">
      <ol className="flex items-center gap-3 label text-ink-3">
        <li className="text-ink">Basket</li><li>—</li>
        <li className={step === 'details' ? 'text-verdigris' : 'text-ink'}>Details</li><li>—</li>
        <li className={step === 'review' ? 'text-verdigris' : ''}>Confirm</li><li>—</li>
        <li>Payment</li>
      </ol>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_400px]">
        {step === 'details' ? (
          <form onSubmit={next} noValidate className="rise">
            <h1 className="font-display text-5xl">Delivery details</h1>
            <p className="text-ink-2 mt-2">We use these only to deliver and support your order.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {fields.map((f) => (
                <label key={f.name} className={`grid gap-1.5 ${'span' in f ? 'sm:col-span-2' : ''}`}>
                  <span className="text-sm font-medium">{f.label}</span>
                  <input
                    className="field"
                    type={'type' in f ? f.type : 'text'}
                    autoComplete={f.autoComplete}
                    value={d[f.name]}
                    aria-invalid={!!errors[f.name]}
                    onChange={(e) => setD({ ...d, [f.name]: e.target.value })}
                  />
                  {errors[f.name] && <span className="text-xs text-oxblood">{errors[f.name]}</span>}
                </label>
              ))}
              <label className="grid gap-1.5 sm:col-span-2">
                <span className="text-sm font-medium">Country</span>
                <select className="field" value={d.country} onChange={(e) => setD({ ...d, country: e.target.value })}>
                  <option>United Kingdom</option>
                </select>
              </label>
              <label className="grid gap-1.5 sm:col-span-2">
                <span className="text-sm font-medium">Order notes <span className="text-ink-3 font-normal">(optional)</span></span>
                <textarea className="field min-h-24" maxLength={500} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Delivery instructions, safe place…" />
              </label>
            </div>
            <div className="mt-8 flex items-center justify-between">
              <Link to="/cart" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"><ArrowLeft size={15} /> Back to basket</Link>
              <button className="btn btn-primary">Review order</button>
            </div>
          </form>
        ) : (
          <div className="rise">
            <h1 className="font-display text-5xl">Confirm your order</h1>
            <p className="text-ink-2 mt-2">Check everything below before you pay.</p>

            <section className="mt-8 rounded-2xl border border-line bg-card p-6">
              <div className="flex justify-between items-start">
                <h2 className="label text-ink-3">Deliver to</h2>
                <button onClick={() => setStep('details')} disabled={placing} className="inline-flex items-center gap-1 text-sm text-verdigris"><Pencil size={13} /> Edit</button>
              </div>
              <address className="not-italic mt-3 leading-relaxed">
                <strong className="font-medium">{d.name}</strong><br />
                {d.address}<br />{d.city} {d.postcode.toUpperCase()}<br />{d.country}
              </address>
              <p className="mt-3 text-sm text-ink-2">{d.email} · {d.phone}</p>
              {d.notes && <p className="mt-3 text-sm border-t border-line pt-3"><span className="text-ink-3">Notes:</span> {d.notes}</p>}
            </section>

            <section className="mt-4 rounded-2xl border border-line bg-card p-6">
              <h2 className="label text-ink-3 mb-3">Items</h2>
              <table className="w-full text-sm">
                <thead className="text-ink-3 text-left"><tr><th className="font-normal pb-2">Product</th><th className="font-normal pb-2 text-center">Qty</th><th className="font-normal pb-2 text-right">Price</th><th className="font-normal pb-2 text-right">Total</th></tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.variantId} className="border-t border-line">
                      <td className="py-2.5">{i.product.name} <span className="text-ink-3">{i.variant.name}</span></td>
                      <td className="text-center font-mono">{i.quantity}</td>
                      <td className="text-right">{formatMoney(i.price)}</td>
                      <td className="text-right">{formatMoney(i.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <label className="mt-6 flex gap-3 text-sm cursor-pointer">
              <input type="checkbox" className="accent-verdigris mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>
                I confirm my details are correct, I am 18 or over, and I accept the{' '}
                <Link to="/terms" className="underline">terms</Link>, <Link to="/refunds" className="underline">refund policy</Link> and{' '}
                <Link to="/disclaimer" className="underline">product disclaimer</Link>.
              </span>
            </label>
            {placeError && <p role="alert" className="mt-6 rounded-xl bg-oxblood-soft px-4 py-3 text-sm text-oxblood">{placeError}</p>}
            <button className="btn btn-primary w-full mt-6 !py-4" disabled={!confirmed || placing} aria-busy={placing} onClick={placeOrder}>
              <Lock size={16} /> {placing ? 'Submitting order…' : `Confirm order · ${formatMoney(total)}`}
            </button>
            <p className="text-xs text-ink-3 text-center mt-3">No card details are taken on this page. We’ll confirm payment with you separately.</p>
          </div>
        )}

        <aside className="rounded-2xl border border-line bg-card p-6 self-start lg:sticky lg:top-24">
          <h2 className="font-display text-3xl mb-5">Your order</h2>
          <ul className="grid gap-4 mb-6">
            {items.map((i) => (
              <li key={i.variantId} className="flex gap-3 items-center">
                <span className="relative">
                  <img src={img(i.product.image, 120, 120)} alt="" className="w-14 h-14 rounded-lg object-cover" />
                  <span className="absolute -top-1.5 -right-1.5 bg-ink text-paper rounded-full text-[10px] font-mono w-5 h-5 grid place-items-center">{i.quantity}</span>
                </span>
                <span className="flex-1 text-sm">{i.product.name}<br /><span className="text-ink-3">{i.variant.name}</span>{i.product.preOrder && <PreOrderTag />}</span>
                <span className="text-sm">{formatMoney(i.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <Summary subtotal={subtotal} shipping={shipping} total={total} />
          <PreOrderNotice names={items.filter((i) => i.product.preOrder).map((i) => i.product.name)} className="mt-5" />
        </aside>
      </div>
    </div>
  )
}
