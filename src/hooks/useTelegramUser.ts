import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '../types/database'

export function useTelegramUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchUser() {
      try {
        let telegramId: string | undefined

        // Try to get telegram ID from URL parameters (tgWebAppData)
        if (typeof window !== 'undefined') {
          try {
            const params = new URLSearchParams(window.location.search)
            const raw = params.get('tgWebAppData')
            if (raw) {
              const data = new URLSearchParams(raw)
              const userRaw = data.get('user')
              if (userRaw) {
                const parsedUser = JSON.parse(userRaw) as { id?: number }
                telegramId = parsedUser?.id?.toString()
              }
            }
          } catch {
            telegramId = undefined
          }
        }

        // Fallback: try window.Telegram.WebApp if available
        if (!telegramId && typeof window !== 'undefined') {
          try {
            const tg = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number } } } } }).Telegram?.WebApp
            if (tg?.initDataUnsafe?.user?.id) {
              telegramId = tg.initDataUnsafe.user.id.toString()
            }
          } catch {
            telegramId = undefined
          }
        }

        if (!telegramId) {
          setError('Не удалось получить ID из Telegram. Откройте приложение через кнопку меню в боте.')
          setLoading(false)
          return
        }

        const { data, error: dbError } = await supabase
          .from('users')
          .select('*')
          .eq('telegram_id', telegramId)
          .maybeSingle()

        if (dbError || !data) {
          setError('Пользователь не найден. Обратитесь к арендодателю.')
          setLoading(false)
          return
        }

        setUser(data)
      } catch {
        setError('Ошибка подключения')
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  return { user, loading, error }
}
