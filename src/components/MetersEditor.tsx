import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function MetersEditor({ objId }: { objId: string }) {
  const [types, setTypes] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])

  async function load() {
    const { data: t } = await supabase.from('meter_types').select('*')
    setTypes(t || [])
    const { data: r } = await supabase.from('object_meters').select('*').eq('object_id', objId)
    setRows(r || [])
  }

  useEffect(() => {
    load()
    const on = () => load()
    window.addEventListener('rentflow-refresh', on)
    return () => window.removeEventListener('rentflow-refresh', on)
  }, [objId])

  const typeByCode = (code: string) => types.find(t => t.code === code)
  const activeRows = (code: string) => rows.filter(r => {
    const t = types.find(x => x.id === r.meter_type_id)
    return t?.code === code && r.is_active
  })
  const isAct = (code: string) => activeRows(code).length > 0

  async function setActive(code: string, active: boolean) {
    const mt = typeByCode(code)
    if (!mt) return
    const ex = rows.find(r => r.meter_type_id === mt.id)
    if (ex) {
      await supabase.from('object_meters').update({ is_active: active }).eq('id', ex.id)
    } else if (active) {
      await supabase.from('object_meters').insert({ object_id: objId, meter_type_id: mt.id, is_active: true, label: '' })
    }
    window.dispatchEvent(new Event('rentflow-refresh'))
    load()
  }

  async function setSerial(id: string, value: string) {
    await supabase.from('object_meters').update({ label: value }).eq('id', id)
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function addMeter(code: string) {
    const mt = typeByCode(code)
    if (!mt) return
    const all = rows.filter(r => r.meter_type_id === mt.id)
    const inactive = all.find(r => !r.is_active)
    if (inactive) {
      await supabase.from('object_meters').update({ is_active: true }).eq('id', inactive.id)
    } else {
      await supabase.from('object_meters').insert({ object_id: objId, meter_type_id: mt.id, is_active: true, label: '' })
    }
    window.dispatchEvent(new Event('rentflow-refresh'))
    load()
  }

  async function removeMeter(id: string) {
    await supabase.from('object_meters').update({ is_active: false }).eq('id', id)
    window.dispatchEvent(new Event('rentflow-refresh'))
    load()
  }

  function getElecMode(): string {
    if (isAct('electricity_peak') && isAct('electricity_semipeak') && isAct('electricity_night')) return '3'
    if (isAct('electricity_day') && isAct('electricity_night')) return '2'
    if (isAct('electricity_single')) return '1'
    return 'none'
  }

  async function setElecMode(mode: string) {
    const need: Record<string, string[]> = {
      none: [],
      '1': ['electricity_single'],
      '2': ['electricity_day', 'electricity_night'],
      '3': ['electricity_peak', 'electricity_semipeak', 'electricity_night'],
    }
    const all = ['electricity_single', 'electricity_day', 'electricity_night', 'electricity_peak', 'electricity_semipeak']
    for (const code of all) await setActive(code, (need[mode] || []).includes(code))
  }

  const elecMode = getElecMode()

  const serialRow = (r: any, withDelete: boolean) => (
    <div key={r.id} style={st.serialRow}>
      <input
        defaultValue={r.label || ''}
        placeholder="номер счётчика"
        style={st.serialInput}
        onBlur={(e) => setSerial(r.id, e.target.value)}
      />
      {withDelete && <button style={st.del} onClick={() => removeMeter(r.id)}>✕</button>}
    </div>
  )

  return (
    <div>
      <div style={st.small}>⚡ Электричество</div>
      {[
        { v: 'none', l: 'Не используется / автопередача данных' },
        { v: '1', l: '1-тарифный' },
        { v: '2', l: '2-тарифный (день/ночь)' },
        { v: '3', l: '3-тарифный (пик/полупик/ночь)' },
      ].map(opt => (
        <div key={opt.v} style={st.row}>
          <label style={st.label}>
            <input type="radio" name={`elec-${objId}`} checked={elecMode === opt.v} onChange={() => setElecMode(opt.v)} />
            {' '}{opt.l}
          </label>
        </div>
      ))}
      {['electricity_single', 'electricity_day', 'electricity_night', 'electricity_peak', 'electricity_semipeak'].map(code =>
        activeRows(code).map(r => (
          <div key={r.id} style={st.serialRow}>
            <span style={st.idx}>{typeByCode(code)?.label}:</span>
            <input defaultValue={r.label || ''} placeholder="номер счётчика" style={st.serialInput} onBlur={(e) => setSerial(r.id, e.target.value)} />
          </div>
        ))
      )}

      <div style={st.small}>💧 Вода</div>
      {['water_cold', 'water_hot'].map(code => {
        const t = typeByCode(code)
        const act = activeRows(code)
        return (
          <div key={code} style={{ marginBottom: 10 }}>
            <div style={st.small}>{t?.label || code}</div>
            {act.length === 0 && <div style={st.note}>счётчиков нет</div>}
            {act.map(r => serialRow(r, true))}
            <button style={st.addBtn} onClick={() => addMeter(code)}>+ Добавить счётчик</button>
          </div>
        )
      })}

      <div style={st.small}>🔥 Отопление</div>
      <div style={st.row}>
        <label style={st.label}>
          <input type="checkbox" checked={isAct('heat')} onChange={(e) => setActive('heat', e.target.checked)} />
          {' '}Теплосчётчик установлен
        </label>
      </div>
      {activeRows('heat').map(r => serialRow(r, false))}
      {typeByCode('gas') && (
        <div style={st.row}>
          <label style={st.label}>
            <input type="checkbox" checked={isAct('gas')} onChange={(e) => setActive('gas', e.target.checked)} />
            {' '}Газ
          </label>
        </div>
      )}
      {activeRows('gas').map(r => serialRow(r, false))}
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  small: { fontSize: 12, color: '#888', marginTop: 6, marginBottom: 4 },
  note: { fontSize: 11, color: 'rgba(0,0,0,0.4)', marginBottom: 4 },
  row: { marginBottom: 8 },
  label: { fontSize: 14, cursor: 'pointer' },
  serialRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 },
  idx: { fontSize: 12, color: '#888', minWidth: 90 },
  serialInput: { flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 },
  del: { padding: '4px 8px', borderRadius: 6, border: 'none', background: '#ff5252', color: '#fff', fontSize: 12, cursor: 'pointer' },
  addBtn: { padding: '6px 10px', borderRadius: 8, border: 'none', background: '#90a4ae', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
}

export default MetersEditor
