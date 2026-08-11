import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'

export function TenantDashboard() {
  const { user, loading: userLoading } = useTelegramUser()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    async function load() {
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

        setData({ contract, obj, landlord, payments: payments || [], meters: meters || [], meterTypes: meterTypes || [] })
      } catch (e) {
        setError('Ошибка загрузки: ' + String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  async function claimPaid() {
    if (!data || !data.landlord) return
    const payment = data.payments[0]
    if (!payment) return
    const { error: e } = await supabase.from('notifications_log').insert({
      user_id: data.landlord.id,
      type: 'payment_claimed',
      related_id: payment.id,
      sent_at: new Date().toISOString(),
    })
    setMsg(e ? 'Ошибка: ' + e.message : '✅ Арендодатель уведомлён об оплате')
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
  }

  if (userLoading || loading) return <div style={s.container}>Загрузка...</div>
  if (error) return <div style={s.container}>{error}</div>
  if (!data) return <div style={s.container}>Нет данных</div>

  const { contract, obj, landlord, payments, meters, meterTypes } = data
  const payment = payments[0]
  const today = new Date()
  const isOverdue = payment && !payment.confirmed_by_landlord && today > new Date(payment.due_date)
  const total = payment ? Number(payment.base_amount) + Number(payment.penalty_amount || 0) : Number(contract.rent_amount)
  const status = payment
    ? payment.confirmed_by_landlord ? { icon: '🟢', text: 'Оплачено' }
      : isOverdue ? { icon: '🔴', text: 'Просрочка' }
      : { icon: '🟡', text: 'Ожидает оплаты' }
    : { icon: '⚪', text: 'Нет счёта' }
  const monthLabel = payment ? new Date(payment.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : ''

  return (
    <div style={s.container}>
      <h1 style={s.title}>💧 Моя аренда</h1>
      <div style={s.card}>
        <div style={s.address}>{obj?.address}</div>
        <div style={s.small}>Арендодатель: {landlord?.full_name}{landlord?.phone ? ', ' + landlord.phone : ''}</div>
      </div>

      <div style={s.card}>
        <div style={s.h2}>🧾 Счёт за {monthLabel}</div>
        <div style={s.row}><span>Аренда</span><b>{Number(payment?.base_amount ?? contract.rent_amount).toFixed(2)} ₽</b></div>
        <div style={s.row}><span>Штраф</span><b>{Number(payment?.penalty_amount || 0).toFixed(2)} ₽</b></div>
        <div style={s.row}><span>Итого</span><b style={s.total}>{total.toFixed(2)} ₽</b></div>
        {payment && <div style={s.small}>Оплатить до: {new Date(payment.due_date).toLocaleDateString('ru-RU')}</div>}
        <div style={s.statusRow}><span>{status.icon}</span><span>{status.text}</span></div>
        {contract.card_number && <div style={s.small}>💳 Оплата на карту: {contract.card_number}</div>}
        {!payment?.confirmed_by_landlord && (
          <button onClick={claimPaid} style={s.button}>✅ Я оплатил</button>
        )}
      </div>

      {meters.length > 0 && (
        <div style={s.card}>
          <div style={s.h2}>💦 Передать показания</div>
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

      {msg && <div style={s.msg}>{msg}</div>}

      <div style={s.card}>
        <div style={s.h2}>📜 История платежей</div>
        {payments.slice(0, 5).map((p: any) => (
          <div key={p.id} style={s.row}>
            <span>{new Date(p.period).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })} {p.confirmed_by_landlord ? '🟢' : '🟡'}</span>
            <b>{(Number(p.base_amount) + Number(p.penalty_amount || 0)).toFixed(2)} ₽</b>
          </div>
        ))}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { fontFamily: 'system-ui', maxWidth: 600, margin: '0 auto', padding: 16, backgroundColor: '#f5f5f5', minHeight: '100vh' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  address: { fontSize: 16, fontWeight: 600, marginBottom: 8 },
  small: { fontSize: 13, color: '#666', marginTop: 6 },
  h2: { fontSize: 17, fontWeight: 700, marginBottom: 10 },
  row: { display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 },
  total: { fontSize: 17 },
  statusRow: { display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0' },
  button: { marginTop: 10, width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#2196f3', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15, marginBottom: 8, boxSizing: 'border-box' },
  msg: { padding: 12, borderRadius: 10, backgroundColor: '#e8f5e9', color: '#2e7d32', marginBottom: 12, fontSize: 14 },
}

export default TenantDashboard
