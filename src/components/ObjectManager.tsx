import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { useTeam } from '../hooks/useTeam'
import { T } from '../theme'
import { ConfirmDelete, showToast } from './ui'

const BANKS = ['Сбербанк', 'Т-Банк (Тинькофф)', 'ВТБ', 'Альфа-Банк', 'Газпромбанк', 'Россельхозбанк', 'Райффайзен Банк', 'Росбанк', 'Открытие', 'Совкомбанк', 'МТС Банк', 'Промсвязьбанк', 'Почта Банк', 'Дом.РФ', 'ЮниКредит Банк']

interface PayDetail { type: 'card' | 'sbp'; bank: string; number: string }

const S: Record<string, React.CSSProperties> = {
  lab: { fontSize: 13, color: '#8e8e93', margin: '12px 0 2px' },
  inp: { width: '100%', padding: '8px 0', border: 'none', borderBottom: '1px solid rgba(60,60,67,0.12)', background: 'transparent', fontSize: 15, color: '#1d1d1f', outline: 'none', borderRadius: 0, boxSizing: 'border-box' },
  inpLocked: { width: '100%', padding: '8px 0', border: 'none', borderBottom: '1px solid rgba(60,60,67,0.12)', background: 'transparent', fontSize: 15, color: '#8e8e93', outline: 'none', borderRadius: 0, boxSizing: 'border-box', opacity: 0.6 },
  sel: { width: '100%', padding: '9px 10px', border: 'none', background: 'rgba(120,120,128,0.08)', borderRadius: 8, fontSize: 14, color: '#1d1d1f', outline: 'none', boxSizing: 'border-box' },
  blue: { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4 },
  red: { border: 'none', background: 'transparent', color: '#ff3b30', fontSize: 15, cursor: 'pointer', padding: 4 },
  btnRow: { display: 'flex', gap: 16, alignItems: 'center', margin: '14px 0 8px' },
}

function normalizePhone(input: string): string {
  let cleaned = input.replace(/[\s\-\(\)]/g, '')
  if (cleaned.startsWith('8') && cleaned.length === 11) cleaned = '+7' + cleaned.slice(1)
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned
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
        <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(60,60,67,0.12)' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={d.type} onChange={e => { const v = [...list]; v[i] = { ...v[i], type: e.target.value as 'card' | 'sbp', number: '' }; onChange(v) }} style={{ ...S.sel, width: '45%' }}>
              <option value="card">Карта банка</option>
              <option value="sbp">СБП по телефону</option>
            </select>
            <select value={d.bank} onChange={e => { const v = [...list]; v[i] = { ...v[i], bank: e.target.value }; onChange(v) }} style={{ ...S.sel, flex: 1 }}>
              {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
            <input
              value={d.number}
              onChange={e => { const v = [...list]; v[i] = { ...v[i], number: d.type === 'card' ? formatCardInput(e.target.value) : formatPhoneInput(e.target.value) }; onChange(v) }}
              placeholder={d.type === 'card' ? '0000 0000 0000 0000' : '+7 000 000 00-00'}
              style={{ ...S.inp, flex: 1 }}
              inputMode="numeric"
            />
            <button style={S.red} onClick={() => onChange(list.filter((_, x) => x !== i))}>удалить</button>
          </div>
        </div>
      ))}
      <div style={{ padding: '10px 0' }}>
        <button style={S.blue} onClick={() => onChange([...list, { type: 'sbp', bank: BANKS[0], number: '' }])}>+ Добавить способ оплаты</button>
      </div>
    </div>
  )
}

function ReadingsModeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select style={S.sel} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="manual">Арендатор подаёт показания вручную</option>
      <option value="auto">Показания передаются автоматически</option>
      <option value="self">Арендатор оплачивает полную квитанцию самостоятельно</option>
    </select>
  )
}

function validPhone(phoneInput: string): boolean {
  if (!phoneInput) return true
  return phoneInput.replace(/\D/g, '').length === 11
}

async function findCounterparty(phoneInput: string): Promise<any | null> {
  const digits = phoneInput.replace(/\D/g, '')
  if (!digits) return null
  const { data: users } = await supabase.from('users').select('*').not('phone', 'is', null)
  return (users || []).find((u: any) => (u.phone || '').replace(/\D/g, '').slice(-10) === digits.slice(-10)) || null
}

const methodOptions = (
  <>
    <option value="card">Безналичный расчёт</option>
    <option value="cash">Наличные</option>
    <option value="both">Наличный и безналичный расчёт</option>
  </>
)

export function ObjectAdd() {
  const { user } = useTelegramUser()
  const { teamId } = useTeam()
  const [showForm, setShowForm] = useState(false)
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
  const [penPay, setPenPay] = useState('500')
  const [penRead, setPenRead] = useState('100')
  const [remind, setRemind] = useState('3')
  const [details, setDetails] = useState<PayDetail[]>([])
  const [addDetailsErr, setAddDetailsErr] = useState<string | null>(null)

  async function save() {
    if (saving) return
    if (!user || !address) { showToast('Укажите адрес объекта'); return }
    if (!validPhone(phone)) { showToast('Проверьте номер телефона арендатора'); return }
    if (method !== 'cash' && details.length === 0) { setAddDetailsErr('Добавьте хотя бы один способ безналичной оплаты'); return }
    setAddDetailsErr(null)
    setSaving(true)
    try {
      const normalizedPhone = phone ? normalizePhone(phone) : null
      let counter: any = null
      if (normalizedPhone) counter = await findCounterparty(normalizedPhone)
      if (!counter) {
        const { data, error } = await supabase.from('users').insert({ full_name: name || 'Арендатор', phone: normalizedPhone, role: 'tenant' }).select().single()
        if (error) { showToast('Ошибка арендатора: ' + error.message); return }
        counter = data
      } else if (name) {
        await supabase.from('users').update({ full_name: name }).eq('id', counter.id)
      }
      const { data: obj, error: objErr } = await supabase.from('objects').insert({ landlord_id: user.id, address, notes: notes || null, team_id: teamId }).select().single()
      if (objErr) { showToast('Ошибка: ' + objErr.message); return }
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
      if (conErr) { showToast('Ошибка: ' + conErr.message); return }
      const rules: any[] = [
        { contract_id: contract.id, violation_type: 'payment_overdue', rate: Number(penPay) || 500, rate_unit: 'per_day_rub', starts_after_days: 0 },
      ]
      if (readingsMode === 'manual') {
        rules.push({ contract_id: contract.id, violation_type: 'readings_overdue', rate: Number(penRead) || 100, rate_unit: 'per_day_rub', starts_after_days: 0 })
      }
      await supabase.from('penalty_rules').insert(rules)
      const startD = new Date(startISO + 'T00:00:00')
      const periodD = new Date(startD.getFullYear(), startD.getMonth(), 1)
      const payDay = Number(paymentDay) || 1
      let due = new Date(periodD.getFullYear(), periodD.getMonth(), payDay)
      if (due < startD) due = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate())
      const period = `${periodD.getFullYear()}-${String(periodD.getMonth() + 1).padStart(2, '0')}-01`
      const dueISO = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`
      await supabase.from('payments').insert({
        contract_id: contract.id, period, due_date: dueISO,
        base_amount: Number(rent) || 0, penalty_amount: 0, utilities_amount: 0,
      })
      showToast('✅ Объект, договор и первый платёж сохранены')
      setShowForm(false)
      setAddress(''); setNotes(''); setName(''); setPhone(''); setRent(''); setDeposit(''); setStartDate(''); setPaymentDay(''); setMeterDay('15'); setDetails([]); setReadingsMode('manual'); setMethod('both')
      window.dispatchEvent(new Event('rentflow-refresh'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {!showForm ? (
        <div style={{ ...T.row, borderBottom: 'none' }}>
          <span style={{ fontSize: 15 }}>Новый объект</span>
          <button style={S.blue} onClick={() => setShowForm(true)}>Добавить объект</button>
        </div>
      ) : (
        <div>
          <div style={{ ...T.row, borderBottom: 'none', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Новый объект</span>
            <button style={S.blue} onClick={() => setShowForm(false)}>Свернуть</button>
          </div>
          <div style={S.lab}>Адрес объекта *</div>
          <input style={S.inp} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Квартира, дом, гараж, коммерция" />
          <div style={S.lab}>Заметка</div>
          <input style={S.inp} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Необязательно" />
          <div style={S.lab}>Арендатор (имя)</div>
          <input style={S.inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" />
          <div style={S.lab}>Телефон арендатора</div>
          <input style={S.inp} value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} placeholder="+7 905 000-00-00" inputMode="tel" />
          <div style={S.lab}>Начало договора</div>
          <input style={S.inp} type="date" value={startDate} onChange={(e) => { const v = e.target.value; setStartDate(v); const d = Number(v.slice(8, 10)); if (d >= 1 && d <= 31) setPaymentDay(String(d)) }} />
          <div style={S.lab}>Сумма аренды, руб</div>
          <input style={S.inp} value={rent} onChange={(e) => setRent(e.target.value)} placeholder="85000" inputMode="numeric" />
          <div style={S.lab}>Залоговый депозит, руб</div>
          <input style={S.inp} value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="Например: 85000" inputMode="numeric" />
          <div style={S.lab}>День платежа (число месяца)</div>
          <input style={S.inp} value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} placeholder="1" inputMode="numeric" />
          <div style={S.lab}>Режим показаний счётчиков</div>
          <ReadingsModeSelect value={readingsMode} onChange={setReadingsMode} />
          {readingsMode === 'manual' && (
            <div>
              <div style={S.lab}>Крайний день подачи показаний</div>
              <input style={S.inp} value={meterDay} onChange={(e) => setMeterDay(e.target.value)} placeholder="15" inputMode="numeric" />
            </div>
          )}
          <div style={S.lab}>Окончание договора</div>
          <input style={S.inp} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <div style={S.lab}>Способ оплаты</div>
          <select style={S.sel} value={method} onChange={(e) => setMethod(e.target.value)}>{methodOptions}</select>
          {method !== 'cash' && (
            <div>
              <div style={S.lab}>Способы оплаты (карты банков и СБП) *</div>
              <DetailsEditor list={details} onChange={(v) => { setDetails(v); if (v.length > 0) setAddDetailsErr(null) }} />
              {addDetailsErr && <div style={T.noteRed}>{addDetailsErr}</div>}
            </div>
          )}
          <div style={S.lab}>Штраф за просрочку оплаты, руб/день</div>
          <input style={S.inp} value={penPay} onChange={(e) => setPenPay(e.target.value)} placeholder="500" inputMode="numeric" />
          {readingsMode === 'manual' && (
            <div>
              <div style={S.lab}>Штраф за просрочку показаний, руб/день</div>
              <input style={S.inp} value={penRead} onChange={(e) => setPenRead(e.target.value)} placeholder="100" inputMode="numeric" />
            </div>
          )}
          <div style={S.lab}>Напоминать за сколько дней до срока</div>
          <input style={S.inp} value={remind} onChange={(e) => setRemind(e.target.value)} placeholder="3" inputMode="numeric" />
          <button style={T.btn} onClick={save}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
        </div>
      )}
    </div>
  )
}

export function ObjectEdit({ objectId }: { objectId: string }) {
  const [ready, setReady] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [locked, setLocked] = useState(false)

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

  useEffect(() => {
    (async () => {
      const { data: o } = await supabase.from('objects').select('*').eq('id', objectId).maybeSingle()
      if (!o) return
      setEAddress(o.address || '')
      setENotes(o.notes || '')
      const { data: contract } = await supabase.from('contracts').select('*').eq('object_id', objectId).eq('status', 'active').maybeSingle()
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
        setEditCounterId(contract.tenant_id)
        const { data: counter } = await supabase.from('users').select('*').eq('id', contract.tenant_id).maybeSingle()
        setEName(counter?.full_name || '')
        setEPhone(counter?.phone || '')
        const { data: rules } = await supabase.from('penalty_rules').select('*').eq('contract_id', contract.id)
        const rp = (rules || []).find((r: any) => r.violation_type === 'payment_overdue')
        const rr = (rules || []).find((r: any) => r.violation_type === 'readings_overdue')
        setEPenPay(rp ? String(rp.rate) : '')
        setEPenRead(rr ? String(rr.rate) : '')
        const { data: pays } = await supabase.from('payments').select('confirmed_by_landlord').eq('contract_id', contract.id)
        const list = pays || []
        setLocked(list.some((p: any) => p.confirmed_by_landlord) || list.length > 1)
      }
      setReady(true)
    })()
  }, [objectId])

  async function saveEdit() {
    if (!validPhone(ePhone)) { showToast('Проверьте номер телефона арендатора'); return }
    if (eMethod !== 'cash' && eDetails.length === 0) { setEditDetailsErr('Добавьте хотя бы один способ безналичной оплаты'); return }
    setEditDetailsErr(null)
    const { error: oe } = await supabase.from('objects').update({ address: eAddress, notes: eNotes || null }).eq('id', objectId)
    if (oe) { showToast('Ошибка: ' + oe.message); return }
    if (editContractId) {
      const firstCard = eDetails.find(d => d.type === 'card')
      const upd: any = {
        payment_method: eMethod,
        card_number: firstCard ? firstCard.number : null,
        payment_details: eDetails,
        reminder_days_before: Number(eRemind) || 3,
        meter_deadline_day: Number(eMeterDay) || 15,
        readings_mode: eReadingsMode,
        end_date: eEndDate || null,
      }
      if (!locked) {
        upd.rent_amount = Number(eRent) || 0
        upd.deposit_amount = Number(eDeposit) || 0
        upd.payment_day = Number(ePaymentDay) || 1
        upd.start_date = eStartDate || null
      }
      const { error: ce } = await supabase.from('contracts').update(upd).eq('id', editContractId)
      if (ce) { showToast('Ошибка: ' + ce.message); return }
      if (!locked) {
        const rules: Array<['payment_overdue' | 'readings_overdue', number]> = [
          ['payment_overdue', Number(ePenPay) || 500],
        ]
        if (eReadingsMode === 'manual') rules.push(['readings_overdue', Number(ePenRead) || 100])
        for (const [vt, rate] of rules) {
          const { data: ex } = await supabase.from('penalty_rules').select('id').eq('contract_id', editContractId).eq('violation_type', vt).limit(1)
          if (ex && ex.length) await supabase.from('penalty_rules').update({ rate }).eq('id', ex[0].id)
          else await supabase.from('penalty_rules').insert({ contract_id: editContractId, violation_type: vt, rate, rate_unit: 'per_day_rub', starts_after_days: 0 })
        }
        if (eReadingsMode !== 'manual') {
          const { data: ex } = await supabase.from('penalty_rules').select('id').eq('contract_id', editContractId).eq('violation_type', 'readings_overdue').limit(1)
          if (ex && ex.length) await supabase.from('penalty_rules').update({ rate: 0 }).eq('id', ex[0].id)
        }
      }
      if (editCounterId) {
        await supabase.from('users').update({ full_name: eName || 'Арендатор', phone: ePhone ? normalizePhone(ePhone) : null }).eq('id', editCounterId)
      }
    }
    showToast('✅ Изменения сохранены')
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function doRemove() {
    const { data: contracts } = await supabase.from('contracts').select('id').eq('object_id', objectId)
    const ids = (contracts || []).map((c: any) => c.id)
    if (ids.length) {
      await supabase.from('meter_readings').delete().in('contract_id', ids)
      await supabase.from('payments').delete().in('contract_id', ids)
      await supabase.from('penalty_rules').delete().in('contract_id', ids)
      await supabase.from('cash_meetings').delete().in('contract_id', ids)
      await supabase.from('deferred_requests').delete().in('contract_id', ids)
      await supabase.from('deferred_debts').delete().in('contract_id', ids)
      await supabase.from('frozen_penalties').delete().in('contract_id', ids)
      await supabase.from('utility_bills').delete().in('contract_id', ids)
      await supabase.from('contracts').delete().in('id', ids)
    }
    await supabase.from('object_meters').delete().eq('object_id', objectId)
    const { error } = await supabase.from('objects').delete().eq('id', objectId)
    if (error) { showToast('Ошибка: ' + error.message); return }
    showToast('Объект удалён')
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  if (!ready) return null

  return (
    <div style={T.card}>
      <div style={T.h2}>Объект и договор</div>
      {locked && (
        <div style={T.note}>Платежи начались — ключевые условия (аренда, депозит, день оплаты, дата начала, штрафы) защищены от изменений. Остальные поля можно редактировать.</div>
      )}
      <div style={S.lab}>Адрес</div>
      <input style={S.inp} value={eAddress} onChange={(e) => setEAddress(e.target.value)} />
      <div style={S.lab}>Заметка</div>
      <input style={S.inp} value={eNotes} onChange={(e) => setENotes(e.target.value)} />
      <div style={S.lab}>Арендатор (имя)</div>
      <input style={S.inp} value={eName} onChange={(e) => setEName(e.target.value)} />
      <div style={S.lab}>Телефон арендатора</div>
      <input style={S.inp} value={ePhone} onChange={(e) => setEPhone(formatPhoneInput(e.target.value))} inputMode="tel" />
      <div style={S.lab}>Начало договора</div>
      <input style={locked ? S.inpLocked : S.inp} type="date" value={eStartDate} disabled={locked} onChange={(e) => { const v = e.target.value; setEStartDate(v); const d = Number(v.slice(8, 10)); if (d >= 1 && d <= 31) setEPaymentDay(String(d)) }} />
      <div style={S.lab}>Сумма аренды, руб</div>
      <input style={locked ? S.inpLocked : S.inp} value={eRent} disabled={locked} onChange={(e) => setERent(e.target.value)} inputMode="numeric" />
      <div style={S.lab}>Залоговый депозит, руб</div>
      <input style={locked ? S.inpLocked : S.inp} value={eDeposit} disabled={locked} onChange={(e) => setEDeposit(e.target.value)} inputMode="numeric" />
      <div style={S.lab}>День платежа</div>
      <input style={locked ? S.inpLocked : S.inp} value={ePaymentDay} disabled={locked} onChange={(e) => setEPaymentDay(e.target.value)} inputMode="numeric" />
      <div style={S.lab}>Режим показаний счётчиков</div>
      <ReadingsModeSelect value={eReadingsMode} onChange={setEReadingsMode} />
      {eReadingsMode === 'manual' && (
        <div>
          <div style={S.lab}>Крайний день показаний</div>
          <input style={S.inp} value={eMeterDay} onChange={(e) => setEMeterDay(e.target.value)} inputMode="numeric" />
        </div>
      )}
      <div style={S.lab}>Окончание договора</div>
      <input style={S.inp} type="date" value={eEndDate} onChange={(e) => setEEndDate(e.target.value)} />
      <div style={S.lab}>Способ оплаты</div>
      <select style={S.sel} value={eMethod} onChange={(e) => setEMethod(e.target.value)}>{methodOptions}</select>
      {eMethod !== 'cash' && (
        <div>
          <div style={S.lab}>Способы оплаты (карты банков и СБП) *</div>
          <DetailsEditor list={eDetails} onChange={(v) => { setEDetails(v); if (v.length > 0) setEditDetailsErr(null) }} />
          {editDetailsErr && <div style={T.noteRed}>{editDetailsErr}</div>}
        </div>
      )}
      <div style={S.lab}>Штраф за просрочку оплаты, руб/день</div>
      <input style={locked ? S.inpLocked : S.inp} value={ePenPay} disabled={locked} onChange={(e) => setEPenPay(e.target.value)} inputMode="numeric" />
      {eReadingsMode === 'manual' && (
        <div>
          <div style={S.lab}>Штраф за просрочку показаний, руб/день</div>
          <input style={locked ? S.inpLocked : S.inp} value={ePenRead} disabled={locked} onChange={(e) => setEPenRead(e.target.value)} inputMode="numeric" />
        </div>
      )}
      <div style={S.lab}>Напоминать за сколько дней</div>
      <input style={S.inp} value={eRemind} onChange={(e) => setERemind(e.target.value)} inputMode="numeric" />
      <div style={S.btnRow}>
        <button style={S.blue} onClick={saveEdit}>Сохранить</button>
        <button style={S.red} onClick={() => setDelOpen(true)}>Удалить объект</button>
      </div>

      <ConfirmDelete
        open={delOpen}
        text="Объект, договор, платежи и вся история будут удалены безвозвратно."
        onClose={() => setDelOpen(false)}
        onConfirm={doRemove}
      />
    </div>
  )
}

export default ObjectAdd
