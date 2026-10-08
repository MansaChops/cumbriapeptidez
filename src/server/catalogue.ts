import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { checkBasket, getProductBySlug, listCatalogue } from '../../netlify/lib/catalogue'

// Storefront reads. These run only on the server (TanStack Start replaces them with RPC calls in
// the browser bundle), so database access never reaches the client.

export const getCatalogue = createServerFn({ method: 'GET' }).handler(() => listCatalogue())

export const getProduct = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().max(200) }))
  .handler(async ({ data }) => {
    const product = await getProductBySlug(data.slug)
    if (!product) throw notFound()
    return product
  })

/** Current prices and stock for a basket, plus anything that can no longer be bought as requested. */
export const validateBasket = createServerFn({ method: 'POST' })
  .validator(z.object({ items: z.array(z.object({ variantId: z.string().max(100), quantity: z.number().int().min(1).max(1000) })).max(50) }))
  .handler(({ data }) => checkBasket(data.items))
