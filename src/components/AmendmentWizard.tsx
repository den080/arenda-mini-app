import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../theme'
import { Modal, showToast } from './ui'

const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box', outline: 'none', background: '#fff' }

export function AmendmentWizard({ contractId, tenantId }: { contractId: string; tenantId: string }) {
  const [rent, setRent] = useState('')
  const [fromMonth, setFromMonth] = useState('')
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [current, setCurrent] = useState<any>(null)

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from('contracts').select('rent_amount, amendment_at, amendment_from').eq('id', contractId).maybeSingle()
      setCurrent(c || null)
      if (c) setRent(String(Number(c.rent_amount) || ''))
      const n = new Date()
      const next = new Date(n.getFullYear(), n.getMonth() + 1, 1)
      setFromMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
      setReady(true)
    })()
  }, [contractId])

  const months: { v: string; l: string }[] = []
  for (let i = 0; i < 13; i++) {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() + i, 1)
    months.push({
      v: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      l: d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
    })
  }

  async function apply() {
    if (busy) return
    const newRent = Number(rent)
    if (isNaN(newRent) || newRent <= 0) { showToast('Укажите новую сумму аренды'); return }
    if (!fromMonth) { showToast('Укажите месяц действия'); return }
    setBusy(true)
    try {
      const fromPeriod = `${fromMonth}-01`
      const { error: e1 } = await supabase.from('contracts').update({
        rent_amount: newRent,
        amendment_at: new Date().toISOString(),
        amendment_from: fromPeriod,
        amendment_note: note.trim() || null,
      }).eq('id', contractId)
      if (e1) { showToast('Ошибка: ' + e1.message); return }
      const { error: e2 } = await supabase.from('payments')
        .update({ base_amount: newRent })
        .eq('contract_id', contractId)
        .eq('confirmed_by_landlord', false)
        .gte('period', fromPeriod)
      if (e2) { showToast('Ошибка: ' + e2.message); return }
      await supabase.from('notifications_log').insert({
        user_id: tenantId, type: 'amendment', related_id: contractId,
        message: `📝 Допсоглашение: аренда ${newRent.toFixed(0)} ₽/мес с ${new Date(fromPeriod).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`,
        sent_at: new Date().toISOString(),
      })
      showToast('✅ Допсоглашение сохранено')
      setOpen(false)
      setOk(false)
      setExpanded(false)
      window.dispatchEvent(new Event('rentflow-refresh'))
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return null
  return (
    <div style={T.card}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: '10px 0 4px', textAlign: 'left', boxSizing: 'border-box' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>Допсоглашение</div>
          <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>
            {current?.amendment_at
              ? `Аренда ${Number(current.rent_amount).toFixed(0)} ₽ с ${new Date(current.amendment_from || current.amendment_at).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`
              : 'Изменение аренды по взаимному согласию'}
          </div>
        </div>
        <span style={{ color: '#c7c7cc', fontSize: 18 }}>{expanded ? '▴' : '›'}</span>
      </button>
      {expanded && (
        <>
          <div style={{ ...T.small, margin: '4px 0 10px' }}>Новые суммы встанут в неоплаченные счета с выбранного месяца, оплаченная история не изменится.</div>
          <div style={{ fontSize: 14, margin: '8px 0 4px' }}>Новая аренда, ₽/мес</div>
          <input value={rent} onChange={(e) => setRent(e.target.value)} inputMode="numeric" style={inp} />
          <div style={{ fontSize: 14, margin: '10px 0 4px' }}>Действует с месяца</div>
          <select value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} style={inp}>
            {months.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
          <div style={{ fontSize: 14, margin: '10px 0 4px' }}>Комментарий (необязательно)</div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: индексация по договору" style={inp} />
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
            <button style={iosBlue} onClick={() => { setOk(false); setOpen(true) }}>Сохранить допсоглашение</button>
          </div>
        </>
      )}
      <Modal open={open} title="Допсоглашение" onClose={() => setOpen(false)}>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 12 }}>
          Аренда {Number(rent || 0).toFixed(0)} ₽/мес с {fromMonth ? new Date(`${fromMonth}-01`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : '—'}. Неоплаченные счета с этого месяца будут пересчитаны, оплаченные — не изменятся.
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 14, color: '#1d1d1f' }}>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          Согласовано с арендатором
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            disabled={!ok || busy}
            onClick={apply}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: ok ? 1 : 0.4 }}
          >{busy ? 'Сохранение…' : 'Сохранить'}</button>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => setOpen(false)}>Отмена</button>
        </div>
      </Modal>
    </div>
  )
}

export default AmendmentWizard
