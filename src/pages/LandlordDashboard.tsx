import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Object as PropertyObject } from '../types/database'

interface ObjectWithStatus extends PropertyObject {
  status: 'paid' | 'overdue' | 'pending' | 'no_contract'
  amount: number
}

export function LandlordDashboard() {
  const [objects, setObjects] = useState<ObjectWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        // Get landlord ID from Telegram with safe access
        let telegramId: string | undefined

        try {
          const launchParams = await import('@telegram-apps/sdk')
          const lp = launchParams.retrieveLaunchParams()
          telegramId = lp?.initData?.user?.id?.toString()
        } catch {
          telegramId = undefined
        }

        if (!telegramId && typeof window !== 'undefined') {
          try {
            const params = new URLSearchParams(window.location.search)
            const raw = params.get('tgWebAppData')
            if (raw) {
              const data = new URLSearchParams(raw)
              const userRaw = data.get('user')
              if (userRaw) {
                telegramId = (JSON.parse(userRaw) as { id?: number })?.id?.toString()
              }
            }
          } catch {
            telegramId = undefined
          }
        }

        if (!telegramId) {
          setError('Не удалось получить ID из Telegram. Откройте приложение через кнопку меню в боте.')
          setLoading(false)
          return
        }

        // Get user
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_id', telegramId)
          .single()

        if (userError || !userData) {
          setError('Пользователь не найден. Обратитесь к арендодателю.')
          setLoading(false)
          return
        }

        // Get objects
        const { data: objectsData } = await supabase
          .from('objects')
          .select('*')
          .eq('landlord_id', userData.id)

        if (!objectsData) {
          setObjects([])
          setLoading(false)
          return
        }

        // For each object, get contract and payment status
        const objectsWithStatus: ObjectWithStatus[] = []

        for (const obj of objectsData) {
          // Get active contract
          const { data: contract } = await supabase
            .from('contracts')
            .select('*')
            .eq('object_id', obj.id)
            .eq('status', 'active')
            .single()

          if (!contract) {
            objectsWithStatus.push({
              ...obj,
              status: 'no_contract',
              amount: 0,
            })
            continue
          }

          // Get current period payment
          const currentPeriod = new Date().toISOString().slice(0, 7) // YYYY-MM
          const { data: payment } = await supabase
            .from('payments')
            .select('*')
            .eq('contract_id', contract.id)
            .eq('period', currentPeriod)
            .single()

          const today = new Date()
          const dueDate = payment ? new Date(payment.due_date) : new Date(contract.end_date)
          const isOverdue = today > dueDate

          if (payment?.confirmed_by_landlord) {
            objectsWithStatus.push({
              ...obj,
              status: 'paid',
              amount: payment.base_amount + (payment.penalty_amount || 0),
            })
          } else if (isOverdue) {
            objectsWithStatus.push({
              ...obj,
              status: 'overdue',
              amount: (payment?.base_amount || contract.rent_amount) + (payment?.penalty_amount || 0),
            })
          } else {
            objectsWithStatus.push({
              ...obj,
              status: 'pending',
              amount: (payment?.base_amount || contract.rent_amount) + (payment?.penalty_amount || 0),
            })
          }
        }

        setObjects(objectsWithStatus)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid': return '🟢'
      case 'overdue': return '🔴'
      case 'pending': return '🟡'
      case 'no_contract': return '⚪'
      default: return ''
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid': return 'Оплачено'
      case 'overdue': return 'Просрочка'
      case 'pending': return 'Ждём платёж'
      case 'no_contract': return 'Нет договора'
      default: return ''
    }
  }

  if (loading) {
    return <div style={styles.container}>Загрузка...</div>
  }

  if (error) {
    return <div style={styles.container}>{error}</div>
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Мои объекты</h1>
      {objects.length === 0 ? (
        <p style={styles.empty}>Объектов нет</p>
      ) : (
        objects.map((obj) => (
          <div key={obj.id} style={styles.card}>
            <div style={styles.address}>{obj.address}</div>
            <div style={styles.statusRow}>
              <span>{getStatusIcon(obj.status)}</span>
              <span style={styles.statusText}>{getStatusText(obj.status)}</span>
            </div>
            {obj.amount > 0 && (
              <div style={styles.amount}>{obj.amount.toFixed(2)} ₽</div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxWidth: '600px',
    margin: '0 auto',
    padding: '16px',
    backgroundColor: '#f5f5f5',
    minHeight: '100vh',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '16px',
  },
  empty: {
    color: '#888',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  address: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '8px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  statusText: {
    fontSize: '14px',
    color: '#666',
  },
  amount: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
  },
}

export default LandlordDashboard
