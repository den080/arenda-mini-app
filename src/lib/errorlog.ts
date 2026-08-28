import { supabase } from './supabase'

// Версия сборки — видна в тревогах, обновляйте при крупных коммитах
export const APP_BUILD = '2026-08-28b'

let currentUser: any = null
let lastSig = ''
let lastTs = 0

export function setErrorUser(u: any) { currentUser = u }

// НЕ репортуем ошибки чужих расширений и сторонних сервисов
function isForeign(message: string, stack: string): boolean {
  const s = `${message || ''} ${stack || ''}`.toLowerCase()
  return /chrome-extension:|moz-extension:|safari-extension:|metamask|user-script|userscript|facebook\.net|googletagmanager|google-analytics|cdn\.ampproject|yandex\.ru\/metrika|vk\.com\/(?!.*arenda)/.test(s)
}

async function send(message: string, stack: string, screen?: string) {
  if (isForeign(message, stack)) return // чужая ошибка — пропускаем
  const sig = message.slice(0, 80)
  const now = Date.now()
  if (sig === lastSig && now - lastTs < 60000) return // не спамим одинаковым
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

  // 1) в базу — для вкладки «Ошибки» в админке
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

  // 2) мгновенная тревога вам в Telegram
  try {
    await fetch('/api/alert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {}
}

// Для ручных сообщений из кода в важных местах
export function reportError(err: any, screen?: string) {
  send(err?.message || String(err), err?.stack || '', screen)
}

// Глобальные ловушки: краши и необработанные промисы
export function initErrorReporting() {
  window.addEventListener('error', (e) => send(e.message, e.error?.stack || ''))
  window.addEventListener('unhandledrejection', (e) =>
    send('Unhandled rejection: ' + (e.reason?.message || String(e.reason)), e.reason?.stack || '')
  )
  // тестовая тревога из консоли: window.__roomioTestError()
  ;(window as any).__roomioTestError = () => send('Тестовая тревога (проверка оповещений)', '')
}
