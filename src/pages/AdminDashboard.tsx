import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import FamilyDetector from '../components/FamilyDetector'
import { T } from '../theme'
import { showToast } from '../components/ui'

const OWNER_PHONE = '+79057674225'

const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
const iosMuted: React.CSSProperties = { color: '#8e8e93', fontSize: 14 }
const secHead: React.CSSProperties = { fontSize: 13, color: '#8e8e93', margin: '14px 16px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }

function normPhone(v: string): string {
  return (v || '').replace(/\D/g, '').slice(-10)
}

export function AdminDashboard() {
  const { user } = useTelegramUser()
  const [feedback, setFeedback] = useState<any[]>([])
  const [subs, setSubs] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [view, setView] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const isOwner = !!user && normPhone(user.phone || '') === normPhone(OWNER_PHONE)

  async function load() {
    const [fbRes, subRes, uRes, evRes] = await Promise.all([
      supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('subscriptions').select('*').order('until_date', { ascending: false }),
      supabase.from('users').select('id, full_name, phone, role, email, telegram_id').limit(200),
      supabase.from('analytics_events').select('*').order('created_at', { ascending: false }).limit(200),
    ])
    setFeedback(fbRes.data || [])
    setSubs(subRes.data || [])
    setUsers(uRes.data || [])
    setEvents(evRes.data || [])
    setReady(true)
  }

  useEffect(() => { load() }, [])

  async function markDone(id: string) {
    const { error } = await supabase.from('feedback').update({ status: 'done' }).eq('id', id)
    if (error) { showToast('Ошибка: ' + error.message); return }
    showToast('✅ Обращение закрыто')
    load()
  }

  if (!isOwner) {
    return <div style={T.page}><div style={T.card}>Доступ только для владельца сервиса.</div></div>
  }
  if (!ready) return <div style={T.page}>Загрузка…</div>

  const newFb = feedback.filter(f => f.status === 'new')
  const doneFb = feedback.filter(f => f.status !== 'new').slice(0, 10)
  const landlords = users.filter(u => u.role === 'landlord').length
  const tenants = users.filter(u => u.role === 'tenant').length
  const opens7 = events.filter(e => String(e.event || e.type || '').includes('open')).slice(0, 100)

  return (
    <div style={{ ...T.page, paddingBottom: 60 }}>
      <h1 style={T.h1}>Админка</h1>

      <div style={T.card}>
        <div style={T.h2}>Пользователи</div>
        <div style={T.row}><span style={iosMuted}>Всего</span><span style={{ fontSize: 16, fontWeight: 600 }}>{users.length}</span></div>
        <div style={T.row}><span style={iosMuted}>Арендодатели</span><span style={{ fontSize: 16, fontWeight: 600 }}>{landlords}</span></div>
        <div style={{ ...T.row, borderBottom: 'none' }}><span style={iosMuted}>Арендаторы</span><span style={{ fontSize: 16, fontWeight: 600 }}>{tenants}</span></div>
      </div>

      <div style={T.card}>
        <div style={T.h2}>Подписки Pro</div>
        {subs.length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Активных подписок нет.</div>}
        {subs.map(s => {
          const owner = users.find(u => u.id === s.owner_id)
          return (
            <div key={s.id} style={T.row}>
              <span style={{ fontSize: 14 }}>{owner?.full_name || '—'} · {owner?.phone || ''}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1e7e34' }}>до {new Date(s.until_date + 'T12:00:00').toLocaleDateString('ru-RU')}</span>
            </div>
          )
        })}
      </div>

      <div style={secHead}>Обращения · новых: {newFb.length}</div>
      <div style={T.card}>
        {newFb.length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Новых обращений нет.</div>}
        {newFb.map(f => (
          <div key={f.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(60,60,67,0.12)' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{f.sender_name || '—'} · {f.sender_phone || ''}</div>
            <div style={{ fontSize: 12, color: '#8e8e93' }}>{new Date(f.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
            <div style={{ fontSize: 14, color: '#1d1d1f', marginTop: 4, whiteSpace: 'pre-wrap' }}>{f.message}</div>
            {f.image_url && <button style={iosBlue} onClick={() => setView(f.image_url)}>смотреть вложение</button>}
            <div style={{ marginTop: 4 }}>
              <button style={iosBlue} onClick={() => markDone(f.id)}>Закрыть</button>
            </div>
          </div>
        ))}
        {doneFb.length > 0 && (
          <div style={{ ...iosMuted, marginTop: 8 }}>Закрытых недавно: {doneFb.length}</div>
        )}
      </div>

      <FamilyDetector />

      <div style={secHead}>Аналитика · последние события</div>
      <div style={T.card}>
        <div style={T.row}><span style={iosMuted}>Открытий приложения (последние)</span><span style={{ fontSize: 16, fontWeight: 600 }}>{opens7.length}</span></div>
        {events.slice(0, 15).map((e, i) => (
          <div key={e.id || i} style={{ ...T.row }}>
            <span style={{ fontSize: 13, color: '#8e8e93' }}>{new Date(e.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            <span style={{ fontSize: 13 }}>{String(e.event || e.type || e.screen || 'событие')}</span>
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
