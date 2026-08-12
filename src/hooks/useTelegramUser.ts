import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '../types/database'

let cachedUser: User | null = null

export function useTelegramUser() {
  const [user, setUser] = useState<User | null>(cachedUser)
  const [loading, setLoading] = useState<boolean>(!cachedUser)
  const [error, setError] = useState<string | null>(null)

  async function loginWithId(telegramId: string) {
    setLoading(true)
    setError(null)
    try {
      localStorage.setItem('rentflow_tg_id', telegramId)
    } catch {
      // ignore
    }
    try {
      const { data, error: dbError } = await supabase
        .from('users')
        .select('*')
        .or(`telegram_id.eq."${telegramId}",phone.eq."${telegramId}"`)
        .maybeSingle()
      if (dbError) setError('Ошибка базы: ' + dbError.message)
      else if (!data) setError('Пользователь с таким ID или телефоном не найден.')
      else {
        cachedUser = data as User
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
    } catch {
      // ignore
    }
    cachedUser = null
    setUser(null)
    setError(null)
    setLoading(false)
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
    if (!autoId) {
      try {
        autoId = localStorage.getItem('rentflow_tg_id') || undefined
      } catch {
        // ignore
      }
    }
    if (autoId) loginWithId(autoId)
    else {
      setError('Telegram не передал ID автоматически. Введите его вручную ниже.')
      setLoading(false)
    }
  }, [])

  return { user, loading, error, loginWithId, logout }
}
