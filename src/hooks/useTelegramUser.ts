import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { LOCKDOWN, isAllowed, normPhone } from '../App'
import type { User } from '../types/database'

let cachedUser: User | null = null
let cachedDenied: boolean = false

export function useTelegramUser() {
  const [user, setUser] = useState<User | null>(cachedUser)
  const [loading, setLoading] = useState<boolean>(!cachedUser && !cachedDenied)
  const [error, setError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState<boolean>(cachedDenied)

  async function loginWithId(input: string) {
    setLoading(true)
    setError(null)
    setAccessDenied(false)

    if (LOCKDOWN && !isAllowed(input)) {
      setError('Доступ к приложению сейчас закрыт.')
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
    cachedDenied = false
    setUser(null)
    setAccessDenied(false)
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

    if (autoId) {
      if (LOCKDOWN && !isAllowed(autoId)) {
        cachedDenied = true
        setAccessDenied(true)
        setLoading(false)
        return
      }
      loginWithId(autoId)
      return
    }

    try {
      const saved = localStorage.getItem('rentflow_tg_id') || undefined
      if (saved && (!LOCKDOWN || isAllowed(saved))) {
        loginWithId(saved)
        return
      }
    } catch {}

    setError('Telegram не передал ID автоматически. Введите его вручную ниже.')
    setLoading(false)
  }, [])

  return { user, loading, error, loginWithId, logout, accessDenied }
}
