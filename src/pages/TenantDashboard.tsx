import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'

interface PayDetail { type: 'card' | 'sbp'; bank: string; number: string }
interface Notification { id: string; user_id: string; type: string; related_id: string; sent_at: string }
interface CashMeeting { id: string; contract_id: string; payment_id: string; day: number; time_from: string; time_to: string; status: 'proposed' | 'confirmed' }

function parseDate(d: any): Date {
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, dd || 1)
}

function formatSlotDate(d: any): string {
  const dt = parseDate(d)
  const wd = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][dt.getDay()]
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()} (${wd})`
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

export function TenantDashboard() {
  const { user, loading: userLoading } = useTelegramUser()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [cashMeetings, setCashMeetings] = useState<CashMeeting[]>([])
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0)

  async function load() {
    if (!user) return
    try {
      const { data: contract } = await supabase
        .from('contracts').select('*')
        .eq('tenant_id', user!.id).eq('status', 'active').maybeSingle()
      if (!contract) { setError('Договор не найден. Обратитесь к арендодателю.'); setLoading(false); return }

      const { data: obj } = await supabase.from('objects').select('*').eq('id', contract.object_id).maybeSingle()
      const { data: landlord } = await supabase.from('users').select('*').eq('id', obj?.landlord_id).maybeSingle()
      const { data: payments } = await supabase.from('payments').select('*').eq('contract_id', contract.id).order('period', { ascending: false })
      const { data: meters } = await supabase.from('object_meters').select('*').eq('object_id', contract.object_id).eq('is_active', true)
      const { data: meterTypes } = await supabase.from('meter_types').select('*')
      const { data: penaltyRules } = await supabase.from('penalty_rules').select('*').eq('contract_id', contract.id)
      const { data: deferredDebts } = await supabase.from('deferred_debts').select('*').eq('contract_id', contract.id)
      const { data: deferredReqs } = await supabase.from('deferred_requests').select('*').eq('contract_id', contract.id).order('created_at', { ascending: false }).limit(1)

      const { data: meetings } = await supabase
        .from('cash_meetings').select('*')
        .eq('contract_id', contract.id)
        .order('created_at', { ascending: false }).limit(1)
      if (meetings && meetings.length > 0) setCashMeetings(meetings)
      else setCashMeetings([])

      const { data: notifData } = await supabase
        .from('notifications_log').select('*')
        .eq('user_id', user!.id)
        .order('sent_at', { ascending: false }).limit(5)
      setNotifications(notifData || [])

      setData({
        contract, obj, landlord,
        payments: payments || [], meters: meters || [], meterTypes: meterTypes || [],
        penaltyRules: penaltyRules || [],
        deferredDebts: deferredDebts || [], deferredReqs: deferredReqs || []
      })
    } catch (e) {
      setError('Ошибка загрузки: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load(), 30000)
    window.addEventListener('rentflow-refresh', () => load())
    return () => clearInterval(interval)
  }, [user])

  async function choosePayMethod(m: string) {
    if (!data) return
    const { error: e } = await supabase.from('contracts').update({ tenant_pay_method: m }).eq('id', data.contract.id)
    if (e) setMsg('Ошибка: ' + e.message)
    else load()
  }

  async function claimPaid() {
    if (!data || !data.landlord) return
    const payment = data.payments[0]
    if (!payment) return
    const { error: e } = await supabase.from('notifications_log').insert({
      user_id: data.landlord.id, type: 'payment_claimed', related_id: payment.id, sent_at: new Date().toISOString(),
    })
    setMsg(e ? 'Ошибка: ' + e.message : '✅ Арендодатель уведомлён об оплате')
    const { data: notifData } = await supabase.from('notifications_log').select('*').eq('user_id', user!.id).order('sent_at', { ascending: false }).limit(5)
    setNotifications(notifData || [])
  }

  async function requestDeferral() {
    if (!data || !data.landlord) return
    const payment = data.payments[0]
    if (!payment || Number(payment.penalty_amount) <= 0) return
    const { error: e } = await supabase.from('deferred_requests').insert({
      contract_id: data.contract.id, payment_id: payment.id,
      amount: Number(payment.penalty_amount), status: 'proposed',
    })
    if (e) { setMsg('Ошибка: ' + e.message); return }
    await supabase.from('notifications_log').insert({
      user_id: data.landlord.id, type: 'deferred_proposed', related_id: data.contract.id, sent_at: new Date().toISOString(),
    })
    setMsg('✅ Заявка на отсрочку штрафа отправлена арендодателю')
    load()
  }

  async function submitMeters() {
    if (!data) return
    const period = new Date().toISOString().slice(0, 7) + '-01'
    const rows: any[] = []
    for (const m of data.meters) {
      const v = vals[m.id]
      if (v) rows.push({ object_meter_id: m.id, contract_id: data.contract.id, value: Number(v), period, submitted_at: new Date().toISOString() })
    }
    if (rows.length === 0) { setMsg('Введите показания счётчиков'); return }
    const { error: e } = await supabase.from('meter_readings').insert(rows)
    setMsg(e ? 'Ошибка: ' + e.message : '✅ Показания переданы')
    setVals({})
    if (!e) {
      await supabase.from('notifications_log').insert({
        user_id: user!.id, type: 'meter_submitted', related_id: data.contract.id, sent_at: new Date().toISOString()
      })
      const { data: notifData } = await supabase.from('notifications_log').select('*').eq('user_id', user!.id).order('sent_at', { ascending: false }).limit(5)
      setNotifications(notifData || [])
    }
  }

  async function proposeCashMeeting() {
    if (!data || !data.contract) return
    const slots = data.contract.cash_slots || []
    if (slots.length === 0) { setMsg('Нет доступных слотов времени'); return }
    const slot = slots[selectedSlotIndex]
    if (!slot) return
    const payment = data.payments[0]
    const meetingData = {
      contract_id: data.contract.id,
      payment_id: payment ? payment.id : null,
      day: slot.day,
      meeting_date: (slot as any).date || null,
      time_from: slot.time_from,
      time_to: slot.time_to,
      status: 'proposed' as const
    }
    const { error: e } = await supabase.from('cash_meetings').insert(meetingData)
    if (e) { setMsg('Ошибка: ' + e.message); return }
    await supabase.from('notifications_log').insert({
      user_id: data.landlord.id, type: 'cash_proposed', related_id: data.contract.id, sent_at: new Date().toISOString()
    })
    const { data: newMeeting } = await supabase.from('cash_meetings').select('*')
      .eq('contract_id', data.contract.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (newMeeting) setCashMeetings([newMeeting])
    setMsg('✅ Заявка отправлена арендодателю')
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setMsg(`✅ Скопировано: ${label}`)
      setTimeout(() => setMsg(null), 2000)
    } catch {
      setMsg('Не удалось скопировать')
    }
  }

  if (userLoading || loading) return <div style={s.container}>Загрузка...</div>
  if (error) return <div style={s.container}>{error}</div>
  if (!data) return <div style={s.container}>Нет данных</div>

  const { contract, obj, landlord, payments, meters, meterTypes, penaltyRules, deferredDebts, deferredReqs } = data
  const readingsMode = contract.readings_mode || 'manual'
  const reminder = contract.reminder_days_before || 3
  const payment = payments[0]
  const today = new Date()
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const utilities = Number(payment?.utilities_amount || 0)
  const total = payment ? Number(payment.base_amount) + Number(payment.penalty_amount || 0) + utilities : Number(contract.rent_amount)
  const monthLabel = payment ? new Date(payment.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : ''

  const effectiveMethod = contract.payment_method === 'both'
    ? (contract.tenant_pay_method || 'card')
    : contract.payment_method

  let statusIcon = '⚪'
  let statusText = 'Нет счёта'
  let statusColor = '#888'
  let isOverdue = false

  if (payment) {
    if (!payment.confirmed_by_landlord) {
      const dueMid = parseDate(payment.due_date)
      const daysUntilDue = Math.round((dueMid.getTime() - todayMid.getTime()) / 86400000)
      if (todayMid > dueMid) {
        isOverdue = true
        statusIcon = '🔴'
        statusColor = '#c00'
        statusText = `Просрочка ${-daysUntilDue} дн.`
      } else if (daysUntilDue === 0) {
        statusIcon = '🟡'
        statusColor = '#a80'
        statusText = 'Сегодня последний день оплаты'
      } else if (daysUntilDue <= reminder) {
        statusIcon = '🟡'
        statusColor = '#a80'
        statusText = `До оплаты ${daysUntilDue} дн.`
      } else {
        statusIcon = '🟢'
        statusColor = '#080'
        statusText = `До оплаты ${daysUntilDue} дн.`
      }
    } else {
      const periodDate = parseDate(payment.period)
      const nextDue = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, contract.payment_day || 1)
      const daysLeft = Math.round((nextDue.getTime() - todayMid.getTime()) / 86400000)
      if (daysLeft < 0) {
        statusIcon = '🔴'
        statusColor = '#c00'
        statusText = `Следующий платёж просрочен на ${-daysLeft} дн.`
      } else if (daysLeft === 0) {
        statusIcon = '🟡'
        statusColor = '#a80'
        statusText = 'Следующая оплата: сегодня последний день'
      } else if (daysLeft <= reminder) {
        statusIcon = '🟡'
        statusColor = '#a80'
        statusText = `${daysLeft} дн. до следующей оплаты`
      } else {
        statusIcon = '🟢'
        statusColor = '#080'
        statusText = `${daysLeft} дн. до следующей оплаты`
      }
    }
  }

  const paymentOverdueRule = penaltyRules.find((r: any) => r.violation_type === 'payment_overdue')
  const penaltyRate = paymentOverdueRule ? Number(paymentOverdueRule.rate) : 500

  const deferredTotal = (deferredDebts || []).reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0)
  const lastDeferral = deferredReqs && deferredReqs[0] ? deferredReqs[0] : null
  const deferralPending = !!(lastDeferral && lastDeferral.status === 'proposed' && payment && String(lastDeferral.payment_id) === String(payment.id))

  const lastMeeting = cashMeetings[0]
  const meetingStatus = !lastMeeting ? null : lastMeeting.status === 'proposed' ? { icon: '🟡', text: 'Заявка на рассмотрении' } : { icon: '🟢', text: 'Время подтверждено' }

  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
  const slots = contract.cash_slots || []

  const details: PayDetail[] = Array.isArray(contract.payment_details) && contract.payment_details.length > 0
    ? contract.payment_details
    : (contract.card_number ? [{ type: 'card', bank: 'Банк не указан', number: contract.card_number }] : [])

  const getNotificationText = (type: string) => {
    switch (type) {
      case 'payment_claimed': return '✅ Арендатор сообщил об оплате'
      case 'payment_confirmed': return '🟢 Арендодатель подтвердил оплату'
      case 'meter_submitted': return '💦 Переданы новые показания'
      case 'cash_proposed': return '💵 Арендатор предложил время оплаты наличными'
      case 'cash_confirmed': return '🤝 Время оплаты наличными подтверждено'
      case 'deferred_proposed': return '🙏 Заявка на отсрочку штрафа отправлена'
      case 'deferred_confirmed': return '🤝 Арендодатель подтвердил отсрочку штрафа'
      default: return type
    }
  }

  return (
    <div style={s.container}>
      <h1 style={s.title}>💧 Моя аренда</h1>
      <div style={s.card}>
        <div style={s.address}>{obj?.address}</div>
        <div style={s.small}>Арендодатель: {landlord?.full_name}{landlord?.phone ? ', ' + formatPhoneDisplay(landlord.phone) : ''}</div>
      </div>

      {deferredTotal > 0 && (
        <div style={s.suspendedBlock}>
          ⚠️ Приостановленный долг: <b>{deferredTotal.toFixed(2)} ₽</b>
          <div style={s.small}>Напоминание о недобросовестности — останется до конца срока аренды</div>
        </div>
      )}

      <div style={s.card}>
        <div style={s.h2}>🧾 Счёт за {monthLabel}</div>
        <div style={s.row}><span>Аренда</span><b>{Number(payment?.base_amount ?? contract.rent_amount).toFixed(2)} ₽</b></div>
        <div style={s.row}><span>Штраф</span><b>{Number(payment?.penalty_amount || 0).toFixed(2)} ₽</b></div>
        {utilities > 0 && (
          <div style={s.row}><span>Ресурсы по квитанции</span><b>{utilities.toFixed(2)} ₽</b></div>
        )}
        <div style={s.row}><span>Итого</span><b style={s.total}>{total.toFixed(2)} ₽</b></div>
        {payment && <div style={s.small}>Оплатить до: {parseDate(payment.due_date).toLocaleDateString('ru-RU')}</div>}
        <div style={s.statusRow}>
          <span>{statusIcon}</span>
          <span style={{ color: statusColor, fontWeight: 600 }}>{statusText}</span>
        </div>
        {isOverdue && (
          <div style={s.overdueNotice}>⚠️ +{penaltyRate} руб за каждый день просрочки</div>
        )}

        {payment && !payment.confirmed_by_landlord && Number(payment.penalty_amount) > 0 && (
          deferralPending ? (
            <div style={s.meetingStatus}>🟡 Отсрочка штрафа: заявка на рассмотрении</div>
          ) : (
            <button onClick={requestDeferral} style={s.warnButton}>🙏 Попросить отсрочку штрафа</button>
          )
        )}

        {contract.payment_method === 'both' && (
          <div style={s.paySection}>
            <div style={s.h3}>💰 Как вы будете платить</div>
            <div style={s.methodRow}>
              <label style={s.methodLabel}>
                <input type="radio" checked={effectiveMethod === 'card'} onChange={() => choosePayMethod('card')} />
                {' '}💳 Карта
              </label>
              <label style={s.methodLabel}>
                <input type="radio" checked={effectiveMethod === 'cash'} onChange={() => choosePayMethod('cash')} />
                {' '}💵 Наличные
              </label>
            </div>
          </div>
        )}

        {effectiveMethod === 'card' && details.length > 0 && (
          <div style={s.paySection}>
            <div style={s.h3}>💳 Способы оплаты</div>
            {details.map((d: PayDetail, i: number) => (
              <div key={i} style={s.payItem}>
                <div style={s.payHeader}>
                  <span style={s.payIcon}>{d.type === 'card' ? '💳' : '⚡'}</span>
                  <span style={s.payBank}>{d.type === 'card' ? d.bank : `СБП • ${d.bank}`}</span>
                </div>
                <div style={s.payNumber}>{d.type === 'card' ? formatCardNumber(d.number) : formatPhoneDisplay(d.number)}</div>
                <button onClick={() => copyToClipboard(d.type === 'card' ? formatCardNumber(d.number) : d.number, d.type === 'card' ? 'номер карты' : 'номер СБП')} style={s.copyBtn}>
                  📋 Скопировать
                </button>
              </div>
            ))}
            {!payment?.confirmed_by_landlord && (
              <button onClick={claimPaid} style={s.button}>✅ Я оплатил</button>
            )}
          </div>
        )}

        {effectiveMethod === 'cash' && (
          <div style={s.cashSection}>
            <div style={s.h3}>💵 Оплата наличными</div>
            {slots.length === 0 ? (
              <div style={s.small}>Арендодатель ещё не указал слоты времени</div>
            ) : (
              <>
                <select value={selectedSlotIndex} onChange={(e) => setSelectedSlotIndex(Number(e.target.value))} style={s.select}>
                  {slots.map((slot: any, idx: number) => (
                    <option key={idx} value={idx}>
                      {slot.date ? formatSlotDate(slot.date) : (dayNames[slot.day] || '')} {slot.time_from}–{slot.time_to}
                    </option>
                  ))}
                </select>
                <button onClick={proposeCashMeeting} style={s.button}>Предложить время</button>
              </>
            )}
            {meetingStatus && (
              <div style={s.meetingStatus}>
                <span>{meetingStatus.icon}</span> {meetingStatus.text}
              </div>
            )}
          </div>
        )}
      </div>

      {readingsMode === 'manual' && meters.length > 0 && (
        <div style={s.card}>
          <div style={s.h2}>💦 Передать показания</div>
          <div style={s.small}>Срок подачи: до {contract.meter_deadline_day} числа</div>
          {meters.map((m: any) => {
            const t = meterTypes.find((x: any) => x.id === m.meter_type_id)
            return (
              <input
                key={m.id}
                value={vals[m.id] || ''}
                onChange={(e) => setVals({ ...vals, [m.id]: e.target.value })}
                placeholder={(t?.label || 'Счётчик') + ', ' + (t?.unit || 'м³')}
                style={s.input}
                inputMode="decimal"
              />
            )
          })}
          <button onClick={submitMeters} style={s.button}>📤 Передать показания</button>
        </div>
      )}

      {readingsMode === 'auto' && (
        <div style={s.card}>
          <div style={s.h2}>💦 Показания счётчиков</div>
          <div style={s.small}>💡 Показания передаются автоматически — вам ничего подавать не нужно.</div>
        </div>
      )}

      {readingsMode === 'self' && (
        <div style={s.card}>
          <div style={s.h2}>💦 Показания счётчиков</div>
          <div style={s.small}>💡 Вы платите полную квитанцию сами — показания подавать не нужно.</div>
        </div>
      )}

      {msg && <div style={s.msg}>{msg}</div>}

      <div style={s.card}>
        <div style={s.h2}>📜 История платежей</div>
        {payments.slice(0, 5).map((p: any) => (
          <div key={p.id} style={s.row}>
            <span>{new Date(p.period).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })} {p.confirmed_by_landlord ? '🟢' : '🟡'}</span>
            <b>{(Number(p.base_amount) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0)).toFixed(2)} ₽</b>
          </div>
        ))}
      </div>

      <div style={s.card}>
        <div style={s.h2}>🔔 Уведомления</div>
        {notifications.length === 0 ? (
          <div style={s.small}>Нет уведомлений</div>
        ) : (
          notifications.map(n => (
            <div key={n.id} style={s.notificationRow}>{(n as any).message || getNotificationText(n.type)}</div>
          ))
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { fontFamily: 'system-ui', maxWidth: 600, margin: '0 auto', padding: 16, backgroundColor: '#f5f5f5', minHeight: 'auto' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  address: { fontSize: 16, fontWeight: 600, marginBottom: 8 },
  small: { fontSize: 13, color: '#666', marginTop: 6 },
  h2: { fontSize: 17, fontWeight: 700, marginBottom: 10 },
  h3: { fontSize: 15, fontWeight: 600, marginBottom: 8 },
  row: { display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 },
  total: { fontSize: 17 },
  statusRow: { display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0' },
  overdueNotice: { padding: 10, background: '#fdecea', color: '#c00', borderRadius: 8, fontSize: 14, fontWeight: 600, marginTop: 8 },
  suspendedBlock: { padding: 12, backgroundColor: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 12, marginBottom: 12, fontSize: 15, color: '#e65100' },
  button: { marginTop: 10, width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#2196f3', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  warnButton: { marginTop: 10, width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#ff9800', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15, marginBottom: 8, boxSizing: 'border-box' },
  msg: { padding: 12, borderRadius: 10, backgroundColor: '#e8f5e9', color: '#2e7d32', marginBottom: 12, fontSize: 14 },
  paySection: { marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' },
  cashSection: { marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' },
  methodRow: { display: 'flex', gap: 16, marginBottom: 8 },
  methodLabel: { fontSize: 14, cursor: 'pointer' },
  payItem: { background: '#f9f9f9', borderRadius: 8, padding: 12, marginBottom: 8 },
  payHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  payIcon: { fontSize: 20 },
  payBank: { fontWeight: 600, fontSize: 14 },
  payNumber: { fontFamily: 'monospace', fontSize: 16, fontWeight: 500, marginBottom: 8, wordBreak: 'break-all' as const },
  copyBtn: { padding: '8px 14px', borderRadius: 8, border: '1px solid #2196f3', background: '#fff', color: '#2196f3', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  select: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15, marginBottom: 8, boxSizing: 'border-box' },
  meetingStatus: { marginTop: 10, padding: 10, backgroundColor: '#fff3e0', borderRadius: 8, fontSize: 14 },
  notificationRow: { padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 14, color: '#333' },
}

export default TenantDashboard
