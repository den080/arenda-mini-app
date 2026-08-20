import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { T } from '../theme'
import { showToast } from './ui'

const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
const iosRed: React.CSSProperties = { border: 'none', background: 'transparent', color: '#ff3b30', fontSize: 15, cursor: 'pointer', padding: 4, flexShrink: 0 }
const hair = { height: 1, background: 'rgba(60,60,67,0.12)' } as React.CSSProperties
const rightInput: React.CSSProperties = { width: 110, border: 'none', outline: 'none', background: 'rgba(120,120,128,0.08)', borderRadius: 8, padding: '8px 10px', fontSize: 15, textAlign: 'right', color: '#1d1d1f', boxSizing: 'border-box' }

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

  const inputRow = (m: any, hint?: string) => (
    <>
      {hint && <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>{hint}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
        <input
          value={vals[m.id] || ''}
          onChange={(e) => setVals(prev => ({ ...prev, [m.id]: e.target.value }))}
          placeholder="Значение с фото"
          style={{ ...rightInput, width: 150 }}
          inputMode="decimal"
        />
        <button style={iosBlue} onClick={() => enterValue(m.id)}>Внести</button>
      </div>
    </>
  )

  return (
    <div style={T.card}>
      <div style={{ ...T.tiny, margin: '0 0 10px' }}>Если арендатор прислал фото счётчиков в чат — впишите значения здесь сами: учёт и расчёты не прервутся.</div>
      {meters.map((m, i) => {
        const t = types.find(x => x.id === m.meter_type_id)
        const rd = reads[m.id]
        return (
          <div key={m.id}>
            {i > 0 && <div style={hair} />}
            <div style={{ padding: '10px 0' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{t?.label || 'Счётчик'}{m.label ? ` · № ${m.label}` : ''}</div>
              {!rd && inputRow(m)}
              {rd && rd.status === 'incomplete' && inputRow(m, `последние от арендатора: ${rd.value} — отмечены неполными`)}
              {rd && rd.status !== 'incomplete' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 15 }}>Значение: <b>{rd.value}</b>{rd.entered_by ? ' · внёс арендодатель' : ' · арендатор'}</span>
                  {rd.status === 'confirmed' ? (
                    <span style={{ fontSize: 13, color: '#1e7e34', fontWeight: 600 }}>подтверждены</span>
                  ) : (
                    <span style={{ display: 'flex', gap: 12 }}>
                      <button style={iosRed} onClick={() => setStatus(rd.id, 'incomplete')}>не полностью</button>
                      <button style={iosBlue} onClick={() => setStatus(rd.id, 'confirmed')}>Подтвердить</button>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ReadingsReview
