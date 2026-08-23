import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import TenantRental from '../components/TenantRental'
import { setAnalyticsUser, trackOpen, trackScreen } from '../lib/analytics'
import { T } from '../theme'

interface Notification { id: string; user_id: string; type: string; related_id: string; sent_at: string }

export function TenantDashboard() {
  const { user, loading: userLoading } = useTelegramUser()
  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [tab, setTab] = useState('pay')

  async function load() {
    if (!user) return
    const [csRes, notifRes] = await Promise.all([
      supabase.from('contracts').select('*').eq('tenant_id', user.id).in('status', ['active', 'terminated']).order('created_at', { ascending: true }),
      supabase.from('notifications_log').select('*').eq('user_id', user.id).order('sent_at', { ascending: false }).limit(5),
    ])
    const cs = csRes.data || []
    const objIds = cs.map((c: any) => c.object_id)
    const objBy: Record<string, any> = {}
    if (objIds.length) {
      const { data: objs } = await supabase.from('objects').select('id, address').in('id', objIds)
      for (const o of objs || []) objBy[o.id] = o
    }
    setContracts(cs.map((c: any) => ({ ...c, _address: objBy[c.object_id]?.address || 'Объект' })))
    setNotifications(notifRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load(), 30000)
    window.addEventListener('rentflow-refresh', () => load())
    return () => clearInterval(interval)
  }, [user])

  useEffect(() => {
    if (user) { setAnalyticsUser(user); trackOpen('tenant') }
  }, [user])

  useEffect(() => {
    trackScreen(openId ? `rental_${tab}` : 'rental_list')
  }, [tab, openId])

  const getNotificationText = (type: string) => {
    switch (type) {
      case 'payment_claimed': return '✅ Арендатор сообщил об оплате'
      case 'payment_confirmed': return '🟢 Арендодатель подтвердил оплату'
      case 'payment_partial': return '💰 Частичная оплата учтена'
      case 'payment_undo': return '↩️ Подтверждение оплаты отменено'
      case 'meter_submitted': return '💦 Переданы новые показания'
      case 'cash_proposed': return '💵 Предложено время встречи наличными'
      case 'cash_confirmed': return '🤝 Встреча по оплате согласована'
      case 'deferred_proposed': return '🙏 Заявка на отсрочку штрафа отправлена'
      case 'deferred_confirmed': return '🧊 Замороженный штраф обновлён'
      case 'bill_uploaded': return '📄 Квитанция загружена'
      case 'bill_paid': return '🧾 Подтверждение оплаты приложено'
      case 'bill_confirmed': return '✅ Арендодатель подтвердил оплату по квитанции'
      case 'contract_terminated': return '🏁 Договор завершён'
      case 'amendment': return '📝 Допсоглашение по аренде'
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
          <>
            {contracts.map((c) => (
              <div key={c.id} style={T.card}>
                <button
                  onClick={() => { setOpenId(c.id); setTab('pay') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 0', textAlign: 'left', boxSizing: 'border-box' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#1d1d1f' }}>{c._address}</div>
                    <div style={{ fontSize: 13, color: c.status === 'terminated' ? '#ff3b30' : '#8e8e93', marginTop: 4 }}>{Number(c.rent_amount).toFixed(0)} ₽/мес{c.status === 'terminated' ? ' · договор завершён' : ''}</div>
                  </div>
                  <span style={{ color: '#c7c7cc', fontSize: 18 }}>›</span>
                </button>
              </div>
            ))}
          </>
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
      <h1 style={T.h1}>{current._address}</h1>
      <TenantRental contract={current} tab={tab} setTab={setTab} />
    </div>
  )
}

export default TenantDashboard
