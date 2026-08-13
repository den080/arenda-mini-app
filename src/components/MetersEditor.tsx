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

  async function setCount(code: string, n: number) {
    const mt = typeByCode(code)
    if (!mt || n < 0 || n > 4) return
    const cur = activeRows(code)
    if (n > cur.length) {
      const all = rows.filter(r => r.meter_type_id === mt.id)
      const inactive = all.filter(r => !r.is_active)
      let toAdd = n - cur.length
      for (const r of inactive) {
        if (toAdd <= 0) break
        await supabase.from('object_meters').update({ is_active: true }).eq('id', r.id)
        toAdd--
      }
      for (let i = 0; i < toAdd; i++) {
        await supabase.from('object_meters').insert({ object_id: objId, meter_type_id: mt.id, is_active: true, label: '' })
      }
    } else if (n < cur.length) {
      for (let i = cur.length - 1; i >= n; i--) {
        await supabase.from('object_meters').update({ is_active: false }).eq('id', cur[i].id)
      }
    }
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

  const serialInput = (r: any) => (
    <div key={r.id} style={st.serialRow}>
      <input
        defaultValue={r.label || ''}
        placeholder="номер счётчика"
        style={st.serialInput}
        onBlur={(e) => setSerial(r.id, e.target.value)}
      />
    </div>
  )

  const elecMode = getElecMode()

  return (
    <div>
      <div style={st.small}>⚡ Электричество</div>
      {[
        { v: 'none', l: 'Не установлено' },
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

      <div style={st.small}>💧 Вода (можно несколько счётчиков)</div>
      {['water_cold', 'water_hot'].map(code => {
        const t = typeByCode(code)
        const act = activeRows(code)
        return (
          <div key={code}>
            <div style={st.countRow}>
              <span>{t?.label || code}: {act.length === 0 ? 'не установлено' : `${act.length} счётчик(а)`}</span>
              <span>
                <button style={st.miniBtn} onClick={() => setCount(code, act.length - 1)}>−</button>
                <button style={st.miniBtn} onClick={() => setCount(code, act.length + 1)}>+</button>
              </span>
            </div>
            {act.map(serialInput)}
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
      {activeRows('heat').map(serialInput)}
      {typeByCode('gas') && (
        <div style={st.row}>
          <label style={st.label}>
            <input type="checkbox" checked={isAct('gas')} onChange={(e) => setActive('gas', e.target.checked)} />
            {' '}Газ
          </label>
        </div>
      )}
      {activeRows('gas').map(serialInput)}
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  small: { fontSize: 12, color: '#888', marginTop: 6, marginBottom: 4 },
  row: { marginBottom: 8 },
  label: { fontSize: 14, cursor: 'pointer' },
  countRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14, marginBottom: 8 },
  miniBtn: { padding: '4px 10px', borderRadius: 6, border: 'none', background: '#2196f3', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginLeft: 6 },
  serialRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 },
  idx: { fontSize: 12, color: '#888', minWidth: 90 },
  serialInput: { flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 },
}

export default MetersEditor
