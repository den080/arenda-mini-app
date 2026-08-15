import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../theme'
import { showToast } from './ui'

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

const S: Record<string, React.CSSProperties> = {
  head: { fontSize: 13, color: '#8e8e93', margin: '14px 4px 6px', textTransform: 'uppercase', letterSpacing: 0.3 },
  card: { background: '#fff', borderRadius: 12, margin: '0 0 10px', padding: '0 16px' },
  row: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '6px 0', boxSizing: 'border-box' },
  sep: { height: 1, background: 'rgba(60,60,67,0.12)' },
  label: { fontSize: 15, color: '#1d1d1f' },
  sub: { fontSize: 13, color: '#8e8e93', marginTop: 2 },
  blue: { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 },
  red: { border: 'none', background: 'transparent', color: '#ff3b30', fontSize: 15, cursor: 'pointer', padding: 4, flexShrink: 0 },
  orange: { color: '#b25000', fontSize: 14, flexShrink: 0 },
  ok: { color: '#1e7e34', fontSize: 15, fontWeight: 600, flexShrink: 0 },
  sel: { padding: '7px 10px', border: 'none', background: 'rgba(120,120,128,0.08)', borderRadius: 8, fontSize: 14, color: '#1d1d1f', outline: 'none' },
  foot: { fontSize: 12, color: '#8e8e93', margin: '4px 4px 10px' },
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
      showToast('Укажите дату и время: начало раньше конца')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.from('cash_meetings').insert({
        contract_id: contractId, proposer: myRole, kind: 'window', status: 'open',
        meeting_date: date, day: parseDate(date).getDay(), time_from: from, time_to: to,
      })
      if (error) { showToast('Ошибка: ' + error.message); return }
      setDate(''); setFrom(''); setTo('')
      showToast('✅ Окно добавлено')
      window.dispatchEvent(new Event('rentflow-refresh'))
    } finally {
      setBusy(false)
    }
  }

  async function removeWindow(id: string) {
    await supabase.from('cash_meetings').delete().eq('parent_id', id)
    await supabase.from('cash_meetings').delete().eq('id', id)
    showToast('Окно удалено')
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function propose(w: Meeting, cancelConfirmedId?: string) {
    if (busy) return
    const s = sub[w.id] || { from: '', to: '' }
    if (!s.from || !s.to || s.from >= s.to) {
      showToast('Выберите время начала и окончания внутри окна')
      return
    }
    if (s.from < w.time_from || s.to > w.time_to) {
      showToast(`Время должно быть внутри окна ${w.time_from}–${w.time_to}`)
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
      if (error) { showToast('Ошибка: ' + error.message); return }
      await notifyOther()
      showToast('✅ Заявка отправлена')
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
    showToast('✅ Встреча подтверждена')
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function decline(id: string) {
    await supabase.from('cash_meetings').delete().eq('id', id)
    showToast('Отклонено')
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  const windowPicker = (list: Meeting[]) => list.map(w => {
    const opts = TIME_OPTIONS.filter(t => t >= w.time_from && t <= w.time_to)
    const s = sub[w.id] || { from: '', to: '' }
    return (
      <div key={w.id} style={S.card}>
        <div style={S.row}>
          <span style={S.label}>{fmtDate(w.meeting_date)} · {w.time_from}–{w.time_to}</span>
        </div>
        <div style={S.sep} />
        <div style={S.row}>
          <select value={s.from} onChange={(e) => setSub({ ...sub, [w.id]: { ...s, from: e.target.value } })} style={{ ...S.sel, flex: 1 }}>
            <option value="">с --:--</option>
            {opts.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={s.to} onChange={(e) => setSub({ ...sub, [w.id]: { ...s, to: e.target.value } })} style={{ ...S.sel, flex: 1 }}>
            <option value="">по --:--</option>
            {opts.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button style={S.blue} disabled={busy} onClick={() => propose(w, resched && confirmed ? confirmed.id : undefined)}>{resched ? 'Перенести' : 'Предложить'}</button>
        </div>
      </div>
    )
  })

  return (
    <div>
      <div style={S.foot}>Место встречи по умолчанию — арендуемый объект, если не обсуждалось иное.</div>

      {confirmed && (
        <div style={S.card}>
          <div style={S.row}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Встреча согласована</div>
              <div style={S.sub}>{fmtDate(confirmed.meeting_date)}, {confirmed.time_from}–{confirmed.time_to}</div>
            </div>
            <span style={{ flex: 1 }} />
            {canResched
              ? <button style={S.blue} onClick={() => setResched(!resched)}>{resched ? 'Отменить' : 'Изменить'}</button>
              : <span style={S.ok}>✓</span>}
          </div>
          {!canResched && <div style={{ ...S.foot, margin: '0 0 8px' }}>Перенос возможен не позже чем за 24 ч до встречи — дальше только по договорённости по телефону.</div>}
        </div>
      )}

      {pauseActive && D && (
        <div style={T.note}>Штраф на паузе до встречи {fmtDate(confirmed?.meeting_date)}: встреча в пределах 3 дней после срока оплаты. Если встреча пройдёт без оплаты — штраф начислится с {D.toLocaleDateString('ru-RU')} полностью. Переключение на безнал тоже вернёт штраф за пропущенные дни.</div>
      )}

      {resched && !firstMonthActive && (
        <>
          <div style={S.head}>Новое время</div>
          {windows.length === 0 && <div style={S.foot}>Нет открытых окон — добавьте новое ниже.</div>}
          {windowPicker(windows)}
        </>
      )}

      {!resched && !firstMonthActive && (
        <>
          <div style={S.head}>Мои окна</div>
          <div style={S.card}>
            {myWindows.length === 0 && <div style={{ ...S.row, fontSize: 14, color: '#8e8e93' }}>Пока нет — добавьте окно ниже</div>}
            {myWindows.map((w, i) => (
              <div key={w.id}>
                {i > 0 && <div style={S.sep} />}
                <div style={S.row}>
                  <span style={S.label}>{fmtDate(w.meeting_date)} · {w.time_from}–{w.time_to}</span>
                  <span style={{ flex: 1 }} />
                  <button style={S.red} onClick={() => removeWindow(w.id)}>удалить</button>
                </div>
              </div>
            ))}
            <div style={S.sep} />
            <div style={S.row}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...S.sel, flex: 1, minWidth: 0 }} />
              <select value={from} onChange={(e) => setFrom(e.target.value)} style={S.sel}>
                <option value="">с --:--</option>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={to} onChange={(e) => setTo(e.target.value)} style={S.sel}>
                <option value="">по --:--</option>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ ...S.row, justifyContent: 'flex-end' }}>
              <button style={S.blue} disabled={busy} onClick={addWindow}>Добавить окно</button>
            </div>
          </div>

          <div style={S.head}>Окна второй стороны</div>
          {theirWindows.length === 0 && <div style={S.foot}>Вторая сторона ещё не добавила окна.</div>}
          {windowPicker(theirWindows)}
        </>
      )}

      {!firstMonthActive && incoming.length > 0 && (
        <>
          <div style={S.head}>Ждут подтверждения</div>
          <div style={S.card}>
            {incoming.map((m, i) => (
              <div key={m.id}>
                {i > 0 && <div style={S.sep} />}
                <div style={S.row}>
                  <span style={S.label}>{fmtDate(m.meeting_date)} · {m.time_from}–{m.time_to}</span>
                  <span style={{ flex: 1 }} />
                  <button style={S.red} onClick={() => decline(m.id)}>Отклонить</button>
                  <button style={S.blue} onClick={() => confirmMeeting(m.id)}>Подтвердить</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!firstMonthActive && myProposals.length > 0 && (
        <>
          <div style={S.head}>Мои заявки</div>
          <div style={S.card}>
            {myProposals.map((m, i) => (
              <div key={m.id}>
                {i > 0 && <div style={S.sep} />}
                <div style={S.row}>
                  <span style={S.label}>{fmtDate(m.meeting_date)} · {m.time_from}–{m.time_to}</span>
                  <span style={{ flex: 1 }} />
                  <span style={S.orange}>ждёт</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default CashNegotiation
