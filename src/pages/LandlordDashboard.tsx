import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import type { Object as PropertyObject, Contract, MeterType, ObjectMeter, NotificationLog, CashSlot, CashMeeting } from '../types/database'

interface ObjectWithStatus extends PropertyObject {
  status: 'paid' | 'overdue' | 'pending' | 'no_contract'
  amount: number
  paymentId: string | null
  contract?: Contract
  cashMeetings?: CashMeeting[]
}

const DAYS_OF_WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export function LandlordDashboard() {
  const { user, loading: userLoading } = useTelegramUser()
  const [objects, setObjects] = useState<ObjectWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meterTypes, setMeterTypes] = useState<MeterType[]>([])
  const [objectMeters, setObjectMeters] = useState<Record<string, ObjectMeter[]>>({})
  const [notifications, setNotifications] = useState<NotificationLog[]>([])

  useEffect(() => {
    if (!user) return

    async function fetchData() {
      try {
        // Загружаем типы счётчиков
        const { data: mtData } = await supabase.from('meter_types').select('*')
        if (mtData) setMeterTypes(mtData)

        // Загружаем уведомления
        const { data: notifData } = await supabase
          .from('notifications_log')
          .select('*')
          .eq('user_id', user!.id)
          .order('sent_at', { ascending: false })
          .limit(5)
        if (notifData) setNotifications(notifData)

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
        const allObjectMeters: Record<string, ObjectMeter[]> = {}

        for (const obj of objectsData) {
          const { data: contract } = await supabase
            .from('contracts')
            .select('*')
            .eq('object_id', obj.id)
            .eq('status', 'active')
            .maybeSingle()

          // Загружаем счётчики объекта
          const { data: omData } = await supabase
            .from('object_meters')
            .select('*')
            .eq('object_id', obj.id)
          allObjectMeters[obj.id] = omData || []

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
            objectsWithStatus.push({ ...obj, status: 'paid', amount: baseAmount + penaltyAmount, paymentId, contract })
          } else if (isOverdue) {
            objectsWithStatus.push({ ...obj, status: 'overdue', amount: baseAmount + penaltyAmount, paymentId, contract })
          } else {
            objectsWithStatus.push({ ...obj, status: 'pending', amount: baseAmount + penaltyAmount, paymentId, contract })
          }
        }

        setObjectMeters(allObjectMeters)
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

  async function toggleMeter(objId: string, meterTypeId: string) {
    const existing = objectMeters[objId]?.find(om => om.meter_type_id === meterTypeId)
    
    if (existing) {
      const { error } = await supabase
        .from('object_meters')
        .update({ is_active: !existing.is_active })
        .eq('id', existing.id)
      
      if (!error) {
        setObjectMeters(prev => ({
          ...prev,
          [objId]: prev[objId].map(om => 
            om.id === existing.id ? { ...om, is_active: !om.is_active } : om
          )
        }))
      } else {
        alert('Ошибка: ' + error.message)
      }
    } else {
      const { data, error } = await supabase
        .from('object_meters')
        .insert({ object_id: objId, meter_type_id: meterTypeId, is_active: true })
        .select()
      
      if (!error && data) {
        setObjectMeters(prev => ({
          ...prev,
          [objId]: [...(prev[objId] || []), data[0]]
        }))
      } else if (error) {
        alert('Ошибка: ' + error.message)
      }
    }
  }

  async function updatePaymentMethod(contractId: string, method: 'card' | 'cash') {
    const { error } = await supabase
      .from('contracts')
      .update({ payment_method: method, cash_slots: method === 'cash' ? [] : null })
      .eq('id', contractId)
    
    if (!error) {
      setObjects(prev => prev.map(o => 
        o.contract?.id === contractId 
          ? { ...o, contract: { ...o.contract!, payment_method: method, cash_slots: method === 'cash' ? [] : null } }
          : o
      ))
    } else {
      alert('Ошибка: ' + error.message)
    }
  }

  async function saveCashSlots(contractId: string, slots: CashSlot[]) {
    const { error } = await supabase
      .from('contracts')
      .update({ cash_slots: slots })
      .eq('id', contractId)
    
    if (!error) {
      setObjects(prev => prev.map(o => 
        o.contract?.id === contractId 
          ? { ...o, contract: { ...o.contract!, cash_slots: slots } }
          : o
      ))
      alert('Слоты сохранены')
    } else {
      alert('Ошибка: ' + error.message)
    }
  }

  async function confirmCashMeeting(meetingId: string, contractId: string, tenantId: string) {
    const { error: meetError } = await supabase
      .from('cash_meetings')
      .update({ status: 'confirmed' })
      .eq('id', meetingId)
    
    if (!meetError) {
      const { error: notifError } = await supabase
        .from('notifications_log')
        .insert({ 
          user_id: tenantId, 
          type: 'cash_confirmed', 
          related_id: meetingId, 
          sent_at: new Date().toISOString() 
        })
      
      if (!notifError) {
        // Обновляем UI - убираем подтверждённую заявку из списка
        setObjects(prev => prev.map(o => {
          if (o.contract?.id === contractId && o.cashMeetings) {
            return { ...o, cashMeetings: o.cashMeetings.filter((m: CashMeeting) => m.id !== meetingId) }
          }
          return o
        }))
        alert('Время подтверждено')
      }
    } else {
      alert('Ошибка: ' + meetError.message)
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

  const getNotificationText = (type: string) => {
    switch (type) {
      case 'payment_claimed': return '✅ Арендатор сообщил об оплате'
      case 'payment_confirmed': return '🟢 Арендодатель подтвердил оплату'
      case 'meter_submitted': return '💦 Переданы новые показания'
      case 'cash_proposed': return '💵 Арендатор предложил время оплаты наличными'
      case 'cash_confirmed': return '🤝 Время оплаты наличными подтверждено'
      default: return type
    }
  }

  // Состояния для редактора слотов
  const [newSlotDay, setNewSlotDay] = useState<number>(0)
  const [newSlotTimeFrom, setNewSlotTimeFrom] = useState<string>('')
  const [newSlotTimeTo, setNewSlotTimeTo] = useState<string>('')

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
        objects.map((obj) => {
          const objMeters = objectMeters[obj.id] || []
          const contract = obj.contract
          
          return (
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

              {/* ⚙️ Счётчики */}
              {contract && (
                <div style={styles.subCard}>
                  <div style={styles.subCardTitle}>⚙️ Счётчики</div>
                  {meterTypes.map(mt => {
                    const om = objMeters.find(m => m.meter_type_id === mt.id)
                    const isActive = !!om?.is_active
                    return (
                      <div key={mt.id} style={styles.meterRow}>
                        <label style={styles.meterLabel}>
                          <input
                            type="checkbox"
                            checked={isActive}
                            onChange={() => toggleMeter(obj.id, mt.id)}
                          />
                          {' '}{mt.label} ({mt.unit})
                        </label>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 💵 Способ оплаты */}
              {contract && (
                <div style={styles.subCard}>
                  <div style={styles.subCardTitle}>💵 Способ оплаты</div>
                  <div style={styles.methodRow}>
                    <label style={styles.methodLabel}>
                      <input
                        type="radio"
                        name={`payment-method-${obj.id}`}
                        value="card"
                        checked={contract.payment_method === 'card'}
                        onChange={() => updatePaymentMethod(contract.id, 'card')}
                      />
                      {' '}Карта
                    </label>
                    <label style={styles.methodLabel}>
                      <input
                        type="radio"
                        name={`payment-method-${obj.id}`}
                        value="cash"
                        checked={contract.payment_method === 'cash'}
                        onChange={() => updatePaymentMethod(contract.id, 'cash')}
                      />
                      {' '}Наличные
                    </label>
                  </div>
                  
                  {contract.payment_method === 'cash' && (
                    <div style={styles.slotsEditor}>
                      <div style={styles.slotsList}>
                        {(contract.cash_slots as CashSlot[] || []).map((slot: CashSlot, idx: number) => (
                          <div key={idx} style={styles.slotItem}>
                            <span>{DAYS_OF_WEEK[slot.day]} {slot.time_from}–{slot.time_to}</span>
                            <button
                              onClick={() => {
                                const newSlots = (contract.cash_slots as CashSlot[]).filter((_: CashSlot, i: number) => i !== idx)
                                saveCashSlots(contract.id, newSlots)
                              }}
                              style={styles.deleteButton}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      <div style={styles.addSlotForm}>
                        <select
                          value={newSlotDay}
                          onChange={(e) => setNewSlotDay(Number(e.target.value))}
                          style={styles.select}
                        >
                          {DAYS_OF_WEEK.map((d, i) => (
                            <option key={i} value={i}>{d}</option>
                          ))}
                        </select>
                        <input
                          type="time"
                          value={newSlotTimeFrom}
                          onChange={(e) => setNewSlotTimeFrom(e.target.value)}
                          style={styles.timeInput}
                        />
                        <input
                          type="time"
                          value={newSlotTimeTo}
                          onChange={(e) => setNewSlotTimeTo(e.target.value)}
                          style={styles.timeInput}
                        />
                        <button
                          onClick={() => {
                            const currentSlots = contract.cash_slots as CashSlot[] || []
                            const newSlots = [...currentSlots, { day: newSlotDay, time_from: newSlotTimeFrom, time_to: newSlotTimeTo }]
                            saveCashSlots(contract.id, newSlots)
                            setNewSlotDay(0)
                            setNewSlotTimeFrom('')
                            setNewSlotTimeTo('')
                          }}
                          style={styles.addButton}
                        >
                          Добавить
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 🤝 Оплата наличными */}
              {contract && contract.payment_method === 'cash' && (
                <div style={styles.subCard}>
                  <div style={styles.subCardTitle}>🤝 Оплата наличными</div>
                  <CashMeetingsList
                    contractId={contract.id}
                    tenantId={contract.tenant_id}
                    onConfirm={confirmCashMeeting}
                  />
                </div>
              )}
            </div>
          )
        })
      )}

      {/* 🔔 Уведомления */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>🔔 Уведомления</div>
        {notifications.length === 0 ? (
          <p style={styles.empty}>Нет уведомлений</p>
        ) : (
          notifications.map(n => (
            <div key={n.id} style={styles.notificationItem}>
              {getNotificationText(n.type)}
            </div>
          ))
        )}
      </div>
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
  cardTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '12px',
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
  subCard: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #eee',
  },
  subCardTitle: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '12px',
  },
  meterRow: {
    marginBottom: '8px',
  },
  meterLabel: {
    fontSize: '14px',
    cursor: 'pointer',
  },
  methodRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '12px',
  },
  methodLabel: {
    fontSize: '14px',
    cursor: 'pointer',
  },
  slotsEditor: {
    marginTop: '8px',
  },
  slotsList: {
    marginBottom: '12px',
  },
  slotItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px',
    backgroundColor: '#f9f9f9',
    borderRadius: '6px',
    marginBottom: '6px',
    fontSize: '14px',
  },
  deleteButton: {
    background: '#ff5252',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '4px 8px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  addSlotForm: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  select: {
    padding: '6px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    fontSize: '14px',
  },
  timeInput: {
    padding: '6px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    fontSize: '14px',
  },
  addButton: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: 'none',
    background: '#2196f3',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
  },
  notificationItem: {
    padding: '8px',
    borderBottom: '1px solid #eee',
    fontSize: '14px',
    color: '#555',
  },
}

// Компонент списка заявок на наличную оплату
function CashMeetingsList({ contractId, tenantId, onConfirm }: { contractId: string, tenantId: string, onConfirm: (id: string, cid: string, tid: string) => void }) {
  const [meetings, setMeetings] = useState<CashMeeting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadMeetings() {
      const { data } = await supabase
        .from('cash_meetings')
        .select('*')
        .eq('contract_id', contractId)
        .eq('status', 'proposed')
        .order('created_at', { ascending: false })
      
      if (data) setMeetings(data)
      setLoading(false)
    }
    loadMeetings()
  }, [contractId])

  if (loading) return <div style={styles.empty}>Загрузка...</div>
  if (meetings.length === 0) return <div style={styles.empty}>Нет заявок</div>

  return (
    <div>
      {meetings.map(m => (
        <div key={m.id} style={styles.slotItem}>
          <span>{DAYS_OF_WEEK[m.day]} {m.time_from}–{m.time_to}</span>
          <button
            onClick={() => onConfirm(m.id, contractId, tenantId)}
            style={{ ...styles.confirmButton, marginTop: 0, width: 'auto', padding: '6px 12px', fontSize: '13px' }}
          >
            Подтвердить
          </button>
        </div>
      ))}
    </div>
  )
}

export default LandlordDashboard
