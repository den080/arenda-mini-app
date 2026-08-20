import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../theme'
import { Modal, showToast } from './ui'

const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box', outline: 'none' }

export function AmendmentWizard({ contractId, tenantId }: { contractId: string; tenantId: string }) {
  const [rent, setRent] = useState('')
  const [fromMonth, setFromMonth] = useState('')
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from('contracts').select('rent_amount').eq('id', contractId).maybeSingle()
      if (c) setRent(String(Number(c.rent_amount) || ''))
      const n = new Date()
      const next = new Date(n.getFullYear(), n.getMonth() + 1, 1)
      setFromMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
      setReady(true)
    })()
  }, [contractId])

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
      window.dispatchEvent(new Event('rentflow-refresh'))
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return null

  return (
    <div style={T.card}>
      <div style={T.h2}>Допсоглашение</div>
      <div style={{ ...T.small, margin: '4px 0 10px' }}>Изменение аренды по взаимному согласию: новые суммы встанут в неоплаченные счета с выбранного месяца, оплаченная история не изменится.</div>
      <div style={{ fontSize: 14, margin: '8px 0 4px' }}>Новая аренда, ₽/мес</div>
      <input value={rent} onChange={(e) => setRent(e.target.value)} inputMode="numeric" style={inp} />
      <div style={{ fontSize: 14, margin: '10px 0 4px' }}>Действует с месяца</div>
      <input type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} style={inp} />
      <div style={{ fontSize: 14, margin: '10px 0 4px' }}>Комментарий (необязательно)</div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: индексация по договору" style={inp} />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
        <button style={iosBlue} onClick={() => { setOk(false); setOpen(true) }}>Сохранить допсоглашение</button>
      </div>

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
