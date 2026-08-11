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

        // Пытаемся получить telegram_id из URL-параметров (tgWebAppData)
        if (typeof window !== 'undefined') {
          try {
            const params = new URLSearchParams(window.location.search)
            const rawInitData = params.get('tgWebAppData')
            
            if (rawInitData) {
              // tgWebAppData - это строка вида "user=%7B...%7D&query_id=..."
              const initDataParams = new URLSearchParams(rawInitData)
              const userJson = initDataParams.get('user')
              
              if (userJson) {
                const userData = JSON.parse(decodeURIComponent(userJson))
                telegramId = userData.id?.toString()
              }
            }
          } catch (e) {
            console.error('Ошибка парсинга tgWebAppData:', e)
            telegramId = undefined
          }
        }

        if (!telegramId) {
          setError('Не удалось получить ID пользователя из Telegram. Убедитесь, что приложение открыто через бота.')
          setLoading(false)
          return
        }

        // Ищем пользователя в базе данных
        const { data, error: dbError } = await supabase
          .from('users')
          .select('*')
          .eq('telegram_id', telegramId)
          .maybeSingle()

        if (dbError) {
          console.error('Ошибка Supabase:', dbError)
          setError('Ошибка подключения к базе данных')
          setLoading(false)
          return
        }

        if (!data) {
          setError('Пользователь не найден. Обратитесь к арендодателю для регистрации.')
          setLoading(false)
          return
        }

        setUser(data)
      } catch (e) {
        console.error('Неожиданная ошибка:', e)
        setError('Произошла непредвиденная ошибка')
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  return { user, loading, error }
}
