import { supabase } from './supabase'

export const APP_BUILD = '2026-08-28a'

let currentUser: any = null
let lastSig = ''
let lastTs = 0

export function setErrorUser(u: any) { currentUser = u }

async function send(message: string, stack: string, screen?: string) {
  const sig = message.slice(0, 80)
  const now = Date.now()
  if (sig === lastSig && now - lastTs < 60000) return
  lastSig = sig
  lastTs = now

  const tg = (window as any)?.Telegram?.WebApp
  const body = {
    build: APP_BUILD,
    ts: new Date().toISOString(),
    message,
    stack,
    screen: screen || (window as any).__roomioScreen || '',
    url: location.href,
    ua: navigator.userAgent,
    tg: { id: tg?.initDataUnsafe?.user?.id || '', ver: tg?.version || '', platform: tg?.platform || '' },
    user: currentUser
      ? { id: currentUser.id, name: currentUser.full_name, phone: currentUser.phone, role: currentUser.role }
      : null,
  }

  try {
    await supabase.from('analytics_events').insert({
      event: 'error',
      user_id: currentUser?.id || null,
      user_name: currentUser?.full_name || null,
      phone: currentUser?.phone || null,
      role: currentUser?.role || null,
      screen: body.screen,
      meta: body,
    })
  } catch {}

  try {
    await fetch('/api/alert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {}
}

export function reportError(err: any, screen?: string) {
  send(err?.message || String(err), err?.stack || '', screen)
}

export function initErrorReporting() {
  window.addEventListener('error', (e) => send(e.message, e.error?.stack || ''))
  window.addEventListener('unhandledrejection', (e) =>
    send('Unhandled rejection: ' + (e.reason?.message || String(e.reason)), e.reason?.stack || '')
  )
  ;(window as any).__roomioTestError = () => send('Тестовая тревога (проверка оповещений)', '')
}
