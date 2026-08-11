import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import type { Object as PropertyObject } from '../types/database'

interface ObjectWithStatus extends PropertyObject {
  status: 'paid' | 'overdue' | 'pending' | 'no_contract'
  amount: number
  paymentId: string | null
}

export function LandlordDashboard() {
  const { user, loading: userLoading } = useTelegramUser()
  const [objects, setObjects] = useState<ObjectWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    async function fetchData() {
      try {
        const { data: objectsData } = await supabase
          .from('objects')
          .select('*')
          .eq('landlord_id', user!.id)

        if (!objectsData) {
          setObjects([])
          setLoading(false)
          return
        }

        const objectsWithStatus: ObjectWithStatus[] = []

        for (const obj of objectsData) {
          const { data: contract } = await supabase
            .from('contracts')
            .select('*')
            .eq('object_id', obj.id)
            .eq('status', 'active')
            .maybeSingle()

          if (!contract) {
            objectsWithStatus.push({ ...obj, status: 'no_contract', amount: 0, paymentId: null })
            continue
          }

          const { data: payment } = await supabase
            .from('payments')
            .select('*')
            .eq('contract_id', contract.id)
            .order('period', { ascending: false })
            .limit(1)
            .maybeSingle()

          const today = new Date()
          const dueDate = payment ? new Date(payment.due_date) : new Date(contract.end_date)
          const isOverdue = today > dueDate

          const baseAmount = payment?.base_amount || contract.rent_amount
          const penaltyAmount = payment?.penalty_amount || 0
          const paymentId = payment ? String(payment.id) : null

          if (payment?.confirmed_by_landlord) {
            objectsWithStatus.push({ ...obj, status: 'paid', amount: baseAmount + penaltyAmount, paymentId })
          } else if (isOverdue) {
            objectsWithStatus.push({ ...obj, status: 'overdue', amount: baseAmount + penaltyAmount, paymentId })
          } else {
            objectsWithStatus.push({ ...obj, status: 'pending', amount: baseAmount + penaltyAmount, paymentId })
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
  }, [user])

  async function confirmPayment(objId: string, paymentId: string) {
    const { error: updError } = await supabase
      .from('payments')
      .update({ confirmed_by_landlord: true })
      .eq('id', paymentId)

    if (!updError) {
      setObjects(prev => prev.map(o => (o.id === objId ? { ...o, status: 'paid' as const } : o)))
    } else {
      alert('Не удалось подтвердить: ' + updError.message)
    }
  }

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

  if (userLoading || loading) {
    return <div style={styles.container}>Загрузка...</div>
  }

  if (error) {
    return <div style={styles.container}>{error}</div>
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🏠 Мои объекты</h1>
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
            {obj.paymentId && (obj.status === 'overdue' || obj.status === 'pending') && (
              <button
                onClick={() => confirmPayment(String(obj.id), obj.paymentId!)}
                style={styles.confirmButton}
              >
                ✅ Подтвердить оплату
              </button>
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
  confirmButton: {
    marginTop: '12px',
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: '#4caf50',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
  },
}

export default LandlordDashboard
