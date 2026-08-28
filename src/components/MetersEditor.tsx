import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ConfirmDelete, Modal, showToast } from './ui'

const S: Record<string, React.CSSProperties> = {
  editRow: { position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#f2f2f7' },
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
  saveBar: { position: 'sticky', bottom: 64, zIndex: 20, display: 'flex', gap: 8, padding: '10px 16px', background: '#f2f2f7', borderRadius: 12 },
}

export function MetersEditor({ objId }: { objId: string }) {
  const [types, setTypes] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [del, setDel] = useState<string | null>(null)
  const [elecPending, setElecPending] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, { label: string; initial: string; typeCode: string }>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [withReadings, setWithReadings] = useState<string[]>([])
  const [skips, setSkips] = useState<string[]>([])

  const now = new Date()
  const periodISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  async function load() {
    const { data: t } = await supabase.from('meter_types').select('*')
    setTypes(t || [])
    const { data: r } = await supabase.from('object_meters').select('*').eq('object_id', objId)
    const active = (r || []).filter((x: any) => x.is_active)
    const sorted = active.slice().sort((a: any, b: any) =>
      String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)))
    setRows(sorted)
    const d: Record<string, any> = {}
    for (const row of sorted) {
      d[row.id] = {
        label: row.label || '',
        initial: row.initial_value ?? '',
        typeCode: ((t || []).find((x: any) => x.id === row.meter_type_id) || {}).code || '',
      }
    }
    setDraft(d)
    const ids = sorted.map((x: any) => x.id)
    if (ids.length) {
      const { data: rd } = await supabase.from('meter_readings').select('object_meter_id').in('object_meter_id', ids)
      setWithReadings(Array.from(new Set((rd || []).map((x: any) => x.object_meter_id))))
      const { data: sk } = await supabase.from('meter_skips').select('object_meter_id').eq('period', periodISO).in('object_meter_id', ids)
      setSkips((sk || []).map((s: any) => s.object_meter_id))
    } else { setWithReadings([]); setSkips([]) }
  }

  useEffect(() => {
    load()
    const on = () => load()
    window.addEventListener('rentflow-refresh', on)
    return () => window.removeEventListener('rentflow-refresh', on)
  }, [objId])

  const typeByCode = (code: string) => types.find(t => t.code === code)
  const codeOf = (r: any) => (types.find(t => t.id === r.meter_type_id) || {}).code
  const typeName = (code: string) => code === 'water_cold' ? 'Холодная' : code === 'water_hot' ? 'Горячая' : (types.find(t => t.code === code) || {}).label || code

  const dirtyIds = rows.filter(r => {
    const d = draft[r.id]
    if (!d) return false
    return d.label !== (r.label || '') || String(d.initial) !== String(r.initial_value ?? '') || d.typeCode !== codeOf(r)
  }).map(r => r.id)
  const dirty = dirtyIds.length > 0

  const waterCodes = ['water_cold', 'water_hot']
  const waterRows = rows.filter(r => waterCodes.includes(codeOf(r)))
  const elecCodes = ['electricity_single', 'electricity_day', 'electricity_night', 'electricity_peak', 'electricity_semipeak']
  // день строго перед ночью (и т.д. по тарифу)
  const activeElecRows = rows.filter(r => elecCodes.includes(codeOf(r)))
    .sort((a, b) => elecCodes.indexOf(codeOf(a)) - elecCodes.indexOf(codeOf(b)))
  const activeRows = (code: string) => rows.filter(r => codeOf(r) === code)
  const isAct = (code: string) => activeRows(code).length > 0

  function patchDraft(id: string, p: Partial<{ label: string; initial: string; typeCode: string }>) {
    setDraft(prev => ({ ...prev, [id]: { ...prev[id], ...p } }))
  }

  async function applySave() {
    if (busy) return
    setBusy(true)
    try {
      for (const id of dirtyIds) {
        const r = rows.find(x => x.id === id)
        const d = draft[id]
        if (!r || !d) continue
        const mt = types.find(t => t.code === d.typeCode)
        const upd: any = {}
        if (d.label !== (r.label || '')) upd.label = d.label
        if (String(d.initial) !== String(r.initial_value ?? '')) upd.initial_value = d.initial === '' ? null : Number(d.initial)
        if (mt && mt.id !== r.meter_type_id) upd.meter_type_id = mt.id
        if (Object.keys(upd).length) {
          const { error } = await supabase.from('object_meters').update(upd).eq('id', id)
          if (error) showToast('Ошибка: ' + error.message)
        }
      }
      showToast('✅ Сохранено и заблокировано')
      setConfirmOpen(false)
      setUnlocked(false)
      window.dispatchEvent(new Event('rentflow-refresh'))
      await load()
    } finally { setBusy(false) }
  }

  async function setActive(code: string, active: boolean) {
    if (busy) return
    setBusy(true)
    try {
      const mt = typeByCode(code)
      if (!mt) return
      const { data: fresh } = await supabase.from('object_meters').select('*').eq('object_id', objId).eq('meter_type_id', mt.id)
      if ((fresh || []).length) {
        for (const r of fresh || []) await supabase.from('object_meters').update({ is_active: active }).eq('id', r.id)
      } else if (active) {
        await supabase.from('object_meters').insert({ object_id: objId, meter_type_id: mt.id, is_active: true, label: '' })
      }
      window.dispatchEvent(new Event('rentflow-refresh'))
      await load()
    } finally { setBusy(false) }
  }

  async function addWater() {
    if (busy) return
    setBusy(true)
    try {
      const mt = typeByCode('water_cold')
      if (!mt) return
      const { data: fresh } = await supabase.from('object_meters').select('*').eq('object_id', objId)
      const inactive = (fresh || []).find((r: any) => {
        const c = (types.find(t => t.id === r.meter_type_id) || {}).code
        return !r.is_active && waterCodes.includes(c)
      })
      if (inactive) {
        const { error } = await supabase.from('object_meters').update({ is_active: true }).eq('id', inactive.id)
        if (error) { showToast('Ошибка: ' + error.message); return }
      } else {
        const { error } = await supabase.from('object_meters').insert({ object_id: objId, meter_type_id: mt.id, is_active: true, label: '' })
        if (error) { showToast('Ошибка: ' + error.message); return }
      }
      window.dispatchEvent(new Event('rentflow-refresh'))
      await load()
    } finally { setBusy(false) }
  }

  async function doRemove(id: string) {
    if (busy) return
    setBusy(true)
    try {
      await supabase.from('object_meters').update({ is_active: false }).eq('id', id)
      showToast('Счётчик отключён')
      window.dispatchEvent(new Event('rentflow-refresh'))
      await load()
    } finally { setBusy(false) }
  }

  async function toggleSkip(id: string, on: boolean) {
    if (on) {
      await supabase.from('meter_skips').upsert({ object_meter_id: id, period: periodISO }, { onConflict: 'object_meter_id,period' })
      showToast('✅ Отмечено: тепло в этом месяце не используется')
    } else {
      await supabase.from('meter_skips').delete().eq('object_meter_id', id).eq('period', periodISO)
      showToast('Отметка снята')
    }
    window.dispatchEvent(new Event('rentflow-refresh'))
    await load()
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
    for (const code of elecCodes) await setActive(code, (need[mode] || []).includes(code))
  }

  function requestElecMode(mode: string) {
    if (busy || !unlocked) return
    const need: Record<string, string[]> = {
      none: [],
      '1': ['electricity_single'],
      '2': ['electricity_day', 'electricity_night'],
      '3': ['electricity_peak', 'electricity_semipeak', 'electricity_night'],
    }
    const toDeactivate = elecCodes.filter(c => isAct(c) && !(need[mode] || []).includes(c))
    if (toDeactivate.length > 0) setElecPending(mode)
    else applyElecMode(mode)
  }

  const elecMode = getElecMode()

  const changeLines = dirtyIds.map(id => {
    const r = rows.find(x => x.id === id)
    const d = draft[id]
    if (!r || !d) return ''
    const parts: string[] = []
    if (d.typeCode !== codeOf(r)) parts.push(`тип: ${typeName(codeOf(r))} → ${typeName(d.typeCode)}`)
    if (d.label !== (r.label || '')) parts.push(`номер: ${r.label || '—'} → ${d.label || '—'}`)
    if (String(d.initial) !== String(r.initial_value ?? '')) parts.push(`старт: ${r.initial_value ?? '—'} → ${d.initial || '—'}`)
    return `• ${r.label || typeName(codeOf(r))}: ${parts.join(', ')}`
  }).filter(Boolean)

  const dirtyHasReadings = dirtyIds.some(id => withReadings.includes(id))

  const meterCard = (r: any, title: string, extraRow?: any, isHeat?: boolean) => {
    const d = draft[r.id] || { label: r.label || '', initial: r.initial_value ?? '', typeCode: codeOf(r) }
    return (
      <div key={r.id} style={S.card}>
        <div style={S.row}>
          <span style={S.title}>{title}</span>
          <span style={{ flex: 1 }} />
          {unlocked && <button style={S.minus} onClick={() => setDel(r.id)}>−</button>}
        </div>
        {extraRow && (<><div style={S.sep} />{extraRow}</>)}
        <div style={S.sep} />
        <div style={S.row}>
          <span style={S.label}>Номер счётчика</span>
          <input style={S.value} disabled={!unlocked} value={d.label} placeholder="—" onChange={(e) => patchDraft(r.id, { label: e.target.value })} />
        </div>
        <div style={S.sep} />
        <div style={S.row}>
          <span style={S.label}>Стартовые показания</span>
          <input style={S.value} disabled={!unlocked} inputMode="decimal" value={String(d.initial)} placeholder="—" onChange={(e) => patchDraft(r.id, { initial: e.target.value })} />
        </div>
        {isHeat && (
          <>
            <div style={S.sep} />
            <label style={{ ...S.row, cursor: 'pointer' }}>
              <input type="checkbox" checked={skips.includes(r.id)} onChange={(e) => toggleSkip(r.id, e.target.checked)} />
              <span style={S.label}>Тепло не используется в этом месяце</span>
            </label>
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={S.editRow}>
        <span style={{ fontSize: 13, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: 0.3 }}>Счётчики</span>
        <button style={S.editBtn} onClick={() => {
          if (unlocked) { load(); setUnlocked(false) } else setUnlocked(true)
        }}>{unlocked ? 'Готово (заблокировать)' : 'Внести изменения'}</button>
      </div>
      {!unlocked && <div style={S.hint}>Настройки защищены. Чтобы поменять номер, тип или стартовые показания — нажмите «Внести изменения», затем подтвердите сохранение.</div>}

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
            <button style={{ ...S.rowBtn, opacity: unlocked ? 1 : 0.55 }} disabled={busy || !unlocked} onClick={() => requestElecMode(o.v)}>
              <span style={S.label}>{o.l}</span>
              {elecMode === o.v && <span style={S.check}>✓</span>}
            </button>
          </div>
        ))}
      </div>
      {activeElecRows.map(r => meterCard(r, typeByCode(codeOf(r))?.label || 'Электро'))}

      <div style={S.head}>Вода</div>
      {waterRows.length === 0 && <div style={S.hint}>Счётчиков воды нет</div>}
      {waterRows.map(r => meterCard(r, (draft[r.id]?.typeCode || codeOf(r)) === 'water_hot' ? 'Горячая вода' : 'Холодная вода', (
        <div style={S.row}>
          <span style={S.label}>Тип</span>
          <select style={S.select} disabled={!unlocked} value={draft[r.id]?.typeCode || codeOf(r)} onChange={(e) => patchDraft(r.id, { typeCode: e.target.value })}>
            <option value="water_cold">Холодная</option>
            <option value="water_hot">Горячая</option>
          </select>
        </div>
      )))}
      <button style={S.add} disabled={busy || !unlocked} onClick={addWater}>+ Добавить счётчик воды</button>

      <div style={S.head}>Отопление и газ</div>
      {!isAct('heat') && (
        <div style={S.card}>
          <button style={{ ...S.rowBtn, opacity: unlocked ? 1 : 0.55 }} disabled={busy || !unlocked} onClick={() => setActive('heat', true)}>
            <span style={S.label}>Теплосчётчик установлен</span>
            <span style={{ color: '#0071e3', fontSize: 15 }}>добавить</span>
          </button>
        </div>
      )}
      {activeRows('heat').map(r => meterCard(r, 'Теплосчётчик', undefined, true))}
      {typeByCode('gas') && !isAct('gas') && (
        <div style={S.card}>
          <button style={{ ...S.rowBtn, opacity: unlocked ? 1 : 0.55 }} disabled={busy || !unlocked} onClick={() => setActive('gas', true)}>
            <span style={S.label}>Счётчик газа</span>
            <span style={{ color: '#0071e3', fontSize: 15 }}>добавить</span>
          </button>
        </div>
      )}
      {activeRows('gas').map(r => meterCard(r, 'Счётчик газа'))}

      {unlocked && dirty && (
        <div style={S.saveBar}>
          <button style={{ ...S.add, margin: 0, flex: 1 }} disabled={busy} onClick={() => setConfirmOpen(true)}>Сохранить изменения</button>
          <button style={{ flex: 1, padding: '11px 16px', borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} disabled={busy} onClick={() => load()}>Отменить</button>
        </div>
      )}

      <div style={S.hint}>Порядок счётчиков фиксированный: электричество — день, затем ночь. Изменения применяются только после подтверждения, затем настройки блокируются.</div>

      <Modal open={confirmOpen} title="Подтвердить изменения счётчиков" onClose={() => setConfirmOpen(false)}>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 10, whiteSpace: 'pre-wrap' }}>{changeLines.join('\n')}</div>
        {dirtyHasReadings && (
          <div style={{ fontSize: 13, color: '#b25000', marginBottom: 10 }}>
            ⚠️ По некоторым из этих счётчиков уже подавались показания. История сохранится, прошлые месяцы не пересчитаются.
          </div>
        )}
        <div style={{ fontSize: 13, color: '#555', marginBottom: 14 }}>Тип счётчика влияет на расчёты квитанций и штрафов. После сохранения настройки снова будут заблокированы.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }} disabled={busy} onClick={applySave}>Подтверждаю</button>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => setConfirmOpen(false)}>Отмена</button>
        </div>
      </Modal>

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
        onConfirm={() => { const m = elecPending; setElecPending(null); if (m) applyElecMode(m) }}
      />
    </div>
  )
}

export default MetersEditor
