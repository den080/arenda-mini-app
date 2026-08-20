import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../theme'
import { Modal, showToast } from './ui'

const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function TerminationWizard({ contractId }: { contractId: string }) {
  const [open, setOpen] = useState(false)
  const [calc, setCalc] = useState<any>(null)
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)

  async function loadCalc() {
    const [c, f, p] = await Promise.all([
      supabase.from('contracts').select('*').eq('id', contractId).maybeSingle(),
      supabase.from('frozen_penalties').select('amount').eq('contract_id', contractId),
      supabase.from('payments').select('*').eq('contract_id', contractId).eq('confirmed_by_landlord', false),
    ])
    const contract = c.data
    if (!contract) return
    const frozen = (f.data || []).reduce((s: number, x: any) => s + Number(x.amount || 0), 0)
    const openList = p.data || []
    const openSum = openList.reduce((s: number, x: any) => s + Number(x.base_amount || 0) + Number(x.penalty_amount || 0) + Number(x.utilities_amount || 0), 0)
    const depositPaid = Number(contract.deposit_paid || 0)
    const result = depositPaid - frozen - openSum
    setCalc({ contract, frozen, openSum, openCount: openList.length, depositPaid, result })
    setDate(iso(new Date()))
  }

  useEffect(() => { if (open) { setOk(false); loadCalc() } }, [open])

  async function confirm() {
    if (!calc || busy) return
    setBusy(true)
    try {
      const { error } = await supabase.from('contracts').update({
        status: 'terminated',
        terminated_at: new Date(date + 'T12:00:00').toISOString(),
        termination_note: note.trim() || null,
        settlement: { deposit_paid: calc.depositPaid, frozen_total: calc.frozen, open_debt: calc.openSum, result: calc.result },
      }).eq('id', contractId)
      if (error) { showToast('Ошибка: ' + error.message); return }
      await supabase.from('notifications_log').insert({
        user_id: calc.contract.tenant_id, type: 'contract_terminated', related_id: contractId,
        message: `🏁 Договор завершён ${new Date(date + 'T12:00:00').toLocaleDateString('ru-RU')}. ${calc.result >= 0 ? `К возврату арендатору ${calc.result.toFixed(0)} ₽` : `Долг арендатора ${Math.abs(calc.result).toFixed(0)} ₽`}`,
        sent_at: new Date().toISOString(),
      })
      showToast('✅ Договор завершён')
      setOpen(false)
      window.dispatchEvent(new Event('rentflow-refresh'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={T.card}>
      <div style={T.h2}>Завершение договора</div>
      <div style={{ ...T.small, margin: '4px 0 10px' }}>При съезде арендатора приложение посчитает итог: депозит минус замороженные штрафы и открытые счета.</div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
        <button style={iosBlue} onClick={() => setOpen(true)}>Рассчитать и завершить</button>
      </div>

      <Modal open={open} title="Завершение договора" onClose={() => setOpen(false)}>
        {calc && (
          <>
            <div style={T.row}><span style={{ color: '#8e8e93', fontSize: 14 }}>Депозит внесён</span><b>{calc.depositPaid.toFixed(0)} ₽</b></div>
            <div style={T.row}><span style={{ color: '#8e8e93', fontSize: 14 }}>Замороженные штрафы</span><b>−{calc.frozen.toFixed(0)} ₽</b></div>
            <div style={T.row}><span style={{ color: '#8e8e93', fontSize: 14 }}>Открытые счета ({calc.openCount})</span><b>−{calc.openSum.toFixed(0)} ₽</b></div>
            <div style={{ ...T.row, borderBottom: 'none' }}>
              <span style={{ color: '#8e8e93', fontSize: 14 }}>Итог</span>
              <b style={{ color: calc.result >= 0 ? '#1e7e34' : '#ff3b30' }}>{calc.result >= 0 ? `вернуть ${calc.result.toFixed(0)} ₽` : `долг ${Math.abs(calc.result).toFixed(0)} ₽`}</b>
            </div>
            <div style={{ fontSize: 14, margin: '10px 0 4px' }}>Дата съезда</div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box' }} />
            <div style={{ fontSize: 14, margin: '10px 0 4px' }}>Примечание (ключи, состояние, акт)</div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: ключи возвращены, замечаний нет" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box' }} />
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, margin: '12px 0' }}>
              <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
              Стороны рассчитаны, договор расторгается
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={!ok || busy} onClick={confirm} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: ok ? 1 : 0.4 }}>Завершить договор</button>
              <button onClick={() => setOpen(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Отмена</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

export default TerminationWizard
