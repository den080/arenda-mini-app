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

      // 1) по почте сессии
      if (email) {
        const r = await supabase.from('users').select('*').eq('email', email).limit(1).maybeSingle()
        row = r.data || null
      }
      // 2) по telegram_id
      if (!row && tgId) {
        const r = await supabase.from('users').select('*').eq('telegram_id', tgId).limit(1).maybeSingle()
        row = r.data || null
      }
      // 3) создать, если совсем нет; если создание уперлось в уже существующую строку — перечитать
      if (!row && tgId) {
        const tgUser = tg?.initDataUnsafe?.user
        const name = `${tgUser?.first_name || ''} ${tgUser?.last_name || ''}`.trim()
        const ins = await supabase
          .from('users')
          .insert({ telegram_id: tgId, full_name: name || null, email: email || null, role: 'tenant' })
          .select('*')
          .maybeSingle()
        row = ins.data || null
        if (!row) {
          const r2 = await supabase.from('users').select('*').eq('telegram_id', tgId).limit(1).maybeSingle()
          row = r2.data || null
        }
        if (!row && email) {
          const r3 = await supabase.from('users').select('*').eq('email', email).limit(1).maybeSingle()
          row = r3.data || null
        }
      }

      if (row) {
        // связываем почту и telegram_id + отмечаем активность
        const upd: any = { last_seen_at: new Date().toISOString() }
        if (email && String(row.email || '').toLowerCase() !== email) upd.email = email
        if (tgId && String(row.telegram_id || '') !== tgId) upd.telegram_id = tgId
        await supabase.from('users').update(upd).eq('id', row.id).then(() => {}, () => {})
        setUser({ ...row, ...upd } as DbUser)
      } else {
        setUser(null)
      }
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
