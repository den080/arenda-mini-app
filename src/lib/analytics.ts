import { supabase } from './supabase'

let uid: string | null = null
let uname: string | null = null
let uphone: string | null = null
let urole: string | null = null

export function setAnalyticsUser(u: any) {
  uid = u?.id || null
  uname = u?.full_name || null
  uphone = u?.phone || null
  urole = u?.role || null
}

function deviceInfo() {
  const tg = (window as any).Telegram?.WebApp
  return {
    platform: tg?.platform || 'web',
    tg_version: tg?.version || null,
    ua: navigator.userAgent,
    lang: navigator.language,
  }
}

function send(event: string, screen: string | null, meta: any) {
  try {
    supabase.from('analytics_events').insert({
      user_id: uid,
      user_name: uname,
      phone: uphone,
      role: urole,
      event,
      screen,
      meta: { ...meta, ...deviceInfo() },
    }).then(() => {}).catch(() => {})
  } catch {
    // аналитика не должна ломать приложение
  }
}

let currentScreen: string | null = null
let screenStart = 0

export function trackScreen(screen: string) {
  if (currentScreen && currentScreen !== screen) {
    const sec = Math.round((Date.now() - screenStart) / 1000)
    if (sec > 0) send('screen', currentScreen, { duration_sec: sec })
  }
  if (currentScreen !== screen) {
    currentScreen = screen
    screenStart = Date.now()
  }
}

export function trackOpen(role: string) {
  send('open', null, { role })
}

export function trackError(message: string) {
  send('error', currentScreen, { message })
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => trackError(String(e.message)))
  window.addEventListener('unhandledrejection', (e: any) => trackError(String(e?.reason?.message || e?.reason || 'unhandledrejection')))
}
