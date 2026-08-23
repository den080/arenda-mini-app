import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { useTeam } from '../hooks/useTeam'
import { T } from '../theme'
import { Modal, showToast } from './ui'
import { SubscriptionBlock } from './SubscriptionBlock'
import {
  S, PayDetail, PRO_PRICE, normalizePhone, formatPhoneInput, iso, pdate, clampDay,
  moneyOk, validPhone, findCounterparty, DetailsEditor, ReadingsModeSelect, methodOptions,
} from './objectShared'

export function ObjectAdd() {
  const { user } = useTelegramUser()
  const { teamId } = useTeam()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [paywall, setPaywall] = useState(false)
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [startDate, setStartDate] = useState('')
  const [oldContract, setOldContract] = useState(false)
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

  async function checkLimit(): Promise<boolean> {
    if (!user) return false
    // Админы и тестеры из «Доступ» — безлимит
    const dig = (v: string) => (v || '').replace(/\D/g, '').slice(-10)
    const { data: ac } = await supabase.from('access_control').select('phone, role').in('role', ['tester', 'admin'])
    const isPrivileged = (ac || []).some((r: any) => dig(r.phone) === dig(user.phone || ''))
    if (isPrivileged) return true
    // Обычные пользователи — Pro или 1 объект
    const { data: s } = await supabase.from('subscriptions').select('until_date').eq('owner_id', user.id).order('until_date', { ascending: false }).maybeSingle()
    const hasPro = s && s.until_date >= iso(new Date())
    if (hasPro) return true
    if (teamId) {
      const { data: t } = await supabase.from('teams').select('owner_id').eq('id', teamId).maybeSingle()
      if (t) {
        const { data: s2 } = await supabase.from('subscriptions').select('until_date').eq('owner_id', t.owner_id).order('until_date', { ascending: false }).maybeSingle()
        if (s2 && s2.until_date >= iso(new Date())) return true
      }
    }
    const { count } = await supabase.from('objects').select('id', { count: 'exact', head: true }).eq(teamId ? 'team_id' : 'landlord_id', (teamId || user.id) as string)
    return (count || 0) < 1
  }

  async function save() {
    if (saving) return
    if (!user || !address) { showToast('Укажите адрес объекта'); return }
    if (!validPhone(phone)) { showToast('Проверьте номер телефона арендатора'); return }
    if (method !== 'cash' && details.length === 0) { setAddDetailsErr('Добавьте хотя бы один способ безналичной оплаты'); return }
    setAddDetailsErr(null)
    const rentN = moneyOk(rent)
    if (rentN === null || rentN <= 0) { showToast('Сумма аренды — число больше 0'); return }
    const depN = moneyOk(deposit)
    if (depN === null) { showToast('Депозит — число не меньше 0'); return }
    const payDayN = Math.round(Number(paymentDay) || 1)
    if (payDayN < 1 || payDayN > 31) { showToast('День платежа — число от 1 до 31'); return }
    const meterDayN = Math.round(Number(meterDay) || 15)
    if (meterDayN < 1 || meterDayN > 31) { showToast('День показаний — число от 1 до 31'); return }
    const penPayN = moneyOk(penPay)
    if (penPayN === null) { showToast('Штраф за просрочку оплаты — число не меньше 0'); return }
    const penReadN = moneyOk(penRead)
    if (penReadN === null) { showToast('Штраф за показания — число не меньше 0'); return }
    const remindN = Math.round(Number(remind) || 3)
    if (remindN < 0 || remindN > 30) { showToast('Напоминание — от 0 до 30 дней'); return }
    if (endDate && pdate(endDate) <= pdate(startDate || iso(new Date()))) { showToast('Окончание договора должно быть позже начала'); return }
    if (method !== 'cash') {
      for (const d of details) {
        if (!d.bank || !d.bank.trim()) { showToast('Укажите название банка в способах оплаты'); return }
        const dg = (d.number || '').replace(/\D/g, '')
        if (d.type === 'card' ? dg.length !== 16 : dg.length !== 11) { showToast('Проверьте номер карты или СБП в способах оплаты'); return }
      }
    }
    const allowed = await checkLimit()
    if (!allowed) { setPaywall(true); return }
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
        rent_amount: rentN,
        deposit_amount: depN,
        payment_day: payDayN,
        meter_deadline_day: meterDayN,
        readings_mode: readingsMode,
        start_date: startISO,
        end_date: endDate || null,
        payment_method: method,
        card_number: firstCard ? firstCard.number : null,
        payment_details: details,
        reminder_days_before: remindN,
        status: 'active',
      }).select().single()
      if (conErr) { showToast('Ошибка: ' + conErr.message); return }
      const rules: any[] = [
        { contract_id: contract.id, violation_type: 'payment_overdue', rate: penPayN, rate_unit: 'per_day_rub', starts_after_days: 0 },
      ]
      if (readingsMode === 'manual') {
        rules.push({ contract_id: contract.id, violation_type: 'readings_overdue', rate: penReadN, rate_unit: 'per_day_rub', starts_after_days: 0 })
      }
      await supabase.from('penalty_rules').insert(rules)
      const startD = new Date(startISO + 'T00:00:00')
      if (oldContract) {
        const today0 = new Date()
        const tMid = new Date(today0.getFullYear(), today0.getMonth(), today0.getDate())
        const rows: any[] = []
        let cur = new Date(startD.getFullYear(), startD.getMonth(), 1)
        let openDone = false
        let guard = 0
        while (guard++ < 240) {
          const due = new Date(cur.getFullYear(), cur.getMonth(), clampDay(cur.getFullYear(), cur.getMonth(), payDayN))
          if (due < tMid) {
            rows.push({ contract_id: contract.id, period: iso(cur), due_date: iso(due), base_amount: rentN, penalty_amount: 0, utilities_amount: 0, confirmed_by_landlord: true, confirmed_at: iso(due) })
          } else if (!openDone) {
            rows.push({ contract_id: contract.id, period: iso(cur), due_date: iso(due), base_amount: rentN, penalty_amount: 0, utilities_amount: 0 })
            openDone = true
            break
          } else break
          cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
        }
        if (rows.length) await supabase.from('payments').insert(rows)
      } else {
        const periodD = new Date(startD.getFullYear(), startD.getMonth(), 1)
        let due = new Date(periodD.getFullYear(), periodD.getMonth(), clampDay(periodD.getFullYear(), periodD.getMonth(), payDayN))
        if (due < startD) due = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate())
        const period = `${periodD.getFullYear()}-${String(periodD.getMonth() + 1).padStart(2, '0')}-01`
        await supabase.from('payments').insert({
          contract_id: contract.id, period, due_date: iso(due),
          base_amount: rentN, penalty_amount: 0, utilities_amount: 0,
        })
      }
      showToast('✅ Объект, договор и платежи сохранены')
      setShowForm(false)
      setAddress(''); setNotes(''); setName(''); setPhone(''); setRent(''); setDeposit(''); setStartDate(''); setPaymentDay(''); setMeterDay('15'); setDetails([]); setReadingsMode('manual'); setMethod('both'); setOldContract(false)
      window.dispatchEvent(new Event('rentflow-refresh'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {!showForm ? (
        <>
          <div style={{ ...T.row, borderBottom: 'none' }}>
            <span style={{ fontSize: 15 }}>Новый объект</span>
            <button style={S.blue} onClick={() => setShowForm(true)}>Добавить объект</button>
          </div>
          <SubscriptionBlock />
        </>
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
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0 2px', fontSize: 14, color: '#1d1d1f' }}>
            <input type="checkbox" checked={oldContract} onChange={(e) => setOldContract(e.target.checked)} />
            Договор уже идёт — отметить прошлые месяцы оплаченными
          </label>
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
              <div style={S.lab}>Способы оплаты (карта или СБП) *</div>
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
      <Modal open={paywall} title="Лимит тарифа Free" onClose={() => setPaywall(false)}>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 12 }}>
          На бесплатном тарифе доступен 1 объект. Тариф Pro ({PRO_PRICE} ₽/мес) снимает лимит и открывает командный доступ.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }} onClick={() => { setPaywall(false); setShowForm(false); window.dispatchEvent(new Event('rentflow-open-pro')) }}>Оформить Pro</button>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => setPaywall(false)}>Позже</button>
        </div>
      </Modal>
    </div>
  )
}

export default ObjectAdd
