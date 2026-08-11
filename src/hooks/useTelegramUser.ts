import { useEffect, useState } from 'react'
import { retrieveLaunchParams } from '@telegram-apps/sdk'
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

        try {
          const launchParams = retrieveLaunchParams()
          telegramId = launchParams?.initData?.user?.id?.toString()
        } catch {
          telegramId = undefined
        }

        if (!telegramId && typeof window !== 'undefined') {
          try {
            const params = new URLSearchParams(window.location.search)
            const raw = params.get('tgWebAppData')
            if (raw) {
              const data = new URLSearchParams(raw)
              const userRaw = data.get('user')
              if (userRaw) {
                telegramId = (JSON.parse(userRaw) as { id?: number })?.id?.toString()
              }
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
