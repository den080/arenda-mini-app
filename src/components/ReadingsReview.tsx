import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { T } from '../theme'
import { showToast } from './ui'

const actBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
const actRed: React.CSSProperties = { border: 'none', background: 'transparent', color: '#ff3b30', fontSize: 14, cursor: 'pointer', padding: 4, flexShrink: 0 }
const valMoney: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: '#1d1d1f', whiteSpace: 'nowrap' }
const iosMuted: React.CSSProperties = { color: '#8e8e93', fontSize: 14 }
const hair = { height: 1, background: 'rgba(60,60,67,0.12)' } as React.CSSProperties
const rightInput: React.CSSProperties = { width: 150, border: 'none', outline: 'none', background: 'rgba(120,120,128,0.08)', borderRadius: 8, padding: '8px 10px', fontSize: 16, fontWeight: 600, textAlign: 'right', color: '#1d1d1f', boxSizing: 'border-box' }

export function ReadingsReview({ contractId, tenantId }: { contractId: string; tenantId: string }) {
  const { user } = useTelegramUser()
  const [meters, setMeters] = useState<any[]>([])
  const [types, setTypes] = useState<any[]>([])
  const [reads, setReads] = useState<Record<string, any>>({})
  const [vals, setVals] = useState<Record<string, string>>({})
  const [ready, setReady] = useState(false)

  const now = new Date()
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  async function load() {
    const { data: contract } = await supabase.from('contracts').select('object_id').eq('id', contractId).maybeSingle()
    if (!contract) { setReady(true); return }
    const [mRes, tRes, rRes] = await Promise.all([
      supabase.from('object_meters').select('*').eq('object_id', contract.object_id).eq('is_active', true),
      supabase.from('meter_types').select('*'),
      supabase.from('meter_readings').select('*').eq('contract_id', contractId).eq('period', period).order('submitted_at', { ascending: false }),
    ])
    const list = (mRes.data || []) as any[]
    const typesList = (tRes.data || []) as any[]
    const readings = (rRes.data || []) as any[]
    const g = (c: string) => c === 'water_cold' ? 0 : c === 'water_hot' ? 1 : c.startsWith('electricity') ? 2 : c === 'heat' ? 3 : c === 'gas' ? 4 : 5
    list.sort((a, b) => {
      const ca = typesList.find((x: any) => x.id === a.meter_type_id)?.code || ''
      const cb = typesList.find((x: any) => x.id === b.meter_type_id)?.code || ''
      return g(ca) - g(cb) || String(a.label || '').localeCompare(String(b.label || ''))
    })
    setMeters(list)
    setTypes(typesList)
    const map: Record<string, any> = {}
    for (const rd of readings) if (!map[rd.object_meter_id]) map[rd.object_meter_id] = rd
    setReads(map)
    setReady(true)
  }

  useEffect(() => { load() }, [contractId])

  async function setStatus(readingId: string, status: 'confirmed' | 'incomplete') {
    const { error } = await supabase.from('meter_readings').update({ status }).eq('id', readingId)
    if (error) { showToast('Ошибка: ' + error.message); return }
    await supabase.from('notifications_log').insert({
      user_id: tenantId, type: 'meter_submitted', related_id: contractId,
      message: status === 'confirmed' ? '🟢 Показания подтверждены арендодателем' : '⚠️ Арендодатель отметил показания неполными — передайте ещё раз',
      sent_at: new Date().toISOString(),
    })
    showToast(status === 'confirmed' ? '✅ Подтверждено' : 'Отмечено неполными')
    window.dispatchEvent(new Event('rentflow-refresh'))
    load()
  }

  async function enterValue(meterId: string) {
    const v = Number(String(vals[meterId] || '').replace(',', '.'))
    if (isNaN(v) || v <= 0) { showToast('Введите значение показания'); return }
    const { error } = await supabase.from('meter_readings').insert({
      object_meter_id: meterId, contract_id: contractId, value: v, period,
      submitted_at: new Date().toISOString(), status: 'confirmed', entered_by: user!.id,
    })
    if (error) { showToast('Ошибка: ' + error.message); return }
    await supabase.from('notifications_log').insert({
      user_id: tenantId, type: 'meter_submitted', related_id: contractId,
      message: '🧾 Арендодатель внёс показания по фото',
      sent_at: new Date().toISOString(),
    })
    showToast('✅ Показание внесено')
    setVals(prev => ({ ...prev, [meterId]: '' }))
    window.dispatchEvent(new Event('rentflow-refresh'))
    load()
  }

  if (!ready) return null
  if (meters.length === 0) return <div style={T.card}><div style={{ ...T.small, margin: '8px 0' }}>На объекте нет счётчиков с ручной подачей.</div></div>

  return (
    <div style={T.card}>
      <div style={T.h2}>Показания за этот месяц</div>
      <div style={{ ...T.tiny, margin: '0 0 10px' }}>Если арендатор прислал фото счётчиков в чат — впишите значения сами, чтобы учёт и расчёты не прерывались.</div>

      {meters.map((m, i) => {
        const t = types.find(x => x.id === m.meter_type_id)
        const rd = reads[m.id]
        const title = `${t?.label || 'Счётчик'}${m.label ? ` · № ${m.label}` : ''}`
        const noReading = !rd
        const incomplete = rd && rd.status === 'incomplete'
        const confirmed = rd && rd.status === 'confirmed'
        const source = rd ? (rd.entered_by ? 'внёс арендодатель' : 'от арендатора') : ''
        return (
          <div key={m.id}>
            {i > 0 && <div style={hair} />}
            <div style={{ padding: '10px 0' }}>
              {noReading && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>{title}</span>
                    <input
                      value={vals[m.id] || ''}
                      onChange={(e) => setVals(prev => ({ ...prev, [m.id]: e.target.value }))}
                      placeholder="0"
                      style={rightInput}
                      inputMode="decimal"
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <span style={{ fontSize: 13, color: '#8e8e93' }}>показаний ещё нет</span>
                    <button style={actBlue} onClick={() => enterValue(m.id)}>Внести по фото</button>
                  </div>
                </>
              )}
              {incomplete && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>{title}</span>
                    <input
                      value={vals[m.id] || ''}
                      onChange={(e) => setVals(prev => ({ ...prev, [m.id]: e.target.value }))}
                      placeholder="исправить"
                      style={rightInput}
                      inputMode="decimal"
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <span style={{ fontSize: 13, color: '#ff3b30' }}>арендатор · {rd.value} — отмечены неполными</span>
                    <button style={actBlue} onClick={() => enterValue(m.id)}>Внести</button>
                  </div>
                </>
              )}
              {rd && !incomplete && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>{title}</span>
                    <span style={valMoney}>{rd.value}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <span style={{
                      fontSize: 13,
                      color: confirmed ? '#1e7e34' : '#8e8e93',
                    }}>
                      {source}{confirmed ? ' · подтверждены' : ' · ожидают'}
                    </span>
                    {!confirmed && (
                      <span style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                        <button style={actRed} onClick={() => setStatus(rd.id, 'incomplete')}>не полностью</button>
                        <button style={actBlue} onClick={() => setStatus(rd.id, 'confirmed')}>Подтвердить</button>
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ReadingsReview
