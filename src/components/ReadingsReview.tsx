import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function ReadingsReview({ contractId, tenantId }: { contractId: string; tenantId: string }) {
  const [meters, setMeters] = useState<any[]>([])
  const [types, setTypes] = useState<any[]>([])
  const [readings, setReadings] = useState<any[]>([])
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({})

  async function load() {
    const { data: c } = await supabase.from('contracts').select('object_id').eq('id', contractId).maybeSingle()
    if (!c) return
    const { data: m } = await supabase.from('object_meters').select('*').eq('object_id', c.object_id).eq('is_active', true)
    setMeters(m || [])
    const { data: t } = await supabase.from('meter_types').select('*')
    setTypes(t || [])
    const { data: r } = await supabase
      .from('meter_readings').select('*')
      .eq('contract_id', contractId)
      .order('submitted_at', { ascending: false })
    setReadings(r || [])
  }

  useEffect(() => {
    load()
    const on = () => load()
    window.addEventListener('rentflow-refresh', on)
    const iv = setInterval(() => load(), 30000)
    return () => { window.removeEventListener('rentflow-refresh', on); clearInterval(iv) }
  }, [contractId])

  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
  const monthReadings = readings.filter(r => r.submitted_at >= start && r.submitted_at < end)

  const latestByMeter: Record<string, any> = {}
  for (const r of readings) if (!latestByMeter[r.object_meter_id]) latestByMeter[r.object_meter_id] = r
  const monthByMeter: Record<string, any> = {}
  for (const r of monthReadings) if (!monthByMeter[r.object_meter_id]) monthByMeter[r.object_meter_id] = r

  const hasAny = monthReadings.length > 0
  const overall = !hasAny
    ? 'none'
    : Object.values(monthByMeter).some(r => (r.status || 'proposed') === 'incomplete')
      ? 'incomplete'
      : Object.values(monthByMeter).every(r => (r.status || 'proposed') === 'confirmed')
        ? 'confirmed'
        : 'proposed'

  async function review(status: 'confirmed' | 'incomplete') {
    const ids = monthReadings.map(r => r.id)
    if (!ids.length) return
    await supabase.from('meter_readings').update({ status, reviewed_at: new Date().toISOString() }).in('id', ids)
    await supabase.from('notifications_log').insert({
      user_id: tenantId, type: 'meter_submitted', related_id: contractId,
      message: status === 'confirmed'
        ? '🟢 Показания получены арендодателем'
        : '🔴 Показания получены не полностью — передайте недостающие ещё раз',
      sent_at: new Date().toISOString(),
    })
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  const chip = (stt: string) => (stt || 'proposed') === 'confirmed' ? '🟢 получены' : (stt || 'proposed') === 'incomplete' ? '🔴 не полностью' : '🟡 ждут'

  return (
    <div>
      {meters.length === 0 && <div style={st.note}>На объекте нет активных счётчиков.</div>}
      {meters.map(m => {
        const t = types.find(x => x.id === m.meter_type_id)
        const last = latestByMeter[m.id]
        const month = monthByMeter[m.id]
        const hist = readings.filter(r => r.object_meter_id === m.id)
        const open = !!historyOpen[m.id]
        return (
          <div key={m.id} style={st.row}>
            <div>
              {t?.label || 'Счётчик'}{m.label ? ` · № ${m.label}` : ''}
              <div style={st.note}>
                {month
                  ? `за этот месяц: ${month.value} · подано ${new Date(month.submitted_at).toLocaleDateString('ru-RU')} · ${chip(month.status)}`
                  : 'нет данных в этом месяце'}
              </div>
              {last && (
                <div style={st.link} onClick={() => setHistoryOpen({ ...historyOpen, [m.id]: !open })}>
                  🕐 последнее: {last.value} · подано {new Date(last.submitted_at).toLocaleDateString('ru-RU')} · {chip(last.status)} {open ? '▲' : '▼'}
                </div>
              )}
              {open && hist.slice(0, 10).map((r: any) => (
                <div key={r.id} style={st.note}>{r.value} · подано {new Date(r.submitted_at).toLocaleDateString('ru-RU')} · {chip(r.status)}</div>
              ))}
            </div>
          </div>
        )
      })}
      {hasAny && (
        <div style={st.btns}>
          <button style={st.okBtn} onClick={() => review('confirmed')}>✅ Данные получены</button>
          <button style={st.warnBtn} onClick={() => review('incomplete')}>⚠️ Получены не полностью</button>
        </div>
      )}
      <div style={st.note}>
        {overall === 'confirmed' ? 'Все показания этого месяца подтверждены.' : overall === 'incomplete' ? 'Отмечено «не полностью» — для арендатора это неподача.' : overall === 'proposed' ? 'Показания отправлены арендатором и ждут вашего подтверждения.' : 'Арендатор ещё не подавал показания в этом месяце.'}
      </div>
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  row: { padding: 8, background: '#f9f9f9', borderRadius: 6, marginBottom: 6, fontSize: 14 },
  note: { fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 2, marginBottom: 4 },
  link: { fontSize: 11, color: '#00695c', fontWeight: 600, cursor: 'pointer', marginTop: 2, marginBottom: 4 },
  btns: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  okBtn: { padding: '8px 12px', borderRadius: 8, border: 'none', background: '#4caf50', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  warnBtn: { padding: '8px 12px', borderRadius: 8, border: 'none', background: '#ff9800', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
}

export default ReadingsReview
