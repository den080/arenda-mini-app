import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../theme'
import { showToast, ConfirmDelete, Modal } from '../components/ui'
import FamilyDetector from '../components/FamilyDetector'

const TABS = [
  { id: 'alarms', l: 'Тревоги' },
  { id: 'feedback', l: 'Обращения' },
  { id: 'errors', l: 'Ошибки' },
  { id: 'users', l: 'Пользователи' },
  { id: 'pro', l: 'Pro' },
  { id: 'summary', l: 'Сводка' },
  { id: 'objects', l: 'Объекты' },
  { id: 'payments', l: 'Платежи' },
  { id: 'analytics', l: 'Аналитика' },
  { id: 'events', l: 'События' },
  { id: 'control', l: 'Контроль' },
  { id: 'access', l: 'Доступ' },
]

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderBottom: '1px solid rgba(60,60,67,0.12)', fontSize: 15, alignItems: 'center' }
const last: React.CSSProperties = { ...row, borderBottom: 'none' }
const muted: React.CSSProperties = { color: '#8e8e93', fontSize: 14 }
const valMoney: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: '#1d1d1f', whiteSpace: 'nowrap' }
const secHead: React.CSSProperties = { fontSize: 13, color: '#8e8e93', margin: '14px 16px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }
const blue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 4 }
const red: React.CSSProperties = { border: 'none', background: 'transparent', color: '#ff3b30', fontSize: 14, cursor: 'pointer', padding: 4 }
const inp: React.CSSProperties = { flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box', outline: 'none' }

function fmtDur(sec: number): string {
  if (sec < 60) return `${sec} с`
  return `${Math.floor(sec / 60)} мин ${sec % 60} с`
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function deviceLabel(meta: any): string {
  const platform = meta?.platform || 'web'
  const ua = String(meta?.ua || '')
  let dev = ''
  if (/iPhone/.test(ua)) dev = 'iPhone'
  else if (/Android/.test(ua)) dev = 'Android'
  else if (/Macintosh/.test(ua)) dev = 'Mac'
  else if (/Windows/.test(ua)) dev = 'Windows'
  else dev = ua.slice(0, 18)
  return `${platform} · ${dev}`
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addMonthsISO(base: Date, m: number): string {
  const d = new Date(base.getFullYear(), base.getMonth() + m, base.getDate())
  return iso(d)
}

const norm10 = (s: string) => (s || '').replace(/\D/g, '').slice(-10)
const isInf = (d: any) => String(d || '').slice(0, 4) >= '2099'

export function AdminDashboard() {
  const [tab, setTab] = useState('alarms')
  const [users, setUsers] = useState<any[]>([])
  const [objects, setObjects] = useState<any[]>([])
  const [contracts, setContracts] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [readings, setReadings] = useState<any[]>([])
  const [meetings, setMeetings] = useState<any[]>([])
  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [analytics, setAnalytics] = useState<any[]>([])
  const [accessList, setAccessList] = useState<any[]>([])
  const [deferreds, setDeferreds] = useState<any[]>([])
  const [subs, setSubs] = useState<any[]>([])
  const [openLogins, setOpenLogins] = useState<Record<string, boolean>>({})
  const [newPhone, setNewPhone] = useState('')
  const [newRole, setNewRole] = useState<'tester' | 'admin'>('tester')
  const [loading, setLoading] = useState(true)
  const [delFeedback, setDelFeedback] = useState<string | null>(null)
  const [delAccess, setDelAccess] = useState<string | null>(null)
  const [delUser, setDelUser] = useState<string | null>(null)
  const [proPhone, setProPhone] = useState('')
  const [proTerm, setProTerm] = useState<'1' | '3' | '6' | '12' | 'inf'>('1')
  const [proEdit, setProEdit] = useState<{ id: string; date: string } | null>(null)
  const [proRevoke, setProRevoke] = useState<string | null>(null)

  async function load() {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const [u, o, c, p, r, m, f, e, a, ac, dr, sb] = await Promise.all([
      supabase.from('users').select('*').order('created_at', { ascending: false }),
      supabase.from('objects').select('*'),
      supabase.from('contracts').select('*'),
      supabase.from('payments').select('*').order('period', { ascending: false }),
      supabase.from('meter_readings').select('*').gte('submitted_at', monthStart),
      supabase.from('cash_meetings').select('*').eq('status', 'confirmed'),
      supabase.from('feedback').select('*').order('created_at', { ascending: false }),
      supabase.from('notifications_log').select('*').order('sent_at', { ascending: false }).limit(50),
      supabase.from('analytics_events').select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('access_control').select('*').order('created_at', { ascending: false }),
      supabase.from('deferred_requests').select('*').eq('status', 'proposed'),
      supabase.from('subscriptions').select('*'),
    ])
    setUsers(u.data || [])
    setObjects(o.data || [])
    setContracts(c.data || [])
    setPayments(p.data || [])
    setReadings(r.data || [])
    setMeetings(m.data || [])
    setFeedbacks(f.data || [])
    setEvents(e.data || [])
    setAnalytics(a.data || [])
    setAccessList(ac.data || [])
    setDeferreds(dr.data || [])
    setSubs(sb.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const t = setInterval(() => load(), 60000)
    return () => clearInterval(t)
  }, [])

  // Выход: завершает сессию и сбрасывает тихий вход, чтобы можно было сменить аккаунт
  async function logout() {
    try { await supabase.auth.signOut() } catch {}
    try {
      localStorage.removeItem('roomio_bound_email')
      localStorage.removeItem('roomio_admin_v2')
      localStorage.removeItem('roomio_admin_v2_ready')
    } catch {}
    window.location.reload()
  }

  // ===== CSV для налоговой =====
  function downloadTaxCsv() {
    const rows: string[][] = [['Дата подтверждения', 'Период', 'Объект', 'Арендатор', 'Аренда', 'Штрафы', 'Ресурсы', 'Итого']]
    let total = 0
    for (const p of payments) {
      if (!p.confirmed_by_landlord) continue
      const c = contracts.find(x => x.id === p.contract_id)
      const o = objects.find(x => x.id === c?.object_id)
      const t = users.find(x => x.id === c?.tenant_id)
      const sum = Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0)
      total += sum
      rows.push([
        p.confirmed_at ? new Date(p.confirmed_at).toLocaleDateString('ru-RU') : '',
        new Date(p.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
        o?.address || '',
        t?.full_name || '',
        Number(p.base_amount || 0).toFixed(2),
        Number(p.penalty_amount || 0).toFixed(2),
        Number(p.utilities_amount || 0).toFixed(2),
        sum.toFixed(2),
      ])
    }
    rows.push(['', '', '', 'ИТОГО', '', '', '', total.toFixed(2)])
    const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `roomio-nalog-${iso(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('✅ CSV скачан')
  }

  // ===== Удаление персональных данных по запросу (152-ФЗ) =====
  async function eraseUserData(id: string) {
    await supabase.from('notifications_log').delete().eq('user_id', id)
    await supabase.from('analytics_events').delete().eq('user_id', id)
    await supabase.from('team_members').delete().eq('user_id', id)
    await supabase.from('subscriptions').delete().eq('owner_id', id)
    const { data: owned } = await supabase.from('teams').select('id').eq('owner_id', id)
    for (const t of owned || []) {
      await supabase.from('team_members').delete().eq('team_id', t.id)
      await supabase.from('objects').update({ team_id: null }).eq('team_id', t.id)
      await supabase.from('teams').delete().eq('id', t.id)
    }
    const { error } = await supabase.from('users').update({
      full_name: 'Удалённый пользователь', phone: null, email: null, telegram_id: null,
    }).eq('id', id)
    if (error) { showToast('Ошибка: ' + error.message); return }
    showToast('✅ Данные удалены, профиль обезличен')
    load()
  }

  if (loading) return <div style={T.page}>Загрузка…</div>

  const now = new Date()
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const activeContracts = contracts.filter(c => c.status === 'active')
  const objWithContract = new Set(activeContracts.map(c => c.object_id))
  const noContract = objects.filter(o => !objWithContract.has(o.id)).length
  const avgRent = activeContracts.length ? activeContracts.reduce((s, c) => s + Number(c.rent_amount || 0), 0) / activeContracts.length : 0
  const confirmed = payments.filter(p => p.confirmed_by_landlord)
  const sumAll = confirmed.reduce((s, p) => s + Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0), 0)
  const inMonth = (d: string, shift: number) => {
    const dt = new Date(d)
    return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth() + shift
  }
  const sumThis = confirmed.filter(p => p.confirmed_at && inMonth(p.confirmed_at, 0)).reduce((s, p) => s + Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0), 0)
  const sumPrev = confirmed.filter(p => p.confirmed_at && inMonth(p.confirmed_at, -1)).reduce((s, p) => s + Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0), 0)
  const open = payments.filter(p => !p.confirmed_by_landlord)
  const openSum = open.reduce((s, p) => s + Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0), 0)
  const overdue = open.filter(p => new Date(p.due_date) < todayMid)
  const overdueSum = overdue.reduce((s, p) => s + Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0), 0)
  const depPaid = activeContracts.reduce((s, c) => s + Number(c.deposit_paid || 0), 0)
  const depNeed = activeContracts.reduce((s, c) => s + Number(c.deposit_amount || 0), 0)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const activeUsers = users.filter(u => u.last_seen_at && u.last_seen_at >= weekAgo).length
  const newFeedback = feedbacks.filter(f => f.status === 'new').length

  const alarms: { sev: number; title: string; sub: string; chip: string }[] = []
  for (const c of activeContracts) {
    const addr = objects.find(o => o.id === c.object_id)?.address || '—'
    const who = users.find(u => u.id === c.tenant_id)?.full_name || '—'
    const openPays = payments.filter(p => p.contract_id === c.id && !p.confirmed_by_landlord)
    const firstOpen = openPays.slice().sort((a: any, b: any) => String(a.period).localeCompare(String(b.period)))[0]
    if (firstOpen) {
      const days = Math.round((todayMid.getTime() - new Date(String(firstOpen.due_date).slice(0, 10) + 'T00:00:00').getTime()) / 86400000)
      const sum = Number(firstOpen.base_amount || 0) + Number(firstOpen.penalty_amount || 0) + Number(firstOpen.utilities_amount || 0)
      if (days > 0) alarms.push({ sev: days >= 60 ? 0 : days >= 7 ? 1 : 2, title: addr, sub: `${who} · просрочка ${days} дн. · ${sum.toFixed(0)} ₽`, chip: days >= 60 ? 'критично' : 'просрочка' })
    }
    if ((c.readings_mode || 'manual') === 'manual' && c.meter_deadline_day && now.getDate() > Number(c.meter_deadline_day)) {
      const periodISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const has = readings.some(r => r.contract_id === c.id && r.period === periodISO)
      if (!has) alarms.push({ sev: 2, title: addr, sub: `${who} · показания за этот месяц не переданы`, chip: 'показания' })
    }
    const def = deferreds.find(d => d.contract_id === c.id)
    if (def) alarms.push({ sev: 1, title: addr, sub: `${who} · ждёт решения по отсрочке ${Number(def.amount || 0).toFixed(0)} ₽`, chip: 'отсрочка' })
    if (c.end_date) {
      const left = Math.round((new Date(String(c.end_date).slice(0, 10) + 'T00:00:00').getTime() - todayMid.getTime()) / 86400000)
      if (left >= 0 && left <= 30) alarms.push({ sev: 2, title: addr, sub: `${who} · договор заканчивается через ${left} дн.`, chip: 'срок' })
    }
  }
  alarms.sort((a, b) => a.sev - b.sev)

  const opens = analytics.filter(a => a.event === 'open')
  const screenEvents = analytics.filter(a => a.event === 'screen')
  const errorEvents = analytics.filter(a => a.event === 'error')
  const loginGroups = (() => {
    const g: Record<string, any> = {}
    for (const a of opens) {
      const key = a.user_id || a.phone || 'anon'
      if (!g[key]) g[key] = { name: a.user_name || '—', phone: a.phone || '', role: a.role || '—', items: [] as any[] }
      g[key].items.push(a)
    }
    return Object.entries(g).sort((x, y) => y[1].items.length - x[1].items.length)
  })()
  const screenAgg: Record<string, { sec: number; count: number; users: Set<string> }> = {}
  for (const s of screenEvents) {
    const k = s.screen || '—'
    if (!screenAgg[k]) screenAgg[k] = { sec: 0, count: 0, users: new Set() }
    screenAgg[k].sec += Number(s.meta?.duration_sec || 0)
    screenAgg[k].count++
    if (s.user_id) screenAgg[k].users.add(s.user_id)
  }
  const screenList = Object.entries(screenAgg).sort((a, b) => b[1].sec - a[1].sec)
  const errAgg: Record<string, number> = {}
  for (const e of errorEvents) {
    const k = `${e.screen || '—'} · ${String(e.meta?.message || '').slice(0, 60)}`
    errAgg[k] = (errAgg[k] || 0) + 1
  }
  const errList = Object.entries(errAgg).sort((a, b) => b[1] - a[1])
  const objAddress = (id: string) => objects.find(o => o.id === id)?.address || '—'
  const userName = (id: string) => {
    const u = users.find(x => x.id === id)
    return u ? `${u.full_name || ''} ${u.phone || ''}`.trim() : '—'
  }

  async function setFeedbackStatus(id: string, status: string) {
    await supabase.from('feedback').update({ status }).eq('id', id)
    showToast('✅ Готово')
    load()
  }

  async function deleteFeedback(id: string) {
    await supabase.from('feedback').delete().eq('id', id)
    showToast('Удалено')
    load()
  }

  async function addAccess() {
    const phone = newPhone.trim()
    if (!phone) { showToast('Введите номер'); return }
    const normalized = phone.startsWith('+') ? phone : '+' + phone
    const { error } = await supabase.from('access_control').insert({ phone: normalized, role: newRole })
    if (error) { showToast('Ошибка: ' + error.message); return }
    showToast('✅ Добавлено')
    setNewPhone('')
    load()
  }

  async function removeAccess(id: string) {
    const { error } = await supabase.from('access_control').delete().eq('id', id)
    if (error) { showToast('Ошибка: ' + error.message); return }
    showToast('Удалено')
    load()
  }

  async function insertSub(ownerId: string, until: string) {
    const base: any = { owner_id: ownerId, until_date: until }
    const { error } = await supabase.from('subscriptions').insert(base)
    if (error) {
      const retry = await supabase.from('subscriptions').insert({ ...base, plan: 'pro', status: 'active' })
      if (retry.error) { showToast('Ошибка: ' + retry.error.message); return false }
    }
    return true
  }

  async function grantPro() {
    const digits = norm10(proPhone)
    if (digits.length < 10) { showToast('Введите телефон полностью'); return }
    const u = users.find(x => norm10(x.phone || '') === digits)
    if (!u) { showToast('Пользователь с таким телефоном не найден'); return }
    const todayS = iso(now)
    const existing = subs.filter(s => s.owner_id === u.id).sort((a, b) => String(a.until_date).localeCompare(String(b.until_date))).pop()
    const base = existing && String(existing.until_date).slice(0, 10) > todayS ? new Date(String(existing.until_date).slice(0, 10) + 'T00:00:00') : now
    const until = proTerm === 'inf' ? '2099-12-31' : addMonthsISO(base, Number(proTerm))
    const ok = await insertSub(u.id, until)
    if (!ok) return
    showToast(`✅ Pro выдан: ${u.full_name || u.phone} · до ${isInf(until) ? 'бессрочно' : until}`)
    setProPhone('')
    load()
  }

  async function extendPro(s: any, months: number | 'inf') {
    const todayS = iso(now)
    const curS = String(s.until_date || '').slice(0, 10)
    const base = curS > todayS ? new Date(curS + 'T00:00:00') : now
    const until = months === 'inf' ? '2099-12-31' : addMonthsISO(base, months)
    const { error } = await supabase.from('subscriptions').update({ until_date: until }).eq('id', s.id)
    if (error) { showToast('Ошибка: ' + error.message); return }
    showToast(`✅ Срок обновлён: ${months === 'inf' ? 'бессрочно' : until}`)
    load()
  }

  async function saveProDate() {
    if (!proEdit) return
    const d = String(proEdit.date || '').slice(0, 10)
    if (!d) { showToast('Выберите дату'); return }
    const { error } = await supabase.from('subscriptions').update({ until_date: d }).eq('id', proEdit.id)
    if (error) { showToast('Ошибка: ' + error.message); return }
    showToast('✅ Дата исправлена: ' + d)
    setProEdit(null)
    load()
  }

  async function revokePro(id: string) {
    const { error } = await supabase.from('subscriptions').delete().eq('id', id)
    if (error) { showToast('Ошибка: ' + error.message); return }
    showToast('Подписка отозвана')
    load()
  }

  const subsSorted = subs.slice().sort((a, b) => String(b.until_date || '').localeCompare(String(a.until_date || '')))

  return (
    <div style={{ ...T.page, paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h1 style={{ ...T.h1, margin: 0 }}>Админка</h1>
        <button style={iosRed} onClick={() => { if (window.confirm('Выйти из админки?')) { ...текущее действие... } }}>Выйти</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 0' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              background: tab === t.id ? '#0071e3' : 'rgba(120,120,128,0.12)',
              color: tab === t.id ? '#fff' : '#1d1d1f',
            }}
          >{t.l}{t.id === 'feedback' && newFeedback > 0 ? ` · ${newFeedback}` : ''}{t.id === 'alarms' && alarms.length > 0 ? ` · ${alarms.length}` : ''}</button>
        ))}
      </div>

      {tab === 'alarms' && (
        <div style={T.card}>
          <div style={T.h2}>Тревоги</div>
          {alarms.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>Тревог нет — всё спокойно 🎉</div>}
          {alarms.map((a, i) => (
            <div key={i} style={i === alarms.length - 1 ? last : row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>{a.title}</div>
                <div style={muted}>{a.sub}</div>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 600, borderRadius: 8, padding: '4px 10px', flexShrink: 0,
                background: a.sev === 0 ? 'rgba(255,59,48,0.12)' : a.sev === 1 ? 'rgba(255,149,0,0.12)' : 'rgba(255,204,0,0.15)',
                color: a.sev === 0 ? '#ff3b30' : a.sev === 1 ? '#b25000' : '#8a6d00',
              }}>{a.chip}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'feedback' && (
        <div style={T.card}>
          <div style={T.h2}>Обращения</div>
          {feedbacks.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>Обращений нет.</div>}
          {feedbacks.map((f, i) => (
            <div key={f.id} style={i === feedbacks.length - 1 ? last : row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{f.sender_name} · {f.sender_phone}</div>
                <div style={{ fontSize: 14, margin: '4px 0', color: '#1d1d1f' }}>{f.message}</div>
                {f.image_url && <a href={f.image_url} target="_blank" rel="noopener" style={{ ...blue, padding: 0 }}>открыть вложение</a>}
                <div style={muted}>{fmtDate(f.created_at)} · {f.status === 'new' ? 'новое' : 'обработано'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                {f.status === 'new'
                  ? <button style={blue} onClick={() => setFeedbackStatus(f.id, 'done')}>обработано</button>
                  : <button style={blue} onClick={() => setFeedbackStatus(f.id, 'new')}>в новые</button>}
                <button style={red} onClick={() => setDelFeedback(f.id)}>удалить</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'errors' && (
        <div style={T.card}>
          <div style={T.h2}>Проблемные места (ошибки)</div>
          {errList.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>Ошибок не зафиксировано — хороший знак.</div>}
          {errList.map(([name, count], i) => (
            <div key={name} style={i === errList.length - 1 ? last : row}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: '#1d1d1f' }}>{name}</div>
              <span style={{ ...valMoney, color: '#ff3b30' }}>×{count}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div style={T.card}>
          <div style={T.h2}>Пользователи</div>
          <div style={{ ...T.tiny, margin: '0 0 10px' }}>
            «Удалить данные» — стирает личное (уведомления, аналитику, команды, подписку) и обезличивает профиль.
            История платежей и договоров остаётся — её требует налоговый учёт.
          </div>
          {users.map((u, i) => (
            <div key={u.id} style={i === users.length - 1 ? last : row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>{u.full_name || '—'}</div>
                <div style={muted}>{u.phone || 'без телефона'} · роль: {u.role || '—'} · с {new Date(u.created_at).toLocaleDateString('ru-RU')}</div>
              </div>
              <button style={red} onClick={() => setDelUser(u.id)}>удалить данные</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'pro' && (
        <>
          <div style={T.card}>
            <div style={T.h2}>Выдать Pro по телефону</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input value={proPhone} onChange={(e) => setProPhone(e.target.value)} placeholder="+7 900 000-00-00" style={inp} inputMode="tel" />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {([['1', '1 мес'], ['3', '3 мес'], ['6', '6 мес'], ['12', '12 мес'], ['inf', 'бессрочно']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setProTerm(v)} style={{
                  padding: '7px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: proTerm === v ? '#0071e3' : 'rgba(120,120,128,0.12)', color: proTerm === v ? '#fff' : '#1d1d1f',
                }}>{l}</button>
              ))}
            </div>
            <button onClick={grantPro} style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Выдать Pro</button>
            <div style={{ ...T.tiny, margin: '8px 0 0' }}>Если уже есть активная подписка — новый срок прибавится к её концу.</div>
          </div>
          <div style={T.card}>
            <div style={T.h2}>Подписки ({subsSorted.length})</div>
            {subsSorted.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>Подписок пока нет.</div>}
            {subsSorted.map((s, i) => {
              const owner = users.find(u => u.id === s.owner_id)
              const untilS = String(s.until_date || '').slice(0, 10)
              const expired = !isInf(untilS) && untilS < iso(now)
              return (
                <div key={s.id} style={i === subsSorted.length - 1 ? last : row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{owner?.full_name || '—'} · {owner?.phone || '—'}</div>
                    <div style={{ ...muted, color: expired ? '#ff3b30' : undefined }}>{isInf(untilS) ? 'бессрочно' : `до ${untilS}`}{expired ? ' · истекла' : ''}</div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                      <button style={blue} onClick={() => extendPro(s, 1)}>+1 мес</button>
                      <button style={blue} onClick={() => extendPro(s, 3)}>+3 мес</button>
                      <button style={blue} onClick={() => extendPro(s, 'inf')}>бессрочно</button>
                      <button style={blue} onClick={() => setProEdit({ id: s.id, date: untilS })}>дата</button>
                      <button style={red} onClick={() => setProRevoke(s.id)}>отозвать</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {tab === 'summary' && (
        <>
          <div style={secHead}>Люди</div>
          <div style={T.card}>
            <div style={row}><span style={muted}>Всего пользователей</span><span style={valMoney}>{users.length}</span></div>
            <div style={row}><span style={muted}>Арендодателей</span><span style={valMoney}>{users.filter(u => u.role === 'landlord').length}</span></div>
            <div style={row}><span style={muted}>Арендаторов</span><span style={valMoney}>{users.filter(u => u.role === 'tenant').length}</span></div>
            <div style={last}><span style={muted}>Активны за 7 дней</span><span style={valMoney}>{activeUsers}</span></div>
          </div>
          <div style={secHead}>Объекты и договоры</div>
          <div style={T.card}>
            <div style={row}><span style={muted}>Объектов</span><span style={valMoney}>{objects.length}</span></div>
            <div style={row}><span style={muted}>Без активного договора</span><span style={valMoney}>{noContract}</span></div>
            <div style={row}><span style={muted}>Активных договоров</span><span style={valMoney}>{activeContracts.length}</span></div>
            <div style={last}><span style={muted}>Средняя аренда</span><span style={valMoney}>{avgRent.toFixed(0)} ₽/мес</span></div>
          </div>
          <div style={secHead}>Деньги</div>
          <div style={T.card}>
            <div style={row}><span style={muted}>Собрано за всё время</span><span style={valMoney}>{sumAll.toFixed(0)} ₽</span></div>
            <div style={row}><span style={muted}>Собрано в этом месяце</span><span style={valMoney}>{sumThis.toFixed(0)} ₽</span></div>
            <div style={row}><span style={muted}>Собрано в прошлом месяце</span><span style={valMoney}>{sumPrev.toFixed(0)} ₽</span></div>
            <div style={row}><span style={muted}>Ожидает оплаты</span><span style={valMoney}>{openSum.toFixed(0)} ₽ · {open.length} сч.</span></div>
            <div style={row}><span style={muted}>Просрочено</span><span style={{ ...valMoney, color: overdue.length ? '#ff3b30' : '#1d1d1f' }}>{overdue.length} · {overdueSum.toFixed(0)} ₽</span></div>
            <div style={last}><span style={muted}>Депозиты: внесено / нужно</span><span style={valMoney}>{depPaid.toFixed(0)} / {depNeed.toFixed(0)} ₽</span></div>
          </div>
          <div style={secHead}>Активность</div>
          <div style={T.card}>
            <div style={row}><span style={muted}>Показаний в этом месяце</span><span style={valMoney}>{readings.length}</span></div>
            <div style={row}><span style={muted}>Встреч наличными согласовано</span><span style={valMoney}>{meetings.length}</span></div>
            <div style={last}><span style={muted}>Новых обращений</span><span style={{ ...valMoney, color: newFeedback ? '#ff3b30' : '#1d1d1f' }}>{newFeedback}</span></div>
          </div>
        </>
      )}

      {tab === 'objects' && (
        <div style={T.card}>
          <div style={T.h2}>Объекты</div>
          {objects.map((o, i) => {
            const c = activeContracts.find(x => x.object_id === o.id)
            return (
              <div key={o.id} style={i === objects.length - 1 ? last : row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>{o.address}</div>
                  <div style={muted}>{c ? `договор активен · ${userName(c.tenant_id)} · ${Number(c.rent_amount).toFixed(0)} ₽` : 'нет активного договора'}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'payments' && (
        <div style={T.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={T.h2}>Платежи</div>
            <button onClick={downloadTaxCsv} style={{ ...blue, flexShrink: 0 }}>CSV для налоговой</button>
          </div>
          {payments.slice(0, 50).map((p, i) => (
            <div key={p.id} style={i === Math.min(payments.length, 50) - 1 ? last : row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{objAddress(p.contract_id)} · {new Date(p.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</div>
                <div style={muted}>{p.confirmed_by_landlord ? `оплачен ${p.confirmed_at ? new Date(p.confirmed_at).toLocaleDateString('ru-RU') : ''}` : 'ожидает'} · штраф {Number(p.penalty_amount || 0).toFixed(0)} ₽</div>
              </div>
              <span style={valMoney}>{(Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0)).toFixed(0)} ₽</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'analytics' && (
        <>
          <div style={secHead}>Входы в приложение · по пользователям</div>
          <div style={T.card}>
            {loginGroups.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>Пока нет входов с аналитикой.</div>}
            {loginGroups.map(([key, g], i) => {
              const expanded = !!openLogins[key]
              const lastAt = g.items[0]?.created_at
              return (
                <div key={key} style={{ padding: '10px 0', borderBottom: i === loginGroups.length - 1 ? 'none' : '1px solid rgba(60,60,67,0.12)' }}>
                  <button
                    onClick={() => setOpenLogins({ ...openLogins, [key]: !expanded })}
                    style={{ display: 'flex', width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, textAlign: 'left', alignItems: 'center', gap: 8 }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>{g.name} · {g.phone}</div>
                      <div style={muted}>входов: {g.items.length} · последний: {lastAt ? fmtDate(lastAt) : '—'} · роль: {g.role}</div>
                    </div>
                    <span style={{ color: '#0071e3', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
                  </button>
                  {expanded && (
                    <div style={{ paddingTop: 6 }}>
                      {g.items.slice(0, 50).map((a: any) => (
                        <div key={a.id} style={{ padding: '6px 0 6px 12px', borderTop: '1px solid rgba(60,60,67,0.08)' }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: '#1d1d1f' }}>{fmtDate(a.created_at)}</div>
                          <div style={muted}>
                            {deviceLabel(a.meta)}
                            {a.meta?.tg_version ? ` · Telegram ${a.meta.tg_version}` : ''}
                            {a.meta?.lang ? ` · ${a.meta.lang}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div style={secHead}>Время на экранах</div>
          <div style={T.card}>
            {screenList.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>Пока нет данных о экранах.</div>}
            {screenList.map(([name, v], i) => (
              <div key={name} style={i === screenList.length - 1 ? last : row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>{name}</div>
                  <div style={muted}>посещений: {v.count} · пользователей: {v.users.size}</div>
                </div>
                <span style={valMoney}>{fmtDur(v.sec)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'events' && (
        <div style={T.card}>
          <div style={T.h2}>События</div>
          {events.map((e, i) => (
            <div key={e.id} style={i === events.length - 1 ? last : row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1d1d1f' }}>{(e as any).message || e.type}</div>
                <div style={muted}>{fmtDate(e.sent_at)} · {userName(e.user_id)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'control' && (
        <FamilyDetector />
      )}

      {tab === 'access' && (
        <div style={T.card}>
          <div style={T.h2}>Управление доступом</div>
          <div style={{ ...T.tiny, margin: '0 0 10px' }}>
            <b>tester</b> — видит переключатель «Арендатор / Арендодатель» и кнопку «Выйти».<br />
            <b>admin</b> — дополнительно видит кнопку «Админка».
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+7 900 000-00-00" style={inp} />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as any)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}>
              <option value="tester">tester</option>
              <option value="admin">admin</option>
            </select>
            <button style={blue} onClick={addAccess}>+</button>
          </div>
          {accessList.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>Список пуст.</div>}
          {accessList.map((a: any, i) => (
            <div key={a.id} style={i === accessList.length - 1 ? last : row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{a.phone}</div>
                <div style={muted}>{a.role}</div>
              </div>
              <button style={red} onClick={() => setDelAccess(a.id)}>удалить</button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDelete
        open={!!delFeedback}
        text="Обращение будет удалено безвозвратно. Действие нельзя отменить."
        onClose={() => setDelFeedback(null)}
        onConfirm={() => { if (delFeedback) deleteFeedback(delFeedback) }}
      />
      <ConfirmDelete
        open={!!delAccess}
        text="Номер потеряет права tester/admin. Действие нельзя отменить."
        onClose={() => setDelAccess(null)}
        onConfirm={() => { if (delAccess) removeAccess(delAccess) }}
      />
      <ConfirmDelete
        open={!!delUser}
        text="Личные данные пользователя будут удалены, профиль станет «Удалённый пользователь». История платежей и договоров останется (требование налогового учёта)."
        onClose={() => setDelUser(null)}
        onConfirm={() => { if (delUser) eraseUserData(delUser) }}
      />
      <ConfirmDelete
        open={!!proRevoke}
        text="Подписка будет отозвана немедленно. Пользователь потеряет Pro-доступ."
        onClose={() => setProRevoke(null)}
        onConfirm={() => { if (proRevoke) revokePro(proRevoke) }}
      />
      <Modal open={!!proEdit} title="Исправить дату окончания" onClose={() => setProEdit(null)}>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 10 }}>Новая дата окончания (ГГГГ-ММ-ДД). Для «бессрочно» используйте 2099-12-31.</div>
        <input type="date" value={proEdit?.date || ''} onChange={(e) => setProEdit(proEdit ? { ...proEdit, date: e.target.value } : null)} style={{ ...inp, marginBottom: 14 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }} onClick={saveProDate}>Сохранить</button>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => setProEdit(null)}>Отмена</button>
        </div>
      </Modal>
    </div>
  )
}

export default AdminDashboard
