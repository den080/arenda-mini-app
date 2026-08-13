import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import type { Object as PropertyObject, Contract, MeterType, ObjectMeter, NotificationLog, CashSlot, CashMeeting, Payment, User } from '../types/database'

interface ObjectWithStatus extends PropertyObject {
  status: 'paid' | 'overdue' | 'pending' | 'no_contract' | 'no_payment'
  statusDetail?: string
  statusColor?: string
  amount: number
  baseAmount?: number
  penaltyAmount?: number
  utilitiesAmount?: number
  paymentId: string | null
  contract?: Contract & { tenant?: User }
  cashMeetings?: CashMeeting[]
  payment?: Payment
  daysOverdue?: number
  waitingForReadings?: boolean
  needUtilitiesReminder?: boolean
  readingsMode?: string
  bgColor?: string
  deferredTotal?: number
  deferredRequests?: any[]
}

const DAYS_OF_WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function parseDate(d: any): Date {
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, dd || 1)
}

function formatSlotDate(d: any): string {
  const dt = parseDate(d)
  const wd = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][dt.getDay()]
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()} (${wd})`
}

export function LandlordDashboard() {
  const { user, loading: userLoading } = useTelegramUser()
  const [objects, setObjects] = useState<ObjectWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meterTypes, setMeterTypes] = useState<MeterType[]>([])
  const [objectMeters, setObjectMeters] = useState<Record<string, ObjectMeter[]>>({})
  const [notifications, setNotifications] = useState<NotificationLog[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [utilInputs, setUtilInputs] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<any[]>([])
  const [statsPeriod, setStatsPeriod] = useState<'6m' | '12m'>('6m')
  const [statsObject, setStatsObject] = useState<string>('all')

  const [newSlotDay, setNewSlotDay] = useState<number>(0)
  const [newSlotDate, setNewSlotDate] = useState<string>('')
  const [newSlotTimeFrom, setNewSlotTimeFrom] = useState<string>('')
  const [newSlotTimeTo, setNewSlotTimeTo] = useState<string>('')

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    if (!user) return

    async function fetchData() {
      try {
        const { data: mtData } = await supabase.from('meter_types').select('*')
        if (mtData) setMeterTypes(mtData)

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
          setHistory([])
          setLoading(false)
          return
        }

        const objectsWithStatus: ObjectWithStatus[] = []
        const allObjectMeters: Record<string, ObjectMeter[]> = {}
        const allHistory: any[] = []

        const today = new Date()
        const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        const currentMonth = today.getMonth()
        const currentYear = today.getFullYear()

        for (const obj of objectsData) {
          const { data: contract } = await supabase
            .from('contracts')
            .select('*, tenant:users!tenant_id(full_name, phone)')
            .eq('object_id', obj.id)
            .eq('status', 'active')
            .maybeSingle()

          const { data: omData } = await supabase
            .from('object_meters')
            .select('*')
            .eq('object_id', obj.id)
          allObjectMeters[obj.id] = omData || []

          if (!contract) {
            objectsWithStatus.push({ ...obj, status: 'no_contract', amount: 0, paymentId: null, statusColor: '#888', statusDetail: 'Нет договора', bgColor: '#fff' })
            continue
          }

          const readingsMode = contract.readings_mode || 'manual'
          const reminder = contract.reminder_days_before || 3

          const { data: allPays } = await supabase
            .from('payments')
            .select('*')
            .eq('contract_id', contract.id)
          for (const p of allPays || []) {
            allHistory.push({ ...p, objId: obj.id, address: obj.address })
          }

          const { data: dReq } = await supabase
            .from('deferred_requests').select('*')
            .eq('contract_id', contract.id).eq('status', 'proposed')
          const { data: dDebts } = await supabase
            .from('deferred_debts').select('*')
            .eq('contract_id', contract.id)
          const deferredTotal = (dDebts || []).reduce((s2: number, d: any) => s2 + Number(d.amount || 0), 0)

          const { data: payment } = await supabase
            .from('payments')
            .select('*')
            .eq('contract_id', contract.id)
            .order('period', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (!payment) {
            objectsWithStatus.push({
              ...obj,
              status: 'no_payment',
              statusDetail: 'Платёж не создан',
              statusColor: '#a80',
              amount: contract.rent_amount,
              baseAmount: contract.rent_amount,
              penaltyAmount: 0,
              utilitiesAmount: 0,
              paymentId: null,
              contract,
              bgColor: '#fdf6e3',
              readingsMode,
              deferredTotal,
              deferredRequests: dReq || []
            })
            continue
          }

          const dueMid = parseDate(payment.due_date)
          const sd = contract.start_date ? parseDate(contract.start_date) : null
          const firstMonthGrace = !!sd && dueMid.getMonth() === sd.getMonth() && dueMid.getFullYear() === sd.getFullYear() && todayMid < new Date(sd.getFullYear(), sd.getMonth() + 1, 1)
          const isOverdue = todayMid > dueMid && !firstMonthGrace
          const daysUntilDue = firstMonthGrace && todayMid > dueMid ? 0 : Math.round((dueMid.getTime() - todayMid.getTime()) / 86400000)

          const baseAmount = payment.base_amount || contract.rent_amount
          const penaltyAmount = payment.penalty_amount || 0
          const utilitiesAmount = Number(payment.utilities_amount || 0)
          const paymentId = String(payment.id)

          let waitingForReadings = false
          if (readingsMode === 'manual' && contract.meter_deadline_day && today.getDate() > contract.meter_deadline_day) {
            const { data: readingsData } = await supabase
              .from('meter_readings')
              .select('*')
              .eq('contract_id', contract.id)
              .gte('submitted_at', new Date(currentYear, currentMonth, 1).toISOString())
              .lt('submitted_at', new Date(currentYear, currentMonth + 1, 1).toISOString())

            if (!readingsData || readingsData.length === 0) {
              waitingForReadings = true
            }
          }

          const needUtilitiesReminder = !payment.confirmed_by_landlord && readingsMode !== 'self'
            && daysUntilDue >= 0 && daysUntilDue <= reminder && utilitiesAmount === 0

          let status: 'paid' | 'overdue' | 'pending' = 'pending'
          let statusDetail = ''
          let statusColor = '#a80'
          let bgColor = '#fff'

          if (!payment.confirmed_by_landlord) {
            if (isOverdue) {
              status = 'overdue'
              const daysOverdue = Math.round((todayMid.getTime() - dueMid.getTime()) / 86400000)
              statusDetail = `Просрочка ${daysOverdue} дн.`
              statusColor = '#c00'
              bgColor = '#fdecea'
            } else if (waitingForReadings) {
              statusDetail = 'Ждём показания'
              statusColor = '#a80'
              bgColor = '#fdf6e3'
            } else if (daysUntilDue === 0) {
              statusDetail = firstMonthGrace ? 'Первый месяц — просрочка не начисляется' : 'Сегодня последний день оплаты'
              statusColor = '#a80'
              bgColor = '#fdf6e3'
            } else if (daysUntilDue <= reminder) {
              statusDetail = `До оплаты ${daysUntilDue} дн.`
              statusColor = '#a80'
              bgColor = '#fdf6e3'
            } else {
              statusDetail = `До оплаты ${daysUntilDue} дн.`
              statusColor = '#080'
              bgColor = '#eaf7ef'
            }
          } else {
            status = 'paid'
            const periodDate = parseDate(payment.period)
            const nextDue = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, contract.payment_day || 1)
            const daysLeft = Math.round((nextDue.getTime() - todayMid.getTime()) / 86400000)
            if (daysLeft < 0) {
              statusDetail = `Следующий платёж просрочен на ${-daysLeft} дн.`
              statusColor = '#c00'
              bgColor = '#fdecea'
            } else if (daysLeft === 0) {
              statusDetail = 'Следующая оплата: сегодня последний день'
              statusColor = '#a80'
              bgColor = '#fdf6e3'
            } else if (daysLeft <= reminder) {
              statusDetail = `${daysLeft} дн. до следующей оплаты`
              statusColor = '#a80'
              bgColor = '#fdf6e3'
            } else {
              statusDetail = `${daysLeft} дн. до следующей оплаты`
              statusColor = '#080'
              bgColor = '#eaf7ef'
            }
          }

          objectsWithStatus.push({
            ...obj,
            status,
            statusDetail,
            statusColor,
            amount: baseAmount + penaltyAmount + utilitiesAmount,
            baseAmount,
            penaltyAmount,
            utilitiesAmount,
            paymentId,
            contract,
            payment,
            daysOverdue: isOverdue ? Math.round((todayMid.getTime() - dueMid.getTime()) / 86400000) : undefined,
            waitingForReadings,
            needUtilitiesReminder,
            readingsMode,
            bgColor,
            deferredTotal,
            deferredRequests: dReq || []
          })
        }

        setObjectMeters(allObjectMeters)
        setHistory(allHistory)

        const sortedObjects = objectsWithStatus.sort((a, b) => {
          const order: Record<string, number> = { overdue: 0, pending: 1, no_payment: 1.5, paid: 2, no_contract: 3 }
          const colorOrder = (o: ObjectWithStatus) => o.statusColor === '#c00' ? 0 : o.statusColor === '#a80' ? 1 : 2
          const so = (order[a.status] ?? 9) - (order[b.status] ?? 9)
          return so !== 0 ? so : colorOrder(a) - colorOrder(b)
        })

        setObjects(sortedObjects)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const onRefresh = () => fetchData()
    window.addEventListener('rentflow-refresh', onRefresh)
    const interval = setInterval(() => fetchData(), 30000)
    return () => {
      window.removeEventListener('rentflow-refresh', onRefresh)
      clearInterval(interval)
    }
  }, [user])

  async function setMeterActive(objId: string, code: string, active: boolean) {
    const mt = meterTypes.find(t => t.code === code)
    if (!mt) return
    const existing = (objectMeters[objId] || []).find(om => om.meter_type_id === mt.id)
    if (existing) {
      if (!!existing.is_active !== active) {
        const { error } = await supabase.from('object_meters').update({ is_active: active }).eq('id', existing.id)
        if (!error) {
          setObjectMeters(prev => ({
            ...prev,
            [objId]: (prev[objId] || []).map(om => om.id === existing.id ? { ...om, is_active: active } : om)
          }))
        }
      }
    } else if (active) {
      const { data, error } = await supabase.from('object_meters').insert({ object_id: objId, meter_type_id: mt.id, is_active: true }).select()
      if (!error && data) {
        setObjectMeters(prev => ({ ...prev, [objId]: [...(prev[objId] || []), data[0]] }))
      }
    }
  }

  function isMeterActive(objId: string, code: string): boolean {
    const mt = meterTypes.find(t => t.code === code)
    if (!mt) return false
    return !!(objectMeters[objId] || []).find(om => om.meter_type_id === mt.id && om.is_active)
  }

  function getElecMode(objId: string): string {
    if (isMeterActive(objId, 'electricity_peak') && isMeterActive(objId, 'electricity_semipeak') && isMeterActive(objId, 'electricity_night')) return '3'
    if (isMeterActive(objId, 'electricity_day') && isMeterActive(objId, 'electricity_night')) return '2'
    if (isMeterActive(objId, 'electricity_single')) return '1'
    return 'none'
  }

  async function setElecMode(objId: string, mode: string) {
    const need: Record<string, string[]> = {
      'none': [],
      '1': ['electricity_single'],
      '2': ['electricity_day', 'electricity_night'],
      '3': ['electricity_peak', 'electricity_semipeak', 'electricity_night'],
    }
    const all = ['electricity_single', 'electricity_day', 'electricity_night', 'electricity_peak', 'electricity_semipeak']
    for (const code of all) {
      await setMeterActive(objId, code, (need[mode] || []).includes(code))
    }
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function confirmPayment(_objId: string, paymentId: string) {
    const { error: updError } = await supabase
      .from('payments')
      .update({ confirmed_by_landlord: true, confirmed_at: new Date().toISOString() })
      .eq('id', paymentId)

    if (!updError) {
      window.dispatchEvent(new Event('rentflow-refresh'))
    } else {
      alert('Не удалось подтвердить: ' + updError.message)
    }
  }

  async function saveUtilities(paymentId: string, value: string) {
    const { error } = await supabase
      .from('payments')
      .update({ utilities_amount: Number(value) || 0 })
      .eq('id', paymentId)
    if (error) {
      alert('Ошибка: ' + error.message)
    } else {
      window.dispatchEvent(new Event('rentflow-refresh'))
    }
  }

  async function confirmDeferral(requestId: string, contractId: string, paymentId: string, amount: number, tenantId: string) {
    const { error: e1 } = await supabase.from('deferred_debts').insert({ contract_id: contractId, amount })
    if (e1) { alert('Ошибка: ' + e1.message); return }
    await supabase.from('deferred_requests').update({ status: 'confirmed' }).eq('id', requestId)
    if (paymentId) {
      const { data: pay } = await supabase.from('payments').select('penalty_amount').eq('id', paymentId).maybeSingle()
      const newPenalty = Math.max(0, Number(pay?.penalty_amount || 0) - amount)
      await supabase.from('payments').update({ penalty_amount: newPenalty }).eq('id', paymentId)
    }
    await supabase.from('notifications_log').insert({
      user_id: tenantId, type: 'deferred_confirmed', related_id: contractId, sent_at: new Date().toISOString()
    })
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function updatePaymentMethod(contractId: string, method: 'card' | 'cash' | 'both') {
    const updateData: any = { payment_method: method }
    if (method === 'cash') {
      updateData.cash_slots = []
    }

    const { error } = await supabase
      .from('contracts')
      .update(updateData)
      .eq('id', contractId)

    if (!error) {
      setObjects(prev => prev.map(o =>
        o.contract?.id === contractId
          ? { ...o, contract: { ...o.contract!, payment_method: method, cash_slots: method === 'cash' ? [] : o.contract!.cash_slots } }
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

  async function confirmCashMeeting(meetingId: string, _contractId: string, tenantId: string) {
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
        alert('Время подтверждено')
        window.dispatchEvent(new Event('rentflow-refresh'))
      }
    } else {
      alert('Ошибка: ' + meetError.message)
    }
  }
  const getStatusIcon = (color?: string) => {
    if (color === '#c00') return '🔴'
    if (color === '#a80') return '🟡'
    if (color === '#080') return '🟢'
    return '⚪'
  }

  const getNotificationText = (type: string) => {
    switch (type) {
      case 'payment_claimed': return '✅ Арендатор сообщил об оплате'
      case 'payment_confirmed': return '🟢 Арендодатель подтвердил оплату'
      case 'meter_submitted': return '💦 Переданы новые показания'
      case 'cash_proposed': return '💵 Арендатор предложил время оплаты наличными'
      case 'cash_confirmed': return '🤝 Время оплаты наличными подтверждено'
      case 'deferred_proposed': return '🙏 Арендатор попросил отсрочку штрафа'
      case 'deferred_confirmed': return '🤝 Отсрочка штрафа подтверждена'
      default: return type
    }
  }

  function amountBreakdown(obj: ObjectWithStatus): string {
    const parts: string[] = [`${(obj.baseAmount ?? obj.amount).toFixed(2)}`]
    if (obj.penaltyAmount && obj.penaltyAmount > 0) parts.push(`${obj.penaltyAmount.toFixed(2)} руб штраф`)
    if (obj.utilitiesAmount && obj.utilitiesAmount > 0) parts.push(`${obj.utilitiesAmount.toFixed(2)} руб ресурсы`)
    return parts.join(' + ')
  }

  const todayNow = new Date()
  const todayMidNow = new Date(todayNow.getFullYear(), todayNow.getMonth(), todayNow.getDate())
  const periodStart = statsPeriod === '6m'
    ? new Date(todayMidNow.getFullYear(), todayMidNow.getMonth() - 5, 1)
    : new Date(todayMidNow.getFullYear() - 1, todayMidNow.getMonth(), 1)
  const filteredHistory = history
    .filter(h => (statsObject === 'all' || h.objId === statsObject) && parseDate(h.period) >= periodStart)
    .sort((a, b) => parseDate(b.period).getTime() - parseDate(a.period).getTime())
  const collected = filteredHistory
    .filter(h => h.confirmed_by_landlord)
    .reduce((s: number, h: any) => s + Number(h.base_amount || 0) + Number(h.penalty_amount || 0) + Number(h.utilities_amount || 0), 0)
  const penaltiesAccrued = filteredHistory.reduce((s: number, h: any) => s + Number(h.penalty_amount || 0), 0)
  const confirmedCount = filteredHistory.filter(h => h.confirmed_by_landlord).length
  const onTimeCount = filteredHistory.filter(h => h.confirmed_by_landlord && h.confirmed_at && new Date(h.confirmed_at) <= parseDate(h.due_date)).length
  const onTimePct = confirmedCount > 0 ? Math.round((onTimeCount / confirmedCount) * 100) : 0
  const overdueNow = objects.filter(o => o.statusColor === '#c00').length

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
          const isExpanded = expandedIds.has(obj.id)
          const elecMode = getElecMode(obj.id)
          const tenantChoseCash = contract && (contract.payment_method === 'cash' || (contract.payment_method === 'both' && (contract as any).tenant_pay_method === 'cash'))

          return (
            <div key={obj.id} style={{ ...styles.card, backgroundColor: obj.bgColor || '#fff' }}>
              <div style={styles.cardHeader} onClick={() => toggleExpanded(obj.id)}>
                <div style={{ flex: 1 }}>
                  <div style={styles.address}>
                    {(obj.contract as any)?.deposit_amount > 0 && <span style={{ float: 'right', fontSize: 11, color: 'rgba(0,0,0,0.4)' }}>депозит: {Number((obj.contract as any).deposit_amount).toFixed(0)} ₽</span>}
                    {obj.address}
                    <span style={styles.expandArrow}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {contract && contract.start_date && contract.end_date && <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', marginBottom: 6 }}>Срок аренды: с {parseDate(contract.start_date).toLocaleDateString('ru-RU')} по {parseDate(contract.end_date).toLocaleDateString('ru-RU')} ({Math.max(1, Math.round((parseDate(contract.end_date).getTime() - parseDate(contract.start_date).getTime()) / 2629800000))} мес.)</div>}
                  <div style={styles.statusRow}>
                    <span>{getStatusIcon(obj.statusColor)}</span>
                    <span style={{ ...styles.statusText, color: obj.statusColor || '#666' }}>{obj.statusDetail}</span>
                  </div>
                  {obj.amount > 0 && (
                    <div style={styles.amount}>{amountBreakdown(obj)}</div>
                  )}
                  {!!obj.deferredTotal && obj.deferredTotal > 0 && (
                    <div style={styles.deferredNote}>⚠️ Приостановленный долг: {obj.deferredTotal.toFixed(2)} ₽</div>
                  )}
                </div>
              </div>

              {isExpanded && (
                <>
                  {obj.paymentId && obj.status === 'overdue' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); confirmPayment(String(obj.id), obj.paymentId!) }}
                      style={styles.confirmButton}
                    >
                      ✅ Подтвердить оплату
                    </button>
                  )}

                  {contract && obj.paymentId && !obj.payment?.confirmed_by_landlord && obj.readingsMode !== 'self' && (
                    <div style={styles.subCard}>
                      <div style={styles.subCardTitle}>🧮 Ресурсы по квитанции</div>
                      {obj.needUtilitiesReminder && (
                        <div style={styles.reminderNote}>⏳ Посчитайте ресурсы с квитанции и добавьте сумму к платежу</div>
                      )}
                      <div style={styles.utilRow}>
                        <input
                          type="number"
                          value={utilInputs[obj.id] ?? String(obj.utilitiesAmount || '')}
                          onChange={(e) => setUtilInputs({ ...utilInputs, [obj.id]: e.target.value })}
                          placeholder="Сумма по квитанции, ₽"
                          style={styles.utilInput}
                          inputMode="numeric"
                        />
                        <button
                          onClick={() => saveUtilities(obj.paymentId!, utilInputs[obj.id] ?? String(obj.utilitiesAmount || 0))}
                          style={styles.addButton}
                        >
                          Включить в платёж
                        </button>
                      </div>
                      <div style={styles.smallNote}>Сумма добавляется к платежу отдельно, не растёт при просрочке и не входит в штрафы</div>
                    </div>
                  )}

                  {contract && (obj.deferredRequests || []).length > 0 && (
                    <div style={styles.subCard}>
                      <div style={styles.subCardTitle}>🙏 Отсрочка штрафа</div>
                      {(obj.deferredRequests || []).map((r: any) => (
                        <div key={r.id} style={styles.slotItem}>
                          <span>Арендатор просит отсрочить {Number(r.amount).toFixed(2)} ₽</span>
                          <button
                            onClick={() => confirmDeferral(r.id, contract.id, r.payment_id, Number(r.amount), contract.tenant_id)}
                            style={{ ...styles.confirmButton, marginTop: 0, width: 'auto', padding: '6px 12px', fontSize: '13px', background: '#ff9800' }}
                          >
                            Подтвердить
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {contract && (
                    <div style={styles.subCard}>
                      <div style={styles.subCardTitle}>⚙️ Счётчики</div>
                      <div style={styles.smallNote}>⚡ Электричество</div>
                      {[
                        { v: 'none', l: 'Не установлено' },
                        { v: '1', l: '1-тарифный' },
                        { v: '2', l: '2-тарифный (день/ночь)' },
                        { v: '3', l: '3-тарифный (пик/полупик/ночь)' },
                      ].map(opt => (
                        <div key={opt.v} style={styles.meterRow}>
                          <label style={styles.meterLabel}>
                            <input
                              type="radio"
                              name={`elec-${obj.id}`}
                              checked={elecMode === opt.v}
                              onChange={() => setElecMode(obj.id, opt.v)}
                            />
                            {' '}{opt.l}
                          </label>
                        </div>
                      ))}
                      <div style={styles.smallNote}>💧 Вода</div>
                      <div style={styles.meterRow}>
                        <label style={styles.meterLabel}>
                          <input type="checkbox" checked={isMeterActive(obj.id, 'water_cold')} onChange={(e) => { setMeterActive(obj.id, 'water_cold', e.target.checked); window.dispatchEvent(new Event('rentflow-refresh')) }} />
                          {' '}Холодная
                        </label>
                      </div>
                      <div style={styles.meterRow}>
                        <label style={styles.meterLabel}>
                          <input type="checkbox" checked={isMeterActive(obj.id, 'water_hot')} onChange={(e) => { setMeterActive(obj.id, 'water_hot', e.target.checked); window.dispatchEvent(new Event('rentflow-refresh')) }} />
                          {' '}Горячая
                        </label>
                      </div>
                      <div style={styles.smallNote}>🔥 Отопление</div>
                      <div style={styles.meterRow}>
                        <label style={styles.meterLabel}>
                          <input type="checkbox" checked={isMeterActive(obj.id, 'heat')} onChange={(e) => { setMeterActive(obj.id, 'heat', e.target.checked); window.dispatchEvent(new Event('rentflow-refresh')) }} />
                          {' '}Теплосчётчик установлен
                        </label>
                      </div>
                      {meterTypes.find(t => t.code === 'gas') && (
                        <div style={styles.meterRow}>
                          <label style={styles.meterLabel}>
                            <input type="checkbox" checked={isMeterActive(obj.id, 'gas')} onChange={(e) => { setMeterActive(obj.id, 'gas', e.target.checked); window.dispatchEvent(new Event('rentflow-refresh')) }} />
                            {' '}Газ
                          </label>
                        </div>
                      )}
                    </div>
                  )}

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
                          {' '}Безналичный расчёт
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
                        <label style={styles.methodLabel}>
                          <input
                            type="radio"
                            name={`payment-method-${obj.id}`}
                            value="both"
                            checked={contract.payment_method === 'both'}
                            onChange={() => updatePaymentMethod(contract.id, 'both')}
                          />
                          {' '}Наличный и безналичный расчёт
                        </label>
                      </div>
                      {contract.payment_method === 'both' && (
                        <div style={styles.smallNote}>💡 Способ оплаты выбирает арендатор: карта или наличные.</div>
                      )}

                      {contract.payment_method !== 'card' && (
                        <div style={styles.slotsEditor}>
                          <div style={styles.slotsList}>
                            {(contract.cash_slots as CashSlot[] || []).map((slot: CashSlot, idx: number) => (
                              <div key={idx} style={styles.slotItem}>
                                <span>{(slot as any).date ? formatSlotDate((slot as any).date) : DAYS_OF_WEEK[slot.day]} {slot.time_from}–{slot.time_to}</span>
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
                              type="date"
                              value={newSlotDate}
                              onChange={(e) => setNewSlotDate(e.target.value)}
                              style={styles.select}
                              title="Или укажите конкретную дату"
                            />
                            <input
                              type="time"
                              step={600}
                              value={newSlotTimeFrom}
                              onChange={(e) => setNewSlotTimeFrom(e.target.value)}
                              style={styles.timeInput}
                            />
                            <input
                              type="time"
                              step={600}
                              value={newSlotTimeTo}
                              onChange={(e) => setNewSlotTimeTo(e.target.value)}
                              style={styles.timeInput}
                            />
                            <button
                              onClick={() => {
                                const currentSlots = contract.cash_slots as CashSlot[] || []
                                const newSlots = [...currentSlots, { day: newSlotDay, date: newSlotDate || null, time_from: newSlotTimeFrom, time_to: newSlotTimeTo } as any]
                                saveCashSlots(contract.id, newSlots)
                                setNewSlotDay(0)
                                setNewSlotDate('')
                                setNewSlotTimeFrom('')
                                setNewSlotTimeTo('')
                              }}
                              style={styles.addButton}
                            >
                              Добавить
                            </button>
                          </div>
                          <div style={styles.smallNote}>День недели — для регулярных слотов; дата — для конкретной встречи. Если указана дата, она показывается вместо дня недели.</div>
                        </div>
                      )}
                    </div>
                  )}

                  {contract && tenantChoseCash && (
                    <div style={styles.subCard}>
                      <div style={styles.subCardTitle}>🤝 Оплата наличными</div>
                      <CashMeetingsList
                        contractId={contract.id}
                        tenantId={contract.tenant_id}
                        onConfirm={confirmCashMeeting}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })
      )}

      <div style={styles.card}>
        <div style={styles.cardTitle}>📊 Статистика</div>
        <div style={styles.filtersRow}>
          <select value={statsObject} onChange={(e) => setStatsObject(e.target.value)} style={styles.select}>
            <option value="all">Все объекты</option>
            {objects.map(o => <option key={o.id} value={o.id}>{o.address}</option>)}
          </select>
          <select value={statsPeriod} onChange={(e) => setStatsPeriod(e.target.value as '6m' | '12m')} style={styles.select}>
            <option value="6m">Последние 6 мес</option>
            <option value="12m">Год</option>
          </select>
        </div>
        <div style={styles.statsGrid}>
          <div style={styles.statTile}>
            <div style={styles.statLabel}>Собрано</div>
            <div style={styles.statValue}>{collected.toFixed(0)} ₽</div>
          </div>
          <div style={styles.statTile}>
            <div style={styles.statLabel}>Штрафов начислено</div>
            <div style={{ ...styles.statValue, color: '#c00' }}>{penaltiesAccrued.toFixed(0)} ₽</div>
          </div>
          <div style={styles.statTile}>
            <div style={styles.statLabel}>Оплата вовремя</div>
            <div style={styles.statValue}>{onTimePct}%</div>
          </div>
          <div style={styles.statTile}>
            <div style={styles.statLabel}>Сейчас просрочено</div>
            <div style={{ ...styles.statValue, color: overdueNow > 0 ? '#c00' : '#080' }}>{overdueNow} объект(а)</div>
          </div>
        </div>
        <div style={styles.subCardTitle}>История платежей</div>
        {filteredHistory.length === 0 ? (
          <p style={styles.empty}>Платежей за период нет</p>
        ) : (
          filteredHistory.slice(0, 20).map((h: any) => {
            const late = h.confirmed_by_landlord && h.confirmed_at && new Date(h.confirmed_at) > parseDate(h.due_date)
            const sum = Number(h.base_amount || 0) + Number(h.penalty_amount || 0) + Number(h.utilities_amount || 0)
            return (
              <div key={h.id} style={styles.slotItem}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {h.address}<br />
                  <span style={styles.smallNote}>{parseDate(h.period).toLocaleDateString('ru-RU')} · {h.confirmed_by_landlord ? (late ? 'просрочка' : 'вовремя') : 'не подтверждён'}</span>
                </span>
                <b style={{ color: late ? '#c00' : '#333', whiteSpace: 'nowrap', marginLeft: 8 }}>{sum.toFixed(0)} ₽</b>
              </div>
            )
          })
        )}
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>🔔 Уведомления</div>
        {notifications.length === 0 ? (
          <p style={styles.empty}>Нет уведомлений</p>
        ) : (
          notifications.map(n => (
            <div key={n.id} style={styles.notificationItem}>
              {(n as any).message || getNotificationText(n.type)}
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
  cardHeader: {
    cursor: 'pointer',
    userSelect: 'none',
  },
  expandArrow: {
    fontSize: '12px',
    color: '#999',
    marginLeft: '8px',
  },
  deferredNote: {
    fontSize: '13px',
    color: '#e65100',
    marginTop: '6px',
    fontWeight: 600,
  },
  reminderNote: {
    padding: '8px 10px',
    backgroundColor: '#fff3e0',
    border: '1px solid #ffb74d',
    borderRadius: '8px',
    color: '#e65100',
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '8px',
  },
  smallNote: {
    fontSize: '12px',
    color: '#888',
    marginTop: '6px',
  },
  utilRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  utilInput: {
    flex: 1,
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
  },
  filtersRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginBottom: '12px',
  },
  statTile: {
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
    padding: '10px',
  },
  statLabel: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '4px',
  },
  statValue: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#333',
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
    fontWeight: 600,
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
    gap: '12px',
    marginBottom: '12px',
    flexWrap: 'wrap' as const,
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
    flex: 1,
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
          <span>{(m as any).meeting_date ? formatSlotDate((m as any).meeting_date) : DAYS_OF_WEEK[m.day]} {m.time_from}–{m.time_to}</span>
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
