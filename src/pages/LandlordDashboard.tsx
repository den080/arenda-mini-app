import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { useTeam } from '../hooks/useTeam'
import CashNegotiation from '../components/CashNegotiation'
import MetersEditor from '../components/MetersEditor'
import ReadingsReview from '../components/ReadingsReview'
import Chat from '../components/Chat'
import { ObjectAdd } from '../components/ObjectManager'
import TeamManager from '../components/TeamManager'
import { ensureNextPayment } from '../lib/nextPayment'
import { setAnalyticsUser, trackOpen, trackScreen } from '../lib/analytics'
import { BottomNav, showToast } from '../components/ui'
import { T } from '../theme'
import type { Object as PropertyObject, Contract } from '../types/database'

import { parseDate, isFirstPeriod, clampDay, toISO, OBJ_TABS, iosBlue, iosRed, secHead, getNotificationText, actBlue, actRed, iosOk, iosMuted, valText, valMoney, hair } from './landlord/helpers'
import { LandlordCtx } from './landlord/ctx'
import { PayTab } from './landlord/PayTab'
import { ContractTab } from './landlord/ContractTab'
import { ArchiveItemView, ArchiveListView } from './landlord/ArchiveViews'
import { Modals } from './landlord/Modals'

interface ObjectWithStatus extends PropertyObject {
  status: 'paid' | 'overdue' | 'pending' | 'no_contract' | 'no_payment'
  statusDetail?: string
  statusColor?: string
  amount: number
  baseAmount?: number
  penaltyAmount?: number
  utilitiesAmount?: number
  paymentId: string | null
  contract?: Contract & { tenant?: any }
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

export function LandlordDashboard() {
  const { user, loading: userLoading } = useTelegramUser()
  const { teamId, pool, pools, selectPool, role: teamRole } = useTeam()

  const [objects, setObjects] = useState<ObjectWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<any[]>([])
  const [utilInputs, setUtilInputs] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<any[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [tab, setTab] = useState('pay')
  const [depModal, setDepModal] = useState<'add' | 'edit' | null>(null)
  const [fz, setFz] = useState<{ id: string; zero: boolean } | null>(null)
  const [fzAmount, setFzAmount] = useState('')
  const [fzNote, setFzNote] = useState('')
  const [payConfirm, setPayConfirm] = useState<null | { kind: 'card' | 'cash' | 'cash-close' | 'full' }>(null)
  const [payConfirmOk, setPayConfirmOk] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [undoId, setUndoId] = useState<string | null>(null)
  const [receiptFor, setReceiptFor] = useState<any | null>(null)
  const [archived, setArchived] = useState<any[]>([])
  const [archiveId, setArchiveId] = useState<string | null>(null)
  const [archiveListOpen, setArchiveListOpen] = useState(false)
  const [showTeam, setShowTeam] = useState(false)

  // Совместный доступ: виден при Pro ИЛИ admin/tester
  useEffect(() => {
    if (!user) return
    ;(async () => {
      let owner = user.id
      if (teamId) {
        const { data: t } = await supabase.from('teams').select('owner_id').eq('id', teamId).maybeSingle()
        if (t) owner = t.owner_id
      }
      const { data: s } = await supabase.from('subscriptions').select('until_date').eq('owner_id', owner).order('until_date', { ascending: false }).maybeSingle()
      const today = new Date()
      const todayS = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const pro = !!(s && s.until_date >= todayS)
      const dig = (v: string) => (v || '').replace(/\D/g, '').slice(-10)
      const { data: ac } = await supabase.from('access_control').select('phone, role')
      const priv = (ac || []).some((r: any) => (r.role === 'admin' || r.role === 'tester') && dig(r.phone) === dig(user.phone || ''))
      setShowTeam(pro || priv)
    })()
  }, [user, teamId])

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
        .from('contracts').select('*, tenant:users!tenant_id(full_name, phone, email)')
        .in('object_id', objIds).eq('status', 'active')
      const contractByObj: Record<string, any> = {}
      for (const c of contractsData || []) contractByObj[c.object_id] = c
      const contractIds = (contractsData || []).map((c: any) => c.id)
      const { data: archData } = await supabase
        .from('contracts').select('*, object:objects(id, address), tenant:users(full_name, phone)')
        .in('object_id', objIds).eq('status', 'terminated')
        .order('terminated_at', { ascending: false })
      setArchived(archData || [])
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
      const periodISO = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`
      let rulesBy: Record<string, any[]> = {}
      let readPeriodBy: Record<string, any[]> = {}
      if (contractIds.length) {
        const [rulesRes, readPeriodRes] = await Promise.all([
          supabase.from('penalty_rules').select('*').in('contract_id', contractIds),
          supabase.from('meter_readings').select('contract_id, period, status, submitted_at').in('contract_id', contractIds).eq('period', periodISO),
        ])
        for (const r of rulesRes.data || []) { (rulesBy[r.contract_id] = rulesBy[r.contract_id] || []).push(r) }
        for (const r of readPeriodRes.data || []) { (readPeriodBy[r.contract_id] = readPeriodBy[r.contract_id] || []).push(r) }
      }
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
        if (readingsMode === 'manual' && contract.meter_deadline_day) {
          const rr = (rulesBy[contract.id] || []).find((r: any) => r.violation_type === 'readings_overdue')
          const rRate = rr ? Number(rr.rate) || 0 : 0
          if (rRate > 0) {
            const deadline = new Date(currentYear, currentMonth, Number(contract.meter_deadline_day))
            if (todayMid > deadline) {
              const periodReads = readPeriodBy[contract.id] || []
              const confirmed = periodReads.some((r: any) => r.status === 'confirmed')
              if (!confirmed) {
                let endT = todayMid.getTime()
                if (periodReads.length) {
                  const firstSub = Math.min(...periodReads.map((r: any) => parseDate(String(r.submitted_at).slice(0, 10)).getTime()))
                  endT = Math.min(firstSub, endT)
                }
                const daysLate = Math.round((endT - deadline.getTime()) / 86400000)
                const amount = Math.max(0, daysLate) * rRate
                const isReadingsRow = (f: any) => String(f.note || '').includes('показаний')
                const existing = fRows.find((f: any) => f.period === periodISO && isReadingsRow(f))
                const wasAdjusted = fRows.some((f: any) => f.period === periodISO && isReadingsRow(f) && f.adjusted_at)
                if (amount > 0 && !existing && !wasAdjusted) {
                  await supabase.from('frozen_penalties').insert({ contract_id: contract.id, payment_id: null, period: periodISO, amount, original_amount: amount, note: 'штраф за просрочку показаний' })
                } else if (existing && !existing.adjusted_at && Number(existing.amount) !== amount) {
                  await supabase.from('frozen_penalties').update({ amount }).eq('id', existing.id)
                }
              }
            }
          }
        }
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
          const paidPart = Number(payment.paid_amount || 0)
          if (firstMonth) { statusDetail = 'Первый месяц — ждёт оплаты'; statusColor = '#a80' }
          else if (isOverdue) { status = 'overdue'; statusDetail = `Просрочка ${Math.round((todayMid.getTime() - dueMid.getTime()) / 86400000)} дн.`; statusColor = '#c00' }
          else if (waitingForReadings) { statusDetail = 'Ждём показания'; statusColor = '#a80' }
          else if (paidPart > 0) { statusDetail = `Оплачено частично · до оплаты ${daysUntilDue} дн. (${dueMid.toLocaleDateString('ru-RU')})`; statusColor = '#a80' }
          else if (daysUntilDue === 0) { statusDetail = `Сегодня последний день оплаты (${dueMid.toLocaleDateString('ru-RU')})`; statusColor = '#a80' }
          else if (daysUntilDue <= reminder) { statusDetail = `До оплаты ${daysUntilDue} дн. (${dueMid.toLocaleDateString('ru-RU')})`; statusColor = '#a80' }
          else { statusDetail = `До оплаты ${daysUntilDue} дн. (${dueMid.toLocaleDateString('ru-RU')})`; statusColor = '#080' }
        } else {
          status = 'paid'
          const periodDate = parseDate(payment.period)
          const nm = periodDate.getMonth() + 1
          const ny = periodDate.getFullYear() + Math.floor(nm / 12)
          const nextDue = new Date(ny, nm % 12, clampDay(ny, nm % 12, contract.payment_day || 1))
          const daysLeft = Math.round((nextDue.getTime() - todayMid.getTime()) / 86400000)
          if (daysLeft < 0) { statusDetail = `Платёж просрочен на ${-daysLeft} дн. (${nextDue.toLocaleDateString('ru-RU')})`; statusColor = '#c00' }
          else if (daysLeft === 0) { statusDetail = `Сегодня последний день оплаты (${nextDue.toLocaleDateString('ru-RU')})`; statusColor = '#a80' }
          else if (daysLeft <= reminder) { statusDetail = `${daysLeft} дн. до оплаты (${nextDue.toLocaleDateString('ru-RU')})`; statusColor = '#a80' }
          else { statusDetail = `${daysLeft} дн. до оплаты (${nextDue.toLocaleDateString('ru-RU')})`; statusColor = '#080' }
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

  useEffect(() => {
    if (!user) return
    fetchData()
    const onRefresh = () => fetchData()
    window.addEventListener('rentflow-refresh', onRefresh)
    const interval = setInterval(() => fetchData(), 30000)
    return () => { window.removeEventListener('rentflow-refresh', onRefresh); clearInterval(interval) }
  }, [user, teamId, pool])

  useEffect(() => { if (user) { setAnalyticsUser(user); trackOpen('landlord') } }, [user])

  // handlers
  function canUndo(h: any): boolean {
    return !!h.confirmed_by_landlord && !!h.confirmed_at && (Date.now() - new Date(h.confirmed_at).getTime()) < 24 * 3600 * 1000
  }
  async function undoConfirm(paymentId: string) {
    const { data: pay } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle()
    if (!pay) { setUndoId(null); return }
    const { error } = await supabase.from('payments').update({ confirmed_by_landlord: false, confirmed_at: null, confirmed_card: false, confirmed_cash: false, cash_closed: false }).eq('id', paymentId)
    if (error) { showToast('Ошибка: ' + error.message); setUndoId(null); return }
    const { data: nexts } = await supabase.from('payments').select('*').eq('contract_id', pay.contract_id).eq('confirmed_by_landlord', false).order('period', { ascending: true })
    for (const n of nexts || []) {
      if (String(n.period) > String(pay.period) && Number(n.paid_amount || 0) === 0 && !n.card_claimed) {
        await supabase.from('payments').delete().eq('id', n.id); break
      }
    }
    const { data: con } = await supabase.from('contracts').select('tenant_id').eq('id', pay.contract_id).maybeSingle()
    if (con) await supabase.from('notifications_log').insert({ user_id: con.tenant_id, type: 'payment_undo', related_id: pay.id, message: '↩️ Подтверждение оплаты отменено арендодателем (ошибка ввода)', sent_at: new Date().toISOString() })
    showToast('✅ Подтверждение отменено, счёт снова открыт')
    setUndoId(null)
    window.dispatchEvent(new Event('rentflow-refresh'))
  }
  function receiptText(h: any): string {
    const month = parseDate(h.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    const sum = Number(h.base_amount || 0) + Number(h.penalty_amount || 0) + Number(h.utilities_amount || 0)
    const tenantName = contract?.tenant?.full_name || 'арендатора'
    const landlordName = user?.full_name || 'арендодателя'
    const dateStr = new Date(h.confirmed_at || Date.now()).toLocaleDateString('ru-RU')
    return `РАСПИСКА\n${dateStr}\nЯ, ${landlordName}, получил от ${tenantName} сумму ${sum.toFixed(0)} ₽ в счёт оплаты аренды за ${month} по объекту: ${current?.address || h.address}. Оплата произведена наличными. Претензий по оплате не имею.`
  }
  async function copyReceipt(h: any) {
    try { await navigator.clipboard.writeText(receiptText(h)); showToast('✅ Расписка скопирована — отправьте её арендатору в чат') }
    catch { showToast('Не удалось скопировать') }
  }
  async function saveUtilities(paymentId: string, value: string) {
    const { error } = await supabase.from('payments').update({ utilities_amount: Number(value) || 0 }).eq('id', paymentId)
    if (error) showToast('Ошибка: ' + error.message); else { showToast('✅ Ресурсы добавлены к платежу'); window.dispatchEvent(new Event('rentflow-refresh')) }
  }
  async function saveUtilitiesNext(value: string) {
    if (!contract) return
    const amount = Number(value) || 0
    const { data: openPays } = await supabase.from('payments').select('*').eq('contract_id', contract.id).eq('confirmed_by_landlord', false).order('period', { ascending: false })
    if (openPays && openPays.length > 0) {
      await saveUtilities(openPays[openPays.length - 1].id, String(amount))
    } else {
      const { data: lastp } = await supabase.from('payments').select('*').eq('contract_id', contract.id).order('period', { ascending: false }).limit(1)
      const base = lastp && lastp[0] ? parseDate(lastp[0].period) : parseDate(contract.start_date || new Date().toISOString())
      const nextPeriod = new Date(base.getFullYear(), base.getMonth() + 1, 1)
      const due = new Date(nextPeriod.getFullYear(), nextPeriod.getMonth(), clampDay(nextPeriod.getFullYear(), nextPeriod.getMonth(), Number(contract.payment_day) || 1))
      const { error } = await supabase.from('payments').insert({ contract_id: contract.id, period: toISO(nextPeriod), due_date: toISO(due), base_amount: Number(contract.rent_amount) || 0, penalty_amount: 0, utilities_amount: amount })
      if (error) { showToast('Ошибка: ' + error.message); return }
      showToast('✅ Счёт создан вместе с ресурсами')
    }
    if (current) setUtilInputs(prev => ({ ...prev, [current.id]: String(amount) }))
    window.dispatchEvent(new Event('rentflow-refresh'))
  }
  async function recordReceipt(amount: number) {
    if (!contract || !current?.paymentId) return
    if (isNaN(amount) || amount <= 0) { showToast('Некорректная сумма'); return }
    const { data: pay } = await supabase.from('payments').select('*').eq('id', current.paymentId).maybeSingle()
    if (!pay) { showToast('Платёж не найден'); return }
    const total = Number(pay.base_amount || 0) + Number(pay.penalty_amount || 0) + Number(pay.utilities_amount || 0)
    let paid = Number(pay.paid_amount || 0) + amount
    let bal = Number(contract.balance || 0)
    let useBal = 0
    if (paid < total && bal > 0) { useBal = Math.min(bal, total - paid); paid += useBal }
    if (paid >= total) {
      const excess = paid - total
      const { error } = await supabase.from('payments').update({ paid_amount: total, confirmed_by_landlord: true, confirmed_at: new Date().toISOString() }).eq('id', pay.id)
      if (error) { showToast('Ошибка: ' + error.message); return }
      await supabase.from('contracts').update({ balance: bal - useBal + excess }).eq('id', contract.id)
      await ensureNextPayment(contract.id)
      await supabase.from('notifications_log').insert({ user_id: contract.tenant_id, type: 'payment_confirmed', related_id: pay.id, message: excess > 0 ? `🟢 Оплата получена, переплата ${excess.toFixed(0)} ₽ зачислена в баланс` : '🟢 Арендодатель подтвердил оплату', sent_at: new Date().toISOString() })
      showToast(excess > 0 ? `✅ Платёж закрыт, переплата ${excess.toFixed(0)} ₽ в балансе` : '✅ Платёж закрыт')
    } else {
      const { error } = await supabase.from('payments').update({ paid_amount: paid }).eq('id', pay.id)
      if (error) { showToast('Ошибка: ' + error.message); return }
      if (useBal > 0) await supabase.from('contracts').update({ balance: bal - useBal }).eq('id', contract.id)
      await supabase.from('notifications_log').insert({ user_id: contract.tenant_id, type: 'payment_partial', related_id: pay.id, message: `💰 Получено ${paid.toFixed(0)} из ${total.toFixed(0)} ₽`, sent_at: new Date().toISOString() })
      showToast(`✅ Учтено: ${paid.toFixed(0)} из ${total.toFixed(0)} ₽`)
    }
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
    const { error } = await supabase.from('frozen_penalties').update({ amount: newAmount, adjusted_at: new Date().toISOString(), adjusted_note: zero ? `обнулено: ${note}` : `изменено на ${newAmount.toFixed(0)}: ${note}` }).eq('id', fz.id)
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
    if (cardSatisfied && cashSatisfied) { update.confirmed_by_landlord = true; update.confirmed_at = new Date().toISOString(); update.paid_amount = Number(pay.base_amount || 0) + Number(pay.penalty_amount || 0) + Number(pay.utilities_amount || 0) }
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

  // вычисляемые значения для контекста
  const current = objects.find(o => o.id === openId) || null
  const contract: any = current?.contract
  const deposit = Number(contract?.deposit_amount || 0)
  const depositPaid = Number(contract?.deposit_paid || 0)
  const contractBalance = Number(contract?.balance || 0)
  const sd = contract?.start_date ? parseDate(contract.start_date) : null
  const firstMonthPending = !!(contract && current?.payment && !current.payment.confirmed_by_landlord && isFirstPeriod(current.payment.period, sd))
  const firstMonthCurrent = !!(contract && current?.payment && isFirstPeriod(current.payment.period, sd))
  const lastConfirmedIsFirst = !!(contract && current?.payment && current.payment.confirmed_by_landlord && isFirstPeriod(current.payment.period, sd))
  const openPay = current?.payment && !current.payment.confirmed_by_landlord ? current.payment : null
  const showUtilities = !!(contract && current?.paymentId && current.readingsMode !== 'self' && (openPay ? !firstMonthCurrent : lastConfirmedIsFirst))
  const tenantChoseCash = contract && (contract.payment_method === 'cash' || (contract.payment_method === 'both' && contract.tenant_pay_method === 'cash'))
  const objHistory = history.filter(h => h.objId === current?.id).slice(0, 10)
  const pcPay = current?.payment
  const pcMonth = pcPay ? new Date(pcPay.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : ''
  const pcSum = pcPay ? Number(pcPay.base_amount || 0) + Number(pcPay.penalty_amount || 0) + Number(pcPay.utilities_amount || 0) : 0
  const pcPaid = Number(pcPay?.paid_amount || 0)
  const payBadge = !!((current?.payment && !current.payment.confirmed_by_landlord) || firstMonthPending)
  const metersBadge = !!current?.waitingForReadings
  const arch = archived.find(a => a.id === archiveId) || null

  const ctxValue = useMemo(() => ({
    current, contract, sd, deposit, depositPaid, contractBalance,
    firstMonthPending, showUtilities, tenantChoseCash,
    objHistory, pcMonth, pcSum, pcPaid,
    utilInputs, setUtilInputs,
    depModal, setDepModal, fz, setFz, fzAmount, setFzAmount, fzNote, setFzNote,
    payConfirm, setPayConfirm, payConfirmOk, setPayConfirmOk,
    receiptOpen, setReceiptOpen, undoId, setUndoId, receiptFor, setReceiptFor,
    canUndo, undoConfirm, receiptText, copyReceipt,
    saveUtilitiesNext, recordReceipt, confirmSigning, doAddDeposit, doEditDeposit,
    openAdjust, confirmAdjust, confirmDeferral, freezePenalty, updatePaymentMethod, confirmChannel,
  }), [current, contract, sd, deposit, depositPaid, contractBalance, firstMonthPending, showUtilities, tenantChoseCash, objHistory, pcMonth, pcSum, pcPaid, utilInputs, depModal, fz, fzAmount, fzNote, payConfirm, payConfirmOk, receiptOpen, undoId, receiptFor])

  useEffect(() => {
    const screen = arch ? 'archive_item' : archiveListOpen ? 'archive_list' : current ? `object_${tab}` : 'objects_list'
    trackScreen(screen)
  }, [tab, openId, archiveListOpen, archiveId, arch, current])

  if (userLoading || loading) return <div style={T.page}>Загрузка…</div>
  if (error) return <div style={T.page}><div style={T.card}>{error}</div></div>

  if (arch) return <ArchiveItemView arch={arch} onBack={() => setArchiveId(null)} />
  if (archiveListOpen) return <ArchiveListView archived={archived} onBack={() => setArchiveListOpen(false)} onOpen={setArchiveId} />

  return (
    <LandlordCtx.Provider value={ctxValue}>
      {current ? (
        <div style={{ ...T.page, paddingBottom: 90 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
            <button style={iosBlue} onClick={() => setOpenId(null)}>← Мои объекты</button>
          </div>
          <h1 style={T.h1}>{current.address}</h1>
          {tab === 'pay' && <PayTab />}
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
          {tab === 'contract' && <ContractTab />}
          {tab === 'chat' && contract && (
            <div style={T.card}>
              <div style={T.h2}>Чат с арендатором</div>
              <Chat contractId={contract.id} myId={user!.id} />
            </div>
          )}
          <BottomNav tabs={OBJ_TABS} tab={tab} setTab={setTab} badges={{ pay: payBadge, meters: metersBadge }} />
          <Modals />
        </div>
      ) : (
        <div style={{ ...T.page, paddingBottom: 40 }}>
          <h1 style={T.h1}>Мои объекты</h1>
          {pools.length > 1 && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 0 10px' }}>
              {pools.map(p => (
                <button
                  key={p.id}
                  onClick={() => selectPool(p.id)}
                  style={{ flexShrink: 0, border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', background: pool === p.id ? '#0071e3' : 'rgba(120,120,128,0.12)', color: pool === p.id ? '#fff' : '#1d1d1f' }}
                >{p.name}</button>
              ))}
            </div>
          )}
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
          <div style={secHead}>Объекты</div>
          {objects.length === 0 && (
            <div style={T.card}><div style={{ ...T.small, margin: '8px 0' }}>Пока нет объектов — добавьте первый.</div></div>
          )}
          {objects.map((o) => (
            <div key={o.id} style={T.card}>
              <button
                onClick={() => { setOpenId(o.id); setTab('pay') }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 0', textAlign: 'left', boxSizing: 'border-box' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#1d1d1f' }}>{o.address}</div>
                  <div style={{ fontSize: 13, color: o.statusColor || '#8e8e93', marginTop: 4 }}>
                    {o.statusDetail}{o.amount > 0 ? ` · ${o.amount.toFixed(0)} ₽` : ''}
                  </div>
                </div>
                {Number(o.contract?.deposit_amount || 0) > 0 && (
                  <span style={{ fontSize: 12, color: '#8e8e93', flexShrink: 0 }}>депозит {Number(o.contract?.deposit_paid || 0).toFixed(0)}/{Number(o.contract?.deposit_amount).toFixed(0)}</span>
                )}
                <span style={{ color: '#c7c7cc', fontSize: 18 }}>›</span>
              </button>
            </div>
          ))}
          <div style={T.card}>
            {teamRole === 'viewer'
              ? <div style={{ ...T.small, margin: '8px 0' }}>Режим наблюдателя: добавление объектов недоступно.</div>
              : <ObjectAdd />}
          </div>
          {showTeam && <TeamManager />}
          {archived.length > 0 && (
            <div style={T.card}>
              <button
                onClick={() => setArchiveListOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 0', textAlign: 'left', boxSizing: 'border-box' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#1d1d1f' }}>Архив договоров</div>
                  <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 4 }}>завершённых: {archived.length}</div>
                </div>
                <span style={{ color: '#c7c7cc', fontSize: 18 }}>›</span>
              </button>
            </div>
          )}
        </div>
      )}
    </LandlordCtx.Provider>
  )
}

export default LandlordDashboard
