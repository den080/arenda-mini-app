import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '../types/database'

const TEST_PHONES = ['+79057674225', '+77475885016', '+79651947084', '+79999110921', '+79063190766']
const TEST_IDS = ['28606967']

let cachedUser: User | null = null

function normalizePhone(input: string): string {
  let cleaned = input.replace(/[\s\-\(\)]/g, '')
  if (cleaned.startsWith('8') && cleaned.length === 11) {
    cleaned = '+7' + cleaned.slice(1)
  }
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned
  }
  return cleaned
}

function isTestCredential(v: string): boolean {
  if (TEST_IDS.includes(v.trim())) return true
  return TEST_PHONES.includes(normalizePhone(v))
}

function getRawInitData(): string | null {
  try {
    const w = window as any
    if (w?.Telegram?.WebApp?.initData) return w.Telegram.WebApp.initData
  } catch {}
  try {
    const s = new URLSearchParams(window.location.search)
    const d = s.get('tgWebAppData')
    if (d) return decodeURIComponent(d)
  } catch {}
  return null
}

export function useTelegramUser() {
  const [user, setUser] = useState<User | null>(cachedUser)
  const [loading, setLoading] = useState<boolean>(!cachedUser)
  const [error, setError] = useState<string | null>(null)

  async function loginWithId(input: string) {
    setLoading(true)
    setError(null)

    if (!isTestCredential(input)) {
      setError('Вход по номеру/ID доступен только тестовым пользователям. Откройте мини-приложение из Telegram.')
      setLoading(false)
      return
    }

    const isPhone = /\d/.test(input) && input.length >= 10
    const searchValue = isPhone ? normalizePhone(input) : input

    try {
      localStorage.setItem('rentflow_tg_id', input)
    } catch {
      // ignore
    }
    try {
      const { data, error: dbError } = await supabase
        .from('users')
        .select('*')
        .or(`telegram_id.eq."${searchValue}",phone.eq."${searchValue}"`)
        .limit(1)
      const found = data && data[0]
      if (dbError) setError('Ошибка базы: ' + dbError.message)
      else if (!found) setError('Пользователь с таким ID или телефоном не найден.')
      else {
        cachedUser = found as User
        setUser(cachedUser)
      }
    } catch (e) {
      setError('Ошибка подключения: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    try {
      localStorage.removeItem('rentflow_tg_id')
      localStorage.removeItem('rentflow_session')
    } catch {
      // ignore
    }
    cachedUser = null
    setUser(null)
    setError(null)
    setLoading(false)
    try {
      supabase.auth.signOut()
    } catch {
      // ignore
    }
  }

  async function tryEdgeAuth() {
    const initData = getRawInitData()
    if (!initData) return false
    try {
      const fnUrl = (import.meta as any).env?.VITE_SUPABASE_URL
        ? `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/verify-tg`
        : null
      if (!fnUrl) return false
      const r = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(import.meta as any).env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ initData }),
      })
      if (!r.ok) return false
      const j = await r.json()
      if (j?.session) {
        const { error: se } = await supabase.auth.setSession(j.session)
        if (se) return false
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser) return false
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('telegram_id', String(authUser.user_metadata?.telegram_id || authUser.id))
          .limit(1)
        if (profile && profile[0]) {
          cachedUser = profile[0] as User
          setUser(cachedUser)
          return true
        }
      }
    } catch {
      return false
    }
    return false
  }

  useEffect(() => {
    if (cachedUser) return
    let autoId: string | undefined
    try {
      const w = window as any
      autoId = w?.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString()
      if (!autoId) {
        const s = new URLSearchParams(window.location.search)
        const d = s.get('tgWebAppData')
        if (d) {
          const u = JSON.parse(new URLSearchParams(d).get('user') || 'null')
          if (u?.id) autoId = String(u.id)
        }
      }
    } catch {
      autoId = undefined
    }

    // Сначала пробуем Edge Function (этап 2)
    (async () => {
      const ok = await tryEdgeAuth()
      if (ok) { setLoading(false); return }
      // Фолбэк: тестовый ID из localStorage (этап 1)
      if (!autoId) {
        try { autoId = localStorage.getItem('rentflow_tg_id') || undefined } catch {}
      }
      if (autoId && isTestCredential(autoId)) {
        loginWithId(autoId)
      } else {
        setError('Telegram не передал ID автоматически. Для входа в режиме тестирования введите номер тестового пользователя ниже.')
        setLoading(false)
      }
    })()
  }, [])

  return { user, loading, error, loginWithId, logout }
}
