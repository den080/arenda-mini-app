import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../theme'
import { showToast } from './ui'
import { Media } from './BillUploader'

const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
const hair = { height: 1, background: 'rgba(60,60,67,0.12)' } as React.CSSProperties

export function BillReview({ contractId, tenantId }: { contractId: string; tenantId: string }) {
  const [bills, setBills] = useState<any[]>([])
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.from('utility_bills')
      .select('*').eq('contract_id', contractId)
      .order('uploaded_at', { ascending: false })
    setBills(data || [])
    setReady(true)
  }

  useEffect(() => { load() }, [contractId])

  async function confirmBill(id: string) {
    const { error } = await supabase.from('utility_bills').update({ confirmed_at: new Date().toISOString(), status: 'confirmed' }).eq('id', id)
    if (error) { showToast('Ошибка: ' + error.message); return }
    await supabase.from('notifications_log').insert({
      user_id: tenantId, type: 'bill_confirmed', related_id: contractId,
      message: '✅ Арендодатель подтвердил оплату по квитанции',
      sent_at: new Date().toISOString(),
    })
    showToast('✅ Подтверждено')
    load()
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  if (!ready) return null

  const now = new Date()
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  return (
    <div style={T.card}>
      <div style={T.h2}>Квитанции от арендатора</div>
      {bills.length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Квитанций пока нет.</div>}
      {bills.map((b, i) => {
        const overdue = b.status === 'pending' && new Date(b.due_date) < todayMid
        return (
          <div key={b.id}>
            {i > 0 && <div style={hair} />}
            <div style={{ padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>Квитанция за {new Date(b.period + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</div>
                  <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>
                    загружена {new Date(b.uploaded_at).toLocaleDateString('ru-RU')} · срок {new Date(b.due_date).toLocaleDateString('ru-RU')}
                  </div>
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, flexShrink: 0,
                  background: b.status === 'confirmed' ? 'rgba(52,199,89,0.15)' : b.status === 'paid' ? 'rgba(0,113,227,0.12)' : overdue ? 'rgba(255,59,48,0.15)' : 'rgba(120,120,128,0.12)',
                  color: b.status === 'confirmed' ? '#1e7e34' : b.status === 'paid' ? '#0071e3' : overdue ? '#c00' : '#1d1d1f',
                }}>{b.status === 'confirmed' ? 'подтверждено' : b.status === 'paid' ? 'оплачено' : overdue ? 'просрочено' : 'к оплате'}</span>
              </div>
              {b.bill_url && (
                b.bill_url.includes('.pdf')
                  ? <Media url={b.bill_url} maxH={160} />
                  : <img src={b.bill_url} alt="" onClick={() => setView(b.bill_url)} style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 10, marginTop: 8, cursor: 'pointer' }} />
              )}
              {b.payment_url && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13, color: '#8e8e93' }}>Подтверждение оплаты:</div>
                  {b.payment_url.includes('.pdf')
                    ? <Media url={b.payment_url} maxH={140} />
                    : <img src={b.payment_url} alt="" onClick={() => setView(b.payment_url)} style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 10, marginTop: 4, cursor: 'pointer' }} />}
                </div>
              )}
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                {b.status === 'paid' && <button style={iosBlue} onClick={() => confirmBill(b.id)}>Подтвердить получение</button>}
                {b.status === 'confirmed' && <span style={{ color: '#1e7e34', fontSize: 13, fontWeight: 600 }}>Оплата принята</span>}
              </div>
            </div>
          </div>
        )
      })}
      {view && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setView(null)}>
          <img src={view} alt="" style={{ maxWidth: '100%', maxHeight: '90%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}

export default BillReview
