import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'

const BANKS = ['Сбербанк', 'Т-Банк (Тинькофф)', 'ВТБ', 'Альфа-Банк', 'Газпромбанк', 'Россельхозбанк', 'Райффайзен Банк', 'Росбанк', 'Открытие', 'Совкомбанк', 'МТС Банк', 'Промсвязьбанк', 'Почта Банк', 'Дом.РФ', 'ЮниКредит Банк']

interface PayDetail { type: 'card' | 'sbp'; bank: string; number: string }

function normalizePhone(input: string): string {
  let cleaned = input.replace(/[\s\-\(\)]/g, '')
  if (cleaned.startsWith('8') && cleaned.length === 11) {
    cleaned = '+7' + cleaned.slice(1)
  }
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned
  }
  return cleaned
}

function DetailsEditor({ list, onChange }: { list: PayDetail[]; onChange: (v: PayDetail[]) => void }) {
  return (
    <div>
      {list.map((d, i) => (
        <div key={i} style={s.detailRow}>
          <select value={d.type} onChange={e => { const v = [...list]; v[i] = { ...v[i], type: e.target.value as 'card' | 'sbp', number: '' }; onChange(v) }} style={s.half}>
            <option value="card">Карта банка</option>
            <option value="sbp">СБП по телефону</option>
          </select>
          <select value={d.bank} onChange={e => { const v = [...list]; v[i] = { ...v[i], bank: e.target.value }; onChange(v) }} style={s.half}>
            {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <input value={d.number} onChange={e => { const v = [...list]; v[i] = { ...v[i], number: e.target.value }; onChange(v) }} placeholder={d.type === 'card' ? 'Номер карты' : 'Номер телефона для СБП'} style={s.input} />
          <button style={s.delButton} onClick={() => onChange(list.filter((_, x) => x !== i))}>✕</button>
        </div>
      ))}
      <button style={s.smallButton} onClick={() => onChange([...list, { type: 'card', bank: BANKS[0], number: '' }])}>+ Добавить способ оплаты</button>
    </div>
  )
}

export function ObjectManager() {
  const { user } = useTelegramUser()
  const [objects, setObjects] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [role, setRole] = useState<'landlord' | 'tenant'>('landlord')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [tgId, setTgId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [paymentDay, setPaymentDay] = useState('')
  const [endDate, setEndDate] = useState('')
  const [meterDay, setMeterDay] = useState('')
  const [rent, setRent] = useState('')
  const [method, setMethod] = useState('card')
  const [penPay, setPenPay] = useState('')
  const [penRead, setPenRead] = useState('')
  const [remind, setRemind] = useState('')
  const [details, setDetails] = useState<PayDetail[]>([])

  const [editId, setEditId] = useState<string | null>(null)
  const [editContractId, setEditContractId] = useState<string | null>(null)
  const [editCounterId, setEditCounterId] = useState<string | null>(null)
  const [eAddress, setEAddress] = useState('')
  const [eNotes, setENotes] = useState('')
  const [eName, setEName] = useState('')
  const [ePhone, setEPhone] = useState('')
  const [eStartDate, setEStartDate] = useState('')
  const [eRent, setERent] = useState('')
  const [ePaymentDay, setEPaymentDay] = useState('')
  const [eMeterDay, setEMeterDay] = useState('')
  const [eEndDate, setEEndDate] = useState('')
  const [eMethod, setEMethod] = useState('card')
  const [ePenPay, setEPenPay] = useState('')
  const [ePenRead, setEPenRead] = useState('')
  const [eRemind, setERemind] = useState('')
  const [eDetails, setEDetails] = useState<PayDetail[]>([])

  async function load() {
    if (!user) return
    const { data } = await supabase.from('objects').select('*').eq('landlord_id', user.id)
    setObjects(data || [])
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  useEffect(() => {
    load()
  }, [user])

  async function save() {
    if (saving) return
    if (!user || !address) { setMsg('Укажите адрес объекта'); return }
    setSaving(true)
    try {
      const normalizedPhone = phone ? normalizePhone(phone) : null
      let counter: any = null
      if (normalizedPhone || tgId) {
        const { data } = await supabase.from('users').select('*')
          .or(`telegram_id.eq."${tgId}",phone.eq."${normalizedPhone}"`).limit(1)
        counter = data && data[0]
      }
      if (!counter) {
        const { data, error } = await supabase.from('users').insert({
          full_name: name || 'Контрагент',
          phone: normalizedPhone,
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
      const firstCard = details.find(d => d.type === 'card')
      const startISO = startDate || new Date().toISOString().slice(0, 10)
      const { data: contract, error: conErr } = await supabase.from('contracts').insert({
        object_id: obj.id, tenant_id: tenantId,
        rent_amount: Number(rent) || 0,
        payment_day: Number(paymentDay) || 1,
        meter_deadline_day: Number(meterDay) || 5,
        start_date: startISO,
        end_date: endDate || null,
        payment_method: method,
        card_number: firstCard ? firstCard.number : null,
        payment_details: details,
        reminder_days_before: Number(remind) || 3,
        status: 'active',
      }).select().single()
      if (conErr) { setMsg('Ошибка: ' + conErr.message); return }
      await supabase.from('penalty_rules').insert([
        { contract_id: contract.id, violation_type: 'payment_overdue', rate: Number(penPay) || 500, rate_unit: 'per_day_rub', starts_after_days: 0 },
        { contract_id: contract.id, violation_type: 'readings_overdue', rate: Number(penRead) || 100, rate_unit: 'per_day_rub', starts_after_days: 0 },
      ])
      // Первый платёж: отсчёт только с дня добавления — если день платежа в этом месяце уже прошёл,
      // срок ставим на сегодня, чтобы старые даты не считались долгом
      const now = new Date()
      const payDay = Number(paymentDay) || 1
      let due = new Date(now.getFullYear(), now.getMonth(), payDay)
      const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      if (due < todayMid) due = todayMid
      const period = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      await supabase.from('payments').insert({
        contract_id: contract.id, period, due_date: due.toISOString().slice(0, 10),
        base_amount: Number(rent) || 0, penalty_amount: 0,
      })
      setMsg('✅ Объект, договор и первый платёж сохранены')
      setShowForm(false)
      setAddress(''); setNotes(''); setName(''); setPhone(''); setTgId(''); setRent(''); setStartDate(''); setDetails([])
      load()
    } finally {
      setSaving(false)
    }
  }

  async function openEdit(o: any) {
    setEditId(o.id)
    setEAddress(o.address || '')
    setENotes(o.notes || '')
    const { data: contract } = await supabase.from('contracts').select('*').eq('object_id', o.id).eq('status', 'active').maybeSingle()
    if (contract) {
      setEditContractId(contract.id)
      setEStartDate(contract.start_date || '')
      setERent(String(contract.rent_amount ?? ''))
      setEPaymentDay(String(contract.payment_day ?? ''))
      setEMeterDay(String(contract.meter_deadline_day ?? ''))
      setEEndDate(contract.end_date || '')
      setEMethod(contract.payment_method || 'card')
      setERemind(String(contract.reminder_days_before ?? ''))
      setEDetails((contract.payment_details as PayDetail[]) || [])
      const counterId = user!.id === o.landlord_id ? contract.tenant_id : o.landlord_id
      setEditCounterId(counterId)
      const { data: counter } = await supabase.from('users').select('*').eq('id', counterId).maybeSingle()
      setEName(counter?.full_name || '')
      setEPhone(counter?.phone || '')
      const { data: rules } = await supabase.from('penalty_rules').select('*').eq('contract_id', contract.id)
      const rp = (rules || []).find((r: any) => r.violation_type === 'payment_overdue')
      const rr = (rules || []).find((r: any) => r.violation_type === 'readings_overdue')
      setEPenPay(rp ? String(rp.rate) : '')
      setEPenRead(rr ? String(rr.rate) : '')
    } else {
      setEditContractId(null)
      setEditCounterId(null)
      setEDetails([])
    }
  }

  async function saveEdit() {
    if (!editId || !user) return
    const { error: oe } = await supabase.from('objects').update({ address: eAddress, notes: eNotes || null }).eq('id', editId)
    if (oe) { setMsg('Ошибка: ' + oe.message); return }
    if (editContractId) {
      const firstCard = eDetails.find(d => d.type === 'card')
      const { error: ce } = await supabase.from('contracts').update({
        rent_amount: Number(eRent) || 0,
        payment_day: Number(ePaymentDay) || 1,
        meter_deadline_day: Number(eMeterDay) || 5,
        start_date: eStartDate || null,
        end_date: eEndDate || null,
        payment_method: eMethod,
        card_number: firstCard ? firstCard.number : null,
        payment_details: eDetails,
        reminder_days_before: Number(eRemind) || 3,
      }).eq('id', editContractId)
      if (ce) { setMsg('Ошибка: ' + ce.message); return }
      const rules: Array<['payment_overdue' | 'readings_overdue', number]> = [
        ['payment_overdue', Number(ePenPay) || 500],
        ['readings_overdue', Number(ePenRead) || 100],
      ]
      for (const [vt, rate] of rules) {
        const { data: ex } = await supabase.from('penalty_rules').select('id').eq('contract_id', editContractId).eq('violation_type', vt).limit(1)
        if (ex && ex.length) await supabase.from('penalty_rules').update({ rate }).eq('id', ex[0].id)
        else await supabase.from('penalty_rules').insert({ contract_id: editContractId, violation_type: vt, rate, rate_unit: 'per_day_rub', starts_after_days: 0 })
      }
      if (editCounterId) {
        await supabase.from('users').update({ full_name: eName || 'Контрагент', phone: ePhone ? normalizePhone(ePhone) : null }).eq('id', editCounterId)
      }
    }
    setMsg('✅ Изменения сохранены')
    setEditId(null)
    load()
  }

  async function removeObject(id: string) {
    const answer = window.prompt('Введите слово "удалить" для подтверждения удаления объекта')
    if (!answer || answer.trim().toLowerCase() !== 'удалить') { setMsg('Удаление отменено'); return }
    const { data: contracts } = await supabase.from('contracts').select('id').eq('object_id', id)
    const ids = (contracts || []).map((c: any) => c.id)
    if (ids.length) {
      await supabase.from('meter_readings').delete().in('contract_id', ids)
      await supabase.from('payments').delete().in('contract_id', ids)
      await supabase.from('penalty_rules').delete().in('contract_id', ids)
      await supabase.from('cash_meetings').delete().in('contract_id', ids)
      await supabase.from('deferred_requests').delete().in('contract_id', ids)
      await supabase.from('deferred_debts').delete().in('contract_id', ids)
      await supabase.from('contracts').delete().in('id', ids)
    }
    await supabase.from('object_meters').delete().eq('object_id', id)
    const { error } = await supabase.from('objects').delete().eq('id', id)
    setMsg(error ? 'Ошибка: ' + error.message : '🗑 Объект удалён')
    load()
  }

  const methodOptions = (
    <>
      <option value="card">Карта</option>
      <option value="cash">Наличные</option>
      <option value="both">Наличный и безналичный расчёт</option>
    </>
  )

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
          <div style={s.small}>Адрес объекта *</div>
          <input style={s.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Квартира, дом, гараж, коммерция" />
          <div style={s.small}>Заметка</div>
          <input style={s.input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Необязательно" />
          <div style={s.small}>{role === 'landlord' ? 'Арендатор' : 'Арендодатель'}</div>
          <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" />
          <div style={s.small}>Телефон контрагента</div>
          <input style={s.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+79995553322 или 89995553322" />
          <div style={s.small}>Telegram ID контрагента</div>
          <input style={s.input} value={tgId} onChange={(e) => setTgId(e.target.value)} placeholder="Необязательно" />
          <div style={s.small}>Начало договора</div>
          <input style={s.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <div style={s.small}>Сумма аренды, руб</div>
          <input style={s.input} value={rent} onChange={(e) => setRent(e.target.value)} placeholder="85000" inputMode="numeric" />
          <div style={s.small}>День платежа (число месяца)</div>
          <input style={s.input} value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} placeholder="1" inputMode="numeric" />
          <div style={s.small}>Крайний день подачи показаний (число месяца)</div>
          <input style={s.input} value={meterDay} onChange={(e) => setMeterDay(e.target.value)} placeholder="5" inputMode="numeric" />
          <div style={s.small}>Окончание договора</div>
          <input style={s.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <div style={s.small}>Способ оплаты</div>
          <select style={s.input} value={method} onChange={(e) => setMethod(e.target.value)}>{methodOptions}</select>
          {method !== 'cash' && (
            <div>
              <div style={s.small}>Способы оплаты (карты банков и СБП)</div>
              <DetailsEditor list={details} onChange={setDetails} />
            </div>
          )}
          <div style={s.small}>Штраф за просрочку оплаты, руб/день</div>
          <input style={s.input} value={penPay} onChange={(e) => setPenPay(e.target.value)} placeholder="500" inputMode="numeric" />
          <div style={s.small}>Штраф за просрочку показаний, руб/день</div>
          <input style={s.input} value={penRead} onChange={(e) => setPenRead(e.target.value)} placeholder="100" inputMode="numeric" />
          <div style={s.small}>Напоминать за сколько дней до срока</div>
          <input style={s.input} value={remind} onChange={(e) => setRemind(e.target.value)} placeholder="3" inputMode="numeric" />
          <button style={s.button} onClick={save}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      )}
      <div style={s.h2}>✏️ Мои объекты</div>
      {objects.map((o) => (
        <div key={o.id} style={s.objRow}>
          {editId === o.id ? (
            <div>
              <div style={s.small}>Адрес</div>
              <input style={s.input} value={eAddress} onChange={(e) => setEAddress(e.target.value)} />
              <div style={s.small}>Заметка</div>
              <input style={s.input} value={eNotes} onChange={(e) => setENotes(e.target.value)} />
              <div style={s.small}>Контрагент (имя)</div>
              <input style={s.input} value={eName} onChange={(e) => setEName(e.target.value)} />
              <div style={s.small}>Телефон контрагента</div>
              <input style={s.input} value={ePhone} onChange={(e) => setEPhone(e.target.value)} />
              <div style={s.small}>Начало договора</div>
              <input style={s.input} type="date" value={eStartDate} onChange={(e) => setEStartDate(e.target.value)} />
              <div style={s.small}>Сумма аренды, руб</div>
              <input style={s.input} value={eRent} onChange={(e) => setERent(e.target.value)} inputMode="numeric" />
              <div style={s.small}>День платежа</div>
              <input style={s.input} value={ePaymentDay} onChange={(e) => setEPaymentDay(e.target.value)} inputMode="numeric" />
              <div style={s.small}>Крайний день показаний</div>
              <input style={s.input} value={eMeterDay} onChange={(e) => setEMeterDay(e.target.value)} inputMode="numeric" />
              <div style={s.small}>Окончание договора</div>
              <input style={s.input} type="date" value={eEndDate} onChange={(e) => setEEndDate(e.target.value)} />
              <div style={s.small}>Способ оплаты</div>
              <select style={s.input} value={eMethod} onChange={(e) => setEMethod(e.target.value)}>{methodOptions}</select>
              {eMethod !== 'cash' && (
                <div>
                  <div style={s.small}>Способы оплаты (карты банков и СБП)</div>
                  <DetailsEditor list={eDetails} onChange={setEDetails} />
                </div>
              )}
              <div style={s.small}>Штраф за просрочку оплаты, руб/день</div>
              <input style={s.input} value={ePenPay} onChange={(e) => setEPenPay(e.target.value)} inputMode="numeric" />
              <div style={s.small}>Штраф за просрочку показаний, руб/день</div>
              <input style={s.input} value={ePenRead} onChange={(e) => setEPenRead(e.target.value)} inputMode="numeric" />
              <div style={s.small}>Напоминать за сколько дней</div>
              <input style={s.input} value={eRemind} onChange={(e) => setERemind(e.target.value)} inputMode="numeric" />
              <button style={s.smallButton} onClick={saveEdit}>Сохранить</button>
              <button style={s.smallButton} onClick={() => setEditId(null)}>Отмена</button>
            </div>
          ) : (
            <div style={s.row}>
              <span>{o.address}</span>
              <span>
                <button style={s.smallButton} onClick={() => openEdit(o)}>✏️</button>
                <button style={s.delButton} onClick={() => removeObject(o.id)}>🗑</button>
              </span>
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
  smallButton: { padding: '6px 10px', borderRadius: 8, border: 'none', background: '#90a4ae', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginLeft: 6, marginTop: 6 },
  delButton: { padding: '6px 10px', borderRadius: 8, border: 'none', background: '#e57373', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginLeft: 6 },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15, marginBottom: 8, boxSizing: 'border-box' },
  half: { width: '48%', padding: '8px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, marginBottom: 8, boxSizing: 'border-box' },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 },
  small: { fontSize: 13, color: '#666', margin: '4px 0' },
  msg: { padding: 12, borderRadius: 10, background: '#e8f5e9', color: '#2e7d32', marginTop: 8, fontSize: 14 },
  objRow: { background: '#fff', borderRadius: 10, padding: 10, marginBottom: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
  detailRow: { background: '#f9f9f9', borderRadius: 8, padding: 8, marginBottom: 8 },
}

export default ObjectManager
