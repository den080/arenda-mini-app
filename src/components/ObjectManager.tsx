import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { T, C } from '../theme'

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

function formatPhoneInput(v: string): string {
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

function formatCardInput(v: string): string {
  const d = (v || '').replace(/\D/g, '').slice(0, 16)
  return d.replace(/(.{4})/g, '$1 ').trim()
}

function DetailsEditor({ list, onChange }: { list: PayDetail[]; onChange: (v: PayDetail[]) => void }) {
  return (
    <div>
      {list.map((d, i) => (
        <div key={i} style={T.item}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value={d.type} onChange={e => { const v = [...list]; v[i] = { ...v[i], type: e.target.value as 'card' | 'sbp', number: '' }; onChange(v) }} style={{ ...T.select, width: '45%' }}>
              <option value="card">Карта банка</option>
              <option value="sbp">СБП по телефону</option>
            </select>
            <select value={d.bank} onChange={e => { const v = [...list]; v[i] = { ...v[i], bank: e.target.value }; onChange(v) }} style={{ ...T.select, flex: 1 }}>
              {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
            <input
              value={d.number}
              onChange={e => { const v = [...list]; v[i] = { ...v[i], number: d.type === 'card' ? formatCardInput(e.target.value) : formatPhoneInput(e.target.value) }; onChange(v) }}
              placeholder={d.type === 'card' ? '0000 0000 0000 0000' : '+7 000 000 00-00'}
              style={{ ...T.select, flex: 1 }}
              inputMode="numeric"
            />
            <button style={T.btnDanger} onClick={() => onChange(list.filter((_, x) => x !== i))}>✕</button>
          </div>
        </div>
      ))}
      <button style={T.btnSmall} onClick={() => onChange([...list, { type: 'card', bank: BANKS[0], number: '' }])}>+ Добавить способ оплаты</button>
    </div>
  )
}

function ReadingsModeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select style={T.input} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="manual">Арендатор подаёт показания вручную</option>
      <option value="auto">Показания передаются автоматически</option>
      <option value="self">Арендатор платит полную квитанцию сам (показания не нужны)</option>
    </select>
  )
}

export function ObjectManager() {
  const { user } = useTelegramUser()
  const [objects, setObjects] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [startDate, setStartDate] = useState('')
  const [rent, setRent] = useState('')
  const [deposit, setDeposit] = useState('')
  const [paymentDay, setPaymentDay] = useState('')
  const [endDate, setEndDate] = useState('')
  const [meterDay, setMeterDay] = useState('15')
  const [readingsMode, setReadingsMode] = useState('manual')
  const [method, setMethod] = useState('both')
  const [penPay, setPenPay] = useState('')
  const [penRead, setPenRead] = useState('')
  const [remind, setRemind] = useState('')
  const [details, setDetails] = useState<PayDetail[]>([])
  const [addDetailsErr, setAddDetailsErr] = useState<string | null>(null)

  const [editId, setEditId] = useState<string | null>(null)
  const [editContractId, setEditContractId] = useState<string | null>(null)
  const [editCounterId, setEditCounterId] = useState<string | null>(null)
  const [eAddress, setEAddress] = useState('')
  const [eNotes, setENotes] = useState('')
  const [eName, setEName] = useState('')
  const [ePhone, setEPhone] = useState('')
  const [eStartDate, setEStartDate] = useState('')
  const [eRent, setERent] = useState('')
  const [eDeposit, setEDeposit] = useState('')
  const [ePaymentDay, setEPaymentDay] = useState('')
  const [eMeterDay, setEMeterDay] = useState('15')
  const [eReadingsMode, setEReadingsMode] = useState('manual')
  const [eEndDate, setEEndDate] = useState('')
  const [eMethod, setEMethod] = useState('both')
  const [ePenPay, setEPenPay] = useState('')
  const [ePenRead, setEPenRead] = useState('')
  const [eRemind, setERemind] = useState('')
  const [eDetails, setEDetails] = useState<PayDetail[]>([])
  const [editDetailsErr, setEditDetailsErr] = useState<string | null>(null)

  async function load() {
    if (!user) return
    const { data } = await supabase.from('objects').select('*').eq('landlord_id', user.id)
    setObjects(data || [])
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  useEffect(() => {
    load()
  }, [user])

  async function findCounterparty(phoneInput: string): Promise<any | null> {
    const digits = phoneInput.replace(/\D/g, '')
    if (!digits) return null
    const { data: users } = await supabase.from('users').select('*').not('phone', 'is', null)
    return (users || []).find((u: any) => (u.phone || '').replace(/\D/g, '').slice(-10) === digits.slice(-10)) || null
  }

  function validPhone(phoneInput: string): boolean {
    if (!phoneInput) return true
    return phoneInput.replace(/\D/g, '').length === 11
  }

  async function save() {
    if (saving) return
    if (!user || !address) { setMsg('Укажите адрес объекта'); return }
    if (!validPhone(phone)) { setMsg('⚠️ Проверьте номер телефона арендатора: 11 цифр, начинается с 7 или 8'); return }
    if (method !== 'cash' && details.length === 0) {
      setAddDetailsErr('⚠️ Добавьте хотя бы один способ безналичной оплаты: карту банка или СБП')
      return
    }
    setAddDetailsErr(null)
    setSaving(true)
    try {
      const normalizedPhone = phone ? normalizePhone(phone) : null
      let counter: any = null
      if (normalizedPhone) {
        counter = await findCounterparty(normalizedPhone)
      }
      if (!counter) {
        const { data, error } = await supabase.from('users').insert({
          full_name: name || 'Арендатор',
          phone: normalizedPhone,
          role: 'tenant',
        }).select().single()
        if (error) { setMsg('Ошибка арендатора: ' + error.message); return }
        counter = data
      } else if (name) {
        await supabase.from('users').update({ full_name: name }).eq('id', counter.id)
      }
      const { data: obj, error: objErr } = await supabase.from('objects')
        .insert({ landlord_id: user.id, address, notes: notes || null }).select().single()
      if (objErr) { setMsg('Ошибка: ' + objErr.message); return }
      const firstCard = details.find(d => d.type === 'card')
      const startISO = startDate || new Date().toISOString().slice(0, 10)
      const { data: contract, error: conErr } = await supabase.from('contracts').insert({
        object_id: obj.id, tenant_id: counter.id,
        rent_amount: Number(rent) || 0,
        deposit_amount: Number(deposit) || 0,
        payment_day: Number(paymentDay) || 1,
        meter_deadline_day: Number(meterDay) || 15,
        readings_mode: readingsMode,
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
      const now = new Date()
      const payDay = Number(paymentDay) || 1
      let due = new Date(now.getFullYear(), now.getMonth(), payDay)
      const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      if (due < todayMid) due = new Date(now.getFullYear(), now.getMonth() + 1, payDay)
      const period = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      await supabase.from('payments').insert({
        contract_id: contract.id, period, due_date: due.toISOString().slice(0, 10),
        base_amount: Number(rent) || 0, penalty_amount: 0, utilities_amount: 0,
      })
      setMsg('✅ Объект, договор и первый платёж сохранены')
      setShowForm(false)
      setAddress(''); setNotes(''); setName(''); setPhone(''); setRent(''); setDeposit(''); setStartDate(''); setPaymentDay(''); setMeterDay('15'); setDetails([]); setReadingsMode('manual'); setMethod('both'); setAddDetailsErr(null)
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
      setEDeposit(String(contract.deposit_amount ?? ''))
      setEPaymentDay(String(contract.payment_day ?? ''))
      setEMeterDay(String(contract.meter_deadline_day || 15))
      setEReadingsMode(contract.readings_mode || 'manual')
      setEEndDate(contract.end_date || '')
      setEMethod(contract.payment_method || 'both')
      setERemind(String(contract.reminder_days_before ?? ''))
      setEDetails((contract.payment_details as PayDetail[]) || [])
      const counterId = contract.tenant_id
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
    if (!validPhone(ePhone)) { setMsg('⚠️ Проверьте номер телефона арендатора: 11 цифр, начинается с 7 или 8'); return }
    if (eMethod !== 'cash' && eDetails.length === 0) {
      setEditDetailsErr('⚠️ Добавьте хотя бы один способ безналичной оплаты: карту банка или СБП')
      return
    }
    setEditDetailsErr(null)
    const { error: oe } = await supabase.from('objects').update({ address: eAddress, notes: eNotes || null }).eq('id', editId)
    if (oe) { setMsg('Ошибка: ' + oe.message); return }
    if (editContractId) {
      const firstCard = eDetails.find(d => d.type === 'card')
      const { error: ce } = await supabase.from('contracts').update({
        rent_amount: Number(eRent) || 0,
        deposit_amount: Number(eDeposit) || 0,
        payment_day: Number(ePaymentDay) || 1,
        meter_deadline_day: Number(eMeterDay) || 15,
        readings_mode: eReadingsMode,
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
        await supabase.from('users').update({ full_name: eName || 'Арендатор', phone: ePhone ? normalizePhone(ePhone) : null }).eq('id', editCounterId)
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
      await supabase.from('frozen_penalties').delete().in('contract_id', ids)
      await supabase.from('contracts').delete().in('id', ids)
    }
    await supabase.from('object_meters').delete().eq('object_id', id)
    const { error } = await supabase.from('objects').delete().eq('id', id)
    setMsg(error ? 'Ошибка: ' + error.message : '🗑 Объект удалён')
    load()
  }

  const methodOptions = (
    <>
      <option value="card">Безналичный расчёт</option>
      <option value="cash">Наличные</option>
      <option value="both">Наличный и безналичный расчёт</option>
    </>
  )

  return (
    <div style={T.card}>
      <div style={T.h2}>Управление объектами</div>
      <button style={T.btn} onClick={() => setShowForm(!showForm)}>{showForm ? 'Скрыть форму' : 'Добавить объект'}</button>
      {showForm && (
        <div style={{ marginTop: 12 }}>
          <div style={T.tiny}>Адрес объекта *</div>
          <input style={T.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Квартира, дом, гараж, коммерция" />
          <div style={T.tiny}>Заметка</div>
          <input style={T.input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Необязательно" />
          <div style={T.tiny}>Арендатор (имя)</div>
          <input style={T.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" />
          <div style={T.tiny}>Телефон арендатора</div>
          <input style={T.input} value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} placeholder="+7 905 000-00-00" inputMode="tel" />
          <div style={T.tiny}>Начало договора</div>
          <input
            style={T.input}
            type="date"
            value={startDate}
            onChange={(e) => {
              const v = e.target.value
              setStartDate(v)
              const d = Number(v.slice(8, 10))
              if (d >= 1 && d <= 31) setPaymentDay(String(d))
            }}
          />
          <div style={T.tiny}>Сумма аренды, руб</div>
          <input style={T.input} value={rent} onChange={(e) => setRent(e.target.value)} placeholder="85000" inputMode="numeric" />
          <div style={T.tiny}>Залоговый депозит, руб</div>
          <input style={T.input} value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="Например: 85000" inputMode="numeric" />
          <div style={T.tiny}>День платежа (число месяца, подставляется из начала договора)</div>
          <input style={T.input} value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} placeholder="1" inputMode="numeric" />
          <div style={T.tiny}>Режим показаний счётчиков</div>
          <ReadingsModeSelect value={readingsMode} onChange={setReadingsMode} />
          {readingsMode === 'manual' && (
            <div>
              <div style={T.tiny}>Крайний день подачи показаний (число месяца)</div>
              <input style={T.input} value={meterDay} onChange={(e) => setMeterDay(e.target.value)} placeholder="15" inputMode="numeric" />
            </div>
          )}
          <div style={T.tiny}>Окончание договора</div>
          <input style={T.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <div style={T.tiny}>Способ оплаты</div>
          <select style={T.input} value={method} onChange={(e) => setMethod(e.target.value)}>{methodOptions}</select>
          {method !== 'cash' && (
            <div>
              <div style={T.tiny}>Способы оплаты (карты банков и СБП) *</div>
              <DetailsEditor list={details} onChange={(v) => { setDetails(v); if (v.length > 0) setAddDetailsErr(null) }} />
              {addDetailsErr && <div style={T.noteRed}>{addDetailsErr}</div>}
            </div>
          )}
          <div style={T.tiny}>Штраф за просрочку оплаты, руб/день</div>
          <input style={T.input} value={penPay} onChange={(e) => setPenPay(e.target.value)} placeholder="500" inputMode="numeric" />
          {readingsMode === 'manual' && (
            <div>
              <div style={T.tiny}>Штраф за просрочку показаний, руб/день</div>
              <input style={T.input} value={penRead} onChange={(e) => setPenRead(e.target.value)} placeholder="100" inputMode="numeric" />
            </div>
          )}
          <div style={T.tiny}>Напоминать за сколько дней до срока</div>
          <input style={T.input} value={remind} onChange={(e) => setRemind(e.target.value)} placeholder="3" inputMode="numeric" />
          <button style={T.btn} onClick={save}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
        </div>
      )}
      <div style={{ ...T.h2, marginTop: 16 }}>Мои объекты</div>
      {objects.map((o) => (
        <div key={o.id} style={T.item}>
          {editId === o.id ? (
            <div>
              <div style={T.tiny}>Адрес</div>
              <input style={T.input} value={eAddress} onChange={(e) => setEAddress(e.target.value)} />
              <div style={T.tiny}>Заметка</div>
              <input style={T.input} value={eNotes} onChange={(e) => setENotes(e.target.value)} />
              <div style={T.tiny}>Арендатор (имя)</div>
              <input style={T.input} value={eName} onChange={(e) => setEName(e.target.value)} />
              <div style={T.tiny}>Телефон арендатора</div>
              <input style={T.input} value={ePhone} onChange={(e) => setEPhone(formatPhoneInput(e.target.value))} inputMode="tel" />
              <div style={T.tiny}>Начало договора</div>
              <input
                style={T.input}
                type="date"
                value={eStartDate}
                onChange={(e) => {
                  const v = e.target.value
                  setEStartDate(v)
                  const d = Number(v.slice(8, 10))
                  if (d >= 1 && d <= 31) setEPaymentDay(String(d))
                }}
              />
              <div style={T.tiny}>Сумма аренды, руб</div>
              <input style={T.input} value={eRent} onChange={(e) => setERent(e.target.value)} inputMode="numeric" />
              <div style={T.tiny}>Залоговый депозит, руб</div>
              <input style={T.input} value={eDeposit} onChange={(e) => setEDeposit(e.target.value)} inputMode="numeric" />
              <div style={T.tiny}>День платежа (число месяца, подставляется из начала договора)</div>
              <input style={T.input} value={ePaymentDay} onChange={(e) => setEPaymentDay(e.target.value)} inputMode="numeric" />
              <div style={T.tiny}>Режим показаний счётчиков</div>
              <ReadingsModeSelect value={eReadingsMode} onChange={setEReadingsMode} />
              {eReadingsMode === 'manual' && (
                <div>
                  <div style={T.tiny}>Крайний день показаний</div>
                  <input style={T.input} value={eMeterDay} onChange={(e) => setEMeterDay(e.target.value)} inputMode="numeric" />
                </div>
              )}
              <div style={T.tiny}>Окончание договора</div>
              <input style={T.input} type="date" value={eEndDate} onChange={(e) => setEEndDate(e.target.value)} />
              <div style={T.tiny}>Способ оплаты</div>
              <select style={T.input} value={eMethod} onChange={(e) => setEMethod(e.target.value)}>{methodOptions}</select>
              {eMethod !== 'cash' && (
                <div>
                  <div style={T.tiny}>Способы оплаты (карты банков и СБП) *</div>
                  <DetailsEditor list={eDetails} onChange={(v) => { setEDetails(v); if (v.length > 0) setEditDetailsErr(null) }} />
                  {editDetailsErr && <div style={T.noteRed}>{editDetailsErr}</div>}
                </div>
              )}
              <div style={T.tiny}>Штраф за просрочку оплаты, руб/день</div>
              <input style={T.input} value={ePenPay} onChange={(e) => setEPenPay(e.target.value)} inputMode="numeric" />
              {eReadingsMode === 'manual' && (
                <div>
                  <div style={T.tiny}>Штраф за просрочку показаний, руб/день</div>
                  <input style={T.input} value={ePenRead} onChange={(e) => setEPenRead(e.target.value)} inputMode="numeric" />
                </div>
              )}
              <div style={T.tiny}>Напоминать за сколько дней</div>
              <input style={T.input} value={eRemind} onChange={(e) => setERemind(e.target.value)} inputMode="numeric" />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={T.btnSmall} onClick={saveEdit}>Сохранить</button>
                <button style={T.btnSecondary} onClick={() => setEditId(null)}>Отмена</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{o.address}</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button style={T.btnSecondary} onClick={() => openEdit(o)}>✏️</button>
                <button style={T.btnDanger} onClick={() => removeObject(o.id)}>🗑</button>
              </span>
            </div>
          )}
        </div>
      ))}
      {msg && <div style={T.msg}>{msg}</div>}
    </div>
  )
}

export default ObjectManager
