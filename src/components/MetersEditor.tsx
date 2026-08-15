import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../theme'
import { ConfirmDelete, showToast } from './ui'

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

  const startInput = (r: any) => (
    <input
      defaultValue={r.initial_value ?? ''}
      placeholder="стартовые показания"
      title="Стартовые показания (видит арендатор)"
      style={{ ...T.select, width: 120 }}
      inputMode="decimal"
      onBlur={(e) => setInitial(r.id, e.target.value)}
    />
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
      {activeElecRows.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {activeElecRows.map(r => (
            <div key={r.id} style={{ ...T.item, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, flex: 1, minWidth: 100, textAlign: 'center' }}>{typeByCode(codeOf(r))?.label || 'Электро'}</span>
              <input defaultValue={r.label || ''} placeholder="номер счётчика" style={{ ...T.select, flex: 1, minWidth: 110 }} onBlur={(e) => setSerial(r.id, e.target.value)} />
              {startInput(r)}
              <button style={T.btnDanger} onClick={() => setDel(r.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div style={T.tiny}>Вода</div>
      {waterRows.length === 0 && <div style={T.tiny}>счётчиков воды нет</div>}
      {waterRows.map(r => (
        <div key={r.id} style={{ ...T.item, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={codeOf(r)} onChange={(e) => setWaterType(r.id, e.target.value)} style={{ ...T.select, width: '34%' }}>
            <option value="water_cold">Холодная</option>
            <option value="water_hot">Горячая</option>
          </select>
          <input
            defaultValue={r.label || ''}
            placeholder="номер счётчика"
            style={{ ...T.select, flex: 1, minWidth: 110 }}
            onBlur={(e) => setSerial(r.id, e.target.value)}
          />
          {startInput(r)}
          <button style={T.btnDanger} onClick={() => setDel(r.id)}>✕</button>
        </div>
      ))}
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
      {activeRows('heat').map(r => (
        <div key={r.id} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input defaultValue={r.label || ''} placeholder="номер теплосчётчика" style={{ ...T.select, flex: 1 }} onBlur={(e) => setSerial(r.id, e.target.value)} />
          {startInput(r)}
          <button style={T.btnDanger} onClick={() => setDel(r.id)}>✕</button>
        </div>
      ))}
      {typeByCode('gas') && !isAct('gas') && (
        <div style={{ marginBottom: 6 }}>
          <label style={{ fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={false} onChange={(e) => { if (e.target.checked) setActive('gas', true) }} />
            {' '}Газ
          </label>
        </div>
      )}
      {activeRows('gas').map(r => (
        <div key={r.id} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input defaultValue={r.label || ''} placeholder="номер счётчика газа" style={{ ...T.select, flex: 1 }} onBlur={(e) => setSerial(r.id, e.target.value)} />
          {startInput(r)}
          <button style={T.btnDanger} onClick={() => setDel(r.id)}>✕</button>
        </div>
      ))}
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
