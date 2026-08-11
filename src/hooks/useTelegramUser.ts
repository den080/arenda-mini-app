import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '../types/database'

function extractTelegramId(): { id?: string; debug: string } {
  const debugParts: string[] = []

  try {
    const w = window as any

    if (typeof w.Telegram !== 'undefined') {
      debugParts.push('tg: да')

      const webApp = w.Telegram?.WebApp
      if (!webApp) {
        debugParts.push('WebApp: нет')
        return { id: undefined, debug: debugParts.join(' | ') }
      }

      debugParts.push('WebApp: да')

      // Проверяем initDataUnsafe
      const unsafeData = webApp.initDataUnsafe
      debugParts.push('initDataUnsafe: ' + (unsafeData ? 'есть' : 'нет'))

      if (unsafeData) {
        debugParts.push('initDataUnsafe keys: ' + Object.keys(unsafeData).join(','))

        const unsafeUser = unsafeData.user
        if (unsafeUser && unsafeUser.id) {
          return { id: String(unsafeUser.id), debug: debugParts.join(' | ') + ' (способ 1: initDataUnsafe.user)' }
        } else {
          debugParts.push('user в initDataUnsafe: ' + (unsafeUser ? 'есть, но без id' : 'нет'))
        }
      }

      // Проверяем initData
      const initDataStr = webApp.initData
      debugParts.push('initData: ' + (initDataStr ? initDataStr.slice(0, 50) : '(пусто)'))

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
          // продолжаем
        }
      }
    } else {
      debugParts.push('tg: нет')
    }

    // Способ 2: search
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

    // Способ 3: hash
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
        const {
