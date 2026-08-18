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

async function isTeamUser(userId: string): Promise<boolean> {
  const { data: m } = await supabase.from('team_members').select('id').eq('user_id', userId).limit(1)
  if (m && m.length) return true
  const { data: t } = await supabase.from('teams').select('id').eq('owner_id', userId).limit(1)
  return !!(t && t.length)
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
      else if (!found) setError(LOCKDOWN ? 'Доступ к приложению сейчас закрыт.' : 'Пользователь с таким ID или телефоном не найден.')
      else {
        const allowed = !LOCKDOWN
          || isAllowed(input)
          || isAllowed(String(found.telegram_id || ''))
          || isAllowed(found.phone || '')
          || (await isTeamUser(found.id))
        if (!allowed) { setAccessDenied(true); setLoading(false); return }
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
      if (autoId && isAllowed(autoId)) {
        loginWithId(autoId)
        return
      }
      if (autoId) {
        const { data } = await supabase.from('users').select('*').eq('telegram_id', autoId).limit(1)
        const found = data && data[0]
        if (found) {
          const allowed = !LOCKDOWN || isAllowed(found.phone || '') || (await isTeamUser(found.id))
          if (allowed) {
            cachedUser = found as User
            setUser(cachedUser)
            setLoading(false)
            return
          }
          setAccessDenied(true)
          setLoading(false)
          return
        }
      }
      try {
        const saved = localStorage.getItem('rentflow_tg_id') || undefined
        if (saved && (!LOCKDOWN || isAllowed(saved))) {
          loginWithId(saved)
          return
        }
      } catch {}
      setError('Введите номер телефона, указанный в договоре.')
      setLoading(false)
    })()
  }, [])

  return { user, loading, error, loginWithId, logout, accessDenied }
}
