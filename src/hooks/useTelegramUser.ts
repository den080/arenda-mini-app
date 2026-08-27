import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface DbUser {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  role: string | null
  telegram_id: string | null
  landlord_doc_name?: string | null
  created_at?: string
  last_seen_at?: string | null
}

export function useTelegramUser() {
  const [user, setUser] = useState<DbUser | null>(null)
  const [loading, setLoading] = useState(true)

  const resolve = useCallback(async () => {
    setLoading(true)
    try {
      const tg = (window as any)?.Telegram?.WebApp
      const tgId = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : ''
      let email = ''
      try {
        const { data: authData } = await supabase.auth.getUser()
        email = String(authData?.user?.email || '').toLowerCase()
      } catch {}

      let row: any = null

      // 0) ГЛАВНОЕ: серверный поиск в обход правил доступа — работает на любом устройстве
      try {
        const { data: prof } = await supabase.rpc('profile_resolve', { p_email: email, p_tg: tgId })
        if (prof && (prof as any).id) row = prof as any
      } catch {}

      // 1) запасной: по почте
      if (!row && email) {
        const r = await supabase.from('users').select('*').eq('email', email).limit(1).maybeSingle()
        row = r.data || null
      }
      // 2) запасной: по telegram_id
      if (!row && tgId) {
        const r = await supabase.from('users').select('*').eq('telegram_id', tgId).limit(1).maybeSingle()
        row = r.data || null
      }
      // 3) создать, если профиля совсем нет
      if (!row && tgId) {
        const tgUser = tg?.initDataUnsafe?.user
        const name = `${tgUser?.first_name || ''} ${tgUser?.last_name || ''}`.trim()
        const ins = await supabase
          .from('users')
          .insert({ telegram_id: tgId, full_name: name || null, email: email || null, role: 'tenant' })
          .select('*')
          .maybeSingle()
        row = ins.data || null
      }

      setUser(row ? (row as DbUser) : null)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    resolve()
  }, [resolve])

  return { user, loading, refresh: resolve }
}

export default useTelegramUser
