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

// Очередь: события копятся и уходят пачкой раз в 5 секунд —
// в 5–10 раз меньше запросов к базе, чем раньше.
let queue: any[] = []
let timer: ReturnType<typeof setTimeout> | null = null

function flush() {
  if (!queue.length) return
  const rows = queue
  queue = []
  supabase.from('analytics_events').insert(rows).then(() => {}).catch(() => {})
}

function send(event: string, screen: string | null, meta: any) {
  try {
    queue.push({
      user_id: uid,
      user_name: uname,
      phone: uphone,
      role: urole,
      event,
      screen,
      meta: { ...meta, ...deviceInfo() },
    })
    if (queue.length >= 20) { flush(); return }
    if (!timer) timer = setTimeout(() => { timer = null; flush() }, 5000)
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
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
  window.addEventListener('pagehide', flush)
  window.addEventListener('error', (e) => trackError(String(e.message)))
  window.addEventListener('unhandledrejection', (e: any) => trackError(String(e?.reason?.message || e?.reason || 'unhandledrejection')))
}
