import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { showToast } from './ui'

const S: Record<string, React.CSSProperties> = {
  card: { background: '#fff', borderRadius: 12, margin: '0 0 10px', padding: '0 16px' },
  row: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '6px 0', boxSizing: 'border-box' },
  rowBtn: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 40, padding: '4px 0', boxSizing: 'border-box', width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' },
  sep: { height: 1, background: 'rgba(60,60,67,0.12)' },
  title: { fontSize: 15, fontWeight: 600, color: '#1d1d1f' },
  sub: { fontSize: 13, color: '#8e8e93', marginTop: 2 },
  blue: { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 },
  red: { border: 'none', background: 'transparent', color: '#ff3b30', fontSize: 15, fontWeight: 500, cursor: 'pointer', padding: 4, flexShrink: 0 },
  check: { color: '#0071e3', fontSize: 17, fontWeight: 600, flexShrink: 0 },
  gray: { color: '#8e8e93', fontSize: 14, flexShrink: 0 },
  hist: { fontSize: 13, color: '#8e8e93', padding: '6px 0' },
  foot: { fontSize: 12, color: '#8e8e93', margin: '4px 16px 12px' },
}

export function ReadingsReview({ contractId, tenantId }: { contractId: string; tenantId: string }) {
  const [meters, setMeters] = useState<any[]>([])
  const [types, setTypes] = useState<any[]>([])
  const [reads, setReads] = useState<Record<string, any[]>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})

  async function load() {
    const { data: con } = await supabase.from('contracts').select('object_id').eq('id', contractId).maybeSingle()
    if (!con) return
    const { data: m } = await supabase.from('object_meters').select('*').eq('object_id', con.object_id).eq('is_active', true)
    const { data: t } = await supabase.from('meter_types').select('*')
    const ids = (m || []).map((x: any) => x.id)
    let rd: any[] = []
    if (ids.length) {
      const { data } = await supabase.from('meter_readings').select('*').in('object_meter_id', ids).order('submitted_at', { ascending: false })
      rd = data || []
    }
    const byMeter: Record<string, any[]> = {}
    for (const r of rd) { (byMeter[r.object_meter_id] = byMeter[r.object_meter_id] || []).push(r) }
    setMeters(m || [])
    setTypes(t || [])
    setReads(byMeter)
  }

  useEffect(() => {
    load()
    const on = () => load()
    window.addEventListener('rentflow-refresh', on)
    return () => window.removeEventListener('rentflow-refresh', on)
  }, [contractId])

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  async function setStatus(readingId: string, status: string) {
    const { error } = await supabase.from('meter_readings').update({ status, reviewed_at: new Date().toISOString() }).eq('id', readingId)
    if (error) { showToast('Ошибка: ' + error.message); return }
    await supabase.from('notifications_log').insert({
      user_id: tenantId, type: 'meter_submitted', related_id: contractId,
      message: status === 'confirmed' ? '🟢 Показания подтверждены арендодателем' : '🔴 Показания отмечены неполными — передайте их ещё раз',
      sent_at: new Date().toISOString(),
    })
    showToast(status === 'confirmed' ? '✅ Подтверждено' : 'Отмечено: не полностью')
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  const fmt = (d: any) => new Date(d).toLocaleDateString('ru-RU')

  if (meters.length === 0) return <div style={S.foot}>На объекте нет счётчиков с ручной подачей.</div>

  return (
    <div>
      {meters.map(m => {
        const t = types.find((x: any) => x.id === m.meter_type_id)
        const hist = reads[m.id] || []
        const cur = hist.find(r => { const d = new Date(r.submitted_at); return d >= monthStart && d < monthEnd })
        const isOpen = !!open[m.id]
        return (
          <div key={m.id} style={S.card}>
            <div style={S.row}>
              <div style={{ minWidth: 0 }}>
                <div style={S.title}>{t?.label || 'Счётчик'}{m.label ? ` · № ${m.label}` : ''}</div>
                <div style={S.sub}>{cur ? `за этот месяц: ${cur.value} · подано ${fmt(cur.submitted_at)}` : 'нет данных в этом месяце'}</div>
              </div>
              <span style={{ flex: 1 }} />
              {cur && cur.status === 'confirmed' && <span style={S.check}>✓</span>}
              {cur && cur.status === 'incomplete' && <span style={{ ...S.gray, color: '#ff3b30' }}>не полностью</span>}
              {cur && cur.status === 'proposed' && (
                <>
                  <button style={S.red} onClick={() => setStatus(cur.id, 'incomplete')}>Не полностью</button>
                  <button style={S.blue} onClick={() => setStatus(cur.id, 'confirmed')}>Подтвердить</button>
                </>
              )}
            </div>
            {hist.length > 0 && (
              <>
                <div style={S.sep} />
                <button style={S.rowBtn} onClick={() => setOpen({ ...open, [m.id]: !isOpen })}>
                  <span style={{ fontSize: 14, color: '#0071e3' }}>История · последнее: {hist[0].value}</span>
                  <span style={{ color: '#8e8e93', fontSize: 13 }}>{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && hist.slice(0, 10).map((r: any) => (
                  <div key={r.id} style={{ ...S.hist, borderTop: '1px solid rgba(60,60,67,0.08)' }}>
                    {r.value} · подано {fmt(r.submitted_at)} · {r.status === 'confirmed' ? 'подтверждены' : r.status === 'incomplete' ? 'не полностью' : 'ждут'}
                  </div>
                ))}
              </>
            )}
          </div>
        )
      })}
      <div style={S.foot}>Показания отправлены арендатором и ждут вашего подтверждения по каждому счётчику.</div>
    </div>
  )
}

export default ReadingsReview
