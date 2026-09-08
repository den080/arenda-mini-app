import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { T } from '../theme'
import { showToast } from './ui'
import { Media, billChip, billChipText } from './BillUploader'

const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
const hair = { height: 1, background: 'rgba(60,60,67,0.12)' } as React.CSSProperties
const inpSmall: React.CSSProperties = { flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 10, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box' }

export function BillReview({ contractId, tenantId }: { contractId: string; tenantId: string }) {
  const { user } = useTelegramUser()
  const isTenant = !!user && user.id === tenantId
  const [bills, setBills] = useState<any[]>([])
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [period, setPeriod] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  const [due, setDue] = useState('')
  const [landlordId, setLandlordId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const proofRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function load() {
    const { data } = await supabase.from('utility_bills').select('*').eq('contract_id', contractId).order('period', { ascending: false })
    setBills(data || [])
    setReady(true)
  }
  useEffect(() => { load() }, [contractId])
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('contracts').select('object:objects(landlord_id)').eq('id', contractId).maybeSingle()
      setLandlordId((data as any)?.object?.landlord_id || null)
    })()
  }, [contractId])

  async function notify(userId: string | null, type: string, message: string) {
    if (!userId) return
    await supabase.from('notifications_log').insert({ user_id: userId, type, related_id: contractId, message, sent_at: new Date().toISOString() })
  }

  // файл уходит КАК ЕСТЬ: PDF и картинки без сжатия — QR читается
  async function uploadRaw(file: File, path: string): Promise<string> {
    const { error } = await supabase.storage.from('bills').upload(path, file, { contentType: file.type || 'application/octet-stream', cacheControl: '3600', upsert: true })
    if (error) throw error
    return supabase.storage.from('bills').getPublicUrl(path).data.publicUrl
  }

  async function uploadBill(file: File) {
    if (busy || !period) return
    setBusy(true)
    try {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
      const url = await uploadRaw(file, `${contractId}/${period}-bill.${ext}`)
      const existing = bills.find((b) => b.period === period)
      if (existing) {
        const { error } = await supabase.from('utility_bills').update({ bill_url: url, uploaded_at: new Date().toISOString(), due_date: due || existing.due_date }).eq('id', existing.id)
        if (error) { showToast('Ошибка: ' + error.message); return }
      } else {
        const { error } = await supabase.from('utility_bills').insert({ contract_id: contractId, period, due_date: due || null, bill_url: url, uploaded_by: user!.id, status: 'pending', uploaded_at: new Date().toISOString() })
        if (error) { showToast('Ошибка: ' + error.message); return }
      }
      await notify(tenantId, 'bill_uploaded', `📄 Квитанция за ${period} доступна: оплатите и приложите чек`)
      showToast('✅ Квитанция загружена без сжатия')
      if (fileRef.current) fileRef.current.value = ''
      load()
      window.dispatchEvent(new Event('rentflow-refresh'))
    } catch (e: any) {
      showToast('Ошибка загрузки: ' + (e?.message || e))
    } finally { setBusy(false) }
  }

  async function uploadProof(b: any, file: File) {
    if (busy) return
    setBusy(true)
    try {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
      const url = await uploadRaw(file, `${contractId}/${b.id}-proof.${ext}`)
      const { error } = await supabase.from('utility_bills').update({ payment_url: url, payment_uploaded_at: new Date().toISOString(), status: 'paid' }).eq('id', b.id)
      if (error) { showToast('Ошибка: ' + error.message); return }
      await notify(landlordId, 'bill_paid', `🧾 Арендатор приложил подтверждение оплаты за ${b.period}`)
      showToast('✅ Чек отправлен арендодателю')
      load()
      window.dispatchEvent(new Event('rentflow-refresh'))
    } catch (e: any) {
      showToast('Ошибка загрузки: ' + (e?.message || e))
    } finally { setBusy(false) }
  }

  async function confirmBill(id: string, p: string) {
    const { error } = await supabase.from('utility_bills').update({ confirmed_at: new Date().toISOString(), status: 'confirmed' }).eq('id', id)
    if (error) { showToast('Ошибка: ' + error.message); return }
    await notify(tenantId, 'bill_confirmed', `✅ Арендодатель подтвердил оплату по квитанции за ${p}`)
    showToast('✅ Подтверждено')
    load()
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  if (!ready) return null
  const now = new Date()
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return (
    <div style={T.card}>
      <div style={T.h2}>{isTenant ? 'Квитанции и чеки' : 'Квитанции от арендатора'}</div>
      {!isTenant && (
        <div style={{ padding: '4px 0 10px' }}>
          <div style={{ fontSize: 13, color: '#8e8e93', margin: '0 0 6px' }}>Квитанция от УК: PDF загружается без сжатия — QR читается у арендатора.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#8e8e93', margin: '0 0 2px' }}>Месяц квитанции</div>
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={inpSmall} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#8e8e93', margin: '0 0 2px' }}>Оплатить до</div>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={inpSmall} />
            </div>
          </div>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBill(f) }} />
          <button style={{ width: '100%', marginTop: 8, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }} disabled={busy || !period} onClick={() => fileRef.current?.click()}>{busy ? 'Загрузка…' : 'Загрузить квитанцию'}</button>
        </div>
      )}
      {bills.length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>{isTenant ? 'Квитанций пока нет — арендодатель загрузит первую.' : 'Квитанций пока нет.'}</div>}
      {bills.map((b, i) => {
        const overdue = b.status === 'pending' && !!b.due_date && new Date(b.due_date) < todayMid
        return (
          <div key={b.id}>
            {i > 0 && <div style={hair} />}
            <div style={{ padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>Квитанция за {new Date(b.period + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</div>
                  <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>
                    {b.bill_url ? `загружена ${new Date(b.uploaded_at).toLocaleDateString('ru-RU')}` : 'файл не загружен'}{b.due_date ? ` · оплатить до ${new Date(b.due_date).toLocaleDateString('ru-RU')}` : ''}
                  </div>
                </div>
                <span style={billChip(b.status, overdue)}>{billChipText(b.status, overdue)}</span>
              </div>
              {b.bill_url && (
                <>
                  <div style={{ marginTop: 4 }}>
                    {b.bill_url.includes('.pdf')
                      ? <Media url={b.bill_url} maxH={160} />
                      : <img src={b.bill_url} alt="" onClick={() => setView(b.bill_url)} style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 10, marginTop: 8, cursor: 'pointer' }} />}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <a href={b.bill_url} target="_blank" rel="noopener noreferrer" style={iosBlue}>Открыть оригинал (без сжатия)</a>
                  </div>
                </>
              )}
              {b.payment_url && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13, color: '#8e8e93' }}>Подтверждение оплаты:</div>
                  <div style={{ marginTop: 4 }}>
                    {b.payment_url.includes('.pdf')
                      ? <Media url={b.payment_url} maxH={140} />
                      : <img src={b.payment_url} alt="" onClick={() => setView(b.payment_url)} style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 10, marginTop: 4, cursor: 'pointer' }} />}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center' }}>
                {isTenant && b.bill_url && !b.payment_url && (
                  <>
                    <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} ref={(el) => { proofRefs.current[b.id] = el }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadProof(b, f) }} />
                    <button style={iosBlue} disabled={busy} onClick={() => proofRefs.current[b.id]?.click()}>Приложить чек об оплате</button>
                  </>
                )}
                {!isTenant && b.status === 'paid' && <button style={iosBlue} onClick={() => confirmBill(b.id, b.period)}>Подтвердить получение</button>}
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
