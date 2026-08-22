import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { useTeam } from '../hooks/useTeam'
import { ensureNextPayment } from '../lib/nextPayment'
import { T } from '../theme'
import { ConfirmDelete, Modal, showToast } from './ui'

const BANKS = ['Сбербанк', 'Т-Банк (Тинькофф)', 'ВТБ', 'Альфа-Банк', 'Газпромбанк', 'Россельхозбанк', 'Райффайзен Банк', 'Росбанк', 'Открытие', 'Совкомбанк', 'МТС Банк', 'Промсвязьбанк', 'Почта Банк', 'Дом.РФ', 'ЮниКредит Банк']
const OWNER_PHONE = '+79057674225'
const PRO_PRICE = 299
const SBP_PHONE = '+7 905 767-42-25'

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
  let cleaned = input.replace(/[\s-()]/g, '')
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

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function pdate(s: string): Date {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function clampDay(y: number, m: number, d: number): number {
  const last = new Date(y, m + 1, 0).getDate()
  return Math.min(Math.max(1, d), last)
}

function moneyOk(v: string, max = 10000000): number | null {
  if (String(v).trim() === '') return 0
  const n = Number(String(v).replace(',', '.'))
  if (isNaN(n) || n < 0 || n > max) return null
  return n
}

function compress(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const img = new Image()
      img.onload = () => {
        const max = 1280
        let w = img.width, h = img.height
        const k = Math.min(1, max / Math.max(w, h))
        w = Math.round(w * k); h = Math.round(h * k)
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        c.getContext('2d')!.drawImage(img, 0, 0, w, h)
        c.toBlob(b => b ? resolve(b) : reject(new Error('compress')), 'image/jpeg', 0.82)
      }
      img.onerror = reject
      img.src = String(fr.result)
    }
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

export function SubscriptionBlock() {
  const { user } = useTelegramUser()
  const { teamId } = useTeam()
  const [sub, setSub] = useState<any | null>(null)
  const [subOwnerId, setSubOwnerId] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [payBusy, setPayBusy] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [requests, setRequests] = useState<any[]>([])
  const [view, setView] = useState<string | null>(null)

  const isOwner = !!user && normalizePhone(user.phone || '') === normalizePhone(OWNER_PHONE)

  async function load() {
    if (!user) return
    let owner = user.id
    if (teamId) {
      const { data: t } = await supabase.from('teams').select('owner_id').eq('id', teamId).maybeSingle()
      if (t) owner = t.owner_id
    }
    setSubOwnerId(owner)
    const { data: s } = await supabase.from('subscriptions').select('*').eq('owner_id', owner).order('until_date', { ascending: false }).maybeSingle()
    const today = iso(new Date())
    setSub(s && s.until_date >= today ? s : null)
    if (isOwner) {
      const { data: r } = await supabase.from('feedback').select('*').eq('status', 'new').ilike('message', 'ПОДПИСКА%').order('created_at', { ascending: true })
      setRequests(r || [])
    }
  }

  useEffect(() => { load() }, [user, teamId])

  async function payPro() {
    if (payBusy || !subOwnerId) return
    setPayBusy(true)
    try {
      const r = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: subOwnerId }),
      })
      const data = await r.json()
      if (!r.ok || !data.confirmation_url) { showToast('Ошибка оплаты: ' + (data.error || 'не удалось создать платёж')); return }
      const tg = (window as any).Telegram?.WebApp
      if (tg && typeof tg.openLink === 'function') tg.openLink(data.confirmation_url)
      else window.open(data.confirmation_url, '_blank')
      showToast('После оплаты подписка включится автоматически')
      startPolling()
      setPayOpen(false)
    } catch (e) {
      showToast('Ошибка: ' + String(e))
    } finally {
      setPayBusy(false)
    }
  }

  function startPolling() {
    let tries = 0
    const t = setInterval(async () => {
      tries++
      await load()
      const today = iso(new Date())
      const active = sub && sub.until_date >= today
      if (active || tries > 40) clearInterval(t)
    }, 5000)
  }

  async function sendCheck(file: File) {
    if (busy || !user) return
    setBusy(true)
    try {
      const blob = await compress(file)
      const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      const { error: upErr } = await supabase.storage.from('feedback').upload(id, blob, { contentType: 'image/jpeg' })
      if (upErr) { showToast('Ошибка загрузки: ' + upErr.message); return }
      const url = supabase.storage.from('feedback').getPublicUrl(id).data.publicUrl
      const { error } = await supabase.from('feedback').insert({
        user_id: user.id,
        sender_name: user.full_name || 'Арендодатель',
        sender_phone: user.phone || '',
        message: `ПОДПИСКА: Pro ${PRO_PRICE} ₽/мес (ручная оплата)`,
        image_url: url,
      })
      if (error) { showToast('Ошибка: ' + error.message); return }
      showToast('✅ Чек отправлен. Активация — в течение часа')
      setPayOpen(false)
    } catch (e) {
      showToast('Ошибка: ' + String(e))
    } finally {
      setBusy(false)
    }
  }

  async function activate(userId: string, fbId: string) {
    const today = new Date()
    const todayS = iso(today)
    const { data: ex } = await supabase.from('subscriptions').select('*').eq('owner_id', userId).order('until_date', { ascending: false }).maybeSingle()
    const base = ex && ex.until_date >= todayS ? new Date(ex.until_date + 'T12:00:00') : today
    const until = new Date(base.getTime() + 30 * 86400000)
    if (ex) {
      await supabase.from('subscriptions').update({ until_date: iso(until), updated_at: new Date().toISOString() }).eq('id', ex.id)
    } else {
      await supabase.from('subscriptions').insert({ owner_id: userId, plan: 'pro', until_date: iso(until) })
    }
    await supabase.from('feedback').update({ status: 'done' }).eq('id', fbId)
    showToast('✅ Подписка активирована на 30 дней')
    load()
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  return (
    <div style={{ ...T.row, borderBottom: 'none', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: '#8e8e93' }}>
        {sub ? `Тариф Pro · до ${new Date(sub.until_date + 'T12:00:00').toLocaleDateString('ru-RU')}` : 'Тариф Free · 1 объект'}
      </span>
      <button style={S.blue} onClick={() => setPayOpen(true)}>{sub ? 'Продлить' : 'Оформить Pro'}</button>
      <Modal open={payOpen} title={sub ? 'Продление Pro' : 'Тариф Pro'} onClose={() => setPayOpen(false)}>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 10 }}>
          Pro — {PRO_PRICE} ₽/мес: объекты без лимита, совместный доступ, приоритетная поддержка. Free — 1 объект.
        </div>
        <button
          disabled={payBusy}
          onClick={payPro}
          style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 8, opacity: payBusy ? 0.6 : 1 }}
        >{payBusy ? 'Создание платежа…' : `Оплатить ${PRO_PRICE} ₽ (СБП / карта)`}</button>
        <div style={{ ...T.tiny, margin: '0 0 10px', textAlign: 'center' }}>Оплата через ЮKassa. Подписка включится автоматически после оплаты.</div>
        <div style={{ textAlign: 'center' }}>
          <button style={S.blue} onClick={() => setManualOpen(!manualOpen)}>Оплатили вручную? Приложить чек</button>
        </div>
        {manualOpen && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>Перевод по СБП: <b>{SBP_PHONE}</b> (Роман)</div>
            <label style={{ display: 'block', textAlign: 'center', padding: 12, borderRadius: 10, background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
              {busy ? 'Отправка…' : 'Приложить чек'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) sendCheck(f); e.target.value = '' }} />
            </label>
          </div>
        )}
        {isOwner && (
          <div style={{ marginTop: 16, borderTop: '1px solid rgba(60,60,67,0.12)', paddingTop: 10 }}>
            <div style={{ fontSize: 13, color: '#8e8e93', marginBottom: 6 }}>Ручные заявки ({requests.length})</div>
            {requests.length === 0 && <div style={{ fontSize: 13, color: '#8e8e93' }}>Новых заявок нет.</div>}
            {requests.map(r => (
              <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(60,60,67,0.12)' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.sender_name} · {r.sender_phone}</div>
                <div style={{ fontSize: 12, color: '#8e8e93' }}>{new Date(r.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                {r.image_url && <button style={S.blue} onClick={() => setView(r.image_url)}>смотреть чек</button>}
                <div style={{ marginTop: 4 }}>
                  <button style={S.blue} onClick={() => activate(r.user_id, r.id)}>Активировать 30 дней</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
      {view && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setView(null)}>
          <img src={view} alt="" style={{ maxWidth: '100%', maxHeight: '90%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
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
    // Админы и тестеры — безлимит
    const userPhone = (user.phone || '').replace(/\s-()/g, '')
    const normUser = userPhone.startsWith('+') ? userPhone : (userPhone ? '+' + userPhone : '')
    const { data: ac } = await supabase.from('access_control')
      .select('phone, role')
      .in('role', ['tester', 'admin'])
    const isPrivileged = (ac || []).some((r: any) => {
      const rp = (r.phone || '').replace(/\s-()/g, '')
      const normRp = rp.startsWith('+') ? rp : (rp ? '+' + rp : '')
      return normRp === normUser
    })
    if (isPrivileged) return true
    // Обычные пользователи — лимит 1 объект без Pro
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

export function ObjectEdit({ objectId }: { objectId: string }) {
  const [ready, setReady] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [repairOpen, setRepairOpen] = useState(false)
  const [repairOk, setRepairOk] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [locked, setLocked] = useState(false)
  const [editContractId, setEditContractId] = useState<string | null>(null)
  const [editCounterId, setEditCounterId] = useState<string | null>(null)
  const [cRent, setCRent] = useState(0)
  const [cPayDay, setCPayDay] = useState(1)
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
        setCRent(Number(contract.rent_amount) || 0)
        setCPayDay(Number(contract.payment_day) || 1)
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

  async function doRepair() {
    if (!editContractId || repairing) return
    setRepairing(true)
    try {
      const today0 = new Date()
      const tMid = new Date(today0.getFullYear(), today0.getMonth(), today0.getDate())
      const { data: pays } = await supabase.from('payments').select('*').eq('contract_id', editContractId).order('period', { ascending: true })
      const list = pays || []
      for (const p of list) {
        if (!p.confirmed_by_landlord && pdate(p.due_date) < tMid) {
          await supabase.from('payments').update({ confirmed_by_landlord: true, confirmed_at: p.due_date, penalty_amount: 0 }).eq('id', p.id)
        }
      }
      const { data: pays2 } = await supabase.from('payments').select('*').eq('contract_id', editContractId).order('period', { ascending: true })
      const list2 = pays2 || []
      if (list2.length) {
        const last = list2[list2.length - 1]
        let next = new Date(pdate(last.period).getFullYear(), pdate(last.period).getMonth() + 1, 1)
        const rows: any[] = []
        let guard = 0
        while (guard++ < 240) {
          const due = new Date(next.getFullYear(), next.getMonth(), clampDay(next.getFullYear(), next.getMonth(), cPayDay))
          if (due >= tMid) break
          rows.push({ contract_id: editContractId, period: iso(next), due_date: iso(due), base_amount: cRent, penalty_amount: 0, utilities_amount: 0, confirmed_by_landlord: true, confirmed_at: iso(due) })
          next = new Date(next.getFullYear(), next.getMonth() + 1, 1)
        }
        if (rows.length) await supabase.from('payments').insert(rows)
      }
      await ensureNextPayment(editContractId)
      showToast('✅ История выровнена: прошлые месяцы оплачены, создан текущий счёт')
      setRepairOpen(false)
      setRepairOk(false)
      window.dispatchEvent(new Event('rentflow-refresh'))
    } finally {
      setRepairing(false)
    }
  }

  async function saveEdit() {
    if (!validPhone(ePhone)) { showToast('Проверьте номер телефона арендатора'); return }
    if (eMethod !== 'cash' && eDetails.length === 0) { setEditDetailsErr('Добавьте хотя бы один способ безналичной оплаты'); return }
    setEditDetailsErr(null)
    const eRentRaw = locked ? Number(eRent) || 0 : moneyOk(eRent)
    if (!locked && (eRentRaw === null || eRentRaw <= 0)) { showToast('Сумма аренды — число больше 0'); return }
    const eRentN = eRentRaw ?? 0
    const eDepRaw = locked ? Number(eDeposit) || 0 : moneyOk(eDeposit)
    if (!locked && eDepRaw === null) { showToast('Депозит — число не меньше 0'); return }
    const eDepN = eDepRaw ?? 0
    const ePayDayN = Math.round(Number(ePaymentDay) || 1)
    if (!locked && (ePayDayN < 1 || ePayDayN > 31)) { showToast('День платежа — число от 1 до 31'); return }
    const eMeterDayN = Math.round(Number(eMeterDay) || 15)
    if (eMeterDayN < 1 || eMeterDayN > 31) { showToast('День показаний — число от 1 до 31'); return }
    const ePenPayRaw = locked ? Number(ePenPay) || 0 : moneyOk(ePenPay)
    if (!locked && ePenPayRaw === null) { showToast('Штраф за просрочку оплаты — число не меньше 0'); return }
    const ePenPayN = ePenPayRaw ?? 0
    const ePenReadRaw = locked ? Number(ePenRead) || 0 : moneyOk(ePenRead)
    if (!locked && ePenReadRaw === null) { showToast('Штраф за показания — число не меньше 0'); return }
    const ePenReadN = ePenReadRaw ?? 0
    const eRemindN = Math.round(Number(eRemind) || 3)
    if (eRemindN < 0 || eRemindN > 30) { showToast('Напоминание — от 0 до 30 дней'); return }
    if (eStartDate && eEndDate && pdate(eEndDate) <= pdate(eStartDate)) { showToast('Окончание договора должно быть позже начала'); return }
    if (eMethod !== 'cash') {
      for (const d of eDetails) {
        const dg = (d.number || '').replace(/\D/g, '')
        if (d.type === 'card' ? dg.length !== 16 : dg.length !== 11) { showToast('Проверьте номер карты или СБП в способах оплаты'); return }
      }
    }
    const { error: oe } = await supabase.from('objects').update({ address: eAddress, notes: eNotes || null }).eq('id', objectId)
    if (oe) { showToast('Ошибка: ' + oe.message); return }
    if (editContractId) {
      const firstCard = eDetails.find(d => d.type === 'card')
      const upd: any = {
        payment_method: eMethod,
        card_number: firstCard ? firstCard.number : null,
        payment_details: eDetails,
        reminder_days_before: eRemindN,
        meter_deadline_day: eMeterDayN,
        readings_mode: eReadingsMode,
        end_date: eEndDate || null,
      }
      if (!locked) {
        upd.rent_amount = eRentN
        upd.deposit_amount = eDepN
        upd.payment_day = ePayDayN
        upd.start_date = eStartDate || null
      }
      const { error: ce } = await supabase.from('contracts').update(upd).eq('id', editContractId)
      if (ce) { showToast('Ошибка: ' + ce.message); return }
      if (!locked) {
        const rules: Array<['payment_overdue' | 'readings_overdue', number]> = [
          ['payment_overdue', ePenPayN],
        ]
        if (eReadingsMode === 'manual') rules.push(['readings_overdue', ePenReadN])
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
      {!locked && <div style={{ ...T.tiny, margin: '4px 0 0' }}>Новая аренда действует со следующего счёта.</div>}
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
      <div style={{ borderTop: '1px solid rgba(60,60,67,0.12)', paddingTop: 12, marginTop: 4 }}>
        <div style={{ ...T.tiny, margin: '0 0 8px' }}>Если договор внесён задним числом и в реальности просрочек не было — выровняйте историю: прошлые счета станут «оплачены вовремя», создастся текущий счёт.</div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
          <button style={S.blue} onClick={() => { setRepairOk(false); setRepairOpen(true) }}>Выровнять историю старых платежей</button>
        </div>
      </div>
      <Modal open={repairOpen} title="Выровнять историю" onClose={() => setRepairOpen(false)}>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 12 }}>
          Все счета с прошедшей датой будут отмечены «оплачены вовремя», недостающие месяцы дозаполнятся, создастся текущий открытый счёт. Используйте, только если в реальности просрочек не было.
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 14, color: '#1d1d1f' }}>
          <input type="checkbox" checked={repairOk} onChange={(e) => setRepairOk(e.target.checked)} />
          Понимаю и подтверждаю
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            disabled={!repairOk || repairing}
            onClick={doRepair}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: repairOk ? 1 : 0.4 }}
          >{repairing ? 'Выравнивание…' : 'Выровнять'}</button>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => setRepairOpen(false)}>Отмена</button>
        </div>
      </Modal>
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
