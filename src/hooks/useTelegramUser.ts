import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface DbUser {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  role: 'tenant' | 'landlord' | null
  telegram_id: number | null
  created_at: string
  last_seen_at: string | null
}

export function useTelegramUser() {
  const [user, setUser] = useState<DbUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function resolve() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        if (cancelled) return
        const email = authData.user?.email || null

        if (!email) {
          setUser(null)
          setLoading(false)
          return
        }

        // Ищем пользователя по email
        const { data: byEmail } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .maybeSingle()

        if (cancelled) return

        if (byEmail) {
          // Обновим last_seen_at тихо
          supabase.from('users').update({ last_seen_at: new Date().toISOString() }).eq('id', byEmail.id)
          setUser(byEmail as DbUser)
          setLoading(false)
          return
        }

        // Если в Telegram WebApp есть данные — создаём запись
        const tg = (window as any).Telegram?.WebApp
        const tgUser = tg?.initDataUnsafe?.user
        if (tgUser) {
          const fullName = `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim()
          const { data: inserted, error } = await supabase
            .from('users')
            .insert({
              email,
              full_name: fullName,
              telegram_id: tgUser.id,
              last_seen_at: new Date().toISOString(),
            })
            .select('*')
            .maybeSingle()
          if (!cancelled && !error && inserted) {
            setUser(inserted as DbUser)
            setLoading(false)
            return
          }
        }

        // Фоллбэк — создаём запись без Telegram-данных
        const { data: fallback } = await supabase
          .from('users')
          .insert({
            email,
            full_name: email.split('@')[0],
            last_seen_at: new Date().toISOString(),
          })
          .select('*')
          .maybeSingle()
        if (!cancelled) {
          setUser((fallback as DbUser) || null)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setUser(null)
          setLoading(false)
        }
      }
    }

    resolve()
    return () => { cancelled = true }
  }, [])

  return { user, loading }
}

export default useTelegramUser
