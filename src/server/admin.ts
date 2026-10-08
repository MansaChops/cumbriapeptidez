import { createServerFn } from '@tanstack/react-start'
import { currentAdmin } from '../../netlify/lib/auth'

export type AdminSession = { email: string; role: 'OWNER' | 'ADMIN' | 'PACKER' | 'VIEWER' }

/** The signed-in admin (validated server-side with Netlify Identity), or null. */
export const getAdminSession = createServerFn({ method: 'GET' }).handler(async (): Promise<AdminSession | null> => {
  const admin = await currentAdmin()
  return admin ? { email: admin.email, role: admin.role } : null
})
