import { useState, useEffect } from 'react'
import { retrieveLaunchParams } from '@telegram-apps/sdk'
import { supabase } from '../lib/supabase'
import type { User } from '../types/database'

interface UseTelegramUserResult {
  user: User | null
  loading: boolean
  error: string | null
}

export function useTelegramUser(): UseTelegramUserResult {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchUser() {
      try {
        const launchParams = retrieveLaunchParams()
        const telegramId = (launchParams.initData as { user: { id: number } }).user.id

        const { data, error: fetchError } = await supabase
          .from('users')
          .select('*')
          .eq('telegram_id', telegramId)
          .single()

        if (fetchError) {
          throw fetchError
        }

        setUser(data as User)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  return { user, loading, error }
}
