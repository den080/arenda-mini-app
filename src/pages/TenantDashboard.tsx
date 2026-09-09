import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import CashNegotiation from '../components/CashNegotiation'
import BillReview from '../components/BillReview'
import Chat from '../components/Chat'
import { BottomNav, showToast, SkeletonList, PullToRefresh, Hint, Modal, errText } from '../components/ui'
import { T } from '../theme'
import { addOffer, markOffer, acceptRenewal, latestOffer } from '../lib/renewal'

const TABS = [
  { id: 'pay', l: 'Оплата' },
  { id: 'meters', l: 'Счётчики' },
  { id: 'contract', l: 'Договор' },
  { id: 'chat', l: 'Чат' },
]

function parseDate(d: any): Date { const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, dd || 1) }
function fmt(v: any): string { const x = Number(v); if (!isFinite(x)) return String(v ?? ''); return String(Math.round(x * 1000) / 1000) }
function formatPhone(v: string): string {
  const digits = (v || '').replace(/\D/g, '').slice(0, 11)
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    const x = digits.slice(1)
    let out = '+7'
    if (x.length > 0) out += ' ' + x.slice(0, 3)
    if (x.length > 3) out += ' ' + x.slice(3, 6)
    if (x.length > 6) out += ' ' + x.slice(6, 8)
    if (x.length > 8) out += ' ' + x.slice(8, 10)
    return out
  }
  return v
}

// Дизайн-токены под шкалу Apple HIG: headline 17, subhead 15, footnote 13
const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 17, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
const actBlue: React.CSSProperties = { ...iosBlue, fontSize: 15 }
const iosMuted: React.CSSProperties = { color: '#8e8e93', fontSize: 15 }
const valText: React.CSSProperties = { fontSize: 17, fontWeight: 500, color: '#1d1d1f' }
const valMoney: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: '#1d1d1f', whiteSpace: 'nowrap' }
const secHead: React.CSSProperties = { fontSize: 13, color: '#8e8e93', margin: '14px 16px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }
const rightInput: React.CSSProperties = { width: 110, border: 'none', outline: 'none', background: 'rgba(120,120,128,0.08)', borderRadius: 8, padding: '8px 10px', fontSize: 17, fontWeight: 600, textAlign: 'right', color: '#1d1d1f', boxSizing: 'border-box' }
const hair = { height: 1, background: 'rgba(60,60,67,0.12)' } as React.CSSProperties
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 17, boxSizing: 'border-box', outline: 'none' }
const rowBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 0', textAlign: 'left', boxSizing: 'border-box' }

export function TenantDashboard() {
  const { user, loading: userLoading } = useTelegramUser()
  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [tab, setTab] = useState('pay')
  const [notifications, setNotifications] = useState<any[]>([])
  const [data, setData] = useState<any>(null)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({})
  const [payHistOpen, setPayHistOpen] = useState(false)
  const [payClaimOpen, setPayClaimOpen] = useState(false)
  const [endChoice, setEndChoice] = useState<'' | 'renew' | 'exit'>('')
  const [endConfirm, setEndConfirm] = useState<'' | 'renew' | 'exit'>('')
  const [renewOffer, setRenewOffer] = useState<any>(null)
  const [renewForm, setRenewForm] = useState(false)
  const [myRent, setMyRent] = useState('')
  const [myMonths, setMyMonths] = useState(11)
  const [myStart, setMyStart] = useState('')
  const [claimPhone, setClaimPhone] = useState('')
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimMsg, setClaimMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const now = new Date()
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  async function load() {
    const { data: cs } = await supabase
      .from('contracts').select('*, object:objects(id, address, landlord_id)')
      .eq('tenant_id', user!.id)
      .order('created_at', { ascending: false })
    const list = cs || []
    const ids = list.map((c: any) => c.id)
    const paysBy: Record<string, any[]> = {}
    if (ids.length) {
      const { data: ps } = await supabase.from('payments').select('*').in('contract_id', ids).order('period', { ascending: false })
      for (const p of ps || []) (paysBy[p.contract_id] = paysBy[p.contract_id] || []).push(p)
    }
    const today = new Date()
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    for (const c of list) {
      c._address = c.object?.address || 'Объект'
      c._over = null
      if (c.status === 'active') {
        const open = (paysBy[c.id] || []).filter((p: any) => !p.confirmed_by_landlord)
        const pay = open.length ? open[open.length - 1] : null
        if (pay) {
          const due = parseDate(pay.due_date)
          if (todayMid > due) {
            const total = Number(pay.base_amount || 0) + Number(pay.penalty_amount || 0) + Number(pay.utilities_amount || 0)
            c._over = { days: Math.round((todayMid.getTime() - due.getTime()) / 86400000), amount: total }
          }
        }
      }
    }
    setContracts(list)
    const { data: ns } = await supabase.from('notifications_log').select('*').eq('user_id', user!.id).order('sent_at', { ascending: false }).limit(5)
    setNotifications(ns || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!user) return
    load()
    const on = () => load()
    window.addEventListener('rentflow-refresh', on)
    return () => window.removeEventListener('rentflow-refresh', on)
  }, [user?.id])

  const contract = contracts.find(c => c.id === openId) || null

  async function loadData() {
    if (!contract) return
    const [objRes, metersRes, typesRes, readRes, paysRes, rulesRes, defRes, contactsRes, frozenRes] = await Promise.all([
      supabase.from('objects').select('*, landlord_doc_name, landlord:users(id, full_name, phone)').eq('id', contract.object_id).maybeSingle(),
      supabase.from('object_meters').select('*').eq('object_id', contract.object_id).eq('is_active', true),
      supabase.from('meter_types').select('*'),
      supabase.from('meter_readings').select('*').eq('contract_id', contract.id).order('submitted_at', { ascending: false }),
      supabase.from('payments').select('*').eq('contract_id', contract.id).order('period', { ascending: false }),
      supabase.from('penalty_rules').select('*').eq('contract_id', contract.id),
      supabase.from('deferred_requests').select('*').eq('contract_id', contract.id).order('created_at', { ascending: false }),
      supabase.from('object_contacts').select('*').eq('object_id', contract.object_id).order('sort', { ascending: true }),
      supabase.from('frozen_penalties').select('*').eq('contract_id', contract.id).order('period', { ascending: true }),
    ])
    const meterTypes = typesRes.data || []
    const g = (c: string) => c === 'water_cold' ? 0 : c === 'water_hot' ? 1 : c.startsWith('electricity') ? 2 : c === 'heat' ? 3 : c === 'gas' ? 4 : 5
    const meters = (metersRes.data || []).slice().sort((a: any, b: any) => {
      const ca = meterTypes.find((x: any) => x.id === a.meter_type_id)?.code || ''
      const cb = meterTypes.find((x: any) => x.id === b.meter_type_id)?.code || ''
      return g(ca) - g(cb) || String(a.label || '').localeCompare(String(b.label || ''))
    })
    setData({
      obj: objRes.data,
      landlord: objRes.data?.landlord || null,
      meters, meterTypes,
      readings: readRes.data || [],
      payments: paysRes.data || [],
      rules: rulesRes.data || [],
      defs: defRes.data || [],
      contacts: contactsRes.data || [],
      frozen: frozenRes.data || [],
    })
    const off = await latestOffer(contract.id)
    setRenewOffer(off)
    setRenewForm(false)
  }

  useEffect(() => {
    if (openId && contract) { setData(null); loadData(); setPayHistOpen(false) }
  }, [openId])

  async function notify(landlordId: string | undefined, type: string, message: string, relatedId?: string) {
    if (!landlordId) return
    await supabase.from('notifications_log').insert({ user_id: landlordId, type, related_id: relatedId || null, message, sent_at: new Date().toISOString() })
  }

  async function claim() {
    setClaimBusy(true); setClaimMsg('')
    try {
      const { data: n, error } = await supabase.rpc('claim_contract_by_phone', { p_phone: claimPhone })
      if (error) { showToast(errText(error)); return }
      if ((n || 0) > 0) {
        showToast('✅ Договор привязан')
        setClaimPhone('')
        window.dispatchEvent(new Event('rentflow-refresh'))
        await load()
      } else {
        setClaimMsg('Договор с таким телефоном не найден. Проверьте номер — он должен совпадать с тем, что указал арендодатель.')
      }
    } finally { setClaimBusy(false) }
  }

  async function submitReadings() {
    if (!contract || !data) return
    const rows = (data.meters || []).filter((m: any) => String(vals[m.id] || '').trim() !== '')
    if (rows.length === 0) { showToast('Введите показания'); return }
    setBusy(true)
    try {
      for (const m of rows) {
        const num = Number(String(vals[m.id]).replace(',', '.'))
        if (isNaN(num) || num < 0) { showToast('Некорректное значение'); return }
        const cur = (data.readings || []).find((r: any) => r.object_meter_id === m.id && r.period === period)
        if (cur) {
          if (cur.status === 'confirmed') { showToast('Показания уже подтверждены'); continue }
          const { error } = await supabase.from('meter_readings').update({ value: num, submitted_at: new Date().toISOString(), status: 'proposed' }).eq('id', cur.id)
          if (error) { showToast(errText(error)); return }
        } else {
          const { error } = await supabase.from('meter_readings').insert({ object_meter_id: m.id, contract_id: contract.id, value: num, period, submitted_at: new Date().toISOString(), status: 'proposed' })
          if (error) { showToast(errText(error)); return }
        }
      }
      showToast('✅ Показания переданы')
      setVals({})
      await notify(data.obj?.landlord_id, 'meter_submitted', '💦 Переданы новые показания', contract.id)
      window.dispatchEvent(new Event('rentflow-refresh'))
      loadData()
    } finally { setBusy(false) }
  }

  async function claimCard() {
    if (!contract || !payment) return
    const { error } = await supabase.from('payments').update({ card_claimed: true }).eq('id', payment.id)
    if (error) { showToast(errText(error)); return }
    await notify(data?.obj?.landlord_id, 'payment_claimed', '✅ Арендатор сообщил об оплате', payment.id)
    showToast('✅ Заявка отправлена арендодателю')
    window.dispatchEvent(new Event('rentflow-refresh'))
    loadData()
  }

  async function requestDeferral() {
    if (!contract || !payment) return
    const amount = Math.round(shownPenalty)
    if (amount <= 0) return
    const { error } = await supabase.from('deferred_requests').insert({ contract_id: contract.id, payment_id: payment.id, amount, status: 'proposed' })
    if (error) { showToast(errText(error)); return }
    await notify(data?.obj?.landlord_id, 'deferred_proposed', `🙏 Арендатор попросил отсрочку штрафа ${amount.toFixed(0)} ₽`, contract.id)
    showToast('✅ Просьба отправлена')
    window.dispatchEvent(new Event('rentflow-refresh'))
    loadData()
  }

  async function sendEndChoice(kind: 'renew' | 'exit') {
    if (!contract) return
    setEndChoice(kind)
    if (kind === 'renew') {
      const ed = contract.end_date ? parseDate(contract.end_date) : new Date()
      const ds = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate() + 1)
      await addOffer({
        contract_id: contract.id, offered_by: 'tenant',
        rent_amount: Number(contract.rent_amount) || 0, months: 11,
        start_date: `${ds.getFullYear()}-${String(ds.getMonth() + 1).padStart(2, '0')}-${String(ds.getDate()).padStart(2, '0')}`,
        round: 1,
      })
      const off = await latestOffer(contract.id)
      setRenewOffer(off)
    }
    await notify(data?.obj?.landlord_id, kind === 'renew' ? 'renewal_requested' : 'termination_requested', kind === 'renew' ? '🔄 Предложение арендатора: продлить договор (условия можно пересмотреть)' : '🏁 Предложение арендатора: завершить договор в срок', contract.id)
    showToast(kind === 'renew' ? '✅ Предложение о продлении отправлено' : '✅ Предложение о завершении отправлено')
  }

  async function tenantAccept() {
    if (!contract || !renewOffer) return
    const res = await acceptRenewal(renewOffer, contract)
    if (res.error) { showToast('Ошибка: ' + res.error); return }
    await notify(data?.obj?.landlord_id, 'renewal_accepted', '🤝 Арендатор согласился на продление — договор продлён', contract.id)
    showToast('✅ Договор продлён')
    window.dispatchEvent(new Event('rentflow-refresh'))
    loadData()
  }

  async function tenantCounter() {
    if (!contract || !renewOffer) return
    const rentN = Number(String(myRent).replace(',', '.'))
    if (!rentN || rentN <= 0) { showToast('Укажите сумму аренды'); return }
    if (!myStart) { showToast('Укажите дату начала'); return }
    await markOffer(renewOffer.id, 'countered')
    await addOffer({ contract_id: contract.id, offered_by: 'tenant', rent_amount: rentN, months: myMonths, start_date: myStart, round: (renewOffer.round || 1) + 1 })
    setRenewForm(false)
    await notify(data?.obj?.landlord_id, 'renewal_countered', `🔄 Арендатор предложил свои условия: ${rentN.toFixed(0)} ₽/мес, ${myMonths} мес.`, contract.id)
    showToast('✅ Ваше предложение отправлено')
    const off = await latestOffer(contract.id)
    setRenewOffer(off)
  }

  async function tenantDecline() {
    if (!contract || !renewOffer) return
    await markOffer(renewOffer.id, 'declined')
    await notify(data?.obj?.landlord_id, 'renewal_declined', '🏁 Арендатор отказался от продления', contract.id)
    showToast('✅ Вы отказались от продления')
    setRenewOffer({ ...renewOffer, status: 'declined' })
  }

  async function setTenantPayMethod(m: 'card' | 'cash') {
    if (!contract) return
    try {
      let error: any = null
      for (let i = 0; i < 2; i++) {
        const res = await supabase.from('contracts').update({ tenant_pay_method: m }).eq('id', contract.id)
        error = res.error
        if (!error) break
        if (!String(error.message || '').includes('Load failed')) break
        await new Promise(r => setTimeout(r, 400))
      }
      if (error) { showToast('Не удалось переключить: ' + error.message); return }
      setContracts(prev => prev.map(c => c.id === contract.id ? { ...c, tenant_pay_method: m } : c))
      await loadData()
    } catch {
      showToast('Не удалось переключить способ оплаты. Проверьте связь и нажмите ещё раз.')
    }
  }

  if (userLoading || loading) return (
    <div style={T.page}>
      <h1 style={T.h1}>Моя аренда</h1>
      <SkeletonList count={3} />
    </div>
  )

  if (!contract) {
    return (
      <PullToRefresh onRefresh={async () => { window.dispatchEvent(new Event('rentflow-refresh')); await new Promise(r => setTimeout(r, 600)) }}>
        <div style={{ ...T.page, paddingBottom: 40 }}>
          <h1 style={T.h1}>Моя аренда</h1>
          {contracts.length === 0 && (
            <div style={T.card}>
              <div style={T.h2}>Привязать договор</div>
              <div style={{ ...T.small, margin: '4px 0 10px' }}>Арендодатель добавил вас в договор по номеру телефона? Введите этот номер — и аренда откроется.</div>
              <input style={inp} value={claimPhone} onChange={(e) => setClaimPhone(formatPhone(e.target.value))} placeholder="+7 ___ ___-__-__" inputMode="tel" />
              {claimMsg && <div style={{ ...T.tiny, margin: '8px 0 0', color: '#c00' }}>{claimMsg}</div>}
              <button style={T.btn} disabled={claimBusy} onClick={claim}>{claimBusy ? 'Проверка…' : 'Привязать договор'}</button>
              <Hint text="Если договора ещё нет — попросите арендодателя добавить вас по телефону, затем введите его здесь." />
            </div>
          )}
          {contracts.filter((c: any) => c.status === 'active').map((c: any) => (
            <div key={c.id} style={T.card}>
              <button style={rowBtn} onClick={() => { setOpenId(c.id); setTab('pay') }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#1d1d1f' }}>{c._address}</div>
                  <div style={{ fontSize: 13, color: c._over ? '#ff3b30' : '#8e8e93', marginTop: 4 }}>
                    {c._over ? `Просрочка ${c._over.days} дн. · ${c._over.amount.toFixed(0)} ₽` : `${Number(c.rent_amount).toFixed(0)} ₽/мес`}
                  </div>
                </div>
                <span style={{ color: '#c7c7cc', fontSize: 18 }}>›</span>
              </button>
            </div>
          ))}
          {contracts.some((c: any) => c.status === 'terminated') && (
            <>
              <div style={secHead}>Завершённые</div>
              {contracts.filter((c: any) => c.status === 'terminated').map((c: any) => (
                <div key={c.id} style={T.card}>
                  <button style={rowBtn} onClick={() => { setOpenId(c.id); setTab('pay') }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: '#1d1d1f' }}>{c._address}</div>
                      <div style={{ fontSize: 13, color: '#ff3b30', marginTop: 4 }}>{Number(c.rent_amount).toFixed(0)} ₽/мес · договор завершён</div>
                    </div>
                    <span style={{ color: '#c7c7cc', fontSize: 18 }}>›</span>
                  </button>
                </div>
              ))}
            </>
          )}
          {notifications.length > 0 && (
            <div style={T.card}>
              <div style={T.h2}>Уведомления</div>
              {notifications.map(n => (
                <div key={n.id} style={T.row}>
                  <span style={{ fontSize: 15 }}>{n.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </PullToRefresh>
    )
  }

  const obj = data?.obj
  const landlord = data?.landlord
  const meters = data?.meters || []
  const meterTypes = data?.meterTypes || []
  const readings = data?.readings || []
  const payments = data?.payments || []
  const rules = data?.rules || []
  const defs = data?.defs || []
  const contacts = data?.contacts || []
  const frozen = data?.frozen || []
  const readingsMode = contract.readings_mode || 'manual'
  const openPays = payments.filter((p: any) => !p.confirmed_by_landlord)
  const payment = openPays.length ? openPays[openPays.length - 1] : null
  const monthLabel = payment ? parseDate(payment.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : ''
  const basePlusUtil = payment ? Number(payment.base_amount || 0) + Number(payment.utilities_amount || 0) : 0
  const due = payment ? parseDate(payment.due_date) : null
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const daysLeft = due ? Math.round((due.getTime() - todayMid.getTime()) / 86400000) : 0
  const paymentOverdueRule = rules.find((r: any) => r.violation_type === 'payment_overdue')
  const penaltyRate = paymentOverdueRule ? Number(paymentOverdueRule.rate) : 500
  const accrued = payment && daysLeft < 0 && penaltyRate > 0 ? (-daysLeft) * penaltyRate : 0
  const shownPenalty = payment ? Math.max(Number(payment.penalty_amount || 0), accrued) : 0
  const total = basePlusUtil + shownPenalty
  const daysToEnd = contract.end_date ? Math.round((parseDate(contract.end_date).getTime() - todayMid.getTime()) / 86400000) : null
  const lastMonth = daysToEnd !== null && daysToEnd >= 0 && daysToEnd <= 31
  const readingsRule = rules.find((r: any) => r.violation_type === 'readings_overdue')
  const lastDeferral = defs && defs[0] ? defs[0] : null
  const deferralPending = !!(lastDeferral && lastDeferral.status === 'proposed' && payment && String(lastDeferral.payment_id) === String(payment.id))
  const tenantChoseCash = contract.payment_method === 'cash' || (contract.payment_method === 'both' && (contract as any).tenant_pay_method === 'cash')
  const tenantChoseCard = !tenantChoseCash
  const payDetails = (contract as any).payment_details || []
  const readingsByMeter: Record<string, any[]> = {}
  for (const r of readings) { (readingsByMeter[r.object_meter_id] = readingsByMeter[r.object_meter_id] || []).push(r) }
  const latests = meters.map((m: any) => (readingsByMeter[m.id] || [])[0]).filter(Boolean)
  const overallReading = latests.length === 0
    ? 'none'
    : latests.some((r: any) => (r.status || 'proposed') === 'incomplete')
      ? 'incomplete'
      : latests.every((r: any) => r.status === 'confirmed')
        ? 'confirmed'
        : 'proposed'
  const histList = payments.filter((p: any) => {
    const firstOpen = payments.filter((x: any) => !x.confirmed_by_landlord).map((x: any) => x.period).sort()[0]
    return !(!p.confirmed_by_landlord && firstOpen && p.period > firstOpen)
  })
  const payBadge = !!payment
  const metersBadge = readingsMode === 'manual' && meters.length > 0 && overallReading !== 'confirmed'

  return (
    <div style={{ ...T.page, paddingBottom: 90 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
        <button style={iosBlue} onClick={() => setOpenId(null)}>← Моя аренда</button>
      </div>
      <h1 style={T.h1}>{contract._address}</h1>
      {!data ? (
        <SkeletonList count={3} />
      ) : (
        <>
          {tab === 'pay' && (
            <>
              {payment && (
                <div style={T.card}>
                  <div style={T.h2}>Счёт за {monthLabel}</div>
                  <div style={T.row}><span style={iosMuted}>Аренда</span><span style={valMoney}>{Number(payment.base_amount || 0).toFixed(0)} ₽</span></div>
                  <div style={T.row}><span style={iosMuted}>Коммунальные</span><span style={valMoney}>{Number(payment.utilities_amount || 0).toFixed(0)} ₽</span></div>
                  <div style={T.row}><span style={{ ...iosMuted, color: shownPenalty > 0 ? '#ff3b30' : iosMuted.color }}>Штраф</span><span style={{ ...valMoney, color: shownPenalty > 0 ? '#ff3b30' : valMoney.color }}>{shownPenalty.toFixed(0)} ₽</span></div>
                  <div style={T.row}><span style={{ ...valText, fontWeight: 700 }}>Итого</span><span style={valMoney}>{total.toFixed(0)} ₽</span></div>
                  <div style={{ ...T.row, borderBottom: 'none' }}>
                    <span style={iosMuted}>Срок</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: daysLeft < 0 ? '#ff3b30' : daysLeft <= 3 ? '#b25000' : '#1e7e34' }}>
                      {daysLeft < 0 ? `просрочка ${-daysLeft} дн.` : daysLeft === 0 ? 'сегодня' : `ещё ${daysLeft} дн. (${due!.toLocaleDateString('ru-RU')})`}
                    </span>
                  </div>
                  {accrued > 0 && <Hint text="Штраф начисляется каждый день просрочки и растёт до момента оплаты." />}
                  {Number(payment.paid_amount || 0) > 0 && <div style={T.tiny}>Получено: {Number(payment.paid_amount).toFixed(0)} ₽</div>}
                  {shownPenalty > 0 && !deferralPending && (
                    <div style={{ marginTop: 8 }}>
                      <button style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }} onClick={requestDeferral}>Попросить отсрочку штрафа {shownPenalty.toFixed(0)} ₽</button>
                    </div>
                  )}
                  {deferralPending && <div style={T.tiny}>Просьба об отсрочке отправлена арендодателю.</div>}
                </div>
              )}
              {!payment && (
                <div style={T.card}>
                  <div style={{ ...T.small, margin: '8px 0' }}>{lastMonth ? 'Все счета по текущему договору оплачены до конца срока. Новый счёт появится, если арендодатель примет решение о продлении.' : 'Открытых счетов нет — следующий счёт создастся автоматически после подтверждения оплаты.'}</div>
                </div>
              )}
              <div style={T.card}>
                <div style={T.h2}>Способ оплаты</div>
                {contract.payment_method === 'both' ? (
                  [
                    { v: 'card', l: 'Безналичный расчёт' },
                    { v: 'cash', l: 'Наличные' },
                  ].map((o, i) => (
                    <div key={o.v}>
                      {i > 0 && <div style={hair} />}
                      <button
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 44, border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 0', fontSize: 17, fontWeight: 500, color: '#1d1d1f' }}
                        onClick={() => setTenantPayMethod(o.v as any)}
                      >
                        {o.l}
                        {(contract.tenant_pay_method || 'card') === o.v && <span style={{ color: '#0071e3', fontWeight: 600 }}>✓</span>}
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={{ ...T.row, borderBottom: 'none' }}>
                    <span style={valText}>{contract.payment_method === 'cash' ? 'Наличные' : 'Безналичный расчёт'}</span>
                  </div>
                )}
              </div>
              {tenantChoseCard && payment && (payDetails.length > 0 || (contract as any).card_number) && (
                <div style={T.card}>
                  <div style={T.h2}>Куда платить</div>
                  {payDetails.map((d: any, i: number) => (
                    <div key={i} style={{ padding: '8px 0', borderBottom: i < payDetails.length - 1 ? '1px solid rgba(60,60,67,0.12)' : 'none' }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>
                        {d.type === 'sbp' ? 'СБП по телефону' : d.type === 'card' ? 'Карта' : 'Перевод'}{d.bank ? ` · ${d.bank}` : ''}
                      </div>
                      <div style={{ ...valText, marginTop: 4 }}>{d.number}</div>
                      <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>Получатель: {d.recipient || (obj as any)?.landlord_doc_name || landlord?.full_name || '—'}</div>
                    </div>
                  ))}
                  {payDetails.length === 0 && (contract as any).card_number && (
                    <div style={{ padding: '8px 0' }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>Карта</div>
                      <div style={{ ...valText, marginTop: 4 }}>{(contract as any).card_number}</div>
                    </div>
                  )}
                  <Hint text="Оплатите по этим реквизитам и нажмите «Я оплатил» — арендодатель подтвердит получение." />
                  {payment && tenantChoseCard && !payment.card_claimed && (
                    <button style={T.btn} onClick={() => setPayClaimOpen(true)}>Я оплатил</button>
                  )}
                  {payment && tenantChoseCard && payment.card_claimed && (
                    <div style={{ ...T.noteGreen, marginTop: 10 }}>Заявка отправлена — арендодатель подтвердит получение.</div>
                  )}
                </div>
              )}
              {tenantChoseCash && (
                <CashNegotiation
                  contractId={contract.id}
                  myRole="tenant"
                  tenantId={user!.id}
                  landlordId={obj?.landlord_id || contract.object?.landlord_id}
                />
              )}
              {lastMonth && (
                <div style={T.card}>
                  <div style={T.h2}>Договор заканчивается</div>
                  <div style={{ ...T.small, margin: '0 0 10px' }}>Срок до {contract.end_date ? parseDate(contract.end_date).toLocaleDateString('ru-RU') : '—'}. Ваш выбор — предложение арендодателю: он примет решение и при продлении может изменить стоимость и условия.</div>
                  {!renewOffer && endChoice === '' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }} onClick={() => setEndConfirm('renew')}>Отправить предложение о продлении</button>
                      <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => setEndConfirm('exit')}>Отправить предложение о завершении</button>
                    </div>
                  )}
                  {!renewOffer && endChoice === 'renew' && <div style={T.noteGreen}>Предложение о продлении отправлено арендодателю.</div>}
                  {!renewOffer && endChoice === 'exit' && <div style={T.noteGreen}>Предложение о завершении отправлено. Арендодатель подготовит расчёт при съезде.</div>}
                  {renewOffer && renewOffer.status === 'accepted' && <div style={T.noteGreen}>Договор продлён — новый договор уже в списке.</div>}
                  {renewOffer && renewOffer.status === 'declined' && <div style={T.noteGreen}>Продление отклонено — договор завершится в срок.</div>}
                  {renewOffer && renewOffer.status === 'countered' && <div style={T.noteGreen}>Идёт обсуждение условий — ждём новое предложение.</div>}
                  {renewOffer && renewOffer.status === 'proposed' && renewOffer.offered_by === 'tenant' && <div style={T.noteGreen}>Предложение отправлено. Ждём ответ арендодателя.</div>}
                  {renewOffer && renewOffer.status === 'proposed' && renewOffer.offered_by === 'landlord' && (
                    <>
                      <div style={T.row}><span style={iosMuted}>Аренда</span><span style={valMoney}>{Number(renewOffer.rent_amount).toFixed(0)} ₽/мес</span></div>
                      <div style={{ ...T.row, borderBottom: 'none' }}><span style={iosMuted}>Новый договор</span><span style={valText}>{renewOffer.months} мес. с {parseDate(renewOffer.start_date).toLocaleDateString('ru-RU')}</span></div>
                      {!renewForm ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }} onClick={tenantAccept}>Согласен</button>
                          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => { setMyRent(String(renewOffer.rent_amount)); setMyMonths(renewOffer.months || 11); setMyStart(renewOffer.start_date); setRenewForm(true) }}>Свои условия</button>
                        </div>
                      ) : (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 13, color: '#8e8e93', margin: '4px 0 2px' }}>Ваша аренда, ₽/мес</div>
                          <input style={inp} value={myRent} onChange={(e) => setMyRent(e.target.value)} inputMode="numeric" />
                          <div style={{ fontSize: 13, color: '#8e8e93', margin: '8px 0 2px' }}>Срок, месяцев</div>
                          <select style={{ ...inp, padding: '8px 10px' }} value={myMonths} onChange={(e) => setMyMonths(Number(e.target.value))}>
                            {Array.from({ length: 11 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <div style={{ fontSize: 13, color: '#8e8e93', margin: '8px 0 2px' }}>Начало нового договора</div>
                          <input style={inp} type="date" value={myStart} onChange={(e) => setMyStart(e.target.value)} />
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }} onClick={tenantCounter}>Отправить встречное</button>
                            <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => setRenewForm(false)}>Отмена</button>
                          </div>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
                        <button style={{ ...actBlue, color: '#ff3b30' }} onClick={tenantDecline}>Отказаться от продления</button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div style={T.card}>
                <div style={T.h2}>История платежей</div>
                {histList.length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Платежей пока нет.</div>}
                {(payHistOpen ? histList.slice(0, 8) : histList.slice(0, 1)).map((p: any) => (
                  <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(60,60,67,0.12)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 17, fontWeight: 600, color: '#1d1d1f' }}>{parseDate(p.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span>
                      <span style={valMoney}>{(Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0)).toFixed(0)} ₽</span>
                    </div>
                    <div style={{ marginTop: 2 }}>
                      <span style={{ fontSize: 13, color: p.confirmed_by_landlord ? '#1e7e34' : '#b25000' }}>{p.confirmed_by_landlord ? 'оплачен' : 'ожидает'}</span>
                    </div>
                  </div>
                ))}
                {histList.length > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 2px' }}>
                    <button style={actBlue} onClick={() => setPayHistOpen(!payHistOpen)}>
                      {payHistOpen ? 'Свернуть историю' : 'Показать историю'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {tab === 'meters' && (
            <>
              {readingsMode === 'self' ? (
                <BillReview contractId={contract.id} tenantId={contract.tenant_id} />
              ) : (
                <div style={T.card}>
                  <div style={T.h2}>Показания за {now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</div>
                  {overallReading === 'incomplete' && <div style={T.noteRed}>Арендодатель отметил показания неполными — передайте ещё раз.</div>}
                  {meters.length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Счётчиков нет.</div>}
                  {meters.map((m: any, i: number) => {
                    const t = meterTypes.find((x: any) => x.id === m.meter_type_id)
                    const hist = readingsByMeter[m.id] || []
                    const last = hist[0]
                    const open = !!historyOpen[m.id]
                    return (
                      <div key={m.id}>
                        {i > 0 && <div style={hair} />}
                        <div style={{ padding: '10px 0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                            <span style={{ fontSize: 17, fontWeight: 600, color: '#1d1d1f' }}>{t?.label || 'Счётчик'}{m.label ? ` · № ${m.label}` : ''}</span>
                            <input
                              style={rightInput}
                              value={vals[m.id] || ''}
                              onChange={(e) => setVals({ ...vals, [m.id]: e.target.value })}
                              placeholder={last ? String(fmt(last.value)) : '0'}
                              inputMode="decimal"
                            />
                          </div>
                          <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 4 }}>
                            {last
                              ? `последнее: ${fmt(last.value)} · ${last.status === 'confirmed' ? 'подтверждены' : last.status === 'incomplete' ? 'неполные' : 'ожидают'}`
                              : (m.initial_value != null ? `стартовые: ${fmt(m.initial_value)}` : 'показаний ещё нет')}
                          </div>
                          {hist.length > 0 && (
                            <div style={{ ...actBlue, padding: '8px 0 0' }} onClick={() => setHistoryOpen({ ...historyOpen, [m.id]: !open })}>
                              история · {hist.length} {open ? '▲' : '▼'}
                            </div>
                          )}
                          {open && hist.slice(0, 10).map((r: any) => (
                            <div key={r.id} style={{ fontSize: 13, color: '#8e8e93', padding: '3px 0' }}>
                              {fmt(r.value)} · {parseDate(r.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })} · {r.status === 'confirmed' ? 'подтверждены' : r.status === 'incomplete' ? 'неполные' : 'ожидают'}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  {meters.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 10px' }}>
                      <button style={iosBlue} disabled={busy} onClick={submitReadings}>Передать показания</button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {tab === 'contract' && (
            <>
              <div style={T.card}>
                <div style={T.h2}>Договор</div>
                <div style={T.row}><span style={iosMuted}>Арендодатель</span><span style={{ ...valText, textAlign: 'right' }}>{(obj as any)?.landlord_doc_name || landlord?.full_name || '—'}</span></div>
                {contract.start_date && contract.end_date && (
                  <div style={T.row}><span style={iosMuted}>Срок</span><span style={valText}>{parseDate(contract.start_date).toLocaleDateString('ru-RU')} — {parseDate(contract.end_date).toLocaleDateString('ru-RU')}</span></div>
                )}
                <div style={T.row}><span style={iosMuted}>Аренда</span><span style={valMoney}>{Number(contract.rent_amount).toFixed(0)} ₽/мес</span></div>
                <div style={T.row}><span style={iosMuted}>Оплата</span><span style={valText}>до {contract.payment_day} числа</span></div>
                {Number(contract.deposit_amount || 0) > 0 && (
                  <div style={T.row}><span style={iosMuted}>Депозит</span><span style={valMoney}>{Number(contract.deposit_paid || 0).toFixed(0)} из {Number(contract.deposit_amount || 0).toFixed(0)} ₽</span></div>
                )}
                <div style={T.row}><span style={iosMuted}>Просрочка оплаты</span><span style={valMoney}>+{penaltyRate} ₽/день</span></div>
                {readingsMode === 'manual' && readingsRule && Number(readingsRule.rate) > 0 && (
                  <div style={{ ...T.row, borderBottom: 'none' }}><span style={iosMuted}>Просрочка показаний</span><span style={valMoney}>+{Number(readingsRule.rate)} ₽/день</span></div>
                )}
              </div>
              {contacts.length > 0 && (
                <div style={T.card}>
                  <div style={T.h2}>Экстренные контакты</div>
                  {contacts.map((c: any, i: number) => (
                    <div key={c.id}>
                      {i > 0 && <div style={hair} />}
                      <div style={T.row}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 17, fontWeight: 500, color: '#1d1d1f' }}>{c.label}</div>
                          {c.note && <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>{c.note}</div>}
                        </div>
                        <a
                          href={`tel:${String(c.phone || '').replace(/[^\d+]/g, '')}`}
                          onClick={(e) => {
                            e.preventDefault()
                            try { navigator.clipboard?.writeText(String(c.phone || '')) } catch {}
                            showToast('✅ Номер скопирован')
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            try { navigator.clipboard?.writeText(String(c.phone || '')); showToast('✅ Номер скопирован') } catch {}
                          }}
                          style={{ color: '#0071e3', fontSize: 17, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}
                        >{c.phone}</a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {frozen.length > 0 && (
                <div style={T.card}>
                  <div style={T.h2}>Замороженные штрафы</div>
                  {frozen.map((f: any) => (
                    <div key={f.id} style={T.item}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 17, fontWeight: 500, color: '#1d1d1f' }}>{f.period ? parseDate(f.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : 'без месяца'}</span>
                        <span style={valMoney}>{Number(f.amount).toFixed(0)} ₽</span>
                      </div>
                      {f.adjusted_note && <div style={T.tiny}>{f.adjusted_note}</div>}
                    </div>
                  ))}
                  <Hint text="Записи хранятся до конца договора: каждое изменение — с примечанием и датой." />
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
        </>
      )}
      <Modal open={payClaimOpen} title="Подтверждение оплаты" onClose={() => setPayClaimOpen(false)}>
        <div style={{ fontSize: 15, color: '#555', marginBottom: 12 }}>Вы действительно оплатили {total.toFixed(0)} ₽ за {monthLabel}? Арендодатель получит уведомление.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 17, cursor: 'pointer' }} onClick={() => { setPayClaimOpen(false); claimCard() }}>Да, я оплатил</button>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 17, cursor: 'pointer' }} onClick={() => setPayClaimOpen(false)}>Отмена</button>
        </div>
      </Modal>
      <Modal open={!!endConfirm} title={endConfirm === 'renew' ? 'Предложение о продлении' : 'Предложение о завершении'} onClose={() => setEndConfirm('')}>
        <div style={{ fontSize: 15, color: '#555', marginBottom: 12 }}>
          {endConfirm === 'renew'
            ? 'Отправить арендодателю предложение продлить договор? Он примет решение и при продлении может изменить стоимость и условия.'
            : 'Отправить арендодателю предложение завершить договор в срок? Он подготовит расчёт при съезде.'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 17, cursor: 'pointer' }} onClick={() => { const k = endConfirm; setEndConfirm(''); if (k) sendEndChoice(k) }}>Да, отправить</button>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 17, cursor: 'pointer' }} onClick={() => setEndConfirm('')}>Отмена</button>
        </div>
      </Modal>
      <BottomNav tabs={TABS} tab={tab} setTab={setTab} badges={{ pay: payBadge, meters: metersBadge }} />
    </div>
  )
}

export default TenantDashboard
