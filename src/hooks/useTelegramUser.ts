import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { LOCKDOWN, isAllowed, normPhone } from '../App'
import type { User } from '../types/database'

let cachedUser: User | null = null

function getAutoId(): string | undefined {
  try {
    const w = window as any
    const id = w?.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString()
    if (id) return id
  } catch {}
  try {
    const s = new URLSearchParams(window.location.search)
    const d = s.get('tgWebAppData')
    if (d) {
      const u = JSON.parse(new URLSearchParams(d).get('user') || 'null')
      if (u?.id) return String(u.id)
    }
  } catch {}
  return undefined
}

export function useTelegramUser() {
  const [user, setUser] = useState<User | null>(cachedUser)
  const [loading, setLoading] = useState<boolean>(!cachedUser)
  const [error, setError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState<boolean>(false)

  async function loginWithId(input: string) {
    setLoading(true)
    setError(null)
    setAccessDenied(false)

    if (LOCKDOWN && !isAllowed(input)) {
      // номер не в whitelist — но вдруг это Telegram ID уже известного пользователя
      const { data } = await supabase.from('users').select('*').eq('telegram_id', input).limit(1)
      const found = data && data[0]
      if (!found || !isAllowed(found.phone || '')) {
        setError('Доступ к приложению сейчас закрыт.')
        setLoading(false)
        return
      }
      cachedUser = found as User
      setUser(cachedUser)
      setLoading(false)
      return
    }

    const isPhone = /\d/.test(input) && input.length >= 10
    const searchValue = isPhone ? normPhone(input) : input
    const digits = input.replace(/\D/g, '')

    try {
      localStorage.setItem('rentflow_tg_id', input)
    } catch {}
    try {
      const orCond = digits.length >= 10
        ? `telegram_id.eq."${searchValue}",phone.like."%${digits.slice(-10)}%"`
        : `telegram_id.eq."${searchValue}"`
      const { data, error: dbError } = await supabase
        .from('users')
        .select('*')
        .or(orCond)
        .limit(1)
      const found = data && data[0]
      if (dbError) setError('Ошибка базы: ' + dbError.message)
      else if (!found) setError('Пользователь с таким ID или телефоном не найден.')
      else {
        // привязываем текущий Telegram ID, чтобы дальше входил автоматически
        const autoId = getAutoId()
        if (autoId && String(found.telegram_id || '') !== autoId) {
          await supabase.from('users').update({ telegram_id: autoId }).eq('id', found.id)
          found.telegram_id = autoId
        }
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
    } catch {}
    cachedUser = null
    setUser(null)
    setAccessDenied(false)
    setError(null)
    setLoading(false)
  }

  useEffect(() => {
    if (cachedUser) return
    const autoId = getAutoId()
    ;(async () => {
      // 1) Telegram ID прямо в whitelist (тестеры)
      if (autoId && isAllowed(autoId)) {
        loginWithId(autoId)
        return
      }
      // 2) ищем пользователя по Telegram ID
      if (autoId) {
        const { data } = await supabase.from('users').select('*').eq('telegram_id', autoId).limit(1)
        const found = data && data[0]
        if (found) {
          if (!LOCKDOWN || isAllowed(found.phone || '')) {
            cachedUser = found as User
            setUser(cachedUser)
            setLoading(false)
            return
          }
          // пользователь есть, но не в whitelist
          setAccessDenied(true)
          setLoading(false)
          return
        }
      }
      // 3) сохранённый тестовый вход (вне Telegram или прошлый вход)
      try {
        const saved = localStorage.getItem('rentflow_tg_id') || undefined
        if (saved && (!LOCKDOWN || isAllowed(saved))) {
          loginWithId(saved)
          return
        }
      } catch {}
      // 4) предлагаем войти по телефону из whitelist
      setError('Введите номер телефона, указанный в договоре.')
      setLoading(false)
    })()
  }, [])

  return { user, loading, error, loginWithId, logout, accessDenied }
}
