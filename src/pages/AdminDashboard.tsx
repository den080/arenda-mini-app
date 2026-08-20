import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../theme'
import { showToast } from '../components/ui'

const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
const iosRed: React.CSSProperties = { border: 'none', background: 'transparent', color: '#ff3b30', fontSize: 15, cursor: 'pointer', padding: 4, flexShrink: 0 }
const iosMuted: React.CSSProperties = { color: '#8e8e93', fontSize: 14 }
const secHead: React.CSSProperties = { fontSize: 13, color: '#8e8e93', margin: '14px 16px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }
const hair = { height: 1, background: 'rgba(60,60,67,0.12)' } as React.CSSProperties

const TABS = [
  { id: 'summary', l: 'Сводка' },
  { id: 'users', l: 'Пользователи' },
  { id: 'objects', l: 'Объекты' },
  { id: 'payments', l: 'Платежи' },
  { id: 'events', l: 'События' },
  { id: 'feedback', l: 'Обращения' },
]

function fmtDate(d: any): string {
  return d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
}
function fmtDT(d: any): string {
  return d ? new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
}
function paySum(p: any): number {
  return Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0)
}

export function AdminDashboard() {
  const [tab, setTab] = useState('summary')
  const [users, setUsers] = useState<any[]>([])
  const [objects, setObjects] = useState<any[]>([])
  const [contracts, setContracts] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [feedback, setFeedback] = useState<any[]>([])
  const [frozen, setFrozen] = useState<any[]>([])
  const [meetings, setMeetings] = useState<any[]>([])
  const [readingsMonth, setReadingsMonth] = useState(0)
  const [teamByUser, setTeamByUser] = useState<Record<string, string>>({})
  const [openUser, setOpenUser] = useState<string | null>(null)
  const [view, setView] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  async function load() {
    const now = new Date()
    const [u, o, c, p, ev, fb, tm, fz, mt, rd] = await Promise.all([
      supabase.from('users').select('*').order('created_at', { ascending: false }),
      supabase.from('objects').select('id, address, landlord_id'),
      supabase.from('contracts').select('id, object_id, tenant_id, status, rent_amount, deposit_amount, deposit_paid'),
      supabase.from('payments').select('id, period, due_date, base_amount, penalty_amount, utilities_amount, confirmed_by_landlord, confirmed_at, card_claimed, contract:contracts(tenant_id, object_id, object:objects(address))').order('period', { ascending: false }).limit(500),
      supabase.from('notifications_log').select('*, user:users(full_name, phone)').order('sent_at', { ascending: false }).limit(100),
      supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('team_members').select('user_id, role'),
      supabase.from('frozen_penalties').select('amount'),
      supabase.from('cash_meetings').select('status').eq('kind', 'meeting'),
      supabase.from('meter_readings').select('id', { count: 'exact', head: true })
        .gte('submitted_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString())
        .lt('submitted_at', new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()),
    ])
    setUsers(u.data || [])
    setObjects(o.data || [])
    setContracts(c.data || [])
    setPayments(p.data || [])
    setEvents(ev.data || [])
    setFeedback(fb.data || [])
    setFrozen(fz.data || [])
    setMeetings(mt.data || [])
    setReadingsMonth(rd.count || 0)
    const map: Record<string, string> = {}
    for (const m of tm.data || []) map[m.user_id] = m.role
    setTeamByUser(map)
    setReady(true)
  }

  useEffect(() => { load() }, [])

  const now = new Date()
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekAgo = new Date(todayMid.getTime() - 7 * 86400000)
  const userName = (id: string) => users.find(u => u.id === id)?.full_name || '—'

  const confirmed = payments.filter(p => p.confirmed_by_landlord)
  const collected = confirmed.reduce((s, p) => s + paySum(p), 0)
  const inMonth = (d: any, shift = 0) => {
    if (!d) return false
    const x = new Date(d)
    const m = new Date(now.getFullYear(), now.getMonth() + shift, 1)
    return x.getMonth() === m.getMonth() && x.getFullYear() === m.getFullYear()
  }
  const collectedMonth = confirmed.filter(p => inMonth(p.confirmed_at)).reduce((s, p) => s + paySum(p), 0)
  const collectedPrev = confirmed.filter(p => inMonth(p.confirmed_at, -1)).reduce((s, p) => s + paySum(p), 0)
  const open = payments.filter(p => !p.confirmed_by_landlord)
  const openSum = open.reduce((s, p) => s + paySum(p), 0)
  const overdue = open.filter(p => new Date(p.due_date) < todayMid)
  const activeContracts = contracts.filter(c => c.status === 'active')
  const tenants = users.filter(u => u.role === 'tenant')
  const landlords = users.filter(u => u.role !== 'tenant')
  const newUsersMonth = users.filter(u => inMonth(u.created_at)).length
  const active7d = users.filter(u => u.last_seen && new Date(u.last_seen) >= weekAgo).length
  const objectsNoContract = objects.filter(o => !activeContracts.some(c => c.object_id === o.id)).length
  const avgRent = activeContracts.length ? activeContracts.reduce((s, c) => s + Number(c.rent_amount || 0), 0) / activeContracts.length : 0
  const frozenTotal = frozen.reduce((s, f) => s + Number(f.amount || 0), 0)
  const depositTotal = contracts.reduce((s, c) => s + Number(c.deposit_amount || 0), 0)
  const depositPaid = contracts.reduce((s, c) => s + Number(c.deposit_paid || 0), 0)
  const meetingsConfirmed = meetings.filter(m => m.status === 'confirmed').length
  const newFb = feedback.filter(f => f.status === 'new').length

  const pendingPays = open.filter(p => new Date(p.due_date) >= todayMid)
  const paidPays = confirmed.slice().sort((a, b) => String(b.confirmed_at || '').localeCompare(String(a.confirmed_at || '')))

  async function setFbStatus(id: string, status: string) {
    await supabase.from('feedback').update({ status }).eq('id', id)
    showToast(status === 'done' ? '✅ Обработано' : 'Возвращено в новые')
    load()
  }
  async function removeFb(id: string) {
    await supabase.from('feedback').delete().eq('id', id)
    showToast('Удалено')
    load()
  }

  if (!ready) return <div style={T.page}>Загрузка…</div>

  return (
    <div style={{ ...T.page, paddingBottom: 40 }}>
      <h1 style={T.h1}>Админка</h1>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 16px 10px' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
              background: tab === t.id ? '#0071e3' : 'rgba(120,120,128,0.12)',
              color: tab === t.id ? '#fff' : '#1d1d1f',
            }}
          >{t.l}{t.id === 'feedback' && newFb > 0 ? ` · ${newFb}` : ''}</button>
        ))}
      </div>

      {tab === 'summary' && (
        <>
          <div style={secHead}>Люди</div>
          <div style={T.card}>
            <div style={T.row}><span style={iosMuted}>Всего пользователей</span><b>{users.length}</b></div>
            <div style={T.row}><span style={iosMuted}>Арендаторы / арендодатели</span><b>{tenants.length} / {landlords.length}</b></div>
            <div style={T.row}><span style={iosMuted}>Новых в этом месяце</span><b>{newUsersMonth}</b></div>
            <div style={{ ...T.row, borderBottom: 'none' }}><span style={iosMuted}>Активны за 7 дней</span><b>{active7d}</b></div>
          </div>

          <div style={secHead}>Объекты и договоры</div>
          <div style={T.card}>
            <div style={T.row}><span style={iosMuted}>Объектов</span><b>{objects.length}</b></div>
            <div style={T.row}><span style={iosMuted}>Без активного договора</span><b>{objectsNoContract}</b></div>
            <div style={T.row}><span style={iosMuted}>Активных договоров</span><b>{activeContracts.length}</b></div>
            <div style={{ ...T.row, borderBottom: 'none' }}><span style={iosMuted}>Средняя аренда</span><b>{avgRent.toFixed(0)} ₽/мес</b></div>
          </div>

          <div style={secHead}>Деньги</div>
          <div style={T.card}>
            <div style={T.row}><span style={iosMuted}>Собрано за всё время</span><b>{collected.toFixed(0)} ₽</b></div>
            <div style={T.row}><span style={iosMuted}>Собрано в этом месяце</span><b>{collectedMonth.toFixed(0)} ₽</b></div>
            <div style={T.row}><span style={iosMuted}>Собрано в прошлом месяце</span><b>{collectedPrev.toFixed(0)} ₽</b></div>
            <div style={T.row}><span style={iosMuted}>Ожидает оплаты</span><b>{openSum.toFixed(0)} ₽ · {open.length} сч.</b></div>
            <div style={T.row}><span style={iosMuted}>Просрочено</span><b style={{ color: overdue.length ? '#ff3b30' : '#1d1d1f' }}>{overdue.length} · {overdue.reduce((s, p) => s + paySum(p), 0).toFixed(0)} ₽</b></div>
            <div style={T.row}><span style={iosMuted}>Замороженные штрафы</span><b>{frozenTotal.toFixed(0)} ₽</b></div>
            <div style={{ ...T.row, borderBottom: 'none' }}><span style={iosMuted}>Депозиты: внесено / нужно</span><b>{depositPaid.toFixed(0)} / {depositTotal.toFixed(0)} ₽</b></div>
          </div>

          <div style={secHead}>Активность</div>
          <div style={T.card}>
            <div style={T.row}><span style={iosMuted}>Показаний в этом месяце</span><b>{readingsMonth}</b></div>
            <div style={T.row}><span style={iosMuted}>Встреч наличными согласовано</span><b>{meetingsConfirmed}</b></div>
            <div style={{ ...T.row, borderBottom: 'none' }}><span style={iosMuted}>Новых обращений</span><b style={{ color: newFb ? '#ff3b30' : '#1d1d1f' }}>{newFb}</b></div>
          </div>
        </>
      )}

      {tab === 'users' && (
        <>
          <div style={secHead}>Пользователи · {users.length}</div>
          <div style={T.card}>
            {users.map((u, i) => {
              const myContracts = contracts.filter(c => c.tenant_id === u.id)
              const myObjects = objects.filter(o => o.landlord_id === u.id)
              const paidSum = payments.filter(p => (p as any).contract?.tenant_id === u.id && p.confirmed_by_landlord).reduce((s, p) => s + paySum(p), 0)
              const openU = openUser === u.id
              return (
                <div key={u.id}>
                  {i > 0 && <div style={hair} />}
                  <button
                    onClick={() => setOpenUser(openU ? null : u.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 0', textAlign: 'left', boxSizing: 'border-box' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{u.full_name || '—'}</div>
                      <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>
                        {u.phone || 'без телефона'} · {u.role === 'tenant' ? 'арендатор' : 'арендодатель'}{teamByUser[u.id] ? ` · ${teamByUser[u.id] === 'owner' ? 'владелец пула' : teamByUser[u.id] === 'manager' ? 'менеджер' : 'наблюдатель'}` : ''}
                      </div>
                    </div>
                    <span style={{ color: '#c7c7cc', fontSize: 18 }}>{openU ? '▾' : '›'}</span>
                  </button>
                  {openU && (
                    <div style={{ padding: '0 0 10px' }}>
                      <div style={{ fontSize: 13, color: '#8e8e93' }}>Telegram ID: {u.telegram_id || '—'}</div>
                      <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>Регистрация: {fmtDate(u.created_at)} · последний вход: {fmtDT(u.last_seen)}</div>
                      {myObjects.length > 0 && <div style={{ fontSize: 14, marginTop: 6 }}>Объекты ({myObjects.length}): {myObjects.map(o => o.address).join('; ')}</div>}
                      {myContracts.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          {myContracts.map(c => {
                            const obj = objects.find(o => o.id === c.object_id)
                            return <div key={c.id} style={{ fontSize: 14 }}>Аренда: {obj?.address || '—'} · {Number(c.rent_amount).toFixed(0)} ₽/мес · {c.status}</div>
                          })}
                          <div style={{ fontSize: 14, marginTop: 4 }}>Оплачено за всё время: <b>{paidSum.toFixed(0)} ₽</b></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {tab === 'objects' && (
        <>
          <div style={secHead}>Объекты · {objects.length}</div>
          <div style={T.card}>
            {objects.map((o, i) => {
              const con = activeContracts.find(c => c.object_id === o.id)
              const tenant = con ? userName(con.tenant_id) : null
              const curPay = payments.find(p => (p as any).contract?.object_id === o.id && !p.confirmed_by_landlord)
              const lastPaid = paidPays.find(p => (p as any).contract?.object_id === o.id)
              return (
                <div key={o.id}>
                  {i > 0 && <div style={hair} />}
                  <div style={{ padding: '10px 0' }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{o.address}</div>
                    <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>
                      Владелец: {userName(o.landlord_id)}{tenant ? ` · арендатор: ${tenant}` : ' · нет активного договора'}
                    </div>
                    {con && (
                      <div style={{ fontSize: 14, marginTop: 4 }}>
                        {Number(con.rent_amount).toFixed(0)} ₽/мес · депозит {Number(con.deposit_paid || 0).toFixed(0)}/{Number(con.deposit_amount || 0).toFixed(0)}
                      </div>
                    )}
                    <div style={{ fontSize: 13, marginTop: 2, color: curPay ? (new Date(curPay.due_date) < todayMid ? '#ff3b30' : '#b25000') : '#1e7e34' }}>
                      {curPay
                        ? (new Date(curPay.due_date) < todayMid ? `просрочен до ${fmtDate(curPay.due_date)} · ${paySum(curPay).toFixed(0)} ₽` : `ожидает до ${fmtDate(curPay.due_date)} · ${paySum(curPay).toFixed(0)} ₽`)
                        : lastPaid ? `последний платёж ${fmtDate(lastPaid.confirmed_at)}` : 'платежей нет'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {tab === 'payments' && (
        <>
          <div style={secHead}>Просрочены · {overdue.length}</div>
          <div style={T.card}>
            {overdue.length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Просроченных нет.</div>}
            {overdue.map((p, i) => (
              <div key={p.id}>
                {i > 0 && <div style={hair} />}
                <PayRow p={p} tone="#ff3b30" />
              </div>
            ))}
          </div>

          <div style={secHead}>Ожидают оплаты · {pendingPays.length}</div>
          <div style={T.card}>
            {pendingPays.length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Ожидающих нет.</div>}
            {pendingPays.map((p, i) => (
              <div key={p.id}>
                {i > 0 && <div style={hair} />}
                <PayRow p={p} tone="#b25000" />
              </div>
            ))}
          </div>

          <div style={secHead}>Оплаченные · {paidPays.length}</div>
          <div style={T.card}>
            {paidPays.slice(0, 100).map((p, i) => (
              <div key={p.id}>
                {i > 0 && <div style={hair} />}
                <PayRow p={p} tone="#1e7e34" />
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'events' && (
        <>
          <div style={secHead}>Последние события · {events.length}</div>
          <div style={T.card}>
            {events.length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Событий пока нет.</div>}
            {events.map((e, i) => (
              <div key={e.id}>
                {i > 0 && <div style={hair} />}
                <div style={{ padding: '8px 0' }}>
                  <div style={{ fontSize: 14 }}>{(e as any).message || e.type}</div>
                  <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 2 }}>{(e as any).user?.full_name || ''} {(e as any).user?.phone || ''} · {fmtDT(e.sent_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'feedback' && (
        <>
          <div style={secHead}>Обращения · {feedback.length}</div>
          <div style={T.card}>
            {feedback.length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Обращений пока нет.</div>}
            {feedback.map((r, i) => (
              <div key={r.id}>
                {i > 0 && <div style={hair} />}
                <div style={{ padding: '10px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{r.sender_name || '—'}</div>
                      <div style={{ fontSize: 13, color: '#8e8e93' }}>{r.sender_phone || ''} · {fmtDT(r.created_at)}</div>
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, flexShrink: 0,
                      background: r.status === 'new' ? 'rgba(255,59,48,0.15)' : 'rgba(52,199,89,0.15)',
                      color: r.status === 'new' ? '#c00' : '#1e7e34',
                    }}>{r.status === 'new' ? 'новое' : 'обработано'}</span>
                  </div>
                  <div style={{ fontSize: 15, margin: '6px 0', whiteSpace: 'pre-wrap' }}>{r.message}</div>
                  {r.image_url && (
                    <img src={r.image_url} alt="" onClick={() => setView(r.image_url)} style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 10, cursor: 'pointer', marginBottom: 6 }} />
                  )}
                  <div style={{ display: 'flex', gap: 16 }}>
                    {r.status === 'new'
                      ? <button style={iosBlue} onClick={() => setFbStatus(r.id, 'done')}>Обработано</button>
                      : <button style={iosBlue} onClick={() => setFbStatus(r.id, 'new')}>Вернуть</button>}
                    <button style={iosRed} onClick={() => removeFb(r.id)}>удалить</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {view && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setView(null)}>
          <img src={view} alt="" style={{ maxWidth: '100%', maxHeight: '90%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}

function PayRow({ p, tone }: { p: any; tone: string }) {
  const late = !p.confirmed_by_landlord && new Date(p.due_date) < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14, flex: 1, minWidth: 0 }}>{p.contract?.object?.address || '—'} · {new Date(p.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span>
        <b style={{ whiteSpace: 'nowrap' }}>{paySum(p).toFixed(0)} ₽</b>
      </div>
      <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 2 }}>
        аренда {Number(p.base_amount || 0).toFixed(0)}{Number(p.penalty_amount || 0) > 0 ? ` + штраф ${Number(p.penalty_amount).toFixed(0)}` : ''}{Number(p.utilities_amount || 0) > 0 ? ` + ресурсы ${Number(p.utilities_amount).toFixed(0)}` : ''}
      </div>
      <div style={{ fontSize: 12, color: tone, marginTop: 2 }}>
        {p.confirmed_by_landlord ? `оплачен ${fmtDate(p.confirmed_at)}` : late ? `просрочен (до ${fmtDate(p.due_date)})` : `ожидает (до ${fmtDate(p.due_date)})`}
      </div>
    </div>
  )
}

export default AdminDashboard
