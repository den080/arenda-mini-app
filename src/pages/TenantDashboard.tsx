import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Object as PropertyObject, Contract, ObjectMeter, MeterType } from '../types/database'

interface TenantData {
  object: PropertyObject | null
  contract: Contract | null
  payment: {
    base_amount: number
    penalty_amount: number
    total: number
    due_date: string
    confirmed: boolean
  } | null
  meters: (ObjectMeter & { meter_type: MeterType })[]
}

export function TenantDashboard() {
  const [data, setData] = useState<TenantData>({
    object: null,
    contract: null,
    payment: null,
    meters: [],
  })
  const [readings, setReadings] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        // Get tenant ID from Telegram with safe access
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

        // Get active contract
        const { data: contract } = await supabase
          .from('contracts')
          .select('*')
          .eq('tenant_id', userData.id)
          .eq('status', 'active')
          .single()

        if (!contract) {
          setLoading(false)
          return
        }

        // Get object
        const { data: object } = await supabase
          .from('objects')
          .select('*')
          .eq('id', contract.object_id)
          .single()

        // Get current period payment
        const currentPeriod = new Date().toISOString().slice(0, 7)
        const { data: payment } = await supabase
          .from('payments')
          .select('*')
          .eq('contract_id', contract.id)
          .eq('period', currentPeriod)
          .single()

        // Get active meters
        const { data: metersData } = await supabase
          .from('object_meters')
          .select('*, meter_type:meter_types(*)')
          .eq('object_id', object.id)
          .eq('is_active', true)

        setData({
          object: object || null,
          contract,
          payment: payment ? {
            base_amount: payment.base_amount,
            penalty_amount: payment.penalty_amount || 0,
            total: payment.base_amount + (payment.penalty_amount || 0),
            due_date: payment.due_date,
            confirmed: payment.confirmed_by_landlord,
          } : {
            base_amount: contract.rent_amount,
            penalty_amount: 0,
            total: contract.rent_amount,
            due_date: new Date(new Date().getFullYear(), new Date().getMonth(), contract.payment_day).toISOString(),
            confirmed: false,
          },
          meters: metersData || [],
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleReadingChange = (meterId: string, value: string) => {
    setReadings(prev => ({ ...prev, [meterId]: value }))
  }

  const handleSubmitReadings = async () => {
    setSubmitting(true)
    setSubmitResult(null)

    try {
      const period = new Date().toISOString().slice(0, 7)
      const promises = Object.entries(readings).map(([meterId, value]) =>
        supabase.rpc('submit_meter_reading', {
          p_object_meter_id: meterId,
          p_contract_id: data.contract?.id,
          p_value: parseFloat(value),
          p_period: period,
        })
      )

      await Promise.all(promises)
      setSubmitResult({ success: true, message: 'Показания успешно отправлены' })
      setReadings({})
    } catch (err) {
      setSubmitResult({ success: false, message: err instanceof Error ? err.message : 'Ошибка отправки' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div style={styles.container}>Загрузка...</div>
  }

  if (error) {
    return <div style={styles.container}>{error}</div>
  }

  if (!data.object || !data.contract) {
    return <div style={styles.container}>Нет активного договора</div>
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Личный кабинет</h1>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Адрес объекта</h2>
        <p style={styles.text}>{data.object.address}</p>
      </div>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Сумма к оплате</h2>
        <div style={styles.amount}>{data.payment?.total.toFixed(2)} ₽</div>
        {data.payment && data.payment.penalty_amount > 0 && (
          <div style={styles.penalty}>в т.ч. пеня: {data.payment.penalty_amount.toFixed(2)} ₽</div>
        )}
        <div style={styles.dueDate}>
          Срок оплаты: {data.payment ? new Date(data.payment.due_date).toLocaleDateString('ru-RU') : ''}
        </div>
        {data.payment?.confirmed && (
          <div style={styles.confirmed}>✓ Подтверждено арендодателем</div>
        )}
      </div>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Реквизиты оплаты</h2>
        {data.contract.payment_method === 'card' || data.contract.payment_method === 'both' ? (
          <>
            <div style={styles.label}>Банковская карта:</div>
            <div style={styles.cardNumber}>{data.contract.card_number || 'Не указана'}</div>
          </>
        ) : null}
        {data.contract.payment_method === 'cash' || data.contract.payment_method === 'both' ? (
          <div style={styles.cashNote}>Оплата наличными</div>
        ) : null}
      </div>

      {data.meters.length > 0 && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Показания счётчиков</h2>
          {data.meters.map((meter) => (
            <div key={meter.id} style={styles.meterRow}>
              <label style={styles.meterLabel}>
                {meter.meter_type.label} ({meter.meter_type.unit}):
              </label>
              <input
                type="number"
                value={readings[meter.id] || ''}
                onChange={(e) => handleReadingChange(meter.id, e.target.value)}
                placeholder="Введите показания"
                style={styles.input}
              />
            </div>
          ))}
          <button
            onClick={handleSubmitReadings}
            disabled={submitting || Object.keys(readings).length === 0}
            style={{
              ...styles.button,
              opacity: submitting || Object.keys(readings).length === 0 ? 0.5 : 1,
            }}
          >
            {submitting ? 'Отправка...' : 'Отправить показания'}
          </button>
          {submitResult && (
            <div style={{
              ...styles.result,
              color: submitResult.success ? '#4CAF50' : '#f44336',
            }}>
              {submitResult.message}
            </div>
          )}
        </div>
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
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '8px',
    color: '#333',
  },
  text: {
    fontSize: '14px',
    color: '#666',
  },
  amount: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '4px',
  },
  penalty: {
    fontSize: '14px',
    color: '#f44336',
    marginBottom: '8px',
  },
  dueDate: {
    fontSize: '14px',
    color: '#666',
  },
  confirmed: {
    fontSize: '14px',
    color: '#4CAF50',
    marginTop: '8px',
  },
  label: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '4px',
  },
  cardNumber: {
    fontSize: '18px',
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  cashNote: {
    fontSize: '14px',
    color: '#666',
  },
  meterRow: {
    marginBottom: '12px',
  },
  meterLabel: {
    display: 'block',
    fontSize: '14px',
    color: '#666',
    marginBottom: '4px',
  },
  input: {
    width: '100%',
    padding: '10px',
    fontSize: '16px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: '12px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#007AFF',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  result: {
    marginTop: '12px',
    fontSize: '14px',
    textAlign: 'center',
  },
}

export default TenantDashboard
