import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../theme'
import { showToast } from '../components/ui'

const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
const iosRed: React.CSSProperties = { border: 'none', background: 'transparent', color: '#ff3b30', fontSize: 15, cursor: 'pointer', padding: 4, flexShrink: 0 }
const iosMuted: React.CSSProperties = { color: '#8e8e93', fontSize: 14 }
const secHead: React.CSSProperties = { fontSize: 13, color: '#8e8e93', margin: '14px 16px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }
const hair = { height: 1, background: 'rgba(60,60,67,0.12)' } as React.CSSProperties

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
  const [users, setUsers] = useState<any[]>([])
  const [objects, setObjects] = useState<any[]>([])
  const [contracts, setContracts] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [feedback, setFeedback] = useState<any[]>([])
  const [teamByUser, setTeamByUser] = useState<Record<string, string>>({})
  const [openUser, setOpenUser] = useState<string | null>(null)
  const [view, setView] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  async function load() {
    const [u, o, c, p, ev, fb, tm] = await Promise.all([
      supabase.from('users').select('*').order('created_at', { ascending: false }),
      supabase.from('objects').select('id, address, landlord_id'),
      supabase.from('contracts').select('id, object_id, tenant_id, status, rent_amount'),
      supabase.from('payments').select('id, period, due_date, base_amount, penalty_amount, utilities_amount, confirmed_by_landlord, confirmed_at, card_claimed, contract:contracts(tenant_id, object:objects(address))').order('period', { ascending: false }).limit(300),
      supabase.from('notifications_log').select('*, user:users(full_name, phone)').order('sent_at', { ascending: false }).limit(60),
      supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('team_members').select('user_id, role'),
    ])
    setUsers(u.data || [])
    setObjects(o.data || [])
    setContracts(c.data || [])
    setPayments(p.data || [])
    setEvents(ev.data || [])
    setFeedback(fb.data || [])
    const map: Record<string, string> = {}
    for (const m of tm.data || []) map[m.user_id] = m.role
    setTeamByUser(map)
    setReady(true)
  }

  useEffect(() => { load() }, [])

  const now = new Date()
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const confirmed = payments.filter(p => p.confirmed_by_landlord)
  const collected = confirmed.reduce((s, p) => s + paySum(p), 0)
  const collectedMonth = confirmed
    .filter(p => p.confirmed_at && new Date(p.confirmed_at).getMonth() === now.getMonth() && new Date(p.confirmed_at).getFullYear() === now.getFullYear())
    .reduce((s, p) => s + paySum(p), 0)
  const open = payments.filter(p => !p.confirmed_by_landlord)
  const openSum = open.reduce((s, p) => s + paySum(p), 0)
  const overdue = open.filter(p => new Date(p.due_date) < todayMid)
  const activeContracts = contracts.filter(c => c.status === 'active')
  const tenants = users.filter(u => u.role === 'tenant')
  const landlords = users.filter(u => u.role !== 'tenant')

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

      <div style={secHead}>Сводка</div>
      <div style={T.card}>
        <div style={T.row}><span style={iosMuted}>Пользователей</span><b>{users.length} <span style={{ fontWeight: 400, color: '#8e8e93' }}>(аренд. {tenants.length} / арендод. {landlords.length})</span></b></div>
        <div style={T.row}><span style={iosMuted}>Объектов / активных договоров</span><b>{objects.length} / {activeContracts.length}</b></div>
        <div style={T.row}><span style={iosMuted}>Собрано за всё время</span><b>{collected.toFixed(0)} ₽</b></div>
        <div style={T.row}><span style={iosMuted}>Собрано в этом месяце</span><b>{collectedMonth.toFixed(0)} ₽</b></div>
        <div style={T.row}><span style={iosMuted}>Ожидает оплаты</span><b>{openSum.toFixed(0)} ₽ <span style={{ fontWeight: 400, color: '#8e8e93' }}>({open.length} сч.)</span></b></div>
        <div style={{ ...T.row, borderBottom: 'none' }}>
          <span style={iosMuted}>Просрочено</span>
          <b style={{ color: overdue.length ? '#ff3b30' : '#1d1d1f' }}>{overdue.length} · {overdue.reduce((s, p) => s + paySum(p), 0).toFixed(0)} ₽</b>
        </div>
      </div>

      <div style={secHead}>События</div>
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

      <div style={secHead}>Пользователи</div>
      <div style={T.card}>
        {users.map((u, i) => {
          const myContracts = contracts.filter(c => c.tenant_id === u.id)
          const myObjects = objects.filter(o => o.landlord_id === u.id)
          const myPays = payments.filter(p => (p as any).contract?.tenant_id === u.id && p.confirmed_by_landlord)
          const paidSum = myPays.reduce((s, p) => s + paySum(p), 0)
          const openU = openUser === u.id
          return (
            <div key={u.id}>
              {i > 0 && <div style={hair} />}
              <button
                onClick={() => setOpenUser(openU ? null : u.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 0', textAlign: 'left', boxSizing: 'border-box' }}
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
                  <div style={{ fontSize: 13, color: '#8e8e93' }}>Telegram ID: {u.telegram_id || '—'} · был(а) в приложении: {fmtDT(u.last_seen)}</div>
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

      <div style={secHead}>Платежи</div>
      <div style={T.card}>
        {payments.slice(0, 50).map((p, i) => {
          const late = !p.confirmed_by_landlord && new Date(p.due_date) < todayMid
          return (
            <div key={p.id}>
              {i > 0 && <div style={hair} />}
              <div style={{ padding: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 14, flex: 1, minWidth: 0 }}>{(p as any).contract?.object?.address || '—'} · {new Date(p.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span>
                  <b style={{ whiteSpace: 'nowrap' }}>{paySum(p).toFixed(0)} ₽</b>
                </div>
                <div style={{ fontSize: 12, color: p.confirmed_by_landlord ? '#1e7e34' : late ? '#ff3b30' : '#b25000', marginTop: 2 }}>
                  {p.confirmed_by_landlord ? `оплачен ${fmtDate(p.confirmed_at)}` : late ? `просрочен (до ${fmtDate(p.due_date)})` : `ожидает (до ${fmtDate(p.due_date)})`}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={secHead}>Обратная связь</div>
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

      {view && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setView(null)}>
          <img src={view} alt="" style={{ maxWidth: '100%', maxHeight: '90%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}

export default AdminDashboard
