import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '../types/database'

function extractTelegramId(): { id?: string; debug: string } {
  const debugParts: string[] = []

  try {
    const w = window as any

    // ===== СПОСОБ 1: через глобальный объект Telegram (самый надёжный) =====
    if (typeof w.Telegram !== 'undefined') {
      debugParts.push('tg: да')

      // initDataUnsafe — готовый объект с данными
      const unsafeUser = w.Telegram?.WebApp?.initDataUnsafe?.user
      if (unsafeUser && unsafeUser.id) {
        return { id: String(unsafeUser.id), debug: debugParts.join(' | ') + ' (способ 1: initDataUnsafe)' }
      }

      // initData — строка, которую нужно распарсить
      const initDataStr = w.Telegram?.WebApp?.initData
      if (initDataStr) {
        try {
          const inner = new URLSearchParams(initDataStr)
          const userRaw = inner.get('user')
          if (userRaw) {
            const user = JSON.parse(userRaw)
            if (user && user.id) {
              return { id: String(user.id), debug: debugParts.join(' | ') + ' (способ 1: initData)' }
            }
          }
        } catch {
          // продолжаем искать
        }
      }
    } else {
      debugParts.push('tg: нет')
    }

    // ===== СПОСОБ 2: tgWebAppData в URL-строке (search) =====
    const search = window.location.search || ''
    debugParts.push('search: ' + (search ? search.slice(0, 80) : '(пусто)'))

    if (search) {
      try {
        const outer = new URLSearchParams(search)
        const data = outer.get('tgWebAppData')
        if (data) {
          const inner = new URLSearchParams(data)
          const userRaw = inner.get('user')
          if (userRaw) {
            const user = JSON.parse(decodeURIComponent(userRaw))
            if (user && user.id) {
              return { id: String(user.id), debug: debugParts.join(' | ') + ' (способ 2: search)' }
            }
          }
        }
      } catch {
        // продолжаем
      }
    }

    // ===== СПОСОБ 3: tgWebAppData в URL-хэше (после #) =====
    const hash = window.location.hash || ''
    debugParts.push('hash: ' + (hash ? hash.slice(0, 80) : '(пусто)'))

    if (hash.includes('=')) {
      try {
        const outer = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
        const data = outer.get('tgWebAppData')
        if (data) {
          const inner = new URLSearchParams(data)
          const userRaw = inner.get('user')
          if (userRaw) {
            const user = JSON.parse(decodeURIComponent(userRaw))
            if (user && user.id) {
              return { id: String(user.id), debug: debugParts.join(' | ') + ' (способ 3: hash)' }
            }
          }
        }
      } catch {
        // продолжаем
      }
    }

    return { id: undefined, debug: debugParts.join(' | ') }
  } catch (e) {
    return { id: undefined, debug: 'ошибка: ' + String(e) }
  }
}

export function useTelegramUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchUser() {
      const { id: telegramId, debug } = extractTelegramId()

      if (!telegramId) {
        setError(
          'Не удалось получить ID из Telegram. Откройте приложение через кнопку меню в боте.\n' +
          'Диагностика: [' + debug + ']'
        )
        setLoading(false)
        return
      }

      try {
        const { data, error: dbError } = await supabase
          .from('users')
          .select('*')
          .eq('telegram_id', telegramId)
          .maybeSingle()

        if (dbError) {
          setError('Ошибка подключения к базе: ' + dbError.message)
        } else if (!data) {
          setError('Пользователь не найден в базе (telegram_id=' + telegramId + ').')
        } else {
          setUser(data as User)
        }
      } catch (e) {
        setError('Ошибка подключения к базе: ' + String(e))
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  return { user, loading, error }
}
