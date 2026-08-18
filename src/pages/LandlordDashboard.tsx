import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { useTeam } from '../hooks/useTeam'
import CashNegotiation from '../components/CashNegotiation'
import MetersEditor from '../components/MetersEditor'
import ReadingsReview from '../components/ReadingsReview'
import Chat from '../components/Chat'
import { ObjectAdd, ObjectEdit } from '../components/ObjectManager'
import TeamManager from '../components/TeamManager'
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

function isFirstPeriod(period: any, sd: Date | null): boolean {
  if (!sd) return false
  const p = parseDate(period)
  return p.getMonth() === sd.getMonth() && p.getFullYear() === sd.getFullYear()
}

const OBJ_TABS = [
  { id: 'pay', l: 'Оплата' },
  { id: 'meters', l: 'Счётчики' },
  { id: 'contract', l: 'Договор' },
  { id: 'chat', l: 'Чат' },
]

export function LandlordDashboard() {
  const { user, loading: userLoading } = useTelegramUser()
  const { teamId } = useTeam()
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
        const today = new Date()
        const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        const currentMonth = today.getMonth()
        const currentYear = today.getFullYear()

        const [notifRes, objRes] = await Promise.all([
          supabase.from('notifications_log').select('*').eq('user_id', user!.id).order('sent_at', { ascending: false }).limit(5),
          supabase.from('objects').select('*').eq(teamId ? 'team_id' : 'landlord_id', (teamId || user!.id) as string),
        ])
        if (notifRes.data) setNotifications(notifRes.data)
        const objectsData = objRes.data
        if (!objectsData || objectsData.length === 0) { setObjects([]); setHistory([]); setLoading(false); return }

        const objIds = objectsData.map((o: any) => o.id)
        const { data: contractsData } = await supabase
          .from('contracts').select('*, tenant:users!tenant_id(full_name, phone)')
          .in('object_id', objIds).eq('status', 'active')
        const contractByObj: Record<string, any> = {}
        for (const c of contractsData || []) contractByObj[c.object_id] = c
        const contractIds = (contractsData || []).map((c: any) => c.id)

        if (contractIds.length) {
          await Promise.all(contractIds.map((id: string) => ensureNextPayment(id).catch(() => {})))
        }

        const [paysRes, dReqRes, fRowsRes, meetRes, readRes] = await Promise.all([
          supabase.from('payments').select('*').in('contract_id', contractIds).order('period', { ascending: false }),
          supabase.from('deferred_requests').select('*').in('contract_id', contractIds).eq('status', 'proposed'),
          supabase.from('frozen_penalties').select('*').in('contract_id', contractIds).order('period', { ascending: true }),
          supabase.from('cash_meetings').select('*').in('contract_id', contractIds).eq('kind', 'meeting').eq('status', 'confirmed'),
          supabase.from('meter_readings').select('contract_id').in('contract_id', contractIds)
            .gte('submitted_at', new Date(currentYear, currentMonth, 1).toISOString())
            .lt('submitted_at', new Date(currentYear, currentMonth + 1, 1).toISOString()),
        ])

        const paysBy: Record<string, any[]> = {}
        for (const p of paysRes.data || []) { (paysBy[p.contract_id] = paysBy[p.contract_id] || []).push(p) }
        const dReqBy: Record<string, any[]> = {}
        for (const r of dReqRes.data || []) { (dReqBy[r.contract_id] = dReqBy[r.contract_id] || []).push(r) }
        const fRowsBy: Record<string, any[]> = {}
        for (const f of fRowsRes.data || []) { (fRowsBy[f.contract_id] = fRowsBy[f.contract_id] || []).push(f) }
        const meetBy: Record<string, any> = {}
        for (const m of meetRes.data || []) if (!meetBy[m.contract_id]) meetBy[m.contract_id] = m
        const readCountBy: Record<string, number> = {}
        for (const r of readRes.data || []) readCountBy[r.contract_id] = (readCountBy[r.contract_id] || 0) + 1

        const objectsWithStatus: ObjectWithStatus[] = []
        const allHistory: any[] = []
        for (const obj of objectsData) {
          const contract = contractByObj[obj.id]
          if (!contract) { objectsWithStatus.push({ ...obj, status: 'no_contract', amount: 0, paymentId: null, statusColor: '#888', statusDetail: 'Нет договора' }); continue }
          const readingsMode = contract.readings_mode || 'manual'
          const reminder = contract.reminder_days_before || 3
          const allPays = paysBy[contract.id] || []
          for (const p of allPays) allHistory.push({ ...p, objId: obj.id, address: obj.address })
          const fRows = fRowsBy[contract.id] || []
          const frozenTotal = fRows.reduce((s2: number, d: any) => s2 + Number(d.amount || 0), 0)
          const openPays = allPays.filter((p: any) => !p.confirmed_by_landlord)
          const payment = openPays.length ? openPays[openPays.length - 1] : allPays[0]
          if (!payment) { objectsWithStatus.push({ ...obj, status: 'no_payment', statusDetail: 'Платёж не создан', statusColor: '#a80', amount: contract.rent_amount, baseAmount: contract.rent_amount, penaltyAmount: 0, utilitiesAmount: 0, paymentId: null, contract, readingsMode, frozenTotal, frozenRows: fRows, deferredRequests: dReqBy[contract.id] || [] }); continue }
          const cashMeeting = meetBy[contract.id] || null
          const dueMid = parseDate(payment.due_date)
          const sd = contract.start_date ? parseDate(contract.start_date) : null
          const firstMonth = isFirstPeriod(payment.period, sd)
          const isOverdue = todayMid > dueMid && !firstMonth && (!sd || dueMid >= sd)
          const daysUntilDue = Math.round((dueMid.getTime() - todayMid.getTime()) / 86400000)
          const baseAmount = payment.base_amount || contract.rent_amount
          const penaltyAmount = payment.penalty_amount || 0
          const utilitiesAmount = Number(payment.utilities_amount || 0)
          const paymentId = String(payment.id)
          let waitingForReadings = false
          if (readingsMode === 'manual' && contract.meter_deadline_day && today.getDate() > contract.meter_deadline_day) {
            if (!(readCountBy[contract.id] > 0)) waitingForReadings = true
          }
          const needUtilitiesReminder = !payment.confirmed_by_landlord && readingsMode !== 'self' && daysUntilDue >= 0 && daysUntilDue <= reminder && utilitiesAmount === 0
          let status: 'paid' | 'overdue' | 'pending' = 'pending'
          let statusDetail = ''
          let statusColor = '#a80'
          if (!payment.confirmed_by_landlord) {
            if (firstMonth) { statusDetail = 'Первый месяц — ждёт оплаты'; statusColor = '#a80' }
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
          objectsWithStatus.push({ ...obj, status, statusDetail, statusColor, amount: baseAmount + penaltyAmount + utilitiesAmount, baseAmount, penaltyAmount, utilitiesAmount, paymentId, contract, payment, daysOverdue: isOverdue ? Math.round((todayMid.getTime() - dueMid.getTime()) / 86400000) : undefined, waitingForReadings, needUtilitiesReminder, readingsMode, frozenTotal, frozenRows: fRows, deferredRequests: dReqBy[contract.id] || [], hasConfirmedCashMeeting: !!cashMeeting })
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
  }, [user, teamId])

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
      const msg = channel === 'card' ? '🟢 Арендодатель подтвердил безналичную оплату' : (close ? '⚪ Наличный расчёт завершён' : '🟢 Арендодатель подтвердил оплату наличными')
      await supabase.from('notifications_log').insert({ user_id: con.tenant_id, type: 'payment_confirmed', related_id: pay.id, message: msg, sent_at: new Date().toISOString() })
    }
    window.dispatchEvent(new Event('rentflow-refresh'))
  }
