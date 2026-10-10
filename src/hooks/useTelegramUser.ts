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
  last_seen?: string | null
}

function normPhone(s: any): string {
  return String(s || '').replace(/\D/g, '')
}

export function useTelegramUser() {
  const [user, setUser] = useState<DbUser | null>(null)
  const [loading, setLoading] = useState(true)

  const resolve = useCallback(async () => {
    setLoading(true)
    try {
      // ===== РЕЖИМ ПРОСМОТРА: админ смотрит глазами пользователя =====
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
      
      // === ИСПРАВЛЕНИЕ: УБРАЛИ DEMO FALLBACK ===
      // Если нет initData от Telegram, выходим сразу с user=null.
      // Никакого mock-пользователя не создаём.
      if (!tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) {
        console.warn('No Telegram initData found. Access denied.')
        setLoading(false)
        return 
      }
      // ===========================================

      const tgId = tg.initDataUnsafe.user.id ? String(tg.initDataUnsafe.user.id) : ''
      const tgPhoneRaw = String(tg.initDataUnsafe.user.phone_number || '')
      const tgDigits = normPhone(tgPhoneRaw)
      const tgLast10 = tgDigits.length >= 10 ? tgDigits.slice(-10) : ''
      
      let email = ''
      try {
        const { data: authData } = await supabase.auth.getUser()
        email = String(authData?.user?.email || '').toLowerCase()
      } catch {}

      if (tgId) {
        await supabase.auth.updateUser({ data: { telegram_id: tgId, phone: tgPhoneRaw || undefined } }).then(() => {}, () => {})
      }

      let row: any = null
      
      // 1) Ищем по email
      if (email) {
        const r = await supabase.from('users').select('*').eq('email', email).limit(1).maybeSingle()
        row = r.data || null
      }
      
      // 2) Ищем по telegram_id
      if (!row && tgId) {
        const r = await supabase.from('users').select('*').eq('telegram_id', tgId).limit(1).maybeSingle()
        row = r.data || null
      }
      
      // 3) ЗАКРЫТИЕ ДЫРЫ: ищем заглушку по телефону (без telegram_id), созданную арендодателем
      //    Если нашли — НЕ создаём новый аккаунт, а дописываем telegram_id/email в существующий.
      if (!row && tgLast10) {
        const candidates: any[] = []
        for (const prefix of ['+7', '8', '']) {
          const val = prefix + tgLast10
          const q = await supabase
            .from('users')
            .select('*')
            .eq('phone', val)
            .is('telegram_id', null)
            .limit(1)
          if (q.data && q.data[0]) { candidates.push(q.data[0]); break }
        }
        
        // запасной поиск через like (на случай другого формата хранения номера)
        if (candidates.length === 0) {
          const q2 = await supabase
            .from('users')
            .select('*')
            .filter('phone', 'like', '%' + tgLast10)
            .is('telegram_id', null)
            .limit(1)
          if (q2.data && q2.data[0]) candidates.push(q2.data[0])
        }
        
        if (candidates.length > 0) {
          row = candidates[0]
          const updByPhone: any = { telegram_id: tgId }
          if (email && !row.email) updByPhone.email = email
          await supabase.from('users').update(updByPhone).eq('id', row.id).then(() => {}, () => {})
          row = { ...row, ...updByPhone }
        }
      }
      
      // 4) Только если ничего не нашли — создаём новый аккаунт
      if (!row && tgId) {
        const tgUser = tg?.initDataUnsafe?.user
        const name = `${tgUser?.first_name || ''} ${tgUser?.last_name || ''}`.trim()
        const ins = await supabase
          .from('users')
          .insert({
            telegram_id: tgId,
            full_name: name || null,
            email: email || null,
            phone: tgPhoneRaw || null,
            role: 'tenant',
          })
          .select('*')
          .maybeSingle()
        row = ins.data || null
      }

      if (row) {
        const upd: any = { last_seen: new Date().toISOString() }
        if (email && !row.email) upd.email = email
        if (tgId && !row.telegram_id) upd.telegram_id = tgId
        if (tgPhoneRaw && !row.phone) upd.phone = tgPhoneRaw
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

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') resolve()
    })
    return () => { sub?.subscription?.unsubscribe() }
  }, [resolve])

  return { user, loading, refresh: resolve }
}

export default useTelegramUser
