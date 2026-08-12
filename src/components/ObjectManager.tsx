import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'

export function ObjectManager() {
  const { user } = useTelegramUser()
  const [objects, setObjects] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [role, setRole] = useState<'landlord' | 'tenant'>('landlord')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [tgId, setTgId] = useState('')
  const [paymentDay, setPaymentDay] = useState('1')
  const [endDate, setEndDate] = useState('')
  const [meterDay, setMeterDay] = useState('5')
  const [rent, setRent] = useState('')
  const [method, setMethod] = useState('card')
  const [cardNumber, setCardNumber] = useState('')
  const [penPay, setPenPay] = useState('500')
  const [penRead, setPenRead] = useState('100')
  const [remind, setRemind] = useState('3')
  const [editId, setEditId] = useState<string | null>(null)
  const [editAddress, setEditAddress] = useState('')
  const [editNotes, setEditNotes] = useState('')

  async function load() {
    if (!user) return
    const { data } = await supabase.from('objects').select('*').eq('landlord_id', user.id)
    setObjects(data || [])
  }

  useEffect(() => {
    load()
  }, [user])

  async function save() {
    if (!user || !address) { setMsg('Укажите адрес объекта'); return }
    let counter: any = null
    if (phone || tgId) {
      const { data } = await supabase.from('users').select('*')
        .or(`telegram_id.eq."${tgId}",phone.eq."${phone}"`).maybeSingle()
      counter = data
    }
    if (!counter) {
      const { data, error } = await supabase.from('users').insert({
        full_name: name || 'Контрагент',
        phone: phone || null,
        telegram_id: tgId || null,
        role: role === 'landlord' ? 'tenant' : 'landlord',
      }).select().single()
      if (error) { setMsg('Ошибка контрагента: ' + error.message); return }
      counter = data
    }
    const landlordId = role === 'landlord' ? user.id : counter.id
    const tenantId = role === 'tenant' ? user.id : counter.id
    const { data: obj, error: objErr } = await supabase.from('objects')
      .insert({ landlord_id: landlordId, address, notes: notes || null }).select().single()
    if (objErr) { setMsg('Ошибка: ' + objErr.message); return }
    const { data: contract, error: conErr } = await supabase.from('contracts').insert({
      object_id: obj.id, tenant_id: tenantId,
      rent_amount: Number(rent) || 0,
      payment_day: Number(paymentDay) || 1,
      meter_deadline_day: Number(meterDay) || 5,
      end_date: endDate || null,
      payment_method: method,
      card_number: cardNumber || null,
      reminder_days_before: Number(remind) || 3,
      status: 'active',
    }).select().single()
    if (conErr) { setMsg('Ошибка: ' + conErr.message); return }
    await supabase.from('penalty_rules').insert([
      { contract_id: contract.id, violation_type: 'payment_overdue', rate: Number(penPay) || 500, rate_unit: 'per_day_rub', starts_after_days: 0 },
      { contract_id: contract.id, violation_type: 'readings_overdue', rate: Number(penRead) || 100, rate_unit: 'per_day_rub', starts_after_days: 0 },
    ])
    setMsg('✅ Объект и договор сохранены')
    setShowForm(false)
    setAddress(''); setNotes(''); setName(''); setPhone(''); setTgId(''); setRent(''); setCardNumber('')
    load()
  }

  async function saveEdit(id: string) {
    const { error } = await supabase.from('objects').update({ address: editAddress, notes: editNotes || null }).eq('id', id)
    setMsg(error ? 'Ошибка: ' + error.message : '✅ Адрес сохранён')
    setEditId(null)
    load()
  }

  return (
    <div style={s.card}>
      <div style={s.h2}>➕ Управление объектами</div>
      <button style={s.button} onClick={() => setShowForm(!showForm)}>{showForm ? 'Скрыть форму' : 'Добавить объект'}</button>
      {showForm && (
        <div>
          <div style={s.row}>
            <label><input type="radio" checked={role === 'landlord'} onChange={() => setRole('landlord')} /> Я арендодатель</label>
            <label><input type="radio" checked={role === 'tenant'} onChange={() => setRole('tenant')} /> Я арендатор</label>
          </div>
          <input style={s.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Адрес (квартира, дом, гараж, коммерция)" />
          <input style={s.input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Заметка (необязательно)" />
          <div style={s.small}>{role === 'landlord' ? 'Арендатор:' : 'Арендодатель:'}</div>
          <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" />
          <input style={s.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Телефон (например: +79995553322)" />
          <input style={s.input} value={tgId} onChange={(e) => setTgId(e.target.value)} placeholder="Telegram ID (необязательно)" />
          <div style={s.small}>Условия договора:</div>
          <input style={s.input} value={rent} onChange={(e) => setRent(e.target.value)} placeholder="Сумма аренды, руб" inputMode="numeric" />
          <div style={s.row}>
            <input style={s.half} value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} placeholder="День платежа" inputMode="numeric" />
            <input style={s.half} value={meterDay} onChange={(e) => setMeterDay(e.target.value)} placeholder="День показаний" inputMode="numeric" />
          </div>
          <input style={s.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <select style={s.input} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="card">Карта</option>
            <option value="cash">Наличные</option>
            <option value="both">Оба</option>
          </select>
          {method !== 'cash' && <input style={s.input} value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="Номер карты" />}
          <div style={s.row}>
            <input style={s.half} value={penPay} onChange={(e) => setPenPay(e.target.value)} placeholder="Штраф оплаты, руб/день" inputMode="numeric" />
            <input style={s.half} value={penRead} onChange={(e) => setPenRead(e.target.value)} placeholder="Штраф показаний, руб/день" inputMode="numeric" />
          </div>
          <input style={s.input} value={remind} onChange={(e) => setRemind(e.target.value)} placeholder="Напоминать за N дней" inputMode="numeric" />
          <button style={s.button} onClick={save}>Сохранить</button>
        </div>
      )}
      <div style={s.h2}>✏️ Мои объекты (правка адреса)</div>
      {objects.map((o) => (
        <div key={o.id} style={s.objRow}>
          {editId === o.id ? (
            <div>
              <input style={s.input} value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
              <input style={s.input} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Заметка" />
              <button style={s.smallButton} onClick={() => saveEdit(o.id)}>Сохранить</button>
              <button style={s.smallButton} onClick={() => setEditId(null)}>Отмена</button>
            </div>
          ) : (
            <div style={s.row}>
              <span>{o.address}</span>
              <button style={s.smallButton} onClick={() => { setEditId(o.id); setEditAddress(o.address); setEditNotes(o.notes || '') }}>✏️</button>
            </div>
          )}
        </div>
      ))}
      {msg && <div style={s.msg}>{msg}</div>}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  card: { fontFamily: 'system-ui', maxWidth: 600, margin: '0 auto', padding: 16 },
  h2: { fontSize: 17, fontWeight: 700, margin: '12px 0 8px' },
  button: { width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#2196f3', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 8 },
  smallButton: { padding: '6px 10px', borderRadius: 8, border: 'none', background: '#90a4ae', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginLeft: 6 },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15, marginBottom: 8, boxSizing: 'border-box' },
  half: { width: '48%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15, marginBottom: 8, boxSizing: 'border-box' },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 },
  small: { fontSize: 13, color: '#666', margin: '4px 0' },
  msg: { padding: 12, borderRadius: 10, background: '#e8f5e9', color: '#2e7d32', marginTop: 8, fontSize: 14 },
  objRow: { background: '#fff', borderRadius: 10, padding: 10, marginBottom: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
}

export default ObjectManager
