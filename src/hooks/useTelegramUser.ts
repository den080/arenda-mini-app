import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '../types/database'

export function useTelegramUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loginWithId(telegramId: string) {
    setLoading(true)
    setError(null)
    try {
      const { data, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .maybeSingle()
      if (dbError) setError('Ошибка базы: ' + dbError.message)
      else if (!data) setError('Пользователь с ID ' + telegramId + ' не найден в базе.')
      else setUser(data as User)
    } catch (e) {
      setError('Ошибка подключения: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
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
    if (autoId) loginWithId(autoId)
    else {
      setError('Telegram не передал ID автоматически. Введите его вручную ниже.')
      setLoading(false)
    }
  }, [])

  return { user, loading, error, loginWithId }
}
