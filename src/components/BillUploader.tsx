import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { T } from '../theme'
import { showToast } from './ui'

const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
const hair = { height: 1, background: 'rgba(60,60,67,0.12)' } as React.CSSProperties

function compress(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const img = new Image()
      img.onload = () => {
        const max = 1280
        let w = img.width, h = img.height
        const k = Math.min(1, max / Math.max(w, h))
        w = Math.round(w * k); h = Math.round(h * k)
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        c.getContext('2d')!.drawImage(img, 0, 0, w, h)
        c.toBlob(b => b ? resolve(b) : reject(new Error('compress')), 'image/jpeg', 0.82)
      }
      img.onerror = reject
      img.src = String(fr.result)
    }
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

async function upload(blob: Blob, prefix: string, ext: string, contentType: string): Promise<string | null> {
  const id = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('bills').upload(id, blob, { contentType })
  if (error) return null
  return supabase.storage.from('bills').getPublicUrl(id).data.publicUrl
}

export function Media({ url, maxH }: { url: string; maxH: number }) {
  if (url.includes('.pdf')) {
    return (
      <a href={url} target="_blank" rel="noopener" style={{ display: 'inline-block', marginTop: 8, color: '#0071e3', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>📄 Открыть документ (PDF)</a>
    )
  }
  return <img src={url} alt="" style={{ width: '100%', maxHeight: maxH, objectFit: 'cover', borderRadius: 10, marginTop: 8 }} />
}

export function BillUploader({ contractId, landlordId }: { contractId: string; landlordId: string }) {
  const { user } = useTelegramUser()
  const [bills, setBills] = useState<any[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('utility_bills')
      .select('*').eq('contract_id', contractId)
      .order('uploaded_at', { ascending: false })
    setBills(data || [])
    setReady(true)
  }

  useEffect(() => { load() }, [contractId])

  async function pickAndUpload(kind: 'bill' | 'payment', billId?: string) {
    if (busy) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,application/pdf'
    input.onchange = async () => {
      const f = input.files && input.files[0]
      if (!f) return
      const isPdf = f.type === 'application/pdf'
      if (!f.type.startsWith('image/') && !isPdf) { showToast('Нужно изображение или PDF'); return }
      setBusy(true)
      try {
        let blob: Blob = f
        let ext = 'pdf'
        let ct = 'application/pdf'
        if (!isPdf) {
          blob = await compress(f)
          ext = 'jpg'
          ct = 'image/jpeg'
        }
        const url = await upload(blob, kind, ext, ct)
        if (!url) { showToast('Ошибка загрузки'); return }
        if (kind === 'bill') {
          const now = new Date()
          const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
          const due = new Date(now.getTime() + 5 * 86400000)
          const dueISO = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`
          const { error } = await supabase.from('utility_bills').insert({
            contract_id: contractId, period, bill_url: url,
            uploaded_by: user!.id, due_date: dueISO, status: 'pending',
          })
          if (error) { showToast('Ошибка: ' + error.message); return }
          await supabase.from('notifications_log').insert({
            user_id: landlordId, type: 'bill_uploaded', related_id: contractId,
            message: `📄 Квитанция за ${period} загружена — оплатить до ${dueISO}`,
            sent_at: new Date().toISOString(),
          })
          showToast('✅ Квитанция загружена')
        } else {
          if (!billId) return
          const { error } = await supabase.from('utility_bills').update({
            payment_url: url, payment_uploaded_at: new Date().toISOString(), status: 'paid',
          }).eq('id', billId)
          if (error) { showToast('Ошибка: ' + error.message); return }
          await supabase.from('notifications_log').insert({
            user_id: landlordId, type: 'bill_paid', related_id: contractId,
            message: '🧾 Квитанция оплачена — подтверждение приложено',
            sent_at: new Date().toISOString(),
          })
          showToast('✅ Подтверждение загружено')
        }
        load()
        window.dispatchEvent(new Event('rentflow-refresh'))
      } catch (e) {
        showToast('Ошибка: ' + String(e))
      } finally {
        setBusy(false)
      }
    }
    input.click()
  }

  if (!ready) return null

  const now = new Date()
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  return (
    <div style={T.card}>
      <div style={T.h2}>Квитанции</div>
      <div style={{ ...T.tiny, margin: '0 0 10px' }}>Загружайте фото или PDF квитанции от УК сразу, как получили. Срок оплаты — 5 дней с момента загрузки.</div>
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
                    загружена {new Date(b.uploaded_at).toLocaleDateString('ru-RU')} · оплатить до {new Date(b.due_date).toLocaleDateString('ru-RU')}
                  </div>
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, flexShrink: 0,
                  background: b.status === 'confirmed' ? 'rgba(52,199,89,0.15)' : b.status === 'paid' ? 'rgba(0,113,227,0.12)' : overdue ? 'rgba(255,59,48,0.15)' : 'rgba(120,120,128,0.12)',
                  color: b.status === 'confirmed' ? '#1e7e34' : b.status === 'paid' ? '#0071e3' : overdue ? '#c00' : '#1d1d1f',
                }}>{b.status === 'confirmed' ? 'подтверждено' : b.status === 'paid' ? 'оплачено' : overdue ? 'просрочено' : 'к оплате'}</span>
              </div>
              {b.bill_url && <Media url={b.bill_url} maxH={160} />}
              {b.payment_url && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13, color: '#8e8e93' }}>Подтверждение оплаты:</div>
                  <Media url={b.payment_url} maxH={140} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                {b.status === 'pending' && <button style={iosBlue} onClick={() => pickAndUpload('payment', b.id)}>Приложить оплату</button>}
              </div>
            </div>
          </div>
        )
      })}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
        <button style={iosBlue} disabled={busy} onClick={() => pickAndUpload('bill')}>Загрузить квитанцию</button>
      </div>
    </div>
  )
}

export default BillUploader
