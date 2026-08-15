import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../theme'
import { ConfirmDelete, showToast } from './ui'

const line = { display: 'flex', gap: 6, alignItems: 'center' } as const
const inp = { ...T.select, flex: 1, minWidth: 0 }

export function MetersEditor({ objId }: { objId: string }) {
  const [types, setTypes] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [del, setDel] = useState<string | null>(null)
  const [elecPending, setElecPending] = useState<string | null>(null)

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
  const elecCodes = ['electricity_single', 'electricity_day', 'electricity_night', 'electricity_peak', 'electricity_semipeak']
  const activeElecRows = rows.filter(r => elecCodes.includes(codeOf(r)) && r.is_active)

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

  async function setInitial(id: string, value: string) {
    await supabase.from('object_meters').update({ initial_value: value === '' ? null : Number(value) }).eq('id', id)
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
        if (error) { showToast('Ошибка: ' + error.message); return }
      } else {
        const { error } = await supabase.from('object_meters').insert({ object_id: objId, meter_type_id: mt.id, is_active: true, label: '' })
        if (error) { showToast('Ошибка: ' + error.message); return }
      }
      window.dispatchEvent(new Event('rentflow-refresh'))
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function doRemove(id: string) {
    await supabase.from('object_meters').update({ is_active: false }).eq('id', id)
    showToast('Счётчик отключён')
    window.dispatchEvent(new Event('rentflow-refresh'))
    load()
  }

  function getElecMode(): string {
    if (isAct('electricity_peak') && isAct('electricity_semipeak') && isAct('electricity_night')) return '3'
    if (isAct('electricity_day') && isAct('electricity_night')) return '2'
    if (isAct('electricity_single')) return '1'
    return 'none'
  }

  async function applyElecMode(mode: string) {
    const need: Record<string, string[]> = {
      none: [],
      '1': ['electricity_single'],
      '2': ['electricity_day', 'electricity_night'],
      '3': ['electricity_peak', 'electricity_semipeak', 'electricity_night'],
    }
    const all = ['electricity_single', 'electricity_day', 'electricity_night', 'electricity_peak', 'electricity_semipeak']
    for (const code of all) await setActive(code, (need[mode] || []).includes(code))
  }

  function requestElecMode(mode: string) {
    const need: Record<string, string[]> = {
      none: [],
      '1': ['electricity_single'],
      '2': ['electricity_day', 'electricity_night'],
      '3': ['electricity_peak', 'electricity_semipeak', 'electricity_night'],
    }
    const all = ['electricity_single', 'electricity_day', 'electricity_night', 'electricity_peak', 'electricity_semipeak']
    const toDeactivate = all.filter(c => isAct(c) && !(need[mode] || []).includes(c))
    if (toDeactivate.length > 0) setElecPending(mode)
    else applyElecMode(mode)
  }

  const elecMode = getElecMode()

  const meterCard = (r: any, head: any) => (
    <div key={r.id} style={T.item}>
      <div style={{ marginBottom: 6 }}>{head}</div>
      <div style={line}>
        <input defaultValue={r.label || ''} placeholder="номер счётчика" style={inp} onBlur={(e) => setSerial(r.id, e.target.value)} />
        <button style={T.btnDanger} onClick={() => setDel(r.id)}>✕</button>
      </div>
      <div style={{ ...line, marginTop: 6 }}>
        <input defaultValue={r.initial_value ?? ''} placeholder="стартовые показания" style={inp} inputMode="decimal" onBlur={(e) => setInitial(r.id, e.target.value)} />
      </div>
    </div>
  )

  return (
    <div>
      <div style={T.tiny}>Электричество</div>
      {[
        { v: 'none', l: 'Не используется / автопередача данных' },
        { v: '1', l: '1-тарифный' },
        { v: '2', l: '2-тарифный (день/ночь)' },
        { v: '3', l: '3-тарифный (пик/полупик/ночь)' },
      ].map(opt => (
        <div key={opt.v} style={{ marginBottom: 6 }}>
          <label style={{ fontSize: 14, cursor: 'pointer' }}>
            <input type="radio" name={`elec-${objId}`} checked={elecMode === opt.v} onChange={() => requestElecMode(opt.v)} />
            {' '}{opt.l}
          </label>
        </div>
      ))}
      {activeElecRows.map(r => meterCard(r, <span style={{ fontSize: 13 }}>{typeByCode(codeOf(r))?.label || 'Электро'}</span>))}

      <div style={{ ...T.tiny, marginTop: 10 }}>Вода</div>
      {waterRows.length === 0 && <div style={T.tiny}>счётчиков воды нет</div>}
      {waterRows.map(r => meterCard(r, (
        <select value={codeOf(r)} onChange={(e) => setWaterType(r.id, e.target.value)} style={{ ...T.select, width: '100%', boxSizing: 'border-box' }}>
          <option value="water_cold">Холодная</option>
          <option value="water_hot">Горячая</option>
        </select>
      )))}
      <button style={busy ? T.btnOff : T.btnSmall} disabled={busy} onClick={addWater}>+ Добавить счётчик воды</button>

      <div style={{ ...T.tiny, marginTop: 10 }}>Отопление</div>
      {!isAct('heat') && (
        <div style={{ marginBottom: 6 }}>
          <label style={{ fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={false} onChange={(e) => { if (e.target.checked) setActive('heat', true) }} />
            {' '}Теплосчётчик установлен
          </label>
        </div>
      )}
      {activeRows('heat').map(r => meterCard(r, <span style={{ fontSize: 13 }}>Теплосчётчик</span>))}
      {typeByCode('gas') && !isAct('gas') && (
        <div style={{ marginBottom: 6 }}>
          <label style={{ fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={false} onChange={(e) => { if (e.target.checked) setActive('gas', true) }} />
            {' '}Газ
          </label>
        </div>
      )}
      {activeRows('gas').map(r => meterCard(r, <span style={{ fontSize: 13 }}>Счётчик газа</span>))}

      <div style={T.tiny}>Стартовые показания видит арендатор в своей вкладке «Счётчики». Отключение счётчика — только с подтверждением.</div>

      <ConfirmDelete
        open={!!del}
        text="Счётчик будет отключён. История показаний сохранится, но арендатор больше не сможет подавать по нему показания."
        onClose={() => setDel(null)}
        onConfirm={() => { if (del) doRemove(del) }}
      />

      <ConfirmDelete
        open={!!elecPending}
        text="Смена тарифа отключит текущие электросчётчики. Продолжить?"
        onClose={() => setElecPending(null)}
        onConfirm={() => { if (elecPending) applyElecMode(elecPending) }}
      />
    </div>
  )
}

export default MetersEditor
