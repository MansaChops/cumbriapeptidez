import { useEffect, useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthError, acceptInvite, getUser, handleAuthCallback, login, logout, requestPasswordRecovery, updateUser } from '@netlify/identity'
import { Lock } from 'lucide-react'
import { img, site } from '@/config/site'
import { getAdminSession } from '@/server/admin'

type Search = { next?: string }

export const Route = createFileRoute('/admin_/login')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    // Only same-site admin paths, so the login page can't be used as an open redirect.
    next: typeof s.next === 'string' && /^\/admin(\/[\w\-./]*)?$/.test(s.next) && !s.next.startsWith('/admin/login') ? s.next : undefined,
  }),
  beforeLoad: async ({ search }): Promise<void> => {
    if (await getAdminSession()) throw redirect({ href: search.next ?? '/admin/dashboard' })
  },
  head: () => ({ meta: [{ title: `Admin sign in — ${site.name}` }, { name: 'robots', content: 'noindex, nofollow' }] }),
  component: Login,
})

type Mode = 'login' | 'forgot' | 'invite' | 'recovery'

const message = (err: unknown) => {
  if (err instanceof AuthError) {
    if (err.status === 401 || err.status === 400) return 'Incorrect email or password.'
    if (err.status === 422) return 'Check your email address and password (at least 8 characters).'
    return err.message
  }
  return 'Sign-in is unavailable right now. Please try again.'
}

function Login() {
  const { next } = Route.useSearch()
  const [mode, setMode] = useState<Mode>('login')
  const [inviteToken, setInviteToken] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Identity emails (invites, password resets) link back with a token in the URL hash.
  useEffect(() => {
    handleAuthCallback()
      .then((result) => {
        if (result?.type === 'invite' && result.token) {
          setInviteToken(result.token)
          setMode('invite')
        } else if (result?.type === 'recovery') setMode('recovery')
        else if (result) window.location.href = next ?? '/admin/dashboard'
      })
      .catch((e) => setError(message(e)))
    // Signed in to Identity but without an admin role.
    getUser().then((u) => u && !location.hash && setNotice(`${u.email} is signed in but doesn’t have admin access. Ask the owner to add a role.`))
  }, [])

  const enter = () => {
    // Full navigation so the server sees the new session cookie.
    window.location.href = next ?? '/admin/dashboard'
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
        enter()
      } else if (mode === 'invite') {
        await acceptInvite(inviteToken, password)
        enter()
      } else if (mode === 'recovery') {
        await updateUser({ password })
        enter()
      } else {
        await requestPasswordRecovery(email.trim())
        setNotice('If that address has an account, a reset link is on its way.')
        setMode('login')
      }
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  const title = { login: 'Sign in', forgot: 'Reset password', invite: 'Set your password', recovery: 'Choose a new password' }[mode]

  return (
    <main className="min-h-screen grid place-items-center px-5 py-16">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-card p-7 rise">
        <img src={img(site.logoMark, 96, 96)} alt="" width={44} height={44} className="size-11 rounded-lg" />
        <p className="label text-ink-3 mt-6">{site.name} admin</p>
        <h1 className="font-display text-4xl mt-1">{title}</h1>

        {notice && <p className="mt-5 rounded-xl bg-amber-soft px-4 py-3 text-sm text-ink-2">{notice}</p>}

        <div className="mt-6 grid gap-4">
          {(mode === 'login' || mode === 'forgot') && (
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">Email</span>
              <input className="field" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          )}
          {mode !== 'forgot' && (
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">{mode === 'login' ? 'Password' : 'New password'}</span>
              <input
                className="field"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'login' ? undefined : 8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
        </div>

        {error && <p role="alert" className="mt-5 rounded-xl bg-oxblood-soft px-4 py-3 text-sm text-oxblood">{error}</p>}

        <button className="btn btn-primary w-full mt-6" disabled={busy} aria-busy={busy}>
          <Lock size={15} /> {busy ? 'Please wait…' : mode === 'forgot' ? 'Send reset link' : mode === 'login' ? 'Sign in' : 'Save and continue'}
        </button>

        <div className="mt-5 flex justify-between text-sm text-ink-2">
          {mode === 'login' ? (
            <button type="button" onClick={() => setMode('forgot')} className="hover:text-ink">Forgot password?</button>
          ) : (
            <button type="button" onClick={() => setMode('login')} className="hover:text-ink">Back to sign in</button>
          )}
          {notice && mode === 'login' && (
            <button type="button" onClick={() => logout().then(() => setNotice(''))} className="hover:text-ink">Sign out</button>
          )}
        </div>
      </form>
    </main>
  )
}
