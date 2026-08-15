import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T, C } from '../theme'

interface Meeting {
  id: string
  contract_id: string
  proposer: string | null
  kind: string | null
  parent_id: string | null
  status: string
  meeting_date: string | null
  day: number
  time_from: string
  time_to: string
}

const TIME_OPTIONS: string[] = []
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 10) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
}

function parseDate(d: any): Date {
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, dd || 1)
}

function fmtDate(d: any): string {
  const dt = parseDate(d)
  const wd = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][dt.getDay()]
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()} (${wd})`
}

export function CashNegotiation({ contractId, myRole, tenantId, landlordId }: {
  contractId: string
  myRole: 'landlord' | 'tenant'
  tenantId: string
  landlordId: string
}) {
  const [rows, setRows] = useState<Meeting[]>([])
  const [con, setCon] = useState<any>(null)
  const [pay, setPay] = useState<any>(null)
  const [date, setDate] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sub, setSub] = useState<Record<string, { from: string; to: string }>>({})
  const [resched, setResched] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('cash_meetings').select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false })
    setRows((data as Meeting[]) || [])
    const { data: c } = await supabase.from('contracts').select('*').eq('id', contractId).maybeSingle()
    setCon(c)
    const { data: allp } = await supabase.from('payments').select('*').eq('contract_id', contractId).order('period', { ascending: false })
    const openp = (allp || []).filter((x: any) => !x.confirmed_by_landlord)
    setPay(openp.length ? openp[openp.length - 1] : (allp || [])[0] || null)
  }

  useEffect(() => {
    load()
    const on = () => load()
    window.addEventListener('rentflow-refresh', on)
    const iv = setInterval(() => load(), 30000)
    return () => { window.removeEventListener('rentflow-refresh', on); clearInterval(iv) }
  }, [contractId])

  const windows = rows.filter(r => (r.kind || 'meeting') === 'window' && r.status === 'open')
  const myWindows = windows.filter(w => w.proposer === myRole)
  const theirWindows = windows.filter(w => w.proposer !== myRole)
  const meetings = rows.filter(r => (r.kind || 'meeting') === 'meeting')
  const incoming = meetings.filter(m => m.status === 'proposed' && m.proposer !== myRole)
  const myProposals = meetings.filter(m => m.status === 'proposed' && m.proposer === myRole)
  const confirmed = meetings.find(m => m.status === 'confirmed')

  const pm = pay ? parseDate(pay.period) : null
  const sm = con?.start_date ? parseDate(con.start_date) : null
  const firstMonthActive = !!(pm && sm && pm.getMonth() === sm.getMonth() && pm.getFullYear() === sm.getFullYear()) && !pay?.confirmed_by_landlord

  const meetMs = confirmed && confirmed.meeting_date ? new Date(`${confirmed.meeting_date}T${confirmed.time_from}`).getTime() : 0
  const canResched = !!confirmed && (meetMs - Date.now()) > 24 * 3600 * 1000

  const today = new Date()
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const D = pay ? parseDate(pay.due_date) : null
  const M = confirmed && confirmed.meeting_date ? parseDate(confirmed.meeting_date) : null
  const effectiveCash = !!con && (con.payment_method === 'cash' || (con.payment_method === 'both' && con.tenant_pay_method === 'cash'))
  const pauseActive = !!(pay && !pay.confirmed_by_landlord && effectiveCash && D && M && M >= D && M <= new Date(D.getFullYear(), D.getMonth(), D.getDate() + 3) && todayMid <= M)

  async function notifyOther() {
    const other = myRole === 'landlord' ? tenantId : landlordId
    await supabase.from('notifications_log').insert({
      user_id: other, type: 'cash_proposed', related_id: contractId, sent_at: new Date().toISOString(),
    })
  }

  async function addWindow() {
    if (busy) return
    if (!date || !from || !to || from >= to) {
      alert('Укажите дату и время: начало должно быть раньше конца')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.from('cash_meetings').insert({
        contract_id: contractId, proposer: myRole, kind: 'window', status: 'open',
        meeting_date: date, day: parseDate(date).getDay(), time_from: from, time_to: to,
      })
      if (error) { alert('Ошибка: ' + error.message); return }
      setDate(''); setFrom(''); setTo('')
      window.dispatchEvent(new Event('rentflow-refresh'))
    } finally {
      setBusy(false)
    }
  }

  async function removeWindow(id: string) {
    await supabase.from('cash_meetings').delete().eq('parent_id', id)
    await supabase.from('cash_meetings').delete().eq('id', id)
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function propose(w: Meeting, cancelConfirmedId?: string) {
    if (busy) return
    const s = sub[w.id] || { from: '', to: '' }
    if (!s.from || !s.to || s.from >= s.to) {
      alert('Выберите время начала и окончания внутри окна')
      return
    }
    if (s.from < w.time_from || s.to > w.time_to) {
      alert(`Время должно быть внутри окна ${w.time_from}–${w.time_to}`)
      return
    }
    setBusy(true)
    try {
      if (cancelConfirmedId) {
        await supabase.from('cash_meetings').update({ status: 'cancelled' }).eq('id', cancelConfirmedId)
      }
      const { error } = await supabase.from('cash_meetings').insert({
        contract_id: contractId, proposer: myRole, kind: 'meeting', status: 'proposed',
        parent_id: w.id, meeting_date: w.meeting_date, day: w.day, time_from: s.from, time_to: s.to,
      })
      if (error) { alert('Ошибка: ' + error.message); return }
      await notifyOther()
      setResched(false)
      window.dispatchEvent(new Event('rentflow-refresh'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmMeeting(id: string) {
    const m = rows.find(r => r.id === id)
    await supabase.from('cash_meetings').update({ status: 'confirmed' }).eq('id', id)
    const other = m ? (m.proposer === 'landlord' ? landlordId : tenantId) : (myRole === 'landlord' ? tenantId : landlordId)
    await supabase.from('notifications_log').insert({
      user_id: other, type: 'cash_confirmed', related_id: contractId, sent_at: new Date().toISOString(),
    })
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function decline(id: string) {
    await supabase.from('cash_meetings').delete().eq('id', id)
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  const windowPicker = (list: Meeting[]) => list.map(w => {
    const opts = TIME_OPTIONS.filter(t => t >= w.time_from && t <= w.time_to)
    const s = sub[w.id] || { from: '', to: '' }
    return (
      <div key={w.id} style={T.item}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
          {fmtDate(w.meeting_date)} · {w.time_from}–{w.time_to}{w.proposer === myRole ? ' · моё окно' : ''}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={s.from} onChange={(e) => setSub({ ...sub, [w.id]: { ...s, from: e.target.value } })} style={T.select}>
            <option value="">с --:--</option>
            {opts.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={s.to} onChange={(e) => setSub({ ...sub, [w.id]: { ...s, to: e.target.value } })} style={T.select}>
            <option value="">по --:--</option>
            {opts.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button style={busy ? T.btnOff : T.btnSmall} disabled={busy} onClick={() => propose(w, resched && confirmed ? confirmed.id : undefined)}>{resched ? 'Перенести' : 'Предложить'}</button>
        </div>
      </div>
    )
  })

  return (
    <div>
      <div style={T.tiny}>Место встречи по умолчанию — арендуемый объект, если не обсуждалось иное.</div>

      {firstMonthActive && (
        <div style={T.note}>💵 Первый месяц оплачивается при подписании — согласование времени встречи не требуется. Арендодатель подтвердит получение в своём кабинете.</div>
      )}

      {confirmed && (
        <div style={T.noteGreen}>
          ✅ Встреча согласована: {fmtDate(confirmed.meeting_date)}, {confirmed.time_from}–{confirmed.time_to}
          <div style={{ marginTop: 8 }}>
            {canResched ? (
              <button style={T.btnSecondary} onClick={() => setResched(!resched)}>{resched ? 'Отменить перенос' : 'Изменить время'}</button>
            ) : (
              <div style={T.tiny}>Перенос возможен не позже чем за 24 ч до встречи — дальше только по договорённости по телефону.</div>
            )}
          </div>
        </div>
      )}

      {pauseActive && D && (
        <div style={T.note}>
          ⏸ Штраф на паузе до встречи {fmtDate(confirmed?.meeting_date)}: встреча в пределах 3 дней после срока оплаты.
          Если встреча пройдёт без оплаты — штраф начислится с {D.toLocaleDateString('ru-RU')} полностью.
          Переключение на безнал тоже вернёт штраф за пропущенные дни.
        </div>
      )}

      {resched && !firstMonthActive && (
        <>
          <div style={T.h3}>🔁 Выберите новое время (внутри любого открытого окна)</div>
          {windows.length === 0 && <div style={T.tiny}>Нет открытых окон — добавьте новое ниже.</div>}
          {windowPicker(windows)}
        </>
      )}

      {!resched && !firstMonthActive && (
        <>
          <div style={T.h3}>🕐 Мои окна, когда я могу</div>
          {myWindows.length === 0 && <div style={T.tiny}>Пока нет. Добавьте окно ниже — вторая сторона выберет внутри него точное время.</div>}
          {myWindows.map(w => (
            <div key={w.id} style={{ ...T.item, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14 }}>{fmtDate(w.meeting_date)} · {w.time_from}–{w.time_to}</span>
              <button style={T.btnDanger} onClick={() => removeWindow(w.id)}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={T.select} />
            <select value={from} onChange={(e) => setFrom(e.target.value)} style={T.select}>
              <option value="">с --:--</option>
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={to} onChange={(e) => setTo(e.target.value)} style={T.select}>
              <option value="">по --:--</option>
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button style={busy ? T.btnOff : T.btnSmall} disabled={busy} onClick={addWindow}>Добавить окно</button>
          </div>

          <div style={T.h3}>🕐 Окна второй стороны — выберите время внутри</div>
          {theirWindows.length === 0 && <div style={T.tiny}>Вторая сторона ещё не добавила окна.</div>}
          {windowPicker(theirWindows)}
        </>
      )}

      {!firstMonthActive && incoming.length > 0 && (
        <>
          <div style={T.h3}>📥 Ждут моего подтверждения</div>
          {incoming.map(m => (
            <div key={m.id} style={{ ...T.item, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14 }}>{fmtDate(m.meeting_date)} · {m.time_from}–{m.time_to}</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...T.btnSmall, background: C.green }} onClick={() => confirmMeeting(m.id)}>Подтвердить</button>
                <button style={T.btnDanger} onClick={() => decline(m.id)}>✕</button>
              </span>
            </div>
          ))}
        </>
      )}

      {!firstMonthActive && myProposals.length > 0 && (
        <>
          <div style={T.h3}>📤 Мои заявки</div>
          {myProposals.map(m => (
            <div key={m.id} style={{ ...T.item, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14 }}>{fmtDate(m.meeting_date)} · {m.time_from}–{m.time_to}</span>
              <span style={T.chipOrange}>🟡 ждёт подтверждения</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default CashNegotiation
