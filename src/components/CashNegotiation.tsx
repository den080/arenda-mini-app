import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

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
    const { data: p } = await supabase.from('payments').select('*').eq('contract_id', contractId).order('period', { ascending: false }).limit(1).maybeSingle()
    setPay(p)
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
      <div key={w.id} style={st.box}>
        <div style={st.boxTitle}>{fmtDate(w.meeting_date)} · {w.time_from}–{w.time_to}{w.proposer === myRole ? ' (моё окно)' : ''}</div>
        <div style={st.form}>
          <select value={s.from} onChange={(e) => setSub({ ...sub, [w.id]: { ...s, from: e.target.value } })} style={st.input}>
            <option value="">с --:--</option>
            {opts.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={s.to} onChange={(e) => setSub({ ...sub, [w.id]: { ...s, to: e.target.value } })} style={st.input}>
            <option value="">по --:--</option>
            {opts.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button style={busy ? st.btnOff : st.btn} disabled={busy} onClick={() => propose(w, resched && confirmed ? confirmed.id : undefined)}>{resched ? 'Перенести' : 'Предложить'}</button>
        </div>
      </div>
    )
  })

  return (
    <div>
      <div style={st.note}>Место встречи по умолчанию — арендуемый объект, если не обсуждалось иное.</div>

      {confirmed && (
        <div style={st.ok}>
          ✅ Встреча согласована: {fmtDate(confirmed.meeting_date)}, {confirmed.time_from}–{confirmed.time_to}
          <div style={{ marginTop: 8 }}>
            {canResched ? (
              <button style={st.btn} onClick={() => setResched(!resched)}>{resched ? 'Отменить перенос' : 'Изменить время'}</button>
            ) : (
              <div style={st.note}>Перенос возможен не позже чем за 24 ч до встречи — дальше только по договорённости по телефону.</div>
            )}
          </div>
        </div>
      )}

      {pauseActive && D && (
        <div style={st.pause}>
          ⏸ Штраф на паузе до встречи {fmtDate(confirmed?.meeting_date)}: встреча в пределах 3 дней после срока оплаты.
          Если встреча пройдёт без оплаты — штраф начислится с {D.toLocaleDateString('ru-RU')} полностью.
          Переключение на безнал тоже вернёт штраф за пропущенные дни.
        </div>
      )}

      {resched && (
        <>
          <div style={st.h}>🔁 Выберите новое время (внутри любого открытого окна)</div>
          {windows.length === 0 && <div style={st.note}>Нет открытых окон — добавьте новое ниже.</div>}
          {windowPicker(windows)}
        </>
      )}

      {!resched && (
        <>
          <div style={st.h}>🕐 Мои окна, когда я могу</div>
          {myWindows.length === 0 && <div style={st.note}>Пока нет. Добавьте окно ниже — вторая сторона выберет внутри него точное время.</div>}
          {myWindows.map(w => (
            <div key={w.id} style={st.row}>
              <span>{fmtDate(w.meeting_date)} · {w.time_from}–{w.time_to}</span>
              <button style={st.del} onClick={() => removeWindow(w.id)}>✕</button>
            </div>
          ))}
          <div style={st.form}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={st.input} />
            <select value={from} onChange={(e) => setFrom(e.target.value)} style={st.input}>
              <option value="">с --:--</option>
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={to} onChange={(e) => setTo(e.target.value)} style={st.input}>
              <option value="">по --:--</option>
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button style={busy ? st.btnOff : st.btn} disabled={busy} onClick={addWindow}>Добавить окно</button>
          </div>

          <div style={st.h}>🕐 Окна второй стороны — выберите время внутри</div>
          {theirWindows.length === 0 && <div style={st.note}>Вторая сторона ещё не добавила окна.</div>}
          {windowPicker(theirWindows)}
        </>
      )}

      {incoming.length > 0 && (
        <>
          <div style={st.h}>📥 Ждут моего подтверждения</div>
          {incoming.map(m => (
            <div key={m.id} style={st.row}>
              <span>{fmtDate(m.meeting_date)} · {m.time_from}–{m.time_to}</span>
              <span>
                <button style={st.okBtn} onClick={() => confirmMeeting(m.id)}>Подтвердить</button>
                <button style={st.del} onClick={() => decline(m.id)}>✕</button>
              </span>
            </div>
          ))}
        </>
      )}

      {myProposals.length > 0 && (
        <>
          <div style={st.h}>📤 Мои заявки</div>
          {myProposals.map(m => (
            <div key={m.id} style={st.row}>
              <span>{fmtDate(m.meeting_date)} · {m.time_from}–{m.time_to}</span>
              <span style={st.wait}>🟡 ждёт подтверждения</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  note: { fontSize: 12, color: '#888', marginTop: 6 },
  ok: { padding: 10, background: '#eaf7ef', border: '1px solid #a5d6a7', borderRadius: 8, color: '#080', fontSize: 14, fontWeight: 600, marginTop: 8 },
  pause: { padding: 10, background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 8, color: '#e65100', fontSize: 13, fontWeight: 600, marginTop: 8 },
  h: { fontSize: 15, fontWeight: 600, margin: '14px 0 8px' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, background: '#f9f9f9', borderRadius: 6, marginBottom: 6, fontSize: 14 },
  box: { padding: 10, background: '#f9f9f9', borderRadius: 8, marginBottom: 8 },
  boxTitle: { fontSize: 14, fontWeight: 600, marginBottom: 6 },
  form: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 },
  input: { flex: 1, minWidth: 90, padding: 6, borderRadius: 6, border: '1px solid #ddd', fontSize: 13 },
  btn: { padding: '6px 12px', borderRadius: 6, border: 'none', background: '#2196f3', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnOff: { padding: '6px 12px', borderRadius: 6, border: 'none', background: '#9e9e9e', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'default' },
  okBtn: { padding: '4px 10px', borderRadius: 6, border: 'none', background: '#4caf50', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginRight: 6 },
  del: { padding: '4px 8px', borderRadius: 6, border: 'none', background: '#ff5252', color: '#fff', fontSize: 12, cursor: 'pointer' },
  wait: { fontSize: 12, color: '#a80' },
}

export default CashNegotiation
