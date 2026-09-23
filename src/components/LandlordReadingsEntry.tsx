import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { showToast, Hint, errText } from './ui'
import { T } from '../theme'

// Ввод показаний арендодателем за арендатора (учёт без арендатора).
// Запись создаётся/обновляется с entered_by = id арендодателя и статусом confirmed.
export function LandlordReadingsEntry({ objectId, contractId, myId }: { objectId: string; contractId: string; myId: string }) {
  const [meters, setMeters] = useState<any[]>([])
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const now = new Date()
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('object_meters').select('*, meter_types(label)').eq('object_id', objectId).eq('is_active', true)
      setMeters(data || [])
    })()
  }, [objectId])

  async function save() {
    const rows = meters.filter((m: any) => String(vals[m.id] || '').trim() !== '')
    if (!rows.length) { showToast('Введите показания'); return }
    setBusy(true)
    try {
      for (const m of rows) {
        const num = Number(String(vals[m.id]).replace(',', '.'))
        if (isNaN(num) || num < 0) { showToast('Некорректное значение'); return }
        const { data: cur } = await supabase.from('meter_readings').select('*').eq('object_meter_id', m.id).eq('contract_id', contractId).eq('period', period).maybeSingle()
        if (cur) {
          const { error } = await supabase.from('meter_readings').update({ value: num, status: 'confirmed', entered_by: myId, submitted_at: new Date().toISOString() }).eq('id', cur.id)
          if (error) { showToast(errText(error)); return }
        } else {
          const { error } = await supabase.from('meter_readings').insert({ object_meter_id: m.id, contract_id: contractId, period, value: num, status: 'confirmed', entered_by: myId, submitted_at: new Date().toISOString() })
          if (error) { showToast(errText(error)); return }
        }
      }
      showToast('✅ Показания внесены за арендатора')
      setVals({})
      window.dispatchEvent(new Event('rentflow-refresh'))
    } finally { setBusy(false) }
  }

  if (!meters.length) return null
  return (
    <div style={T.card}>
      <div style={T.h2}>Ввести показания за арендатора</div>
      {meters.map((m: any, i: number) => (
        <div key={m.id}>
          {i > 0 && <div style={{ height: 1, background: 'rgba(60,60,67,0.12)' }} />}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '8px 0' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{m.meter_types?.label || 'Счётчик'}{m.label ? ` · № ${m.label}` : ''}</span>
            <input
              style={{ width: 110, border: 'none', outline: 'none', background: 'rgba(120,120,128,0.08)', borderRadius: 8, padding: '8px 10px', fontSize: 17, fontWeight: 600, textAlign: 'right', color: '#1d1d1f', boxSizing: 'border-box' }}
              value={vals[m.id] || ''}
              onChange={(e) => setVals({ ...vals, [m.id]: e.target.value })}
              placeholder="0"
              inputMode="decimal"
            />
          </div>
        </div>
      ))}
      <button style={T.btn} disabled={busy} onClick={save}>Сохранить как внесённые арендодателем</button>
      <Hint text="Запись помечается как внесённая арендодателем и сразу подтверждена: штраф за просрочку показаний не начисляется, арендатор увидит значение в своей истории." />
    </div>
  )
}

export default LandlordReadingsEntry
