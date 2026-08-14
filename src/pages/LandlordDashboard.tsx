import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import CashNegotiation from '../components/CashNegotiation'
import MetersEditor from '../components/MetersEditor'
import ReadingsReview from '../components/ReadingsReview'
import { T, C } from '../theme'
import type { Object as PropertyObject, Contract, NotificationLog, User } from '../types/database'

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
  const [notifications, setNotifications] = useState<NotificationLog[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [expandedFrozen, setExpandedFrozen] = useState<Set<string>>(new Set())
  const [utilInputs, setUtilInputs] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<any[]>([])
  const [statsPeriod, setStatsPeriod] = useState<'6m' | '12m'>('6m')
  const [statsObject, setStatsObject] = useState<string>('all')

  function toggleExpanded(id: string) {
    setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleFrozen(id: string) {
    setExpandedFrozen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  useEffect(() => {
    if (!user) return
    async function fetchData() {
      try {
        const { data: notifData } = await supabase.from('notifications_log').select('*').eq('user_id', user!.id).order('sent_at', { ascending: false }).limit(5)
        if (notifData) setNotifications(notifData)
        const { data: objectsData } = await supabase.from('objects').select('*').eq('landlord_id', user!.id)
        if (!objectsData) { setObjects([]); setHistory([]); setLoading(false); return }
        const objectsWithStatus: ObjectWithStatus[] = []
        const allHistory: any[] = []
        const today = new Date()
        const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        const currentMonth = today.getMonth()
        const currentYear = today.getFullYear()
        for (const obj of objectsData) {
          const { data: contract } = await supabase.from('contracts').select('*, tenant:users!tenant_id(full_name, phone)').eq('object_id', obj.id).eq('status', 'active').maybeSingle()
          if (!contract) { objectsWithStatus.push({ ...obj, status: 'no_contract', amount: 0, paymentId: null, statusColor: '#888', statusDetail: 'Нет договора', bgColor: '#fff' }); continue }
          const readingsMode = contract.readings_mode || 'manual'
          const reminder = contract.reminder_days_before || 3
          const { data: allPays } = await supabase.from('payments').select('*').eq('contract_id', contract.id)
          for (const p of allPays || []) allHistory.push({ ...p, objId: obj.id, address: obj.address })
          const { data: dReq } = await supabase.from('deferred_requests').select('*').eq('contract_id', contract.id).eq('status', 'proposed')
          const { data: fRows } = await supabase.from('frozen_penalties').select('*').eq('contract_id', contract.id).order('period', { ascending: true })
          const frozenTotal = (fRows || []).reduce((s2: number, d: any) => s2 + Number(d.amount || 0), 0)
          const { data: payment } = await supabase.from('payments').select('*').eq('contract_id', contract.id).order('period', { ascending: false }).limit(1).maybeSingle()
          if (!payment) { objectsWithStatus.push({ ...obj, status: 'no_payment', statusDetail: 'Платёж не создан', statusColor: '#a80', amount: contract.rent_amount, baseAmount: contract.rent_amount, penaltyAmount: 0, utilitiesAmount: 0, paymentId: null, contract, bgColor: '#fff', readingsMode, frozenTotal, frozenRows: fRows || [], deferredRequests: dReq || [] }); continue }
          const { data: cashMeeting } = await supabase.from('cash_meetings').select('*').eq('contract_id', contract.id).eq('kind', 'meeting').eq('status', 'confirmed').order('created_at', { ascending: false }).limit(1).maybeSingle()
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
            const { data: readingsData } = await supabase.from('meter_readings').select('*').eq('contract_id', contract.id).gte('submitted_at', new Date(currentYear, currentMonth, 1).toISOString()).lt('submitted_at', new Date(currentYear, currentMonth + 1, 1).toISOString())
            if (!readingsData || readingsData.length === 0) waitingForReadings = true
          }
          const needUtilitiesReminder = !payment.confirmed_by_landlord && readingsMode !== 'self' && daysUntilDue >= 0 && daysUntilDue <= reminder && utilitiesAmount === 0
          let status: 'paid' | 'overdue' | 'pending' = 'pending'
          let statusDetail = ''
          let statusColor = '#a80'
          if (!payment.confirmed_by_landlord) {
            if (isOverdue) { status = 'overdue'; statusDetail = `Просрочка ${Math.round((todayMid.getTime() - dueMid.getTime()) / 86400000)} дн.`; statusColor = '#c00' }
            else if (waitingForReadings) { statusDetail = 'Ждём показания'; statusColor = '#a80' }
            else if (daysUntilDue === 0) { statusDetail = firstMonthGrace ? 'Первый месяц — просрочка не начисляется' : 'Сегодня последний день оплаты'; statusColor = '#a80' }
            else if (daysUntilDue <= reminder) { statusDetail = `До оплаты ${daysUntilDue} дн.`; statusColor = '#a80' }
            else { statusDetail = `До оплаты ${daysUntilDue} дн.`; statusColor = '#080' }
          } else {
            status = 'paid'
            const periodDate = parseDate(payment.period)
            const nextDue = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, contract.payment_day || 1)
            const daysLeft = Math.round((nextDue.getTime() - todayMid.getTime()) / 86400000)
            if (daysLeft < 0) { statusDetail = `Следующий платёж просрочен на ${-daysLeft} дн.`; statusColor = '#c00' }
            else if (daysLeft === 0) { statusDetail = 'Следующая оплата: сегодня последний день'; statusColor = '#a80' }
            else if (daysLeft <= reminder) { statusDetail = `${daysLeft} дн. до следующей оплаты`; statusColor = '#a80' }
            else { statusDetail = `${daysLeft} дн. до следующей оплаты`; statusColor = '#080' }
          }
          objectsWithStatus.push({ ...obj, status, statusDetail, statusColor, amount: baseAmount + penaltyAmount + utilitiesAmount, baseAmount, penaltyAmount, utilitiesAmount, paymentId, contract, payment, daysOverdue: isOverdue ? Math.round((todayMid.getTime() - dueMid.getTime()) / 86400000) : undefined, waitingForReadings, needUtilitiesReminder, readingsMode, frozenTotal, frozenRows: fRows || [], deferredRequests: dReq || [], hasConfirmedCashMeeting: !!cashMeeting })
        }
        setHistory(allHistory)
        const sortedObjects = objectsWithStatus.sort((a, b) => {
          const order: Record<string, number> = { overdue: 0, pending: 1, no_payment: 1.5, paid: 2, no_contract: 3 }
          const colorOrder = (o: ObjectWithStatus) => o.statusColor === '#c00' ? 0 : o.statusColor === '#a80' ? 1 : 2
          const so = (order[a.status] ?? 9) - (order[b.status] ?? 9)
          return so !== 0 ? so : colorOrder(a) - colorOrder(b)
        })
        setObjects(sortedObjects)
      } catch (err) { setError(err instanceof Error ? err.message : 'Unknown error') } finally { setLoading(false) }
    }
    fetchData()
    const onRefresh = () => fetchData()
    window.addEventListener('rentflow-refresh', onRefresh)
    const interval = setInterval(() => fetchData(), 30000)
    return () => { window.removeEventListener('rentflow-refresh', onRefresh); clearInterval(interval) }
  }, [user])

  async function saveUtilities(paymentId: string, value: string) {
    const { error } = await supabase.from('payments').update({ utilities_amount: Number(value) || 0 }).eq('id', paymentId)
    if (error) alert('Ошибка: ' + error.message); else window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function confirmSigning(paymentId: string) {
    const { error } = await supabase.from('payments').update({ confirmed_by_landlord: true, confirmed_at: new Date().toISOString() }).eq('id', paymentId)
    if (error) { alert('Ошибка: ' + error.message); return }
    const { data: pay } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle()
    if (pay) {
      const { data: con } = await supabase.from('contracts').select('*').eq('id', pay.contract_id).maybeSingle()
      if (con) await supabase.from('notifications_log').insert({ user_id: con.tenant_id, type: 'payment_confirmed', related_id: pay.id, message: '🟢 Арендодатель подтвердил получение первого месяца и депозита при подписании', sent_at: new Date().toISOString() })
    }
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function addDepositPayment(contractId: string) {
    const { data: con } = await supabase.from('contracts').select('deposit_amount, deposit_paid').eq('id', contractId).maybeSingle()
    if (!con) return
    const total = Number(con.deposit_amount || 0); const paid = Number(con.deposit_paid || 0)
    if (total <= 0) { alert('Сначала укажите общую сумму депозита в редактировании объекта'); return }
    const val = window.prompt(`Внесите платёж по депозиту (внесено ${paid.toFixed(0)} из ${total.toFixed(0)}), ₽:`)
    if (val === null) return
    const amount = Number(val)
    if (isNaN(amount) || amount <= 0) { alert('Некорректная сумма'); return }
    const { error } = await supabase.from('contracts').update({ deposit_paid: Math.min(total, paid + amount) }).eq('id', contractId)
    if (error) { alert('Ошибка: ' + error.message); return }
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function editDepositPaid(contractId: string) {
    const { data: con } = await supabase.from('contracts').select('deposit_amount, deposit_paid').eq('id', contractId).maybeSingle()
    if (!con) return
    const val = window.prompt(`Новое значение «внесено» (общая сумма ${Number(con.deposit_amount || 0).toFixed(0)}), ₽:`, String(con.deposit_paid || 0))
    if (val === null) return
    const v = Number(val)
    if (isNaN(v) || v < 0) { alert('Некорректное значение'); return }
    const { error } = await supabase.from('contracts').update({ deposit_paid: Math.min(Number(con.deposit_amount || 0), v) }).eq('id', contractId)
    if (error) { alert('Ошибка: ' + error.message); return }
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function confirmDeferral(requestId: string, contractId: string, paymentId: string, amount: number, tenantId: string) {
    const { data: pay } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle()
    const { error: e1 } = await supabase.from('frozen_penalties').insert({ contract_id: contractId, payment_id: paymentId, period: pay ? pay.period : null, amount, original_amount: amount, note: 'отсрочка штрафа подтверждена' })
    if (e1) { alert('Ошибка: ' + e1.message); return }
    await supabase.from('deferred_requests').update({ status: 'confirmed' }).eq('id', requestId)
    if (paymentId) {
      const newPenalty = Math.max(0, Number(pay?.penalty_amount || 0) - amount)
      await supabase.from('payments').update({ penalty_amount: newPenalty }).eq('id', paymentId)
    }
    await supabase.from('notifications_log').insert({ user_id: tenantId, type: 'deferred_confirmed', related_id: contractId, message: `🧊 Штраф ${Number(amount).toFixed(0)} ₽ заморожен и будет учтён в конце договора`, sent_at: new Date().toISOString() })
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function freezePenalty(paymentId: string) {
    const { data: pay } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle()
    if (!pay) return
    const pen = Number(pay.penalty_amount || 0)
    if (pen <= 0) { alert('Нет штрафа для заморозки'); return }
    const { error } = await supabase.from('frozen_penalties').insert({ contract_id: pay.contract_id, payment_id: pay.id, period: pay.period, amount: pen, original_amount: pen, note: 'штраф заморожен вручную' })
    if (error) { alert('Ошибка: ' + error.message); return }
    await supabase.from('payments').update({ penalty_amount: 0 }).eq('id', paymentId)
    const { data: con } = await supabase.from('contracts').select('*').eq('id', pay.contract_id).maybeSingle()
    if (con) await supabase.from('notifications_log').insert({ user_id: con.tenant_id, type: 'deferred_confirmed', related_id: pay.id, message: `🧊 Штраф ${pen.toFixed(0)} ₽ заморожен и будет учтён в конце договора`, sent_at: new Date().toISOString() })
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function adjustFrozen(id: string, contractId: string, tenantId: string, zero: boolean) {
    const { data: row } = await supabase.from('frozen_penalties').select('*').eq('id', id).maybeSingle()
    if (!row) return
    const first = window.prompt(zero ? 'Причина обнуления (обязательно):' : `Новая сумма (сейчас ${Number(row.amount).toFixed(0)} ₽):`)
    if (first === null) return
    if (zero && !first.trim()) { alert('Обнуление требует причину'); return }
    let newAmount = zero ? 0 : Number(first)
    if (!zero && (isNaN(newAmount) || newAmount < 0)) { alert('Некорректная сумма'); return }
    let note = ''
    if (!zero) { const n = window.prompt('Примечание к изменению (обязательно):'); if (n === null) return; note = n.trim(); if (!note) { alert('Изменение требует примечание'); return } } else { note = first.trim() }
    const { error } = await supabase.from('frozen_penalties').update({ amount: newAmount, adjusted_at: new Date().toISOString(), adjusted_note: zero ? `обнулено: ${note}` : `изменено с ${Number(row.amount).toFixed(0)} на ${newAmount.toFixed(0)}: ${note}` }).eq('id', id)
    if (error) { alert('Ошибка: ' + error.message); return }
    await supabase.from('notifications_log').insert({ user_id: tenantId, type: 'deferred_confirmed', related_id: contractId, message: zero ? '🧊 Замороженный штраф обнулён' : `🧊 Замороженный штраф изменён: теперь ${newAmount.toFixed(0)} ₽`, sent_at: new Date().toISOString() })
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function updatePaymentMethod(contractId: string, method: 'card' | 'cash' | 'both') {
    const updateData: any = { payment_method: method }
    if (method === 'cash') updateData.cash_slots = []
    const { error } = await supabase.from('contracts').update(updateData).eq('id', contractId)
    if (!error) {
      setObjects(prev => prev.map(o => o.contract?.id === contractId ? { ...o, contract: { ...o.contract!, payment_method: method, cash_slots: method === 'cash' ? [] : o.contract!.cash_slots } } : o))
    } else alert('Ошибка: ' + error.message)
  }

  async function confirmChannel(paymentId: string, channel: 'card' | 'cash', close: boolean = false) {
    const { data: pay } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle()
    if (!pay) { alert('Платёж не найден'); return }
    const { data: cashMeeting } = await supabase.from('cash_meetings').select('*').eq('contract_id', pay.contract_id).eq('kind', 'meeting').eq('status', 'confirmed').order('created_at', { ascending: false }).limit(1).maybeSingle()
    const cardEngaged = !!pay.card_claimed
    const update: any = {}
    if (channel === 'card') { if (close) return; update.confirmed_card = true } else { if (close) update.cash_closed = true; else update.confirmed_cash = true }
    const afterCard = channel === 'card' ? true : pay.confirmed_card
    const afterCashConfirmed = channel === 'cash' && !close ? true : pay.confirmed_cash
    const afterCashClosed = channel === 'cash' && close ? true : pay.cash_closed
    const cashFinalClosed = afterCashClosed || afterCashConfirmed
    const cardSatisfied = !cardEngaged || afterCard
    const cashSatisfied = !(!!cashMeeting && !afterCashClosed) || cashFinalClosed
    if (cardSatisfied && cashSatisfied) { update.confirmed_by_landlord = true; update.confirmed_at = new Date().toISOString() }
    const { error: e1 } = await supabase.from('payments').update(update).eq('id', paymentId)
  const getNotificationText = (type: string) => {
    switch (type) {
      case 'payment_claimed': return '✅ Арендатор сообщил об оплате'
      case 'payment_confirmed': return '🟢 Арендодатель подтвердил оплату'
      case 'meter_submitted': return '💦 Переданы новые показания'
      case 'cash_proposed': return '💵 Предложено время встречи наличными'
      case 'cash_confirmed': return '🤝 Время встречи наличными подтверждено'
      case 'deferred_proposed': return '🙏 Арендатор попросил отсрочку штрафа'
      case 'deferred_confirmed': return '🧊 Замороженный штраф обновлён'
      default: return type
    }
  }

  function amountBreakdown(obj: ObjectWithStatus): string {
    const parts: string[] = [`${(obj.baseAmount ?? obj.amount).toFixed(2)} ₽`]
    if (obj.penaltyAmount && obj.penaltyAmount > 0) parts.push(`${obj.penaltyAmount.toFixed(2)} ₽ штраф`)
    if (obj.utilitiesAmount && obj.utilitiesAmount > 0) parts.push(`${obj.utilitiesAmount.toFixed(2)} ₽ ресурсы`)
    return parts.join(' + ')
  }

  const chipOf = (color?: string) => color === '#c00' ? T.chipRed : color === '#a80' ? T.chipOrange : color === '#080' ? T.chipGreen : T.chipGray

  const todayNow = new Date()
  const todayMidNow = new Date(todayNow.getFullYear(), todayNow.getMonth(), todayNow.getDate())
  const periodStart = statsPeriod === '6m' ? new Date(todayMidNow.getFullYear(), todayMidNow.getMonth() - 5, 1) : new Date(todayMidNow.getFullYear() - 1, todayMidNow.getMonth(), 1)
  const filteredHistory = history.filter(h => (statsObject === 'all' || h.objId === statsObject) && parseDate(h.period) >= periodStart).sort((a, b) => parseDate(b.period).getTime() - parseDate(a.period).getTime())
  const collected = filteredHistory.filter(h => h.confirmed_by_landlord).reduce((s: number, h: any) => s + Number(h.base_amount || 0) + Number(h.penalty_amount || 0) + Number(h.utilities_amount || 0), 0)
  const penaltiesAccrued = filteredHistory.reduce((s: number, h: any) => s + Number(h.penalty_amount || 0), 0)
  const confirmedCount = filteredHistory.filter(h => h.confirmed_by_landlord).length
  const onTimeCount = filteredHistory.filter(h => h.confirmed_by_landlord && h.confirmed_at && new Date(h.confirmed_at) <= parseDate(h.due_date)).length
  const onTimePct = confirmedCount > 0 ? Math.round((onTimeCount / confirmedCount) * 100) : 0
  const overdueNow = objects.filter(o => o.statusColor === '#c00').length

  if (userLoading || loading) return <div style={T.page}>Загрузка…</div>
  if (error) return <div style={T.page}><div style={T.card}>{error}</div></div>

  return (
    <div style={T.page}>
      <h1 style={T.h1}>Мои объекты</h1>
      {objects.length === 0 ? (
        <div style={T.card}>Объектов нет</div>
      ) : (
        objects.map((obj) => {
          const contract = obj.contract
          const isExpanded = expandedIds.has(obj.id)
          const tenantChoseCash = contract && (contract.payment_method === 'cash' || (contract.payment_method === 'both' && (contract as any).tenant_pay_method === 'cash'))
          const deposit = Number((contract as any)?.deposit_amount || 0)
          const depositPaid = Number((contract as any)?.deposit_paid || 0)
          const frozenOpen = expandedFrozen.has(obj.id)
          const periodMid = obj.payment ? parseDate(obj.payment.period) : null
          const sd = (contract as any).start_date ? parseDate((contract as any).start_date) : null
          const firstMonthPending = !!(contract && obj.payment && sd && periodMid && !obj.payment.confirmed_by_landlord && periodMid.getFullYear() === sd.getFullYear() && periodMid.getMonth() === sd.getMonth())

          return (
            <div key={obj.id} style={T.card}>
              <div style={{ cursor: 'pointer' }} onClick={() => toggleExpanded(obj.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 17, fontWeight: 600 }}>{obj.address}</div>
                  {deposit > 0 && <div style={{ fontSize: 11, color: C.text2, whiteSpace: 'nowrap' }}>депозит: внесено {depositPaid.toFixed(0)} из {deposit.toFixed(0)} ₽</div>}
                </div>
                {contract && (contract as any).start_date && (contract as any).end_date && <div style={T.tiny}>Срок аренды: с {parseDate((contract as any).start_date).toLocaleDateString('ru-RU')} по {parseDate((contract as any).end_date).toLocaleDateString('ru-RU')} ({Math.max(1, Math.round((parseDate((contract as any).end_date).getTime() - parseDate((contract as any).start_date).getTime()) / 2629800000))} мес.)</div>}
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={chipOf(obj.statusColor)}>{obj.statusDetail}</span>
                  <span style={{ fontSize: 12, color: C.text2 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
                {obj.amount > 0 && <div style={{ ...T.total, marginTop: 8 }}>{amountBreakdown(obj)}</div>}
                {!!obj.frozenTotal && obj.frozenTotal > 0 && (
                  <div style={T.link} onClick={(e) => { e.stopPropagation(); toggleFrozen(obj.id) }}>
                    🧊 Замороженные штрафы: {obj.frozenTotal.toFixed(0)} ₽ {frozenOpen ? '▲' : '▼'}
                  </div>
                )}
                {frozenOpen && !!obj.frozenTotal && obj.frozenTotal > 0 && (
                  <div style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                    {(obj.frozenRows || []).map((f: any) => (
                      <div key={f.id} style={T.tiny}>
                        {f.period ? parseDate(f.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : 'без месяца'} — {Number(f.amount).toFixed(0)} ₽{f.adjusted_note ? ` (${f.adjusted_note})` : ''}
                      </div>
                    ))}
                    {deposit > 0
                      ? (deposit >= (obj.frozenTotal || 0)
                        ? <div style={T.tiny}>будет удержано из депозита; остаток депозита: {(deposit - (obj.frozenTotal || 0)).toFixed(0)} ₽</div>
                        : <div style={{ ...T.tiny, color: C.red }}>сверх депозита долг: {((obj.frozenTotal || 0) - deposit).toFixed(0)} ₽</div>)
                      : <div style={{ ...T.tiny, color: C.red }}>долг арендатора (депозита нет)</div>}
                  </div>
                )}
              </div>

              {isExpanded && (
                <>
                  {contract && (firstMonthPending || deposit > 0) && (
                    <div style={T.sub}>
                      <div style={T.h3}>Первый месяц и депозит</div>
                      {firstMonthPending && (
                        <button style={T.btn} onClick={() => confirmSigning(obj.paymentId!)}>✅ Подтвердить: первый месяц + депозит получены при подписании</button>
                      )}
                      {deposit > 0 && (
                        <div style={T.item}>
                          <div style={{ fontSize: 14, marginBottom: 8 }}>Внесено {depositPaid.toFixed(0)} из {deposit.toFixed(0)} ₽ · остаток {Math.max(0, deposit - depositPaid).toFixed(0)} ₽</div>
                          <span style={{ display: 'flex', gap: 8 }}>
                            <button style={T.btnSmall} onClick={() => addDepositPayment(contract.id)}>+ внести</button>
                            <button style={{ ...T.btnDanger, padding: '8px 14px', fontSize: 13 }} onClick={() => editDepositPaid(contract.id)}>изменить</button>
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {contract && obj.paymentId && !obj.payment?.confirmed_by_landlord && (
                    <div style={T.sub}>
                      <div style={T.h3}>Подтверждение оплаты по каналам</div>
                      <div style={T.item}>
                        <div style={{ fontSize: 14, marginBottom: 8 }}>💳 Безнал: {obj.payment?.confirmed_card ? '🟢 получен' : obj.payment?.card_claimed ? '🟡 заявлен арендатором' : '⚪ не заявлен'}</div>
                        {obj.payment?.card_claimed && !obj.payment?.confirmed_card && (
                          <button style={T.btnSmall} onClick={() => confirmChannel(obj.paymentId!, 'card')}>Подтвердить</button>
                        )}
                      </div>
                      <div style={T.item}>
                        <div style={{ fontSize: 14, marginBottom: 8 }}>💵 Нал: {obj.payment?.confirmed_cash ? '🟢 получен' : obj.payment?.cash_closed ? '⚪ канал закрыт' : obj.hasConfirmedCashMeeting ? '🟡 ждёт встречи' : '⚪ не заявлен'}</div>
                        {obj.hasConfirmedCashMeeting && !obj.payment?.cash_closed && !obj.payment?.confirmed_cash && (
                          <span style={{ display: 'flex', gap: 8 }}>
                            <button style={T.btnSmall} onClick={() => confirmChannel(obj.paymentId!, 'cash')}>Подтвердить</button>
                            <button style={T.btnDanger} onClick={() => confirmChannel(obj.paymentId!, 'cash', true)}>закрыть канал</button>
                          </span>
                        )}
                      </div>
                      {!obj.payment?.card_claimed && !obj.hasConfirmedCashMeeting && (
                        <button style={T.btn} onClick={() => confirmChannel(obj.paymentId!, 'card')}>✅ Подтвердить оплату полностью</button>
                      )}
                    </div>
                  )}

                  {contract && ((obj.frozenRows || []).length > 0 || ((obj.penaltyAmount || 0) > 0 && !obj.payment?.confirmed_by_landlord)) && (
                    <div style={T.sub}>
                      <div style={T.h3}>Замороженные штрафы — управление</div>
                      {(obj.penaltyAmount || 0) > 0 && !obj.payment?.confirmed_by_landlord && (
                        <button style={T.btnSmall} onClick={() => freezePenalty(obj.paymentId!)}>🧊 Заморозить текущий штраф ({(obj.penaltyAmount || 0).toFixed(0)} ₽)</button>
                      )}
                      {(obj.frozenRows || []).map((f: any) => (
                        <div key={f.id} style={T.item}>
                          <div style={{ fontSize: 14 }}>
                            {f.period ? parseDate(f.period).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' }) : '—'} · {Number(f.amount).toFixed(0)} ₽
                            {f.adjusted_note && <div style={T.tiny}>{f.adjusted_note}</div>}
                          </div>
                          <span style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                            <button style={T.btnSecondary} onClick={() => adjustFrozen(f.id, contract.id, contract.tenant_id, false)}>изменить</button>
                            <button style={T.btnDanger} onClick={() => adjustFrozen(f.id, contract.id, contract.tenant_id, true)}>обнулить</button>
                          </span>
                        </div>
                      ))}
                      <div style={T.tiny}>Записи не удаляются до конца договора; каждое изменение сохраняется с примечанием и датой.</div>
                    </div>
                  )}

                  {contract && obj.paymentId && !obj.payment?.confirmed_by_landlord && obj.readingsMode !== 'self' && (
                    <div style={T.sub}>
                      <div style={T.h3}>Ресурсы по квитанции</div>
                      {obj.needUtilitiesReminder && (
                        <div style={T.note}>⏳ Посчитайте ресурсы с квитанции и добавьте сумму к платежу</div>
                      )}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="number"
                          value={utilInputs[obj.id] ?? String(obj.utilitiesAmount || '')}
                          onChange={(e) => setUtilInputs({ ...utilInputs, [obj.id]: e.target.value })}
                          placeholder="Сумма по квитанции, ₽"
                          style={{ ...T.input, marginBottom: 0, flex: 1 }}
                          inputMode="numeric"
                        />
                        <button
                          onClick={() => saveUtilities(obj.paymentId!, utilInputs[obj.id] ?? String(obj.utilitiesAmount || 0))}
                          style={T.btnSmall}
                        >
                          Включить в платёж
                        </button>
                      </div>
                      <div style={T.tiny}>Сумма добавляется к платежу отдельно, не растёт при просрочке и не входит в штрафы</div>
                    </div>
                  )}

                  {contract && (obj.deferredRequests || []).length > 0 && (
                    <div style={T.sub}>
                      <div style={T.h3}>Отсрочка штрафа</div>
                      {(obj.deferredRequests || []).map((r: any) => (
                        <div key={r.id} style={T.item}>
                          <div style={{ fontSize: 14, marginBottom: 8 }}>Арендатор просит отсрочить {Number(r.amount).toFixed(2)} ₽</div>
                          <button
                            onClick={() => confirmDeferral(r.id, contract.id, r.payment_id, Number(r.amount), contract.tenant_id)}
                            style={T.btnWarn}
                          >
                            Подтвердить отсрочку
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {contract && (
                    <div style={T.sub}>
                      <div style={T.h3}>Счётчики</div>
                      <MetersEditor objId={obj.id} />
                    </div>
                  )}

                  {contract && obj.readingsMode === 'manual' && (
                    <div style={T.sub}>
                      <div style={T.h3}>Показания за текущий месяц</div>
                      <ReadingsReview contractId={contract.id} tenantId={contract.tenant_id} />
                    </div>
                  )}

                  {contract && (
                    <div style={T.sub}>
                      <div style={T.h3}>Способ оплаты</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button style={contract.payment_method === 'card' ? T.btnSmall : T.btnSecondary} onClick={() => updatePaymentMethod(contract.id, 'card')}>Безналичный расчёт</button>
                        <button style={contract.payment_method === 'cash' ? T.btnSmall : T.btnSecondary} onClick={() => updatePaymentMethod(contract.id, 'cash')}>Наличные</button>
                        <button style={contract.payment_method === 'both' ? T.btnSmall : T.btnSecondary} onClick={() => updatePaymentMethod(contract.id, 'both')}>Оба способа</button>
                      </div>
                      {contract.payment_method === 'both' && (
                        <div style={T.tiny}>💡 Способ оплаты выбирает арендатор: карта или наличные.</div>
                      )}
                    </div>
                  )}

                  {contract && tenantChoseCash && (
                    <div style={T.sub}>
                      <div style={T.h3}>Оплата наличными — договорённость о времени</div>
                      <CashNegotiation
                        contractId={contract.id}
                        myRole="landlord"
                        tenantId={contract.tenant_id}
                        landlordId={obj.landlord_id}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })
      )}

      <div style={T.card}>
        <div style={T.h2}>Статистика</div>
        <div style={L.filtersRow}>
          <select value={statsObject} onChange={(e) => setStatsObject(e.target.value)} style={{ ...T.select, flex: 1 }}>
            <option value="all">Все объекты</option>
            {objects.map(o => <option key={o.id} value={o.id}>{o.address}</option>)}
          </select>
          <select value={statsPeriod} onChange={(e) => setStatsPeriod(e.target.value as '6m' | '12m')} style={T.select}>
            <option value="6m">Последние 6 мес</option>
            <option value="12m">Год</option>
          </select>
        </div>
        <div style={L.statsGrid}>
          <div style={L.statTile}>
            <div style={L.statLabel}>Собрано</div>
            <div style={L.statValue}>{collected.toFixed(0)} ₽</div>
          </div>
          <div style={L.statTile}>
            <div style={L.statLabel}>Штрафов начислено</div>
            <div style={{ ...L.statValue, color: C.red }}>{penaltiesAccrued.toFixed(0)} ₽</div>
          </div>
          <div style={L.statTile}>
            <div style={L.statLabel}>Оплата вовремя</div>
            <div style={L.statValue}>{onTimePct}%</div>
          </div>
          <div style={L.statTile}>
            <div style={L.statLabel}>Сейчас просрочено</div>
            <div style={{ ...L.statValue, color: overdueNow > 0 ? C.red : C.green }}>{overdueNow} объект(а)</div>
          </div>
        </div>
        <div style={T.h3}>История платежей</div>
        {filteredHistory.length === 0 ? (
          <div style={T.small}>Платежей за период нет</div>
        ) : (
          filteredHistory.slice(0, 20).map((h: any) => {
            const late = h.confirmed_by_landlord && h.confirmed_at && new Date(h.confirmed_at) > parseDate(h.due_date)
            const sum = Number(h.base_amount || 0) + Number(h.penalty_amount || 0) + Number(h.utilities_amount || 0)
            return (
              <div key={h.id} style={T.item}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{h.address}</span>
                  <b style={{ color: late ? C.red : C.text, whiteSpace: 'nowrap' }}>{sum.toFixed(0)} ₽</b>
                </div>
                <div style={T.tiny}>{parseDate(h.period).toLocaleDateString('ru-RU')} · {h.confirmed_by_landlord ? (late ? 'просрочка' : 'вовремя') : 'не подтверждён'}</div>
              </div>
            )
          })
        )}
      </div>

      <div style={T.card}>
        <div style={T.h2}>Уведомления</div>
        {notifications.length === 0 ? (
          <div style={T.small}>Нет уведомлений</div>
        ) : (
          notifications.map(n => (
            <div key={n.id} style={{ padding: '8px 0', borderBottom: `1px solid ${C.line}`, fontSize: 14 }}>
              {(n as any).message || getNotificationText(n.type)}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const L: Record<string, React.CSSProperties> = {
  filtersRow: { display: 'flex', gap: 8, marginBottom: 12 },
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 },
  statTile: { backgroundColor: '#fafafc', borderRadius: 12, padding: 12 },
  statLabel: { fontSize: 12, color: C.text2, marginBottom: 4 },
  statValue: { fontSize: 17, fontWeight: 700 },
}

export default LandlordDashboard
