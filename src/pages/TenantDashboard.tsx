import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import CashNegotiation from '../components/CashNegotiation'
import BillUploader from '../components/BillUploader'
import { ensureNextPayment } from '../lib/nextPayment'
import Chat from '../components/Chat'
import { BottomNav, PromptNumber, Progress, showToast } from '../components/ui'
import { T } from '../theme'

interface PayDetail { type: 'card' | 'sbp'; bank: string; number: string }
interface Notification { id: string; user_id: string; type: string; related_id: string; sent_at: string }

function parseDate(d: any): Date {
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, dd || 1)
}

function formatCardNumber(v: string): string {
  const d = (v || '').replace(/\D/g, '').slice(0, 16)
  return d.replace(/(.{4})/g, '$1 ').trim()
}

function formatPhoneDisplay(v: string): string {
  const d = (v || '').replace(/\D/g, '')
  const x = d.length === 11 && (d.startsWith('7') || d.startsWith('8')) ? d.slice(1) : d
  if (x.length === 10) return `+7 ${x.slice(0, 3)} ${x.slice(3, 6)} ${x.slice(6, 8)} ${x.slice(8, 10)}`
  return v || ''
}

const TABS = [
  { id: 'pay', l: 'Оплата' },
  { id: 'meters', l: 'Счётчики' },
  { id: 'contract', l: 'Договор' },
  { id: 'chat', l: 'Чат' },
]

export function TenantDashboard() {
  const { user, loading: userLoading } = useTelegramUser()
  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [tab, setTab] = useState('pay')

  async function load() {
    if (!user) return
    const [csRes, notifRes] = await Promise.all([
      supabase.from('contracts').select('*').eq('tenant_id', user.id).in('status', ['active', 'terminated']).order('created_at', { ascending: true }),
      supabase.from('notifications_log').select('*').eq('user_id', user.id).order('sent_at', { ascending: false }).limit(5),
    ])
    const cs = csRes.data || []
    const objIds = cs.map((c: any) => c.object_id)
    const objBy: Record<string, any> = {}
    if (objIds.length) {
      const { data: objs } = await supabase.from('objects').select('id, address').in('id', objIds)
      for (const o of objs || []) objBy[o.id] = o
    }
    setContracts(cs.map((c: any) => ({ ...c, _address: objBy[c.object_id]?.address || 'Объект' })))
    setNotifications(notifRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load(), 30000)
    window.addEventListener('rentflow-refresh', () => load())
    return () => clearInterval(interval)
  }, [user])

  const getNotificationText = (type: string) => {
    switch (type) {
      case 'payment_claimed': return '✅ Арендатор сообщил об оплате'
      case 'payment_confirmed': return '🟢 Арендодатель подтвердил оплату'
      case 'meter_submitted': return '💦 Переданы новые показания'
      case 'cash_proposed': return '💵 Предложено время встречи наличными'
      case 'cash_confirmed': return '🤝 Встреча по оплате согласована'
      case 'deferred_proposed': return '🙏 Заявка на отсрочку штрафа отправлена'
      case 'deferred_confirmed': return '🧊 Замороженный штраф обновлён'
      case 'bill_uploaded': return '📄 Квитанция загружена'
      case 'bill_paid': return '🧾 Подтверждение оплаты приложено'
      case 'bill_confirmed': return '✅ Арендодатель подтвердил оплату по квитанции'
      case 'contract_terminated': return '🏁 Договор завершён'
      case 'amendment': return '📝 Допсоглашение по аренде'
      default: return type
    }
  }

  if (userLoading || loading) return <div style={T.page}>Загрузка…</div>

  const current = contracts.find(c => c.id === openId) || null

  const notifCard = notifications.length > 0 ? (
    <div style={T.card}>
      <div style={T.h2}>Уведомления</div>
      {notifications.map(n => (
        <div key={n.id} style={T.row}>
          <span style={{ fontSize: 14 }}>{(n as any).message || getNotificationText(n.type)}</span>
        </div>
      ))}
    </div>
  ) : null

  if (!current) {
    return (
      <div style={{ ...T.page, paddingBottom: 40 }}>
        <h1 style={T.h1}>Моя аренда</h1>
        {notifCard}
        {contracts.length === 0 ? (
          <div style={{ ...T.card, padding: '28px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#1d1d1f', marginBottom: 6 }}>Пока нет активной аренды</div>
            <div style={{ fontSize: 14, color: '#8e8e93', lineHeight: 1.45 }}>Попросите арендодателя добавить объект и указать ваш номер телефона в договоре — аренда появится здесь автоматически.</div>
          </div>
        ) : (
          <>
            {contracts.map((c) => (
              <div key={c.id} style={T.card}>
                <button
                  onClick={() => { setOpenId(c.id); setTab('pay') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 0', textAlign: 'left', boxSizing: 'border-box' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#1d1d1f' }}>{c._address}</div>
                    <div style={{ fontSize: 13, color: c.status === 'terminated' ? '#ff3b30' : '#8e8e93', marginTop: 4 }}>{Number(c.rent_amount).toFixed(0)} ₽/мес{c.status === 'terminated' ? ' · договор завершён' : ''}</div>
                  </div>
                  <span style={{ color: '#c7c7cc', fontSize: 18 }}>›</span>
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ ...T.page, paddingBottom: 90 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
        <button
          style={{ border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4 }}
          onClick={() => setOpenId(null)}
        >← Моя аренда</button>
      </div>
      <h1 style={T.h1}>{current._address}</h1>
      <TenantRental contract={current} tab={tab} setTab={setTab} />
    </div>
  )
}

const rentalCache: Record<string, any> = {}

function TenantRental({ contract, tab, setTab }: { contract: any; tab: string; setTab: (t: string) => void }) {
  const { user } = useTelegramUser()
  const [data, setData] = useState<any>(rentalCache[contract.id] || null)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({})
  const [advOpen, setAdvOpen] = useState(false)
  const [methodOverride, setMethodOverride] = useState<string | null>(null)

  async function load() {
    if (!user) return
    await ensureNextPayment(contract.id).catch(() => {})
    const [objRes, paysRes, metersRawRes, meterTypesRes, penaltyRes, frozenRes, deferredRes, contactsRes] = await Promise.all([
      supabase.from('objects').select('*').eq('id', contract.object_id).maybeSingle(),
      supabase.from('payments').select('*').eq('contract_id', contract.id).order('period', { ascending: false }),
      supabase.from('object_meters').select('*').eq('object_id', contract.object_id).eq('is_active', true),
      supabase.from('meter_types').select('*'),
      supabase.from('penalty_rules').select('*').eq('contract_id', contract.id),
      supabase.from('frozen_penalties').select('*').eq('contract_id', contract.id).order('period', { ascending: true }),
      supabase.from('deferred_requests').select('*').eq('contract_id', contract.id).order('created_at', { ascending: false }).limit(1),
      supabase.from('object_contacts').select('*').eq('object_id', contract.object_id).order('sort', { ascending: true }).order('created_at', { ascending: true }),
    ])
    const obj = objRes.data
    const { data: landlord } = obj?.landlord_id
      ? await supabase.from('users').select('*').eq('id', obj.landlord_id).maybeSingle()
      : { data: null }
    const meterTypes = meterTypesRes.data || []
    const g = (c: string) => c === 'water_cold' ? 0 : c === 'water_hot' ? 1 : c.startsWith('electricity') ? 2 : c === 'heat' ? 3 : c === 'gas' ? 4 : 5
    const meters = (metersRawRes.data || []).slice().sort((a: any, b: any) => {
      const ca = meterTypes.find((x: any) => x.id === a.meter_type_id)?.code || ''
      const cb = meterTypes.find((x: any) => x.id === b.meter_type_id)?.code || ''
      return g(ca) - g(cb) || String(a.label || '').localeCompare(String(b.label || ''))
    })
    const ids = meters.map((m: any) => m.id)
    const readingsByMeter: Record<string, any[]> = {}
    if (ids.length) {
      const { data: rd } = await supabase.from('meter_readings').select('*').in('object_meter_id', ids).order('submitted_at', { ascending: false })
      for (const r of rd || []) {
        if (!readingsByMeter[r.object_meter_id]) readingsByMeter[r.object_meter_id] = []
        readingsByMeter[r.object_meter_id].push(r)
      }
    }
    const d = {
      obj, landlord,
      payments: paysRes.data || [],
      meters, meterTypes,
      penaltyRules: penaltyRes.data || [],
      frozenRows: frozenRes.data || [],
      deferredReqs: deferredRes.data || [],
      readingsByMeter,
      contacts: contactsRes.data || [],
    }
    rentalCache[contract.id] = d
    setData(d)
  }

  useEffect(() => {
    load()
    const on = () => load()
    window.addEventListener('rentflow-refresh', on)
    return () => window.removeEventListener('rentflow-refresh', on)
  }, [contract.id])

  async function choosePayMethod(m: string) {
    setMethodOverride(m)
    const { error: e } = await supabase.from('contracts').update({ tenant_pay_method: m }).eq('id', contract.id)
    if (e) showToast('Ошибка: ' + e.message)
  }

  async function claimPaid() {
    if (!data?.landlord) return
    const open0 = (data.payments || []).filter((p: any) => !p.confirmed_by_landlord)
    const payment = open0.length ? open0[open0.length - 1] : data.payments[0]
    if (!payment) return
    const { error: e } = await supabase.from('payments').update({ card_claimed: true }).eq('id', payment.id)
    if (e) { showToast('Ошибка: ' + e.message); return }
    await supabase.from('notifications_log').insert({
      user_id: data.landlord.id, type: 'payment_claimed', related_id: payment.id, sent_at: new Date().toISOString(),
    })
    showToast('✅ Арендодатель уведомлён')
    load()
  }

  async function requestDeferral() {
    if (!data?.landlord) return
    const open0 = (data.payments || []).filter((p: any) => !p.confirmed_by_landlord)
    const payment = open0.length ? open0[open0.length - 1] : data.payments[0]
    if (!payment || Number(payment.penalty_amount) <= 0) return
    const { error: e } = await supabase.from('deferred_requests').insert({
      contract_id: contract.id, payment_id: payment.id,
      amount: Number(payment.penalty_amount), status: 'proposed',
    })
    if (e) { showToast('Ошибка: ' + e.message); return }
    await supabase.from('notifications_log').insert({
      user_id: data.landlord.id, type: 'deferred_proposed', related_id: contract.id, sent_at: new Date().toISOString(),
    })
    showToast('✅ Заявка на отсрочку отправлена')
    load()
  }

  async function submitMeters() {
    if (!data) return
    const period = new Date().toISOString().slice(0, 7) + '-01'
    const rows: any[] = []
    for (const m of data.meters) {
      const v = vals[m.id]
      if (v) rows.push({ object_meter_id: m.id, contract_id: contract.id, value: Number(v), period, submitted_at: new Date().toISOString(), status: 'proposed' })
    }
    if (rows.length === 0) { showToast('Введите показания счётчиков'); return }
    const { error: e } = await supabase.from('meter_readings').insert(rows)
    if (e) { showToast('Ошибка: ' + e.message); return }
    showToast('✅ Показания переданы')
    setVals({})
    await supabase.from('notifications_log').insert({
      user_id: user!.id, type: 'meter_submitted', related_id: contract.id, sent_at: new Date().toISOString()
    })
    load()
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      showToast(`✅ Скопировано: ${label}`)
    } catch {
      showToast('Не удалось скопировать')
    }
  }

  async function payAdvanceMonths(n0: number) {
    if (!data) return
    const n = Math.min(12, Math.max(1, Math.round(n0) || 1))
    const pays = data.payments || []
    const base = pays.length ? parseDate(pays[0].period) : parseDate(contract.start_date || new Date().toISOString())
    const rows: any[] = []
    for (let i = 1; i <= n; i++) {
      const pd = new Date(base.getFullYear(), base.getMonth() + i, 1)
      const iso = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}-01`
      if (pays.some((p: any) => String(p.period).slice(0, 10) === iso)) continue
      const due = new Date(pd.getFullYear(), pd.getMonth(), Number(contract.payment_day) || 1)
      const dueISO = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`
      rows.push({ contract_id: contract.id, period: iso, due_date: dueISO, base_amount: Number(contract.rent_amount) || 0, penalty_amount: 0, utilities_amount: 0 })
    }
    if (rows.length === 0) { showToast('Эти месяцы уже созданы'); return }
    const { error } = await supabase.from('payments').insert(rows)
    if (error) { showToast('Ошибка: ' + error.message); return }
    showToast(`✅ Созданы счета на ${rows.length} мес. вперёд`)
    load()
  }

  if (!data) return <div style={T.card}>Загрузка…</div>

  const { obj, landlord, payments, meters, meterTypes, penaltyRules, frozenRows, deferredReqs, readingsByMeter, contacts } = data
  const readingsMode = contract.readings_mode || 'manual'
  const reminder = contract.reminder_days_before || 3
  const openPayments = (payments || []).filter((p: any) => !p.confirmed_by_landlord)
  const payment = openPayments.length ? openPayments[openPayments.length - 1] : payments[0]
  const today = new Date()
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const utilities = Number(payment?.utilities_amount || 0)
  const total = payment ? Number(payment.base_amount) + Number(payment.penalty_amount || 0) + utilities : Number(contract.rent_amount)
  const monthLabel = payment ? new Date(payment.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : ''
  const deposit = Number(contract.deposit_amount || 0)
  const depositPaid = Number(contract.deposit_paid || 0)
  const frozenTotal = (frozenRows || []).reduce((sum: number, f: any) => sum + Number(f.amount || 0), 0)

  const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
  const iosMuted: React.CSSProperties = { color: '#8e8e93', fontSize: 14 }
  const secHead: React.CSSProperties = { fontSize: 13, color: '#8e8e93', margin: '14px 16px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }
  const rightInput: React.CSSProperties = { width: 110, border: 'none', outline: 'none', background: 'rgba(120,120,128,0.08)', borderRadius: 8, padding: '8px 10px', fontSize: 15, textAlign: 'right', color: '#1d1d1f', boxSizing: 'border-box' }
  const actionRow: React.CSSProperties = { display: 'flex', justifyContent: 'center', padding: '8px 0 10px' }
  const hair = { height: 1, background: 'rgba(60,60,67,0.12)' } as React.CSSProperties

  if (contract.status === 'terminated') {
    const s = (contract as any).settlement || {}
    return (
      <div>
        <div style={T.card}>
          <div style={T.h2}>Договор завершён</div>
          <div style={T.row}><span style={iosMuted}>Дата съезда</span><b>{contract.terminated_at ? new Date(contract.terminated_at).toLocaleDateString('ru-RU') : '—'}</b></div>
          {contract.termination_note && <div style={T.row}><span style={iosMuted}>Примечание</span><b>{contract.termination_note}</b></div>}
          {s.deposit_paid != null && <div style={T.row}><span style={iosMuted}>Депозит внесён</span><b>{Number(s.deposit_paid).toFixed(0)} ₽</b></div>}
          {s.frozen_total != null && Number(s.frozen_total) > 0 && <div style={T.row}><span style={iosMuted}>Удержано по штрафам</span><b>{Number(s.frozen_total).toFixed(0)} ₽</b></div>}
          {s.open_debt != null && Number(s.open_debt) > 0 && <div style={T.row}><span style={iosMuted}>Долг по счетам</span><b>{Number(s.open_debt).toFixed(0)} ₽</b></div>}
          <div style={{ ...T.row, borderBottom: 'none' }}>
            <span style={iosMuted}>Итог</span>
            <b style={{ color: Number(s.result || 0) >= 0 ? '#1e7e34' : '#ff3b30' }}>
              {Number(s.result || 0) >= 0 ? `К возврату арендатору ${Number(s.result).toFixed(0)} ₽` : `Долг арендатора ${Math.abs(Number(s.result || 0)).toFixed(0)} ₽`}
            </b>
          </div>
        </div>
        <div style={T.card}>
          <div style={T.h2}>История платежей</div>
          {(payments || []).slice(0, 24).map((p: any) => (
            <div key={p.id} style={T.row}>
              <span style={{ flex: 1, minWidth: 0 }}>{new Date(p.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 13, color: p.confirmed_by_landlord ? '#1e7e34' : '#b25000' }}>{p.confirmed_by_landlord ? 'оплачен' : 'ожидает'}</span>
                <b style={{ whiteSpace: 'nowrap' }}>{(Number(p.base_amount) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0)).toFixed(0)} ₽</b>
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const latests = (meters || []).map((m: any) => ((readingsByMeter || {})[m.id] || [])[0]).filter(Boolean)
  const overallReading = latests.length === 0
    ? 'none'
    : latests.some((r: any) => (r.status || 'proposed') === 'incomplete')
      ? 'incomplete'
      : latests.every((r: any) => (r.status || 'proposed') === 'confirmed')
        ? 'confirmed'
        : 'proposed'
  const effectiveMethod = methodOverride
    ?? (contract.payment_method === 'both'
      ? (contract.tenant_pay_method || 'card')
      : contract.payment_method)

  let statusChip: any = T.chipGray
  let statusText = 'Нет счёта'
  let isOverdue = false
  let firstMonth = false

  if (payment) {
    if (!payment.confirmed_by_landlord) {
      const dueMid = parseDate(payment.due_date)
      const sd = contract.start_date ? parseDate(contract.start_date) : null
      const isFirstMonth = !!sd && dueMid.getMonth() === sd.getMonth() && dueMid.getFullYear() === sd.getFullYear()
      const daysUntilDue = Math.round((dueMid.getTime() - todayMid.getTime()) / 86400000)
      if (isFirstMonth) { firstMonth = true; statusChip = T.chipOrange; statusText = 'Первый месяц — оплата при подписании' }
      else if (todayMid > dueMid && (!sd || dueMid >= sd)) { isOverdue = true; statusChip = T.chipRed; statusText = `Просрочка ${-daysUntilDue} дн.` }
      else if (daysUntilDue === 0) { statusChip = T.chipOrange; statusText = 'Сегодня последний день оплаты' }
      else if (daysUntilDue <= reminder) { statusChip = T.chipOrange; statusText = `До оплаты ${daysUntilDue} дн.` }
      else { statusChip = T.chipGreen; statusText = `До оплаты ${daysUntilDue} дн.` }
    } else {
      const periodDate = parseDate(payment.period)
      const nextDue = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, contract.payment_day || 1)
      const daysLeft = Math.round((nextDue.getTime() - todayMid.getTime()) / 86400000)
      if (daysLeft < 0) { statusChip = T.chipRed; statusText = `Следующий платёж просрочен на ${-daysLeft} дн.` }
      else if (daysLeft === 0) { statusChip = T.chipOrange; statusText = 'Следующая оплата: сегодня последний день' }
      else if (daysLeft <= reminder) { statusChip = T.chipOrange; statusText = `${daysLeft} дн. до следующей оплаты` }
      else { statusChip = T.chipGreen; statusText = `${daysLeft} дн. до следующей оплаты` }
    }
  }

  const paymentOverdueRule = penaltyRules.find((r: any) => r.violation_type === 'payment_overdue')
  const penaltyRate = paymentOverdueRule ? Number(paymentOverdueRule.rate) : 500
  const readingsRule = penaltyRules.find((r: any) => r.violation_type === 'readings_overdue')
  const lastDeferral = deferredReqs && deferredReqs[0] ? deferredReqs[0] : null
  const deferralPending = !!(lastDeferral && lastDeferral.status === 'proposed' && payment && String(lastDeferral.payment_id) === String(payment.id))
  const details: PayDetail[] = Array.isArray(contract.payment_details) && contract.payment_details.length > 0
    ? contract.payment_details
    : (contract.card_number ? [{ type: 'card', bank: 'Банк не указан', number: contract.card_number }] : [])

  const payBadge = !!(payment && !payment.confirmed_by_landlord)
  const metersBadge = !!(readingsMode === 'manual' && meters.length > 0 && overallReading === 'none' && today.getDate() >= Math.max(1, Number(contract.meter_deadline_day || 25) - reminder))

  return (
    <div>
      {tab === 'pay' && (
        <>
          <div style={T.card}>
            <div style={T.h2}>Счёт за {monthLabel}</div>
            <div style={T.row}><span style={iosMuted}>Аренда</span><b>{Number(payment?.base_amount ?? contract.rent_amount).toFixed(2)} ₽</b></div>
            <div style={T.row}><span style={iosMuted}>Штраф</span><b>{Number(payment?.penalty_amount || 0).toFixed(2)} ₽</b></div>
            {utilities > 0 && (
              <div style={T.row}><span style={iosMuted}>Ресурсы по квитанции</span><b>{utilities.toFixed(2)} ₽</b></div>
            )}
            <div style={T.row}><span style={iosMuted}>Итого</span><span style={T.total}>{total.toFixed(2)} ₽</span></div>
            <div style={{ ...T.row, borderBottom: 'none' }}>
              <span style={iosMuted}>{firstMonth ? 'Оплата при подписании договора' : 'Оплатить до'}</span>
              <b>{firstMonth ? '' : parseDate(payment.due_date).toLocaleDateString('ru-RU')}</b>
            </div>
            <div style={{ padding: '0 0 8px' }}><span style={statusChip}>{statusText}</span></div>
            {isOverdue && <div style={T.noteRed}>+{penaltyRate} руб за каждый день просрочки</div>}
            {firstMonth && !payment?.confirmed_by_landlord && (
              <div style={T.note}>Первый месяц оплачивается при подписании договора — подтверждение выставляет арендодатель.</div>
            )}
            {payment && !payment.confirmed_by_landlord && Number(payment.penalty_amount) > 0 && (
              deferralPending ? (
                <div style={T.note}>Отсрочка штрафа: заявка на рассмотрении</div>
              ) : (
                <div style={actionRow}><button onClick={requestDeferral} style={iosBlue}>Попросить отсрочку штрафа</button></div>
              )
            )}
          </div>

          {contract.payment_method === 'both' && (
            <div>
              <div style={secHead}>Способ оплаты</div>
              <div style={T.card}>
                {[
                  { v: 'card', l: 'Безналичный расчёт' },
                  { v: 'cash', l: 'Наличные' },
                ].map((o, i) => (
                  <div key={o.v}>
                    {i > 0 && <div style={hair} />}
                    <button
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 44, border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 0', fontSize: 15, color: '#1d1d1f' }}
                      onClick={() => choosePayMethod(o.v)}
                    >
                      {o.l}
                      {effectiveMethod === o.v && <span style={{ color: '#0071e3', fontWeight: 600 }}>✓</span>}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {effectiveMethod === 'card' && (
            <div>
              <div style={secHead}>Способы оплаты</div>
              <div style={T.card}>
                {details.length === 0 ? (
                  <div style={{ ...T.small, margin: '8px 0' }}>Арендодатель ещё не добавил реквизиты для безналичной оплаты.</div>
                ) : (
                  details.map((d: PayDetail, i) => (
                    <div key={i} style={T.item}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>{d.type === 'card' ? d.bank : `СБП · ${d.bank}`}</div>
                          <div style={{ fontFamily: 'monospace', fontSize: 15, marginTop: 2 }}>{d.type === 'card' ? formatCardNumber(d.number) : formatPhoneDisplay(d.number)}</div>
                        </div>
                        <button style={iosBlue} onClick={() => copyToClipboard(d.type === 'card' ? formatCardNumber(d.number) : d.number, d.type === 'card' ? 'номер карты' : 'номер СБП')}>Скопировать</button>
                      </div>
                    </div>
                  ))
                )}
                {details.length > 0 && !payment?.confirmed_by_landlord && !firstMonth && (
                  payment.card_claimed ? (
                    <div style={T.note}>Безналичная оплата отмечена: ожидает подтверждения арендодателем</div>
                  ) : (
                    <div style={actionRow}><button onClick={claimPaid} style={iosBlue}>Я оплатил</button></div>
                  )
                )}
              </div>
            </div>
          )}

          {effectiveMethod === 'cash' && (
            <div>
              <div style={secHead}>Оплата наличными</div>
              <CashNegotiation
                contractId={contract.id}
                myRole="tenant"
                tenantId={contract.tenant_id}
                landlordId={obj?.landlord_id}
              />
            </div>
          )}

          <div style={T.card}>
            <div style={T.row}>
              <span style={{ fontSize: 15 }}>Оплата досрочно</span>
              <button style={iosBlue} onClick={() => setAdvOpen(true)}>Внести на несколько месяцев</button>
            </div>
          </div>

          <div style={T.card}>
            <div style={T.h2}>История платежей</div>
            {payments.slice(0, 8).map((p: any) => (
              <div key={p.id} style={T.row}>
                <span style={{ flex: 1, minWidth: 0 }}>{new Date(p.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 13, color: p.confirmed_by_landlord ? '#1e7e34' : '#b25000' }}>{p.confirmed_by_landlord ? 'оплачен' : 'ожидает'}</span>
                  <b style={{ whiteSpace: 'nowrap' }}>{(Number(p.base_amount) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0)).toFixed(0)} ₽</b>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'meters' && (
        <>
          {readingsMode === 'manual' && meters.length > 0 && (
            <>
              <div style={secHead}>Передать показания</div>
              <div style={T.card}>
                <div style={{ ...T.row, borderBottom: 'none' }}>
                  <span style={iosMuted}>Срок подачи</span>
                  <b>до {contract.meter_deadline_day} числа</b>
                </div>
                {overallReading === 'incomplete' && <div style={T.noteRed}>Арендодатель отметил: показания получены не полностью — передайте недостающие ещё раз</div>}
                {overallReading === 'confirmed' && <div style={T.noteGreen}>Показания получены арендодателем</div>}
                {overallReading === 'proposed' && <div style={T.note}>Показания отправлены и ждут подтверждения арендодателем</div>}
              </div>
              {meters.map((m: any) => {
                const t = meterTypes.find((x: any) => x.id === m.meter_type_id)
                const hist = (readingsByMeter || {})[m.id] || []
                const last = hist[0]
                const open = !!historyOpen[m.id]
                return (
                  <div key={m.id} style={T.card}>
                    <div style={{ ...T.row, borderBottom: 'none', alignItems: 'center' }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{t?.label || 'Счётчик'}{m.label ? ` · № ${m.label}` : ''}</span>
                      <input
                        value={vals[m.id] || ''}
                        onChange={(e) => setVals({ ...vals, [m.id]: e.target.value })}
                        placeholder="0"
                        style={rightInput}
                        inputMode="decimal"
                      />
                    </div>
                    {m.initial_value != null && <div style={{ ...T.tiny, margin: '0 0 6px' }}>стартовые показания: {Number(m.initial_value).toFixed(0)}</div>}
                    {last && (
                      <div style={{ ...hair }} />
                    )}
                    {last && (
                      <div style={{ ...iosBlue, fontSize: 14, padding: '8px 0 6px' }} onClick={() => setHistoryOpen({ ...historyOpen, [m.id]: !open })}>
                        последнее: {last.value} · подано {new Date(last.submitted_at).toLocaleDateString('ru-RU')} {open ? '▲' : '▼'}
                      </div>
                    )}
                    {open && hist.slice(0, 10).map((r: any) => (
                      <div key={r.id} style={T.tiny}>{r.value} · подано {new Date(r.submitted_at).toLocaleDateString('ru-RU')} · {r.status === 'confirmed' ? 'подтверждены' : r.status === 'incomplete' ? 'не полностью' : 'ожидают'}{(r as any).entered_by ? ' · внёс арендодатель' : ''}</div>
                    ))}
                  </div>
                )
              })}
              <button onClick={submitMeters} style={T.btn}>Передать показания</button>
            </>
          )}
          {readingsMode === 'manual' && meters.length === 0 && (
            <div style={T.card}><div style={{ ...T.small, margin: '8px 0' }}>На объекте нет счётчиков с ручной подачей.</div></div>
          )}
          {readingsMode === 'auto' && (
            <div style={T.card}>
              <div style={T.h2}>Показания счётчиков</div>
              <div style={{ ...T.small, margin: '8px 0' }}>Показания передаются автоматически — вам ничего подавать не нужно.</div>
            </div>
          )}
          {readingsMode === 'self' && (
            <>
              <div style={T.card}>
                <div style={T.h2}>Показания счётчиков</div>
                <div style={{ ...T.small, margin: '8px 0' }}>Вы оплачиваете полную квитанцию самостоятельно — показания подавать не нужно.</div>
              </div>
              <BillUploader contractId={contract.id} landlordId={obj?.landlord_id} />
            </>
          )}
        </>
      )}

      {tab === 'contract' && (
        <>
          <div style={T.card}>
            <div style={T.h2}>Договор</div>
            <div style={T.row}><span style={iosMuted}>Арендодатель</span><b>{landlord?.full_name}</b></div>
            {landlord?.phone && <div style={T.row}><span style={iosMuted}>Телефон</span><b>{formatPhoneDisplay(landlord.phone)}</b></div>}
            {contract.start_date && contract.end_date && (
              <div style={T.row}><span style={iosMuted}>Срок</span><b>{parseDate(contract.start_date).toLocaleDateString('ru-RU')} — {parseDate(contract.end_date).toLocaleDateString('ru-RU')}</b></div>
            )}
            <div style={T.row}><span style={iosMuted}>Аренда</span><b>{Number(contract.rent_amount).toFixed(0)} ₽/мес</b></div>
            {(contract as any).amendment_at && (
              <div style={T.row}><span style={iosMuted}>Допсоглашение</span><b>{Number(contract.rent_amount).toFixed(0)} ₽ с {(contract as any).amendment_from ? new Date((contract as any).amendment_from).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : new Date((contract as any).amendment_at).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</b></div>
            )}
            <div style={T.row}><span style={iosMuted}>Оплата</span><b>до {contract.payment_day} числа</b></div>
            {deposit > 0 && (
              <div style={{ padding: '8px 0 4px' }}>
                <Progress value={depositPaid} max={deposit} />
              </div>
            )}
          </div>
          <div style={T.card}>
            <div style={T.h2}>Штрафы</div>
            <div style={T.row}><span style={iosMuted}>Просрочка оплаты</span><b>+{penaltyRate} ₽/день</b></div>
            {readingsMode === 'manual' && readingsRule && Number(readingsRule.rate) > 0 && (
              <div style={{ ...T.row, borderBottom: 'none' }}><span style={iosMuted}>Просрочка показаний</span><b>+{Number(readingsRule.rate)} ₽/день</b></div>
            )}
          </div>
          {contacts && contacts.length > 0 && (
            <div style={T.card}>
              <div style={T.h2}>Экстренные контакты</div>
              {contacts.map((c: any, i: number) => (
                <div key={c.id}>
                  {i > 0 && <div style={hair} />}
                  <div style={T.row}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15 }}>{c.label}</div>
                      {c.note && <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>{c.note}</div>}
                    </div>
                    <a
                      href={`tel:${String(c.phone || '').replace(/[^\d+]/g, '')}`}
                      style={{ color: '#0071e3', fontSize: 15, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}
                    >{c.phone}</a>
                  </div>
                </div>
              ))}
            </div>
          )}
          {frozenTotal > 0 && (
            <div style={T.card}>
              <div style={T.h2}>Замороженные штрафы · {frozenTotal.toFixed(0)} ₽</div>
              {(frozenRows || []).map((f: any) => (
                <div key={f.id} style={T.item}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 15 }}>
                    <span>{f.period ? parseDate(f.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : 'без месяца'}</span>
                    <b>{Number(f.amount).toFixed(0)} ₽</b>
                  </div>
                  {f.adjusted_note && <div style={T.tiny}>{f.adjusted_note}</div>}
                </div>
              ))}
              {deposit > 0
                ? (deposit >= frozenTotal
                  ? <div style={T.small}>Будет удержано из депозита; остаток депозита: {(deposit - frozenTotal).toFixed(0)} ₽</div>
                  : <div style={{ ...T.small, color: '#ff3b30' }}>Сверх депозита долг: {(frozenTotal - deposit).toFixed(0)} ₽</div>)
                : <div style={{ ...T.small, color: '#ff3b30' }}>Задолженность арендатора (депозит не внесён)</div>}
              <div style={T.tiny}>Записи хранятся до конца договора</div>
            </div>
          )}
        </>
      )}

      {tab === 'chat' && (
        <div style={T.card}>
          <div style={T.h2}>Чат с арендодателем</div>
          <Chat contractId={contract.id} myId={user!.id} />
        </div>
      )}

      <BottomNav tabs={TABS} tab={tab} setTab={setTab} badges={{ pay: payBadge, meters: metersBadge }} />

      <PromptNumber
        open={advOpen}
        title="Оплата досрочно"
        label="На сколько месяцев вперёд внести оплату? (1–12)"
        initial="1"
        onClose={() => setAdvOpen(false)}
        onSubmit={(n) => payAdvanceMonths(n)}
      />
    </div>
  )
}

export default TenantDashboard
