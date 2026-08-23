import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../theme'
import { showToast, SkeletonList, PullToRefresh } from '../components/ui'
import FamilyDetector from '../components/FamilyDetector'
import AdminAlarms from '../components/AdminAlarms'

const TABS = [
  { id: 'summary', l: 'Сводка' },
  { id: 'analytics', l: 'Аналитика' },
  { id: 'users', l: 'Пользователи' },
  { id: 'objects', l: 'Объекты' },
  { id: 'payments', l: 'Платежи' },
  { id: 'events', l: 'События' },
  { id: 'feedback', l: 'Обращения' },
  { id: 'control', l: 'Контроль' },
  { id: 'access', l: 'Доступ' },
]

const muted: React.CSSProperties = { color: '#8e8e93', fontSize: 14 }
const valMoney: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: '#1d1d1f', whiteSpace: 'nowrap' }
const secHead: React.CSSProperties = { fontSize: 13, color: '#8e8e93', margin: '14px 16px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }
const blue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
const red: React.CSSProperties = { border: 'none', background: 'transparent', color: '#ff3b30', fontSize: 14, cursor: 'pointer', padding: 4, flexShrink: 0 }
const hair = { height: 1, background: 'rgba(60,60,67,0.12)' } as React.CSSProperties
const inp: React.CSSProperties = { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'rgba(120,120,128,0.08)', borderRadius: 8, padding: '9px 10px', fontSize: 14, color: '#1d1d1f', boxSizing: 'border-box' }

function Row({ label, value, color, lastRow }: { label: string; value: React.ReactNode; color?: string; lastRow?: boolean }) {
  return (
    <div style={{ ...T.row, ...(lastRow ? { borderBottom: 'none' } : {}) }}>
      <span style={muted}>{label}</span>
      <span style={{ ...valMoney, color: color || '#1d1d1f' }}>{value}</span>
    </div>
  )
}

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

export function AdminDashboard() {
  const [tab, setTab] = useState('summary')
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
  const [openLogins, setOpenLogins] = useState<Record<string, boolean>>({})
  const [newPhone, setNewPhone] = useState('')
  const [newRole, setNewRole] = useState<'tester' | 'admin'>('tester')
  const [loading, setLoading] = useState(true)

  async function load() {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const [u, o, c, p, r, m, f, e, a, ac] = await Promise.all([
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
    setLoading(false)
  }

  useEffect(() => {
    load()
    const t = setInterval(() => load(), 60000)
    return () => clearInterval(t)
  }, [])

  if (loading) return (
    <div style={T.page}>
      <h1 style={T.h1}>Админка</h1>
      <SkeletonList count={4} />
    </div>
  )

  const activeContracts = contracts.filter(c => c.status === 'active')
  const objWithContract = new Set(activeContracts.map(c => c.object_id))
  const noContract = objects.filter(o => !objWithContract.has(o.id)).length
  const avgRent = activeContracts.length ? activeContracts.reduce((s, c) => s + Number(c.rent_amount || 0), 0) / activeContracts.length : 0
  const confirmed = payments.filter(p => p.confirmed_by_landlord)
  const sumAll = confirmed.reduce((s, p) => s + Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0), 0)
  const now = new Date()
  const inMonth = (d: string, shift: number) => {
    const dt = new Date(d)
    return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth() + shift
  }
  const sumThis = confirmed.filter(p => p.confirmed_at && inMonth(p.confirmed_at, 0)).reduce((s, p) => s + Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0), 0)
  const sumPrev = confirmed.filter(p => p.confirmed_at && inMonth(p.confirmed_at, -1)).reduce((s, p) => s + Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0), 0)
  const open = payments.filter(p => !p.confirmed_by_landlord)
  const openSum = open.reduce((s, p) => s + Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0), 0)
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const overdue = open.filter(p => new Date(p.due_date) < todayMid)
  const overdueSum = overdue.reduce((s, p) => s + Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0), 0)
  const depPaid = activeContracts.reduce((s, c) => s + Number(c.deposit_paid || 0), 0)
  const depNeed = activeContracts.reduce((s, c) => s + Number(c.deposit_amount || 0), 0)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const activeUsers = users.filter(u => u.last_seen_at && u.last_seen_at >= weekAgo).length
  const newFeedback = feedbacks.filter(f => f.status === 'new').length
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

  return (
    <PullToRefresh onRefresh={async () => { await load(); showToast('✅ Обновлено') }}>
      <div style={{ ...T.page, paddingBottom: 60 }}>
        <h1 style={T.h1}>Админка</h1>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 0 10px' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flexShrink: 0, border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                background: tab === t.id ? '#0071e3' : 'rgba(120,120,128,0.12)',
                color: tab === t.id ? '#fff' : '#1d1d1f',
              }}
            >{t.l}{t.id === 'feedback' && newFeedback > 0 ? ` · ${newFeedback}` : ''}</button>
          ))}
        </div>

        {tab === 'summary' && (
          <>
            <AdminAlarms />
            <div style={secHead}>Люди</div>
            <div style={T.card}>
              <Row label="Всего пользователей" value={users.length} />
              <Row label="Арендодателей" value={users.filter(u => u.role === 'landlord').length} />
              <Row label="Арендаторов" value={users.filter(u => u.role === 'tenant').length} />
              <Row label="Активны за 7 дней" value={activeUsers} lastRow />
            </div>
            <div style={secHead}>Объекты и договоры</div>
            <div style={T.card}>
              <Row label="Объектов" value={objects.length} />
              <Row label="Без активного договора" value={noContract} />
              <Row label="Активных договоров" value={activeContracts.length} />
              <Row label="Средняя аренда" value={`${avgRent.toFixed(0)} ₽/мес`} lastRow />
            </div>
            <div style={secHead}>Деньги</div>
            <div style={T.card}>
              <Row label="Собрано за всё время" value={`${sumAll.toFixed(0)} ₽`} />
              <Row label="Собрано в этом месяце" value={`${sumThis.toFixed(0)} ₽`} />
              <Row label="Собрано в прошлом месяце" value={`${sumPrev.toFixed(0)} ₽`} />
              <Row label="Ожидает оплаты" value={`${openSum.toFixed(0)} ₽ · ${open.length} сч.`} />
              <Row label="Просрочено" value={`${overdue.length} · ${overdueSum.toFixed(0)} ₽`} color={overdue.length ? '#ff3b30' : undefined} />
              <Row label="Депозиты: внесено / нужно" value={`${depPaid.toFixed(0)} / ${depNeed.toFixed(0)} ₽`} lastRow />
            </div>
            <div style={secHead}>Активность</div>
            <div style={T.card}>
              <Row label="Показаний в этом месяце" value={readings.length} />
              <Row label="Встреч наличными согласовано" value={meetings.length} />
              <Row label="Новых обращений" value={newFeedback} color={newFeedback ? '#ff3b30' : undefined} lastRow />
            </div>
          </>
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
                <div key={name} style={{ ...T.row, ...(i === screenList.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>{name}</div>
                    <div style={muted}>посещений: {v.count} · пользователей: {v.users.size}</div>
                  </div>
                  <span style={valMoney}>{fmtDur(v.sec)}</span>
                </div>
              ))}
            </div>
            <div style={secHead}>Проблемные места (ошибки)</div>
            <div style={T.card}>
              {errList.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>Ошибок не зафиксировано — хороший знак.</div>}
              {errList.map(([name, count], i) => (
                <div key={name} style={{ ...T.row, ...(i === errList.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: '#1d1d1f' }}>{name}</div>
                  <span style={{ ...valMoney, color: '#ff3b30' }}>×{count}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'users' && (
          <div style={T.card}>
            <div style={T.h2}>Пользователи</div>
            {users.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>Пока пусто.</div>}
            {users.map((u, i) => (
              <div key={u.id} style={{ ...T.row, ...(i === users.length - 1 ? { borderBottom: 'none' } : {}) }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>{u.full_name || '—'}</div>
                  <div style={muted}>{u.phone || 'без телефона'} · роль: {u.role || '—'} · с {new Date(u.created_at).toLocaleDateString('ru-RU')}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'objects' && (
          <div style={T.card}>
            <div style={T.h2}>Объекты</div>
            {objects.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>Пока пусто.</div>}
            {objects.map((o, i) => {
              const c = activeContracts.find(x => x.object_id === o.id)
              return (
                <div key={o.id} style={{ ...T.row, ...(i === objects.length - 1 ? { borderBottom: 'none' } : {}) }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>{o.address}</div>
                    <div style={muted}>
                      {c ? `договор активен · ${userName(c.tenant_id)} · ${Number(c.rent_amount).toFixed(0)} ₽` : 'нет активного договора'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'payments' && (
          <div style={T.card}>
            <div style={T.h2}>Платежи</div>
            {payments.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>Пока пусто.</div>}
            {payments.slice(0, 50).map((p, i) => (
              <div key={p.id} style={{ ...T.row, ...(i === Math.min(payments.length, 50) - 1 ? { borderBottom: 'none' } : {}) }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{objAddress(p.contract_id)} · {new Date(p.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</div>
                  <div style={muted}>{p.confirmed_by_landlord ? `оплачен ${p.confirmed_at ? new Date(p.confirmed_at).toLocaleDateString('ru-RU') : ''}` : 'ожидает'} · штраф {Number(p.penalty_amount || 0).toFixed(0)} ₽</div>
                </div>
                <span style={valMoney}>{(Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0)).toFixed(0)} ₽</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'events' && (
          <div style={T.card}>
            <div style={T.h2}>События</div>
            {events.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>Пока пусто.</div>}
            {events.map((e, i) => (
              <div key={e.id} style={{ ...T.row, ...(i === events.length - 1 ? { borderBottom: 'none' } : {}) }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: '#1d1d1f' }}>{(e as any).message || e.type}</div>
                  <div style={muted}>{fmtDate(e.sent_at)} · {userName(e.user_id)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'feedback' && (
          <div style={T.card}>
            <div style={T.h2}>Обращения</div>
            {feedbacks.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>Обращений нет.</div>}
            {feedbacks.map((f, i) => (
              <div key={f.id} style={{ padding: '10px 0', borderBottom: i === feedbacks.length - 1 ? 'none' : '1px solid rgba(60,60,67,0.12)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{f.sender_name} · {f.sender_phone}</div>
                  <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                    {f.status === 'new'
                      ? <button style={blue} onClick={() => setFeedbackStatus(f.id, 'done')}>обработано</button>
                      : <button style={blue} onClick={() => setFeedbackStatus(f.id, 'new')}>в новые</button>}
                    <button style={red} onClick={() => deleteFeedback(f.id)}>удалить</button>
                  </div>
                </div>
                <div style={{ fontSize: 14, margin: '4px 0', color: '#1d1d1f' }}>{f.message}</div>
                {f.image_url && <button style={{ ...blue, padding: 0 }} onClick={() => { const tg = (window as any).Telegram?.WebApp; if (tg && tg.openLink) tg.openLink(f.image_url); else window.open(f.image_url, '_blank') }}>открыть вложение</button>}
                <div style={muted}>{fmtDate(f.created_at)} · {f.status === 'new' ? 'новое' : 'обработано'}</div>
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+7 900 000-00-00"
                style={inp}
                inputMode="tel"
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as any)}
                style={{ border: 'none', background: 'rgba(120,120,128,0.08)', borderRadius: 8, padding: '9px 10px', fontSize: 14, color: '#0071e3', outline: 'none', boxSizing: 'border-box' }}
              >
                <option value="tester">tester</option>
                <option value="admin">admin</option>
              </select>
              <button style={blue} onClick={addAccess}>+</button>
            </div>
            {accessList.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>Список пуст.</div>}
            {accessList.map((a: any, i) => (
              <div key={a.id} style={{ ...T.row, ...(i === accessList.length - 1 ? { borderBottom: 'none' } : {}) }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{a.phone}</div>
                  <div style={muted}>{a.role}</div>
                </div>
                <button style={red} onClick={() => removeAccess(a.id)}>удалить</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PullToRefresh>
  )
}

export default AdminDashboard
