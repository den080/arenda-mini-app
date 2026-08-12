import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '../types/database'

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

export function useTelegramUser() {
  const [user, setUser] = useState<User | null>(cachedUser)
  const [loading, setLoading] = useState<boolean>(!cachedUser)
  const [error, setError] = useState<string | null>(null)

  async function loginWithId(input: string) {
    setLoading(true)
    setError(null)
    
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
