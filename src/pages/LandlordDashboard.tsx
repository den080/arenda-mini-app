import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import CashNegotiation from '../components/CashNegotiation'
import type { Object as PropertyObject, Contract, MeterType, ObjectMeter, NotificationLog, User } from '../types/database'

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
  payment?: any
  daysOverdue?: number
  waitingForReadings?: boolean
  needUtilitiesReminder?: boolean
  readingsMode?: string
  bgColor?: string
  frozenTotal?: number
  frozenRows?: any[]
  deferredRequests?: any[]
  hasConfirmedCashMeeting?: boolean
}

function parseDate(d: any): Date {
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, dd || 1)
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
  const [expandedFrozen, setExpandedFrozen] = useState<Set<string>>(new Set())
  const [utilInputs, setUtilInputs] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<any[]>([])
  const [statsPeriod, setStatsPeriod] = useState<'6m' | '12m'>('6m')
  const [statsObject, setStatsObject] = useState<string>('all')

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleFrozen(id: string) {
    setExpandedFrozen(prev => {
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

          const { data: fRows } = await supabase
            .from('frozen_penalties').select('*')
            .eq('contract_id', contract.id)
            .order('period', { ascending: true })
          const frozenTotal = (fRows || []).reduce((s2: number, d: any) => s2 + Number(d.amount || 0), 0)

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
              frozenTotal,
              frozenRows: fRows || [],
              deferredRequests: dReq || []
            })
            continue
          }

          const { data: cashMeeting } = await supabase
            .from('cash_meetings')
            .select('*')
            .eq('contract_id', contract.id)
            .eq('kind', 'meeting')
            .eq('status', 'confirmed')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

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
            frozenTotal,
            frozenRows: fRows || [],
            deferredRequests: dReq || [],
            hasConfirmedCashMeeting: !!cashMeeting
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

  // Подтверждение отсрочки: штраф месяца уходит в книгу замороженных штрафов
  async function confirmDeferral(requestId: string, contractId: string, paymentId: string, amount: number, tenantId: string) {
    const { data: pay } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle()
    const { error: e1 } = await supabase.from('frozen_penalties').insert({
      contract_id: contractId,
      payment_id: paymentId,
      period: pay ? pay.period : null,
      amount,
      original_amount: amount,
      note: 'отсрочка штрафа подтверждена',
    })
    if (e1) { alert('Ошибка: ' + e1.message); return }
    await supabase.from('deferred_requests').update({ status: 'confirmed' }).eq('id', requestId)
    if (paymentId) {
      const newPenalty = Math.max(0, Number(pay?.penalty_amount || 0) - amount)
      await supabase.from('payments').update({ penalty_amount: newPenalty }).eq('id', paymentId)
    }
    await supabase.from('notifications_log').insert({
      user_id: tenantId, type: 'deferred_confirmed', related_id: contractId,
      message: `🧊 Штраф ${Number(amount).toFixed(0)} ₽ заморожен и будет учтён в конце договора`,
      sent_at: new Date().toISOString(),
    })
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  // Заморозить текущий штраф месяца вручную
  async function freezePenalty(paymentId: string) {
    const { data: pay } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle()
    if (!pay) return
    const pen = Number(pay.penalty_amount || 0)
    if (pen <= 0) { alert('Нет штрафа для заморозки'); return }
    const { error } = await supabase.from('frozen_penalties').insert({
      contract_id: pay.contract_id,
      payment_id: pay.id,
      period: pay.period,
      amount: pen,
      original_amount: pen,
      note: 'штраф заморожен вручную',
    })
    if (error) { alert('Ошибка: ' + error.message); return }
    await supabase.from('payments').update({ penalty_amount: 0 }).eq('id', paymentId)
    const { data: con } = await supabase.from('contracts').select('*').eq('id', pay.contract_id).maybeSingle()
    if (con) {
      await supabase.from('notifications_log').insert({
        user_id: con.tenant_id, type: 'deferred_confirmed', related_id: pay.id,
        message: `🧊 Штраф ${pen.toFixed(0)} ₽ заморожен и будет учтён в конце договора`,
        sent_at: new Date().toISOString(),
      })
    }
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  // Изменить сумму замороженного штрафа или обнулить (только с примечанием)
  async function adjustFrozen(id: string, contractId: string, tenantId: string, zero: boolean) {
    const { data: row } = await supabase.from('frozen_penalties').select('*').eq('id', id).maybeSingle()
    if (!row) return
    const first = window.prompt(zero ? 'Причина обнуления (обязательно):' : `Новая сумма (сейчас ${Number(row.amount).toFixed(0)} ₽):`)
    if (first === null) return
    if (zero && !first.trim()) { alert('Обнуление требует причину'); return }
    let newAmount = zero ? 0 : Number(first)
    if (!zero && (isNaN(newAmount) || newAmount < 0)) { alert('Некорректная сумма'); return }
    let note = ''
    if (!zero) {
      const n = window.prompt('Примечание к изменению (обязательно):')
      if (n === null) return
      note = n.trim()
      if (!note) { alert('Изменение требует примечание'); return }
    } else {
      note = first.trim()
    }
    const { error } = await supabase.from('frozen_penalties').update({
      amount: newAmount,
      adjusted_at: new Date().toISOString(),
      adjusted_note: zero ? `обнулено: ${note}` : `изменено с ${Number(row.amount).toFixed(0)} на ${newAmount.toFixed(0)}: ${note}`,
    }).eq('id', id)
    if (error) { alert('Ошибка: ' + error.message); return }
    await supabase.from('notifications_log').insert({
      user_id: tenantId, type: 'deferred_confirmed', related_id: contractId,
      message: zero ? '🧊 Замороженный штраф обнулён' : `🧊 Замороженный штраф изменён: теперь ${newAmount.toFixed(0)} ₽`,
      sent_at: new Date().toISOString(),
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

  // Подтверждение конкретного канала оплаты.
  // close=true — закрыть канал без подтверждения (например, «нал закрыт, оплатили всё картой»)
  async function confirmChannel(paymentId: string, channel: 'card' | 'cash', close: boolean = false) {
    const { data: pay } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle()
    if (!pay) { alert('Платёж не найден'); return }

    const { data: cashMeeting } = await supabase
      .from('cash_meetings')
      .select('*')
      .eq('contract_id', pay.contract_id)
      .eq('kind', 'meeting')
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const cardEngaged = !!pay.card_claimed

    const update: any = {}
    if (channel === 'card') {
      if (close) return
      update.confirmed_card = true
    } else {
      if (close) update.cash_closed = true
      else update.confirmed_cash = true
    }

    const afterCard = channel === 'card' ? true : pay.confirmed_card
    const afterCashConfirmed = channel === 'cash' && !close ? true : pay.confirmed_cash
    const afterCashClosed = channel === 'cash' && close ? true : pay.cash_closed
    const cashFinalClosed = afterCashClosed || afterCashConfirmed

    const cardEngagedAfter = cardEngaged
    const cashEngagedAfter = !!cashMeeting && !afterCashClosed

    const cardSatisfied = !cardEngagedAfter || afterCard
    const cashSatisfied = !cashEngagedAfter || cashFinalClosed

    if (cardSatisfied && cashSatisfied) {
      update.confirmed_by_landlord = true
      update.confirmed_at = new Date().toISOString()
    }

    const { error: e1 } = await supabase.from('payments').update(update).eq('id', paymentId)
    if (e1) { alert('Ошибка: ' + e1.message); return }

    const { data: con } = await supabase.from('contracts').select('*').eq('id', pay.contract_id).maybeSingle()
    if (con) {
      const msg = channel === 'card'
        ? '🟢 Арендодатель подтвердил получение по безналу'
        : (close ? '⚪ Наличный канал закрыт' : '🟢 Арендодатель подтвердил получение наличных')
      await supabase.from('notifications_log').insert({
        user_id: con.tenant_id, type: 'payment_confirmed', related_id: pay.id, message: msg, sent_at: new Date().toISOString(),
      })
    }
    window.dispatchEvent(new Event('rentflow-refresh'))
  }
