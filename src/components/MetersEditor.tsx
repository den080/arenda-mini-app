import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function MetersEditor({ objId }: { objId: string }) {
  const [types, setTypes] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [busy, setBusy] = useState(false)

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
  const codeOf = (r: any) => (types.find(t => t.id === r.meter_type_id) || {}).code
  const activeRows = (code: string) => rows.filter(r => codeOf(r) === code && r.is_active)
  const isAct = (code: string) => activeRows(code).length > 0

  const waterCodes = ['water_cold', 'water_hot']
  const waterRows = rows.filter(r => waterCodes.includes(codeOf(r)) && r.is_active)

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

  async function setWaterType(id: string, code: string) {
    const mt = typeByCode(code)
    if (!mt) return
    await supabase.from('object_meters').update({ meter_type_id: mt.id }).eq('id', id)
    window.dispatchEvent(new Event('rentflow-refresh'))
    load()
  }

  async function addWater() {
    if (busy) return
    setBusy(true)
    try {
      const mt = typeByCode('water_cold')
      if (!mt) return
      const inactive = rows.find(r => !r.is_active && waterCodes.includes(codeOf(r)))
      if (inactive) {
        const { error } = await supabase.from('object_meters').update({ is_active: true }).eq('id', inactive.id)
        if (error) { alert('Ошибка: ' + error.message); return }
      } else {
        const { error } = await supabase.from('object_meters').insert({ object_id: objId, meter_type_id: mt.id, is_active: true, label: '' })
        if (error) { alert('Ошибка: ' + error.message); return }
      }
      window.dispatchEvent(new Event('rentflow-refresh'))
      await load()
    } finally {
      setBusy(false)
    }
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

      <div style={st.small}>💧 Вода</div>
      {waterRows.length === 0 && <div style={st.note}>счётчиков воды нет</div>}
      {waterRows.map(r => (
        <div key={r.id} style={st.detailRow}>
          <select value={codeOf(r)} onChange={(e) => setWaterType(r.id, e.target.value)} style={st.half}>
            <option value="water_cold">Холодная</option>
            <option value="water_hot">Горячая</option>
          </select>
          <input
            defaultValue={r.label || ''}
            placeholder="номер счётчика"
            style={st.input}
            onBlur={(e) => setSerial(r.id, e.target.value)}
          />
          <button style={st.del} onClick={() => removeMeter(r.id)}>✕</button>
        </div>
      ))}
      <button style={busy ? st.addBtnOff : st.addBtn} disabled={busy} onClick={addWater}>+ Добавить счётчик воды</button>

      <div style={st.small}>🔥 Отопление</div>
      <div style={st.row}>
        <label style={st.label}>
          <input type="checkbox" checked={isAct('heat')} onChange={(e) => setActive('heat', e.target.checked)} />
          {' '}Теплосчётчик установлен
        </label>
      </div>
      {activeRows('heat').map(r => (
        <div key={r.id} style={st.serialRow}>
          <input defaultValue={r.label || ''} placeholder="номер теплосчётчика" style={st.serialInput} onBlur={(e) => setSerial(r.id, e.target.value)} />
        </div>
      ))}
      {typeByCode('gas') && (
        <div style={st.row}>
          <label style={st.label}>
            <input type="checkbox" checked={isAct('gas')} onChange={(e) => setActive('gas', e.target.checked)} />
            {' '}Газ
          </label>
        </div>
      )}
      {activeRows('gas').map(r => (
        <div key={r.id} style={st.serialRow}>
          <input defaultValue={r.label || ''} placeholder="номер счётчика газа" style={st.serialInput} onBlur={(e) => setSerial(r.id, e.target.value)} />
        </div>
      ))}
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  small: { fontSize: 12, color: '#888', marginTop: 6, marginBottom: 4 },
  note: { fontSize: 11, color: 'rgba(0,0,0,0.4)', marginBottom: 4 },
  row: { marginBottom: 8 },
  label: { fontSize: 14, cursor: 'pointer' },
  detailRow: { background: '#f9f9f9', borderRadius: 8, padding: 8, marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  half: { width: '38%', padding: 8, borderRadius: 8, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  input: { flex: 1, minWidth: 120, padding: 8, borderRadius: 8, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' },
  serialRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 },
  serialInput: { flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 },
  del: { padding: '6px 10px', borderRadius: 8, border: 'none', background: '#e57373', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  addBtn: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2196f3', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  addBtnOff: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#9e9e9e', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'default' },
}

export default MetersEditor
