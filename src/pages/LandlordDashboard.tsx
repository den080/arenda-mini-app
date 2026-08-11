import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import type { Object as PropertyObject, MeterType, ObjectMeter, Contract, CashMeeting, NotificationLog } from '../types/database'

interface ObjectWithStatus extends PropertyObject {
  status: 'paid' | 'overdue' | 'pending' | 'no_contract'
  amount: number
  paymentId: string | null
  contract?: Contract & { tenant_id: string }
}

interface NotificationItem extends NotificationLog {
  users?: { full_name: string }
}

export function LandlordDashboard() {
  const { user, loading: userLoading } = useTelegramUser()
  const [objects, setObjects] = useState<ObjectWithStatus[]>([])
  const [meterTypes, setMeterTypes] = useState<MeterType[]>([])
  const [objectMeters, setObjectMeters] = useState<Record<string, ObjectMeter[]>>({})
  const [contracts, setContracts] = useState<Record<string, Contract & { tenant_id: string }>>({})
  const [cashMeetings, setCashMeetings] = useState<CashMeeting[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Local state for editing cash slots
  const [newSlot, setNewSlot] = useState<Record<string, { day: string; time_from: string; time_to: string }>>({})

  useEffect(() => {
    if (!user) return

    async function fetchData() {
      try {
        // Load meter types
        const { data: mtData } = await supabase.from('meter_types').select('*')
        if (mtData) setMeterTypes(mtData)

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
        const contractsMap: Record<string, Contract & { tenant_id: string }> = {}
        const objectMetersMap: Record<string, ObjectMeter[]> = {}

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

          contractsMap[obj.id] = contract as Contract & { tenant_id: string }

          // Load object meters for this object
          const { data: omData } = await supabase
            .from('object_meters')
            .select('*')
            .eq('object_id', obj.id)
          objectMetersMap[obj.id] = omData || []

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

        setObjects(objectsWithStatus)
        setContracts(contractsMap)
        setObjectMeters(objectMetersMap)

        // Load cash meetings for all contracts
        const contractIds = Object.values(contractsMap).map(c => c.id)
        if (contractIds.length > 0) {
          const { data: cmData } = await supabase
            .from('cash_meetings')
            .select('*')
            .in('contract_id', contractIds)
            .eq('status', 'proposed')
          if (cmData) setCashMeetings(cmData)
        }

        // Load notifications
        const { data: notifData } = await supabase
          .from('notifications_log')
          .select('*, users(full_name)')
          .eq('user_id', user!.id)
          .order('sent_at', { ascending: false })
          .limit(5)
        if (notifData) setNotifications(notifData as NotificationItem[])

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
      // Add notification for tenant
      const obj = objects.find(o => o.id === objId)
      const contract = obj?.contract
      if (contract) {
        await supabase.from('notifications_log').insert({
          user_id: contract.tenant_id,
          type: 'payment_confirmed',
          related_id: paymentId,
          sent_at: new Date().toISOString(),
        })
      }
      setObjects(prev => prev.map(o => (o.id === objId ? { ...o, status: 'paid' as const } : o)))
    } else {
      alert('Не удалось подтвердить: ' + updError.message)
    }
  }

  async function toggleMeter(objId: string, meterTypeId: string) {
    const existing = objectMeters[objId]?.find(m => m.meter_type_id === meterTypeId)
    if (existing) {
      const { error } = await supabase
        .from('object_meters')
        .update({ is_active: !existing.is_active })
        .eq('id', existing.id)
      if (!error) {
        setObjectMeters(prev => ({
          ...prev,
          [objId]: prev[objId].map(m => m.id === existing.id ? { ...m, is_active: !m.is_active } : m),
        }))
      }
    } else {
      const { error, data } = await supabase
        .from('object_meters')
        .insert({ object_id: objId, meter_type_id: meterTypeId, is_active: true })
        .select()
      if (!error && data) {
        setObjectMeters(prev => ({
          ...prev,
          [objId]: [...(prev[objId] || []), data[0]],
        }))
      }
    }
  }

  async function updatePaymentMethod(objId: string, method: 'card' | 'cash') {
    const contract = contracts[objId]
    if (!contract) return
    const { error } = await supabase
      .from('contracts')
      .update({ payment_method: method })
      .eq('id', contract.id)
    if (!error) {
      setContracts(prev => ({ ...prev, [objId]: { ...prev[objId], payment_method: method } }))
    }
  }

  async function saveSlot(objId: string) {
    const contract = contracts[objId]
    if (!contract || !newSlot[objId]) return
    const slot = {
      day: Number(newSlot[objId].day),
      time_from: newSlot[objId].time_from,
      time_to: newSlot[objId].time_to,
    }
    const currentSlots = contract.cash_slots || []
    const updatedSlots = [...currentSlots, slot]
    const { error } = await supabase
      .from('contracts')
      .update({ cash_slots: updatedSlots })
      .eq('id', contract.id)
    if (!error) {
      setContracts(prev => ({ ...prev, [objId]: { ...prev[objId], cash_slots: updatedSlots } }))
      setNewSlot(prev => ({ ...prev, [objId]: { day: '1', time_from: '', time_to: '' } }))
    }
  }

  async function removeSlot(objId: string, index: number) {
    const contract = contracts[objId]
    if (!contract) return
    const currentSlots = contract.cash_slots || []
    const updatedSlots = currentSlots.filter((_, i) => i !== index)
    const { error } = await supabase
      .from('contracts')
      .update({ cash_slots: updatedSlots })
      .eq('id', contract.id)
    if (!error) {
      setContracts(prev => ({ ...prev, [objId]: { ...prev[objId], cash_slots: updatedSlots } }))
    }
  }

  async function confirmCashMeeting(meetingId: string, tenantId: string) {
    const { error } = await supabase
      .from('cash_meetings')
      .update({ status: 'confirmed' })
      .eq('id', meetingId)
    if (!error) {
      await supabase.from('notifications_log').insert({
        user_id: tenantId,
        type: 'cash_confirmed',
        related_id: meetingId,
        sent_at: new Date().toISOString(),
      })
      setCashMeetings(prev => prev.filter(m => m.id !== meetingId))
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

  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  const getNotificationText = (type: string) => {
    switch (type) {
      case 'payment_claimed': return '✅ Арендатор сообщил об оплате'
      case 'payment_confirmed': return '🟢 Арендодатель подтвердил оплату'
      case 'meter_submitted': return '💦 Переданы новые показания'
      case 'cash_proposed': return '💵 Арендатор предложил время оплаты наличными'
      case 'cash_confirmed': return '🤝 Время оплаты наличными подтверждено'
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
        objects.map((obj) => {
          const contract = obj.contract
          const objMeters = objectMeters[obj.id] || []
          const objCashMeetings = cashMeetings.filter(m => m.contract_id === contract?.id)
          
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

              {/* Счётчики */}
              <div style={styles.subCard}>
                <div style={styles.subTitle}>⚙️ Счётчики</div>
                {meterTypes.map(mt => {
                  const active = objMeters.some(m => m.meter_type_id === mt.id && m.is_active)
                  return (
                    <label key={mt.id} style={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleMeter(obj.id, mt.id)}
                      />
                      <span>{mt.label}</span>
                    </label>
                  )
                })}
              </div>

              {/* Способ оплаты */}
              {contract && (
                <div style={styles.subCard}>
                  <div style={styles.subTitle}>💵 Способ оплаты</div>
                  <div style={styles.radioGroup}>
                    <label style={styles.radioLabel}>
                      <input
                        type="radio"
                        name={`payment_method_${obj.id}`}
                        value="card"
                        checked={contract.payment_method === 'card'}
                        onChange={() => updatePaymentMethod(obj.id, 'card')}
                      />
                      Карта
                    </label>
                    <label style={styles.radioLabel}>
                      <input
                        type="radio"
                        name={`payment_method_${obj.id}`}
                        value="cash"
                        checked={contract.payment_method === 'cash'}
                        onChange={() => updatePaymentMethod(obj.id, 'cash')}
                      />
                      Наличные
                    </label>
                  </div>
                  {contract.payment_method === 'cash' && (
                    <div>
                      <div style={styles.small}>Слоты для оплаты:</div>
                      {(contract.cash_slots || []).map((slot, idx) => (
                        <div key={idx} style={styles.slotRow}>
                          <span>{dayNames[slot.day - 1]} {slot.time_from}–{slot.time_to}</span>
                          <button onClick={() => removeSlot(obj.id, idx)} style={styles.removeBtn}>✕</button>
                        </div>
                      ))}
                      <div style={styles.addSlotForm}>
                        <select
                          value={newSlot[obj.id]?.day || '1'}
                          onChange={(e) => setNewSlot(prev => ({ ...prev, [obj.id]: { ...prev[obj.id], day: e.target.value } }))}
                          style={styles.select}
                        >
                          {dayNames.map((d, i) => (
                            <option key={i} value={i + 1}>{d}</option>
                          ))}
                        </select>
                        <input
                          type="time"
                          value={newSlot[obj.id]?.time_from || ''}
                          onChange={(e) => setNewSlot(prev => ({ ...prev, [obj.id]: { ...prev[obj.id], time_from: e.target.value } }))}
                          style={styles.timeInput}
                        />
                        <input
                          type="time"
                          value={newSlot[obj.id]?.time_to || ''}
                          onChange={(e) => setNewSlot(prev => ({ ...prev, [obj.id]: { ...prev[obj.id], time_to: e.target.value } }))}
                          style={styles.timeInput}
                        />
                        <button onClick={() => saveSlot(obj.id)} style={styles.addBtn}>Добавить</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Оплата наличными - заявки */}
              {contract && objCashMeetings.length > 0 && (
                <div style={styles.subCard}>
                  <div style={styles.subTitle}>🤝 Оплата наличными</div>
                  {objCashMeetings.map(meeting => (
                    <div key={meeting.id} style={styles.slotRow}>
                      <span>{dayNames[meeting.day - 1]} {meeting.time_from}–{meeting.time_to}</span>
                      <button onClick={() => confirmCashMeeting(meeting.id, contract.tenant_id)} style={styles.confirmSmallBtn}>✓</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}

      {/* Уведомления */}
      <div style={styles.card}>
        <div style={styles.h2}>🔔 Уведомления</div>
        {notifications.length === 0 ? (
          <div style={styles.empty}>Нет уведомлений</div>
        ) : (
          notifications.map(n => (
            <div key={n.id} style={styles.notifRow}>
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
  subCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
    padding: '12px',
    marginTop: '12px',
    borderTop: '1px solid #eee',
  },
  subTitle: {
    fontSize: '15px',
    fontWeight: '700',
    marginBottom: '8px',
  },
  h2: {
    fontSize: '17px',
    fontWeight: '700',
    marginBottom: '10px',
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
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    marginBottom: '6px',
    cursor: 'pointer',
  },
  radioGroup: {
    display: 'flex',
    gap: '16px',
    marginBottom: '10px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  small: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '6px',
  },
  slotRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '14px',
    padding: '6px 0',
    borderBottom: '1px solid #eee',
  },
  removeBtn: {
    background: '#f44336',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  addSlotForm: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
    flexWrap: 'wrap' as const,
  },
  select: {
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    fontSize: '13px',
  },
  timeInput: {
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    fontSize: '13px',
  },
  addBtn: {
    background: '#2196f3',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  confirmSmallBtn: {
    background: '#4caf50',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  notifRow: {
    fontSize: '14px',
    padding: '8px 0',
    borderBottom: '1px solid #eee',
  },
}

export default LandlordDashboard
