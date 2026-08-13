import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import CashNegotiation from '../components/CashNegotiation'

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

export function TenantDashboard() {
  const { user, loading: userLoading } = useTelegramUser()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [frozenOpen, setFrozenOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({})

  async function load() {
    if (!user) return
    try {
      const { data: contract } = await supabase
        .from('contracts').select('*')
        .eq('tenant_id', user!.id).eq('status', 'active').maybeSingle()
      if (!contract) { setError('🤝 У вас пока нет активной аренды. Переключитесь наверх в режим «Арендодатель» и в «Добавить объект» выберите «Я арендатор» — или попросите арендодателя добавить вас в договор по телефону.'); setLoading(false); return }

      const { data: obj } = await supabase.from('objects').select('*').eq('id', contract.object_id).maybeSingle()
      const { data: landlord } = await supabase.from('users').select('*').eq('id', obj?.landlord_id).maybeSingle()
      const { data: payments } = await supabase.from('payments').select('*').eq('contract_id', contract.id).order('period', { ascending: false })
      const { data: meters } = await supabase.from('object_meters').select('*').eq('object_id', contract.object_id).eq('is_active', true)
      const { data: meterTypes } = await supabase.from('meter_types').select('*')
      const { data: penaltyRules } = await supabase.from('penalty_rules').select('*').eq('contract_id', contract.id)
      const { data: frozenRows } = await supabase.from('frozen_penalties').select('*').eq('contract_id', contract.id).order('period', { ascending: true })
      const { data: deferredReqs } = await supabase.from('deferred_requests').select('*').eq('contract_id', contract.id).order('created_at', { ascending: false }).limit(1)

      const ids = (meters || []).map((m: any) => m.id)
      const readingsByMeter: Record<string, any[]> = {}
      if (ids.length) {
        const { data: rd } = await supabase
          .from('meter_readings').select('*')
          .in('object_meter_id', ids)
          .order('submitted_at', { ascending: false })
        for (const r of rd || []) {
          if (!readingsByMeter[r.object_meter_id]) readingsByMeter[r.object_meter_id] = []
          readingsByMeter[r.object_meter_id].push(r)
        }
      }

      const { data: notifData } = await supabase
        .from('notifications_log').select('*')
        .eq('user_id', user!.id)
        .order('sent_at', { ascending: false }).limit(5)
      setNotifications(notifData || [])

      setData({
        contract, obj, landlord,
        payments: payments || [], meters: meters || [], meterTypes: meterTypes || [],
        penaltyRules: penaltyRules || [],
        frozenRows: frozenRows || [],
        deferredReqs: deferredReqs || [],
        readingsByMeter
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
    const { error: e } = await supabase.from('payments').update({ card_claimed: true }).eq('id', payment.id)
    if (e) { setMsg('Ошибка: ' + e.message); return }
    await supabase.from('notifications_log').insert({
      user_id: data.landlord.id, type: 'payment_claimed', related_id: payment.id, sent_at: new Date().toISOString(),
    })
    setMsg('✅ Арендодатель уведомлён: безнал заявлен, ждёт подтверждения')
    load()
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
      if (v) rows.push({ object_meter_id: m.id, contract_id: data.contract.id, value: Number(v), period, submitted_at: new Date().toISOString(), status: 'proposed' })
    }
    if (rows.length === 0) { setMsg('Введите показания счётчиков'); return }
    const { error: e } = await supabase.from('meter_readings').insert(rows)
    setMsg(e ? 'Ошибка: ' + e.message : '✅ Показания переданы и ждут подтверждения арендодателем')
    setVals({})
    if (!e) {
      await supabase.from('notifications_log').insert({
        user_id: user!.id, type: 'meter_submitted', related_id: data.contract.id, sent_at: new Date().toISOString()
      })
      load()
    }
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

  const { contract, obj, landlord, payments, meters, meterTypes, penaltyRules, frozenRows, deferredReqs, readingsByMeter } = data
  const readingsMode = contract.readings_mode || 'manual'
  const reminder = contract.reminder_days_before || 3
  const payment = payments[0]
  const today = new Date()
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const utilities = Number(payment?.utilities_amount || 0)
  const total = payment ? Number(payment.base_amount) + Number(payment.penalty_amount || 0) + utilities : Number(contract.rent_amount)
  const monthLabel = payment ? new Date(payment.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : ''
  const deposit = Number(contract.deposit_amount || 0)
  const frozenTotal = (frozenRows || []).reduce((sum: number, f: any) => sum + Number(f.amount || 0), 0)

  const chip = (stt: string) => (stt || 'proposed') === 'confirmed' ? '🟢 получены' : (stt || 'proposed') === 'incomplete' ? '🔴 не полностью' : '🟡 ждут'

  const latests = (meters || []).map((m: any) => ((readingsByMeter || {})[m.id] || [])[0]).filter(Boolean)
  const overallReading = latests.length === 0
    ? 'none'
    : latests.some((r: any) => (r.status || 'proposed') === 'incomplete')
      ? 'incomplete'
      : latests.every((r: any) => (r.status || 'proposed') === 'confirmed')
        ? 'confirmed'
        : 'proposed'

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
      const sd = contract.start_date ? parseDate(contract.start_date) : null
      const firstMonthGrace = !!sd && dueMid.getMonth() === sd.getMonth() && dueMid.getFullYear() === sd.getFullYear() && todayMid < new Date(sd.getFullYear(), sd.getMonth() + 1, 1)
      const daysUntilDue = firstMonthGrace && todayMid > dueMid ? 0 : Math.round((dueMid.getTime() - todayMid.getTime()) / 86400000)
      if (todayMid > dueMid && !firstMonthGrace) {
        isOverdue = true
        statusIcon = '🔴'
        statusColor = '#c00'
        statusText = `Просрочка ${-daysUntilDue} дн.`
      } else if (daysUntilDue === 0) {
        statusIcon = '🟡'
        statusColor = '#a80'
        statusText = firstMonthGrace ? 'Первый месяц — просрочка не начисляется' : 'Сегодня последний день оплаты'
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

  const lastDeferral = deferredReqs && deferredReqs[0] ? deferredReqs[0] : null
  const deferralPending = !!(lastDeferral && lastDeferral.status === 'proposed' && payment && String(lastDeferral.payment_id) === String(payment.id))

  const details: PayDetail[] = Array.isArray(contract.payment_details) && contract.payment_details.length > 0
    ? contract.payment_details
    : (contract.card_number ? [{ type: 'card', bank: 'Банк не указан', number: contract.card_number }] : [])

  const getNotificationText = (type: string) => {
    switch (type) {
      case 'payment_claimed': return '✅ Арендатор сообщил об оплате'
      case 'payment_confirmed': return '🟢 Арендодатель подтвердил оплату'
      case 'meter_submitted': return '💦 Переданы новые показания'
      case 'cash_proposed': return '💵 Предложено время встречи наличными'
      case 'cash_confirmed': return '🤝 Время встречи наличными подтверждено'
      case 'deferred_proposed': return '🙏 Заявка на отсрочку штрафа отправлена'
      case 'deferred_confirmed': return '🧊 Замороженный штраф обновлён'
      default: return type
    }
  }

  return (
    <div style={s.container}>
      <h1 style={s.title}>💧 Моя аренда</h1>
      <div style={s.card}>
        <div style={s.address}>{obj?.address}</div>
        <div style={s.small}>Арендодатель: {landlord?.full_name}{landlord?.phone ? ', ' + formatPhoneDisplay(landlord.phone) : ''}</div>
        {contract.start_date && contract.end_date && <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', marginTop: 4 }}>Срок аренды: с {parseDate(contract.start_date).toLocaleDateString('ru-RU')} по {parseDate(contract.end_date).toLocaleDateString('ru-RU')} ({Math.max(1, Math.round((parseDate(contract.end_date).getTime() - parseDate(contract.start_date).getTime()) / 2629800000))} мес.)</div>}
        {deposit > 0 && <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', marginTop: 4 }}>Депозит: {deposit.toFixed(0)} ₽</div>}
        {frozenTotal > 0 && (
          <div style={s.frozenNote} onClick={() => setFrozenOpen(!frozenOpen)}>
            🧊 Замороженные штрафы: {frozenTotal.toFixed(0)} ₽ {frozenOpen ? '▲' : '▼'}
            {frozenOpen && (
              <div style={{ marginTop: 6 }}>
                {(frozenRows || []).map((f: any) => (
                  <div key={f.id} style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', marginBottom: 2 }}>
                    {f.period ? parseDate(f.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : 'без месяца'} — {Number(f.amount).toFixed(0)} ₽{f.adjusted_note ? ` (${f.adjusted_note})` : ''}
                  </div>
                ))}
                {deposit > 0
                  ? (deposit >= frozenTotal
                    ? <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>будет удержано из депозита; остаток депозита: {(deposit - frozenTotal).toFixed(0)} ₽</div>
                    : <div style={{ fontSize: 11, color: '#c00' }}>сверх депозита долг: {(frozenTotal - deposit).toFixed(0)} ₽</div>)
                  : <div style={{ fontSize: 11, color: '#c00' }}>долг арендатора (депозита нет)</div>}
                <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)' }}>записи хранятся до конца договора</div>
              </div>
            )}
          </div>
        )}
      </div>

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
                {' '}💳 Безналичный расчёт
              </label>
              <label style={s.methodLabel}>
                <input type="radio" checked={effectiveMethod === 'cash'} onChange={() => choosePayMethod('cash')} />
                {' '}💵 Наличные
              </label>
            </div>
          </div>
        )}

        {effectiveMethod === 'card' && (
          <div style={s.paySection}>
            <div style={s.h3}>💳 Способы оплаты</div>
            {details.length === 0 ? (
              <div style={s.small}>Арендодатель ещё не добавил реквизиты для безналичной оплаты.</div>
            ) : (
              details.map((d: PayDetail, i: number) => (
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
              ))
            )}
            {!payment?.confirmed_by_landlord && details.length > 0 && (
              payment.card_claimed ? (
                <div style={s.meetingStatus}>💳 Безнал заявлен: ждёт подтверждения арендодателем</div>
              ) : (
                <button onClick={claimPaid} style={s.button}>✅ Я оплатил</button>
              )
            )}
          </div>
        )}

        {effectiveMethod === 'cash' && (
          <div style={s.cashSection}>
            <div style={s.h3}>💵 Оплата наличными</div>
            <CashNegotiation
              contractId={contract.id}
              myRole="tenant"
              tenantId={contract.tenant_id}
              landlordId={obj?.landlord_id}
            />
          </div>
        )}
      </div>

      {readingsMode === 'manual' && meters.length > 0 && (
        <div style={s.card}>
          <div style={s.h2}>💦 Передать показания</div>
          <div style={s.small}>Срок подачи: до {contract.meter_deadline_day} числа</div>
          {overallReading === 'incomplete' && (
            <div style={s.overdueNotice}>🔴 Арендодатель отметил: показания получены не полностью — передайте недостающие ещё раз</div>
          )}
          {overallReading === 'confirmed' && (
            <div style={s.okNote}>🟢 Показания получены арендодателем</div>
          )}
          {overallReading === 'proposed' && (
            <div style={s.meetingStatus}>🟡 Показания отправлены и ждут подтверждения арендодателем</div>
          )}
          {meters.map((m: any) => {
            const t = meterTypes.find((x: any) => x.id === m.meter_type_id)
            const hist = (readingsByMeter || {})[m.id] || []
            const last = hist[0]
            const open = !!historyOpen[m.id]
            return (
              <div key={m.id}>
                <input
                  value={vals[m.id] || ''}
                  onChange={(e) => setVals({ ...vals, [m.id]: e.target.value })}
                  placeholder={(t?.label || 'Счётчик') + (m.label ? ` · № ${m.label}` : '') + ', ' + (t?.unit || 'м³')}
                  style={s.input}
                  inputMode="decimal"
                />
                {m.label && <div style={s.tiny}>номер счётчика: {m.label}</div>}
                {last && (
                  <div style={s.tinyLink} onClick={() => setHistoryOpen({ ...historyOpen, [m.id]: !open })}>
                    🕐 последнее: {last.value} · подано {new Date(last.submitted_at).toLocaleDateString('ru-RU')} · {chip(last.status)} {open ? '▲' : '▼'}
                  </div>
                )}
                {open && hist.slice(0, 10).map((r: any) => (
                  <div key={r.id} style={s.tiny}>{r.value} · подано {new Date(r.submitted_at).toLocaleDateString('ru-RU')} · {chip(r.status)}</div>
                ))}
              </div>
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
            <span style={{ flex: 1, minWidth: 0 }}>{new Date(p.period).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })} {p.confirmed_by_landlord ? '🟢' : '🟡'}</span>
            <b style={{ whiteSpace: 'nowrap', marginLeft: 8 }}>{(Number(p.base_amount) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0)).toFixed(2)} ₽</b>
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
  tiny: { fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 2, marginBottom: 6 },
  tinyLink: { fontSize: 11, color: '#00695c', fontWeight: 600, cursor: 'pointer', marginTop: 2, marginBottom: 6 },
  okNote: { padding: 8, background: '#eaf7ef', border: '1px solid #a5d6a7', borderRadius: 8, color: '#080', fontSize: 13, fontWeight: 600, marginBottom: 8 },
  h2: { fontSize: 17, fontWeight: 700, marginBottom: 10 },
  h3: { fontSize: 15, fontWeight: 600, marginBottom: 8 },
  row: { display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 },
  total: { fontSize: 17 },
  statusRow: { display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0' },
  overdueNotice: { padding: 10, background: '#fdecea', color: '#c00', borderRadius: 8, fontSize: 14, fontWeight: 600, marginTop: 8 },
  frozenNote: { fontSize: 13, color: '#00695c', marginTop: 6, fontWeight: 600, cursor: 'pointer' },
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
  meetingStatus: { marginTop: 10, padding: 10, backgroundColor: '#fff3e0', borderRadius: 8, fontSize: 14 },
  notificationRow: { padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 14, color: '#333' },
}

export default TenantDashboard
