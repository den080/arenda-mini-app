import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ConfirmDelete, showToast } from './ui'

const S: Record<string, React.CSSProperties> = {
  editRow: { position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', background: '#f2f2f7' },
  editBtn: { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4 },
  head: { fontSize: 13, color: '#8e8e93', margin: '16px 16px 6px', textTransform: 'uppercase', letterSpacing: 0.3 },
  card: { background: '#fff', borderRadius: 12, margin: '0 0 10px', padding: '0 16px' },
  row: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '4px 0', boxSizing: 'border-box' },
  rowBtn: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 44, padding: '4px 0', boxSizing: 'border-box', width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' },
  sep: { height: 1, background: 'rgba(60,60,67,0.12)' },
  label: { fontSize: 15, color: '#1d1d1f' },
  title: { fontSize: 15, fontWeight: 600, color: '#1d1d1f' },
  value: { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right', fontSize: 15, color: '#1d1d1f', padding: 0 },
  select: { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right', fontSize: 15, color: '#0071e3', padding: 0 },
  minus: { width: 22, height: 22, borderRadius: 11, border: 'none', background: '#ff3b30', color: '#fff', fontSize: 16, lineHeight: '20px', cursor: 'pointer', padding: 0, flexShrink: 0 },
  check: { color: '#0071e3', fontSize: 17, fontWeight: 600 },
  add: { margin: '2px 0 12px', padding: '11px 16px', borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  hint: { fontSize: 12, color: '#8e8e93', margin: '4px 16px 12px' },
}

export function MetersEditor({ objId }: { objId: string }) {
  const [types, setTypes] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(false)
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

  const meterCard = (r: any, title: string, extraRow?: any) => (
    <div key={r.id} style={S.card}>
      <div style={S.row}>
        <span style={S.title}>{title}</span>
        <span style={{ flex: 1 }} />
        {edit && <button style={S.minus} onClick={() => setDel(r.id)}>−</button>}
      </div>
      {extraRow && (<><div style={S.sep} />{extraRow}</>)}
      <div style={S.sep} />
      <div style={S.row}>
        <span style={S.label}>Номер счётчика</span>
        <input style={S.value} defaultValue={r.label || ''} placeholder="—" onBlur={(e) => setSerial(r.id, e.target.value)} />
      </div>
      <div style={S.sep} />
      <div style={S.row}>
        <span style={S.label}>Стартовые показания</span>
        <input style={S.value} inputMode="decimal" defaultValue={r.initial_value ?? ''} placeholder="—" onBlur={(e) => setInitial(r.id, e.target.value)} />
      </div>
    </div>
  )

  return (
    <div>
      <div style={S.editRow}>
        <span style={{ fontSize: 13, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: 0.3 }}>Счётчики</span>
        <button style={S.editBtn} onClick={() => setEdit(!edit)}>{edit ? 'Готово' : 'Изменить'}</button>
      </div>

      <div style={S.head}>Электричество</div>
      <div style={S.card}>
        {[
          { v: 'none', l: 'Не используется / автопередача' },
          { v: '1', l: '1-тарифный' },
          { v: '2', l: '2-тарифный (день/ночь)' },
          { v: '3', l: '3-тарифный (пик/полупик/ночь)' },
        ].map((o, i) => (
          <div key={o.v}>
            {i > 0 && <div style={S.sep} />}
            <button style={S.rowBtn} onClick={() => requestElecMode(o.v)}>
              <span style={S.label}>{o.l}</span>
              {elecMode === o.v && <span style={S.check}>✓</span>}
            </button>
          </div>
        ))}
      </div>
      {activeElecRows.map(r => meterCard(r, typeByCode(codeOf(r))?.label || 'Электро'))}

      <div style={S.head}>Вода</div>
      {waterRows.length === 0 && <div style={S.hint}>Счётчиков воды нет</div>}
      {waterRows.map(r => meterCard(r, codeOf(r) === 'water_hot' ? 'Горячая вода' : 'Холодная вода', (
        <div style={S.row}>
          <span style={S.label}>Тип</span>
          <select value={codeOf(r)} onChange={(e) => setWaterType(r.id, e.target.value)} style={S.select}>
            <option value="water_cold">Холодная</option>
            <option value="water_hot">Горячая</option>
          </select>
        </div>
      )))}
      <button style={S.add} disabled={busy} onClick={addWater}>+ Добавить счётчик воды</button>

      <div style={S.head}>Отопление и газ</div>
      {!isAct('heat') && (
        <div style={S.card}>
          <button style={S.rowBtn} onClick={() => setActive('heat', true)}>
            <span style={S.label}>Теплосчётчик установлен</span>
            <span style={{ color: '#0071e3', fontSize: 15 }}>добавить</span>
          </button>
        </div>
      )}
      {activeRows('heat').map(r => meterCard(r, 'Теплосчётчик'))}
      {typeByCode('gas') && !isAct('gas') && (
        <div style={S.card}>
          <button style={S.rowBtn} onClick={() => setActive('gas', true)}>
            <span style={S.label}>Счётчик газа</span>
            <span style={{ color: '#0071e3', fontSize: 15 }}>добавить</span>
          </button>
        </div>
      )}
      {activeRows('gas').map(r => meterCard(r, 'Счётчик газа'))}

      <div style={S.hint}>Стартовые показания видит арендатор. Отключение счётчика — в режиме «Изменить», с подтверждением.</div>

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
