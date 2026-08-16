import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import CashNegotiation from '../components/CashNegotiation'
import MetersEditor from '../components/MetersEditor'
import ReadingsReview from '../components/ReadingsReview'
import Chat from '../components/Chat'
import { ObjectAdd, ObjectEdit } from '../components/ObjectManager'
import { ensureNextPayment } from '../lib/nextPayment'
import { BottomNav, Modal, PromptNumber, Progress, showToast } from '../components/ui'
import { T } from '../theme'
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
  frozenTotal?: number
  frozenRows?: any[]
  deferredRequests?: any[]
  hasConfirmedCashMeeting?: boolean
}

function parseDate(d: any): Date {
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, dd || 1)
}

const OBJ_TABS = [
  { id: 'pay', l: 'Оплата' },
  { id: 'meters', l: 'Счётчики' },
  { id: 'contract', l: 'Договор' },
  { id: 'chat', l: 'Чат' },
]

export function LandlordDashboard() {
  const { user, loading: userLoading } = useTelegramUser()
  const [objects, setObjects] = useState<ObjectWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<NotificationLog[]>([])
  const [utilInputs, setUtilInputs] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<any[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [tab, setTab] = useState('pay')
  const [depModal, setDepModal] = useState<'add' | 'edit' | null>(null)
  const [fz, setFz] = useState<{ id: string; zero: boolean } | null>(null)
  const [fzAmount, setFzAmount] = useState('')
  const [fzNote, setFzNote] = useState('')

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
          if (!contract) { objectsWithStatus.push({ ...obj, status: 'no_contract', amount: 0, paymentId: null, statusColor: '#888', statusDetail: 'Нет договора' }); continue }
          const readingsMode = contract.readings_mode || 'manual'
          const reminder = contract.reminder_days_before || 3
          const { data: allPays } = await supabase.from('payments').select('*').eq('contract_id', contract.id).order('period', { ascending: false })
          for (const p of allPays || []) allHistory.push({ ...p, objId: obj.id, address: obj.address })
          const { data: dReq } = await supabase.from('deferred_requests').select('*').eq('contract_id', contract.id).eq('status', 'proposed')
          const { data: fRows } = await supabase.from('frozen_penalties').select('*').eq('contract_id', contract.id).order('period', { ascending: true })
          const frozenTotal = (fRows || []).reduce((s2: number, d: any) => s2 + Number(d.amount || 0), 0)
          await ensureNextPayment(contract.id)
          const openPays = (allPays || []).filter((p: any) => !p.confirmed_by_landlord)
          const payment = openPays.length ? openPays[openPays.length - 1] : (allPays || [])[0]
          if (!payment) { objectsWithStatus.push({ ...obj, status: 'no_payment', statusDetail: 'Платёж не создан', statusColor: '#a80', amount: contract.rent_amount, baseAmount: contract.rent_amount, penaltyAmount: 0, utilitiesAmount: 0, paymentId: null, contract, readingsMode, frozenTotal, frozenRows: fRows || [], deferredRequests: dReq || [] }); continue }
          const { data: cashMeeting } = await supabase.from('cash_meetings').select('*').eq('contract_id', contract.id).eq('kind', 'meeting').eq('status', 'confirmed').order('created_at', { ascending: false }).limit(1).maybeSingle()
          const dueMid = parseDate(payment.due_date)
          const sd = contract.start_date ? parseDate(contract.start_date) : null
          const isFirstMonth = !!sd && dueMid.getMonth() === sd.getMonth() && dueMid.getFullYear() === sd.getFullYear()
          const isOverdue = todayMid > dueMid && !isFirstMonth
          const daysUntilDue = Math.round((dueMid.getTime() - todayMid.getTime()) / 86400000)
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
            if (isFirstMonth) { statusDetail = 'Первый месяц — ждёт оплаты'; statusColor = '#a80' }
            else if (isOverdue) { status = 'overdue'; statusDetail = `Просрочка ${Math.round((todayMid.getTime() - dueMid.getTime()) / 86400000)} дн.`; statusColor = '#c00' }
            else if (waitingForReadings) { statusDetail = 'Ждём показания'; statusColor = '#a80' }
            else if (daysUntilDue === 0) { statusDetail = 'Сегодня последний день оплаты'; statusColor = '#a80' }
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
    if (error) showToast('Ошибка: ' + error.message); else { showToast('✅ Ресурсы добавлены к платежу'); window.dispatchEvent(new Event('rentflow-refresh')) }
  }

  function toISO(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${dd}`
  }

  async function saveUtilitiesNext(value: string) {
    if (!contract) return
    const amount = Number(value) || 0
    const { data: openPays } = await supabase
      .from('payments').select('*')
      .eq('contract_id', contract.id).eq('confirmed_by_landlord', false)
      .order('period', { ascending: false })
    if (openPays && openPays.length > 0) {
      await saveUtilities(openPays[openPays.length - 1].id, String(amount))
    } else {
      const { data: lastp } = await supabase.from('payments').select('*').eq('contract_id', contract.id).order('period', { ascending: false }).limit(1)
      const base = lastp && lastp[0] ? parseDate(lastp[0].period) : parseDate((contract as any).start_date || new Date().toISOString())
      const nextPeriod = new Date(base.getFullYear(), base.getMonth() + 1, 1)
      const due = new Date(nextPeriod.getFullYear(), nextPeriod.getMonth(), Number(contract.payment_day) || 1)
      const { error } = await supabase.from('payments').insert({
        contract_id: contract.id, period: toISO(nextPeriod), due_date: toISO(due),
        base_amount: Number(contract.rent_amount) || 0, penalty_amount: 0, utilities_amount: amount,
      })
      if (error) { showToast('Ошибка: ' + error.message); return }
      showToast('✅ Счёт создан вместе с ресурсами')
    }
    if (current) setUtilInputs(prev => ({ ...prev, [current.id]: String(amount) }))
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function confirmSigning(paymentId: string) {
    const { error } = await supabase.from('payments').update({ confirmed_by_landlord: true, confirmed_at: new Date().toISOString() }).eq('id', paymentId)
    if (error) { showToast('Ошибка: ' + error.message); return }
    showToast('✅ Первый месяц подтверждён')
    const { data: pay } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle()
    if (pay) {
      await ensureNextPayment(pay.contract_id)
      const { data: con } = await supabase.from('contracts').select('*').eq('id', pay.contract_id).maybeSingle()
      if (con) await supabase.from('notifications_log').insert({ user_id: con.tenant_id, type: 'payment_confirmed', related_id: pay.id, message: '🟢 Арендодатель подтвердил получение первого месяца и депозита при подписании', sent_at: new Date().toISOString() })
    }
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function doAddDeposit(amount: number) {
    if (!contract) return
    if (deposit <= 0) { showToast('Сначала укажите общую сумму депозита'); return }
    if (isNaN(amount) || amount <= 0) { showToast('Некорректная сумма'); return }
    const { error } = await supabase.from('contracts').update({ deposit_paid: Math.min(deposit, depositPaid + amount) }).eq('id', contract.id)
    if (error) { showToast('Ошибка: ' + error.message); return }
    showToast('✅ Платёж по депозиту внесён')
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function doEditDeposit(v: number) {
    if (!contract) return
    if (isNaN(v) || v < 0) { showToast('Некорректное значение'); return }
    const { error } = await supabase.from('contracts').update({ deposit_paid: Math.min(deposit, v) }).eq('id', contract.id)
    if (error) { showToast('Ошибка: ' + error.message); return }
    showToast('✅ Депозит обновлён')
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  function openAdjust(id: string, zero: boolean) {
    const row = (current?.frozenRows || []).find((f: any) => f.id === id)
    setFzAmount(row ? String(row.amount) : '')
    setFzNote('')
    setFz({ id, zero })
  }

  async function confirmAdjust() {
    if (!fz || !contract) return
    const zero = fz.zero
    const note = fzNote.trim()
    if (zero && !note) { showToast('Обнуление требует причину'); return }
    let newAmount = zero ? 0 : Number(fzAmount)
    if (!zero && (isNaN(newAmount) || newAmount < 0)) { showToast('Некорректная сумма'); return }
    if (!zero && !note) { showToast('Изменение требует примечание'); return }
    const { error } = await supabase.from('frozen_penalties').update({
      amount: newAmount, adjusted_at: new Date().toISOString(),
      adjusted_note: zero ? `обнулено: ${note}` : `изменено на ${newAmount.toFixed(0)}: ${note}`,
    }).eq('id', fz.id)
    if (error) { showToast('Ошибка: ' + error.message); return }
    await supabase.from('notifications_log').insert({ user_id: contract.tenant_id, type: 'deferred_confirmed', related_id: contract.id, message: zero ? '🧊 Замороженный штраф обнулён' : `🧊 Замороженный штраф изменён: теперь ${newAmount.toFixed(0)} ₽`, sent_at: new Date().toISOString() })
    showToast('✅ Сохранено')
    setFz(null)
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function confirmDeferral(requestId: string, contractId: string, paymentId: string, amount: number, tenantId: string) {
    const { data: pay } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle()
    const { error: e1 } = await supabase.from('frozen_penalties').insert({ contract_id: contractId, payment_id: paymentId, period: pay ? pay.period : null, amount, original_amount: amount, note: 'отсрочка штрафа подтверждена' })
    if (e1) { showToast('Ошибка: ' + e1.message); return }
    await supabase.from('deferred_requests').update({ status: 'confirmed' }).eq('id', requestId)
    if (paymentId) {
      const newPenalty = Math.max(0, Number(pay?.penalty_amount || 0) - amount)
      await supabase.from('payments').update({ penalty_amount: newPenalty }).eq('id', paymentId)
    }
    await supabase.from('notifications_log').insert({ user_id: tenantId, type: 'deferred_confirmed', related_id: contractId, message: `🧊 Штраф ${Number(amount).toFixed(0)} ₽ заморожен и будет учтён в конце договора`, sent_at: new Date().toISOString() })
    showToast('✅ Отсрочка подтверждена')
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function freezePenalty(paymentId: string) {
    const { data: pay } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle()
    if (!pay) return
    const pen = Number(pay.penalty_amount || 0)
    if (pen <= 0) { showToast('Нет штрафа для заморозки'); return }
    const { error } = await supabase.from('frozen_penalties').insert({ contract_id: pay.contract_id, payment_id: pay.id, period: pay.period, amount: pen, original_amount: pen, note: 'штраф заморожен вручную' })
    if (error) { showToast('Ошибка: ' + error.message); return }
    await supabase.from('payments').update({ penalty_amount: 0 }).eq('id', paymentId)
    const { data: con } = await supabase.from('contracts').select('*').eq('id', pay.contract_id).maybeSingle()
    if (con) await supabase.from('notifications_log').insert({ user_id: con.tenant_id, type: 'deferred_confirmed', related_id: pay.id, message: `🧊 Штраф ${pen.toFixed(0)} ₽ заморожен и будет учтён в конце договора`, sent_at: new Date().toISOString() })
    showToast('✅ Штраф заморожен')
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function updatePaymentMethod(contractId: string, method: 'card' | 'cash' | 'both') {
    const updateData: any = { payment_method: method }
    if (method === 'cash') updateData.cash_slots = []
    const { error } = await supabase.from('contracts').update(updateData).eq('id', contractId)
    if (!error) {
      showToast('✅ Способ оплаты обновлён')
      setObjects(prev => prev.map(o => o.contract?.id === contractId ? { ...o, contract: { ...o.contract!, payment_method: method, cash_slots: method === 'cash' ? [] : o.contract!.cash_slots } } : o))
    } else showToast('Ошибка: ' + error.message)
  }

  async function confirmChannel(paymentId: string, channel: 'card' | 'cash', close: boolean = false) {
    const { data: pay } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle()
    if (!pay) { showToast('Платёж не найден'); return }
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
    if (e1) { showToast('Ошибка: ' + e1.message); return }
    showToast('✅ Подтверждено')
    if (update.confirmed_by_landlord) await ensureNextPayment(pay.contract_id)
    const { data: con } = await supabase.from('contracts').select('*').eq('id', pay.contract_id).maybeSingle()
    if (con) {
      const msg = channel === 'card' ? '🟢 Арендодатель подтвердил получение по безналу' : (close ? '⚪ Наличный канал закрыт' : '🟢 Арендодатель подтвердил получение наличных')
      await supabase.from('notifications_log').insert({ user_id: con.tenant_id, type: 'payment_confirmed', related_id: pay.id, message: msg, sent_at: new Date().toISOString() })
    }
    window.dispatchEvent(new Event('rentflow-refresh'))
  }
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

  const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
  const iosRed: React.CSSProperties = { border: 'none', background: 'transparent', color: '#ff3b30', fontSize: 15, cursor: 'pointer', padding: 4, flexShrink: 0 }
  const iosOk: React.CSSProperties = { color: '#1e7e34', fontSize: 14, fontWeight: 600 }
  const iosMuted: React.CSSProperties = { color: '#8e8e93', fontSize: 14 }
  const secHead: React.CSSProperties = { fontSize: 13, color: '#8e8e93', margin: '14px 4px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }

  const current = objects.find(o => o.id === openId) || null
  const contract = current?.contract
  const deposit = Number((contract as any)?.deposit_amount || 0)
  const depositPaid = Number((contract as any)?.deposit_paid || 0)
  const periodMid = current?.payment ? parseDate(current.payment.period) : null
  const sd = (contract as any)?.start_date ? parseDate((contract as any).start_date) : null
  const firstMonthPending = !!(contract && current?.payment && sd && periodMid && !current.payment.confirmed_by_landlord && periodMid.getFullYear() === sd.getFullYear() && periodMid.getMonth() === sd.getMonth())
  const firstMonthCurrent = !!(contract && current?.payment && sd && periodMid && periodMid.getFullYear() === sd.getFullYear() && periodMid.getMonth() === sd.getMonth())
  const openPay = current?.payment && !current.payment.confirmed_by_landlord ? current.payment : null
  const lastConfirmedIsFirst = !!(contract && sd && current?.payment && current.payment.confirmed_by_landlord && periodMid && periodMid.getFullYear() === sd.getFullYear() && periodMid.getMonth() === sd.getMonth())
  const showUtilities = !!(contract && current?.paymentId && current.readingsMode !== 'self' && (openPay ? !firstMonthCurrent : lastConfirmedIsFirst))
  const tenantChoseCash = contract && (contract.payment_method === 'cash' || (contract.payment_method === 'both' && (contract as any).tenant_pay_method === 'cash'))
  const objHistory = history.filter(h => h.objId === current?.id).slice(0, 10)

  const payBadge = !!((current?.payment && !current.payment.confirmed_by_landlord) || firstMonthPending)
  const metersBadge = !!current?.waitingForReadings

  if (userLoading || loading) return <div style={T.page}>Загрузка…</div>
  if (error) return <div style={T.page}><div style={T.card}>{error}</div></div>

  if (!current) {
    return (
      <div style={{ ...T.page, paddingBottom: 40 }}>
        <h1 style={T.h1}>Мои объекты</h1>
        {notifications.length > 0 && (
          <div style={T.card}>
            <div style={T.h2}>Уведомления</div>
            {notifications.map(n => (
              <div key={n.id} style={T.row}>
                <span style={{ fontSize: 14 }}>{(n as any).message || getNotificationText(n.type)}</span>
              </div>
            ))}
          </div>
        )}
        <div style={T.card}>
          {objects.length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Пока нет объектов — добавьте первый.</div>}
          {objects.map((o, i) => (
            <div key={o.id}>
              {i > 0 && <div style={{ height: 1, background: 'rgba(60,60,67,0.12)' }} />}
              <button
                onClick={() => { setOpenId(o.id); setTab('pay') }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 0', textAlign: 'left', boxSizing: 'border-box' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{o.address}</div>
                  <div style={{ fontSize: 13, color: o.statusColor || '#8e8e93', marginTop: 2 }}>
                    {o.statusDetail}{o.amount > 0 ? ` · ${o.amount.toFixed(0)} ₽` : ''}
                  </div>
                </div>
                {Number((o.contract as any)?.deposit_amount || 0) > 0 && (
                  <span style={{ fontSize: 12, color: '#8e8e93', flexShrink: 0 }}>депозит {Number((o.contract as any).deposit_paid || 0).toFixed(0)}/{Number((o.contract as any).deposit_amount).toFixed(0)}</span>
                )}
                <span style={{ color: '#c7c7cc', fontSize: 18 }}>›</span>
              </button>
            </div>
          ))}
        </div>

        <ObjectAdd />
      </div>
    )
  }

  return (
    <div style={{ ...T.page, paddingBottom: 90 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
        <button style={iosBlue} onClick={() => setOpenId(null)}>← Мои объекты</button>
      </div>
      <h1 style={{ ...T.h1, fontSize: 22 }}>{current.address}</h1>

      {tab === 'pay' && (
        <>
          {contract && firstMonthPending && (
            <div style={T.card}>
              <div style={T.h2}>Первый месяц</div>
              <button style={T.btn} onClick={() => confirmSigning(current.paymentId!)}>Подтвердить: первый месяц получен при подписании</button>
            </div>
          )}

          {contract && current.paymentId && !current.payment?.confirmed_by_landlord && (
            <div style={T.card}>
              <div style={T.h2}>Подтверждение оплаты</div>
              <div style={T.row}>
                <span>Безнал</span>
                {current.payment?.confirmed_card
                  ? <span style={iosOk}>получен</span>
                  : current.payment?.card_claimed
                    ? <button style={iosBlue} onClick={() => confirmChannel(current.paymentId!, 'card')}>Подтвердить</button>
                    : <span style={iosMuted}>не заявлен</span>}
              </div>
              <div style={{ ...T.row, borderBottom: 'none' }}>
                <span>Нал</span>
                {current.payment?.confirmed_cash
                  ? <span style={iosOk}>получен</span>
                  : current.payment?.cash_closed
                    ? <span style={iosMuted}>канал закрыт</span>
                    : current.hasConfirmedCashMeeting
                      ? (
                        <span style={{ display: 'flex', gap: 14 }}>
                          <button style={iosRed} onClick={() => confirmChannel(current.paymentId!, 'cash', true)}>закрыть</button>
                          <button style={iosBlue} onClick={() => confirmChannel(current.paymentId!, 'cash')}>Подтвердить</button>
                        </span>
                      )
                      : <span style={iosMuted}>не заявлен</span>}
              </div>
              {!current.payment?.card_claimed && !current.hasConfirmedCashMeeting && (
                <button style={T.btn} onClick={() => confirmChannel(current.paymentId!, 'card')}>Подтвердить оплату полностью</button>
              )}
            </div>
          )}

          {showUtilities && (
            <div style={T.card}>
              <div style={T.h2}>Ресурсы по квитанции</div>
              <div style={{ ...T.row, borderBottom: 'none' }}>
                <input
                  type="number"
                  value={utilInputs[current.id] ?? String(current.utilitiesAmount || '')}
                  onChange={(e) => setUtilInputs({ ...utilInputs, [current.id]: e.target.value })}
                  placeholder="Сумма, ₽"
                  style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right', fontSize: 15, color: '#1d1d1f', padding: 0 }}
                  inputMode="numeric"
                />
                <button style={iosBlue} onClick={() => saveUtilitiesNext(utilInputs[current.id] ?? String(current.utilitiesAmount || 0))}>Включить в платёж</button>
              </div>
              <div style={T.tiny}>Введённая сумма записывается как есть (заменяет предыдущую), добавляется к платежу отдельно, не растёт при просрочке и не входит в штрафы. Если следующего счёта ещё нет — он создаётся вместе с ресурсами.</div>
            </div>
          )}

          {contract && ((current.deferredRequests || []).length > 0 || ((current.penaltyAmount || 0) > 0 && !current.payment?.confirmed_by_landlord)) && (
            <div style={T.card}>
              <div style={T.h2}>Штраф текущего платежа</div>
              {(current.deferredRequests || []).map((r: any) => (
                <div key={r.id} style={T.row}>
                  <span>Просьба отсрочить {Number(r.amount).toFixed(0)} ₽</span>
                  <button style={iosBlue} onClick={() => confirmDeferral(r.id, contract.id, r.payment_id, Number(r.amount), contract.tenant_id)}>Подтвердить</button>
                </div>
              ))}
              {(current.penaltyAmount || 0) > 0 && !current.payment?.confirmed_by_landlord && (
                <div style={{ ...T.row, borderBottom: 'none' }}>
                  <span>Текущий штраф: {(current.penaltyAmount || 0).toFixed(0)} ₽</span>
                  <button style={iosBlue} onClick={() => freezePenalty(current.paymentId!)}>Заморозить</button>
                </div>
              )}
            </div>
          )}

          {contract && tenantChoseCash && (
            <div>
              <div style={secHead}>Оплата наличными</div>
              <CashNegotiation
                contractId={contract.id}
                myRole="landlord"
                tenantId={contract.tenant_id}
                landlordId={current.landlord_id}
              />
            </div>
          )}

          <div style={T.card}>
            <div style={T.h2}>История платежей</div>
            {objHistory.length === 0 ? (
              <div style={{ ...T.small, margin: '8px 0' }}>Платежей пока нет</div>
            ) : (
              objHistory.map((h: any) => {
                const late = h.confirmed_by_landlord && h.confirmed_at && new Date(h.confirmed_at) > parseDate(h.due_date)
                const sum = Number(h.base_amount || 0) + Number(h.penalty_amount || 0) + Number(h.utilities_amount || 0)
                return (
                  <div key={h.id} style={T.row}>
                    <span>{parseDate(h.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: late ? '#ff3b30' : '#8e8e93' }}>{h.confirmed_by_landlord ? (late ? 'просрочка' : 'вовремя') : 'не подтверждён'}</span>
                      <b>{sum.toFixed(0)} ₽</b>
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {tab === 'meters' && (
        <>
          {current.readingsMode === 'manual' && contract && (
            <>
              <div style={secHead}>Показания за текущий месяц</div>
              <ReadingsReview contractId={contract.id} tenantId={contract.tenant_id} />
            </>
          )}
          <div style={secHead}>Настройка счётчиков</div>
          <MetersEditor objId={current.id} />
        </>
      )}

      {tab === 'contract' && contract && (
        <>
          <div style={T.card}>
            <div style={T.h2}>Договор</div>
            <div style={T.row}><span style={iosMuted}>Арендатор</span><b>{(contract as any).tenant?.full_name || '—'}</b></div>
            {(contract as any).tenant?.phone && <div style={T.row}><span style={iosMuted}>Телефон</span><b>{(contract as any).tenant.phone}</b></div>}
            {(contract as any).start_date && (contract as any).end_date && (
              <div style={T.row}><span style={iosMuted}>Срок</span><b>{parseDate((contract as any).start_date).toLocaleDateString('ru-RU')} — {parseDate((contract as any).end_date).toLocaleDateString('ru-RU')}</b></div>
            )}
            <div style={T.row}><span style={iosMuted}>Аренда</span><b>{Number(contract.rent_amount).toFixed(0)} ₽/мес</b></div>
            <div style={T.row}><span style={iosMuted}>Оплата</span><b>до {contract.payment_day} числа</b></div>
            {deposit > 0 && (
              <div style={{ padding: '8px 0 4px' }}>
                <Progress value={depositPaid} max={deposit} />
                <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                  <button style={iosBlue} onClick={() => setDepModal('add')}>Внести</button>
                  <button style={iosBlue} onClick={() => setDepModal('edit')}>Изменить</button>
                </div>
              </div>
            )}
          </div>

          <div style={T.card}>
            <div style={T.h2}>Способ оплаты</div>
            {[
              { v: 'card', l: 'Безналичный расчёт' },
              { v: 'cash', l: 'Наличные' },
              { v: 'both', l: 'Оба способа' },
            ].map((o, i) => (
              <div key={o.v}>
                {i > 0 && <div style={{ height: 1, background: 'rgba(60,60,67,0.12)' }} />}
                <button
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 44, border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 0', fontSize: 15, color: '#1d1d1f' }}
                  onClick={() => updatePaymentMethod(contract.id, o.v as any)}
                >
                  {o.l}
                  {contract.payment_method === o.v && <span style={{ color: '#0071e3', fontWeight: 600 }}>✓</span>}
                </button>
              </div>
            ))}
            {contract.payment_method === 'both' && <div style={T.tiny}>Способ оплаты выбирает арендатор: карта или наличные.</div>}
          </div>

          <div style={T.card}>
            <div style={T.h2}>Замороженные штрафы</div>
            {(current.frozenRows || []).length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Замороженных штрафов нет</div>}
            {(current.frozenRows || []).map((f: any) => (
              <div key={f.id} style={T.item}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 15 }}>
                  <span>{f.period ? parseDate(f.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : 'без месяца'}</span>
                  <b>{Number(f.amount).toFixed(0)} ₽</b>
                </div>
                {f.adjusted_note && <div style={T.tiny}>{f.adjusted_note}</div>}
                <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                  <button style={iosBlue} onClick={() => openAdjust(f.id, false)}>изменить</button>
                  <button style={iosRed} onClick={() => openAdjust(f.id, true)}>обнулить</button>
                </div>
              </div>
            ))}
            {!!current.frozenTotal && current.frozenTotal > 0 && (
              deposit > 0
                ? (deposit >= (current.frozenTotal || 0)
                  ? <div style={T.small}>Будет удержано из депозита; остаток: {(deposit - (current.frozenTotal || 0)).toFixed(0)} ₽</div>
                  : <div style={{ ...T.small, color: '#ff3b30' }}>Сверх депозита долг: {((current.frozenTotal || 0) - deposit).toFixed(0)} ₽</div>)
                : <div style={{ ...T.small, color: '#ff3b30' }}>Долг арендатора (депозита нет)</div>
            )}
            <div style={T.tiny}>Записи не удаляются до конца договора; каждое изменение сохраняется с примечанием и датой.</div>
          </div>

          <ObjectEdit objectId={current.id} />
        </>
      )}

      {tab === 'chat' && contract && (
        <div style={T.card}>
          <div style={T.h2}>Чат с арендатором</div>
          <Chat contractId={contract.id} myId={user!.id} />
        </div>
      )}

      <BottomNav tabs={OBJ_TABS} tab={tab} setTab={setTab} badges={{ pay: payBadge, meters: metersBadge }} />

      <PromptNumber
        open={depModal === 'add'}
        title="Взнос по депозиту"
        label={`Внесено ${depositPaid.toFixed(0)} из ${deposit.toFixed(0)} ₽. Сумма взноса:`}
        onClose={() => setDepModal(null)}
        onSubmit={(n) => doAddDeposit(n)}
      />
      <PromptNumber
        open={depModal === 'edit'}
        title="Изменить «внесено»"
        label={`Общая сумма депозита ${deposit.toFixed(0)} ₽. Новое значение «внесено»:`}
        initial={String(depositPaid || 0)}
        onClose={() => setDepModal(null)}
        onSubmit={(n) => doEditDeposit(n)}
      />

      <Modal open={!!fz} title={fz?.zero ? 'Обнулить замороженный штраф' : 'Изменить замороженный штраф'} onClose={() => setFz(null)}>
        {!fz?.zero && (
          <>
            <div style={{ fontSize: 14, marginBottom: 8 }}>Новая сумма, ₽</div>
            <input value={fzAmount} onChange={(e) => setFzAmount(e.target.value)} inputMode="decimal" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 16, boxSizing: 'border-box', marginBottom: 12 }} />
          </>
        )}
        <div style={{ fontSize: 14, marginBottom: 8 }}>{fz?.zero ? 'Причина обнуления (обязательно)' : 'Примечание к изменению (обязательно)'}</div>
        <input value={fzNote} onChange={(e) => setFzNote(e.target.value)} placeholder="например: договорились с арендатором" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 16, boxSizing: 'border-box', marginBottom: 14 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }} onClick={confirmAdjust}>Сохранить</button>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => setFz(null)}>Отмена</button>
        </div>
      </Modal>
    </div>
  )
}

export default LandlordDashboard
