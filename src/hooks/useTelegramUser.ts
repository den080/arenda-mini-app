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
      // ===== Режим просмотра (админ смотрит глазами пользователя) =====
      // Сессия остаётся админской — меняется только отображаемый профиль.
      const viewAsId = (localStorage.getItem('roomio_viewas_id') || '').trim()
      if (viewAsId) {
        const vr = await supabase.from('users').select('*').eq('id', viewAsId).maybeSingle()
        if (vr.data) {
          setUser(vr.data as DbUser)
          setLoading(false)
          return
        }
        localStorage.removeItem('roomio_viewas_id')
      }

      const tg = (window as any)?.Telegram?.WebApp
      const tgId = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : ''
      const tgPhone = String(tg?.initDataUnsafe?.user?.phone_number || '')
      let email = ''
      try {
        const { data: authData } = await supabase.auth.getUser()
        email = String(authData?.user?.email || '').toLowerCase()
      } catch {}

      // сообщаем базе «кто я»: telegram_id в сессию (для входа с любой своей почты)
      if (tgId) {
        await supabase.auth.updateUser({ data: { telegram_id: tgId, phone: tgPhone || undefined } }).then(() => {}, () => {})
      }

      let row: any = null

      // 0) серверный поиск по почте ИЛИ по telegram, в обход правил доступа
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

      if (row) {
        const upd: any = { last_seen_at: new Date().toISOString() }
        // почту привязываем ТОЛЬКО если у профиля её нет — чужую основную не трогаем
        if (email && !row.email) upd.email = email
        if (tgId && !row.telegram_id) upd.telegram_id = tgId
        if (Object.keys(upd).length > 1) {
          await supabase.from('users').update(upd).eq('id', row.id).then(() => {}, () => {})
        }
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
