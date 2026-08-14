import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T, C } from '../theme'

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

  async function reviewMeter(meterId: string, status: 'confirmed' | 'incomplete') {
    const r = monthByMeter[meterId]
    if (!r) return
    const m = meters.find(x => x.id === meterId)
    const t = types.find(x => x.id === m?.meter_type_id)
    const label = (t?.label || 'Счётчик') + (m?.label ? ` · № ${m.label}` : '')
    await supabase.from('meter_readings').update({ status, reviewed_at: new Date().toISOString() }).eq('id', r.id)
    await supabase.from('notifications_log').insert({
      user_id: tenantId, type: 'meter_submitted', related_id: contractId,
      message: status === 'confirmed'
        ? `🟢 ${label}: показания получены`
        : `🔴 ${label}: показания получены не полностью — передайте ещё раз`,
      sent_at: new Date().toISOString(),
    })
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  const chip = (stt: string) => (stt || 'proposed') === 'confirmed' ? T.chipGreen : (stt || 'proposed') === 'incomplete' ? T.chipRed : T.chipOrange

  return (
    <div>
      {meters.length === 0 && <div style={T.tiny}>На объекте нет активных счётчиков.</div>}
      {meters.map(m => {
        const t = types.find(x => x.id === m.meter_type_id)
        const last = latestByMeter[m.id]
        const month = monthByMeter[m.id]
        const hist = readings.filter(r => r.object_meter_id === m.id)
        const open = !!historyOpen[m.id]
        return (
          <div key={m.id} style={{ ...T.item, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t?.label || 'Счётчик'}{m.label ? ` · № ${m.label}` : ''}</div>
              <div style={T.tiny}>
                {month
                  ? `за этот месяц: ${month.value} · подано ${new Date(month.submitted_at).toLocaleDateString('ru-RU')}`
                  : 'нет данных в этом месяце'}
              </div>
              {month && <div style={{ marginTop: 4 }}><span style={chip(month.status)}>{(month.status || 'proposed') === 'confirmed' ? '🟢 получены' : (month.status || 'proposed') === 'incomplete' ? '🔴 не полностью' : '🟡 ждут'}</span></div>}
              {last && (
                <div style={T.link} onClick={() => setHistoryOpen({ ...historyOpen, [m.id]: !open })}>
                  🕐 последнее: {last.value} · подано {new Date(last.submitted_at).toLocaleDateString('ru-RU')} {open ? '▲' : '▼'}
                </div>
              )}
              {open && hist.slice(0, 10).map((r: any) => (
                <div key={r.id} style={T.tiny}>{r.value} · подано {new Date(r.submitted_at).toLocaleDateString('ru-RU')}</div>
              ))}
            </div>
            {month && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  style={{ ...T.btnSmall, background: month.status === 'confirmed' ? C.green : T.btnSmall.background, opacity: month.status === 'confirmed' ? 1 : 0.85 }}
                  title="Подтвердить этот счётчик"
                  onClick={() => reviewMeter(m.id, 'confirmed')}
                >✅</button>
                <button
                  style={{ ...T.btnDanger, opacity: month.status === 'incomplete' ? 1 : 0.7 }}
                  title="Не полностью по этому счётчику"
                  onClick={() => reviewMeter(m.id, 'incomplete')}
                >⚠️</button>
              </div>
            )}
          </div>
        )
      })}
      <div style={T.tiny}>
        {overall === 'confirmed' ? 'Все показания этого месяца подтверждены.' : overall === 'incomplete' ? 'Часть счётчиков отмечена «не полностью» — арендатор видит, какие именно.' : overall === 'proposed' ? 'Показания отправлены арендатором и ждут вашего подтверждения по каждому счётчику.' : 'Арендатор ещё не подавал показания в этом месяце.'}
      </div>
    </div>
  )
}

export default ReadingsReview
