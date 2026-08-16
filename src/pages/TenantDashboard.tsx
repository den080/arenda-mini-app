import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import CashNegotiation from '../components/CashNegotiation'
import { ensureNextPayment } from '../lib/nextPayment'
import Chat from '../components/Chat'
import { BottomNav, PromptNumber, Progress, showToast } from '../components/ui'
import { T } from '../theme'

interface PayDetail { type: 'card' | 'sbp'; bank: string; number: string }
interface Notification { id: string; user_id: string; type: string; related_id: string; sent_at: string }

function parseDate(d: any): Date {
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, dd || 1)
}

function formatCardNumber(v: string): string {
  const d = (v || '').replace(/\D/g, '').slice(0, 16)
  return d.replace(/(.{4})/g, '$1 ').trim()
}

function formatPhoneDisplay(v: string): string {
  const d = (v || '').replace(/\D/g, '')
  const x = d.length === 11 && (d.startsWith('7') || d.startsWith('8')) ? d.slice(1) : d
  if (x.length === 10) return `+7 ${x.slice(0, 3)} ${x.slice(3, 6)} ${x.slice(6, 8)} ${x.slice(8, 10)}`
  return v || ''
}

const TABS = [
  { id: 'pay', l: 'Оплата' },
  { id: 'meters', l: 'Счётчики' },
  { id: 'contract', l: 'Договор' },
  { id: 'chat', l: 'Чат' },
]

export function TenantDashboard() {
  const { user, loading: userLoading } = useTelegramUser()
  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [tab, setTab] = useState('pay')

  async function load() {
    if (!user) return
    const { data: cs } = await supabase
      .from('contracts').select('*')
      .eq('tenant_id', user.id).eq('status', 'active')
      .order('created_at', { ascending: true })
    const list: any[] = []
    for (const c of cs || []) {
      const { data: obj } = await supabase.from('objects').select('address').eq('id', c.object_id).maybeSingle()
      list.push({ ...c, _address: obj?.address || 'Объект' })
    }
    setContracts(list)
    const { data: notifData } = await supabase
      .from('notifications_log').select('*')
      .eq('user_id', user.id)
      .order('sent_at', { ascending: false }).limit(5)
    setNotifications(notifData || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load(), 30000)
    window.addEventListener('rentflow-refresh', () => load())
    return () => clearInterval(interval)
  }, [user])

  const getNotificationText = (type: string) => {
    switch (type) {
      case 'payment_claimed': return '✅ Арендатор сообщил об оплате'
      case 'payment_confirmed': return '🟢 Арендодатель подтвердил оплату'
      case 'meter_submitted': return '💦 Переданы новые показания'
      case 'cash_proposed': return '💵 Предложено время встречи наличными'
      case 'cash_confirmed': return '🤝 Время встречи наличными подтверждено'
      case 'deferred_proposed': return '🙏 Заявка на отсрочку штрафа отправлена'
      case 'deferred_confirmed': return '🧊 Замороженный штраф обновлён'
      default: return type
    }
  }

  if (userLoading || loading) return <div style={T.page}>Загрузка…</div>

  const current = contracts.find(c => c.id === openId) || null

  const notifCard = notifications.length > 0 ? (
    <div style={T.card}>
      <div style={T.h2}>Уведомления</div>
      {notifications.map(n => (
        <div key={n.id} style={T.row}>
          <span style={{ fontSize: 14 }}>{(n as any).message || getNotificationText(n.type)}</span>
        </div>
      ))}
    </div>
  ) : null

  if (!current) {
    return (
      <div style={{ ...T.page, paddingBottom: 40 }}>
        <h1 style={T.h1}>Моя аренда</h1>
        {notifCard}
        {contracts.length === 0 ? (
          <div style={{ ...T.card, padding: '28px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#1d1d1f', marginBottom: 6 }}>Пока нет активной аренды</div>
            <div style={{ fontSize: 14, color: '#8e8e93', lineHeight: 1.45 }}>Попросите арендодателя добавить объект и указать ваш номер телефона в договоре — аренда появится здесь автоматически.</div>
          </div>
        ) : (
          <div style={T.card}>
            {contracts.map((c, i) => (
              <div key={c.id}>
                {i > 0 && <div style={{ height: 1, background: 'rgba(60,60,67,0.12)' }} />}
                <button
                  onClick={() => { setOpenId(c.id); setTab('pay') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 0', textAlign: 'left', boxSizing: 'border-box' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{c._address}</div>
                    <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>{Number(c.rent_amount).toFixed(0)} ₽/мес</div>
                  </div>
                  <span style={{ color: '#c7c7cc', fontSize: 18 }}>›</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ ...T.page, paddingBottom: 90 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
        <button
          style={{ border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4 }}
          onClick={() => setOpenId(null)}
        >← Моя аренда</button>
      </div>
      <h1 style={{ ...T.h1, fontSize: 22 }}>{current._address}</h1>
      <TenantRental contract={current} tab={tab} setTab={setTab} />
    </div>
  )
}
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import CashNegotiation from '../components/CashNegotiation'
import { ensureNextPayment } from '../lib/nextPayment'
import Chat from '../components/Chat'
import { BottomNav, PromptNumber, Progress, showToast } from '../components/ui'
import { T } from '../theme'

interface PayDetail { type: 'card' | 'sbp'; bank: string; number: string }
interface Notification { id: string; user_id: string; type: string; related_id: string; sent_at: string }

function parseDate(d: any): Date {
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, dd || 1)
}

function formatCardNumber(v: string): string {
  const d = (v || '').replace(/\D/g, '').slice(0, 16)
  return d.replace(/(.{4})/g, '$1 ').trim()
}

function formatPhoneDisplay(v: string): string {
  const d = (v || '').replace(/\D/g, '')
  const x = d.length === 11 && (d.startsWith('7') || d.startsWith('8')) ? d.slice(1) : d
  if (x.length === 10) return `+7 ${x.slice(0, 3)} ${x.slice(3, 6)} ${x.slice(6, 8)} ${x.slice(8, 10)}`
  return v || ''
}

const TABS = [
  { id: 'pay', l: 'Оплата' },
  { id: 'meters', l: 'Счётчики' },
  { id: 'contract', l: 'Договор' },
  { id: 'chat', l: 'Чат' },
]

export function TenantDashboard() {
  const { user, loading: userLoading } = useTelegramUser()
  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [tab, setTab] = useState('pay')

  async function load() {
    if (!user) return
    const { data: cs } = await supabase
      .from('contracts').select('*')
      .eq('tenant_id', user.id).eq('status', 'active')
      .order('created_at', { ascending: true })
    const list: any[] = []
    for (const c of cs || []) {
      const { data: obj } = await supabase.from('objects').select('address').eq('id', c.object_id).maybeSingle()
      list.push({ ...c, _address: obj?.address || 'Объект' })
    }
    setContracts(list)
    const { data: notifData } = await supabase
      .from('notifications_log').select('*')
      .eq('user_id', user.id)
      .order('sent_at', { ascending: false }).limit(5)
    setNotifications(notifData || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load(), 30000)
    window.addEventListener('rentflow-refresh', () => load())
    return () => clearInterval(interval)
  }, [user])

  const getNotificationText = (type: string) => {
    switch (type) {
      case 'payment_claimed': return '✅ Арендатор сообщил об оплате'
      case 'payment_confirmed': return '🟢 Арендодатель подтвердил оплату'
      case 'meter_submitted': return '💦 Переданы новые показания'
      case 'cash_proposed': return '💵 Предложено время встречи наличными'
      case 'cash_confirmed': return '🤝 Время встречи наличными подтверждено'
      case 'deferred_proposed': return '🙏 Заявка на отсрочку штрафа отправлена'
      case 'deferred_confirmed': return '🧊 Замороженный штраф обновлён'
      default: return type
    }
  }

  if (userLoading || loading) return <div style={T.page}>Загрузка…</div>

  const current = contracts.find(c => c.id === openId) || null

  const notifCard = notifications.length > 0 ? (
    <div style={T.card}>
      <div style={T.h2}>Уведомления</div>
      {notifications.map(n => (
        <div key={n.id} style={T.row}>
          <span style={{ fontSize: 14 }}>{(n as any).message || getNotificationText(n.type)}</span>
        </div>
      ))}
    </div>
  ) : null

  if (!current) {
    return (
      <div style={{ ...T.page, paddingBottom: 40 }}>
        <h1 style={T.h1}>Моя аренда</h1>
        {notifCard}
        {contracts.length === 0 ? (
          <div style={{ ...T.card, padding: '28px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#1d1d1f', marginBottom: 6 }}>Пока нет активной аренды</div>
            <div style={{ fontSize: 14, color: '#8e8e93', lineHeight: 1.45 }}>Попросите арендодателя добавить объект и указать ваш номер телефона в договоре — аренда появится здесь автоматически.</div>
          </div>
        ) : (
          <div style={T.card}>
            {contracts.map((c, i) => (
              <div key={c.id}>
                {i > 0 && <div style={{ height: 1, background: 'rgba(60,60,67,0.12)' }} />}
                <button
                  onClick={() => { setOpenId(c.id); setTab('pay') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 0', textAlign: 'left', boxSizing: 'border-box' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{c._address}</div>
                    <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>{Number(c.rent_amount).toFixed(0)} ₽/мес</div>
                  </div>
                  <span style={{ color: '#c7c7cc', fontSize: 18 }}>›</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ ...T.page, paddingBottom: 90 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
        <button
          style={{ border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4 }}
          onClick={() => setOpenId(null)}
        >← Моя аренда</button>
      </div>
      <h1 style={{ ...T.h1, fontSize: 22 }}>{current._address}</h1>
      <TenantRental contract={current} tab={tab} setTab={setTab} />
    </div>
  )
}
