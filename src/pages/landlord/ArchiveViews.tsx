import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { T } from '../../theme'
import { ConfirmDelete, showToast } from '../../components/ui'
import { parseDate, isFirstPeriod, iosBlue, iosRed, iosMuted, valText, valMoney } from './helpers'

export function ArchiveItemView({ arch, onBack }: { arch: any; onBack: () => void }) {
  const [archivePays, setArchivePays] = useState<any[]>([])
  const [archiveFrozen, setArchiveFrozen] = useState<any[]>([])
  const [archDelOpen, setArchDelOpen] = useState(false)

  useEffect(() => {
    if (!arch?.id) return
    ;(async () => {
      const [p, f] = await Promise.all([
        supabase.from('payments').select('*').eq('contract_id', arch.id).order('period', { ascending: false }),
        supabase.from('frozen_penalties').select('*').eq('contract_id', arch.id).order('period', { ascending: true }),
      ])
      setArchivePays(p.data || [])
      setArchiveFrozen(f.data || [])
    })()
  }, [arch?.id])

  async function deleteArchivedContract() {
    const id = arch.id
    await supabase.from('meter_readings').delete().eq('contract_id', id)
    await supabase.from('payments').delete().eq('contract_id', id)
    await supabase.from('penalty_rules').delete().eq('contract_id', id)
    await supabase.from('cash_meetings').delete().eq('contract_id', id)
    await supabase.from('deferred_requests').delete().eq('contract_id', id)
    await supabase.from('deferred_debts').delete().eq('contract_id', id)
    await supabase.from('frozen_penalties').delete().eq('contract_id', id)
    await supabase.from('utility_bills').delete().eq('contract_id', id)
    const { error } = await supabase.from('contracts').delete().eq('id', id)
    if (error) { showToast('Ошибка: ' + error.message); return }
    showToast('✅ Договор удалён из архива')
    setArchDelOpen(false)
    onBack()
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  const archSd = arch?.start_date ? parseDate(arch.start_date) : null
  const archSettlement = (arch as any)?.settlement || {}

  return (
    <div style={{ ...T.page, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
        <button style={iosBlue} onClick={onBack}>← Архив договоров</button>
      </div>
      <h1 style={T.h1}>{arch.object?.address || 'Объект'}</h1>
      <div style={T.card}>
        <div style={T.h2}>Договор завершён · архив</div>
        <div style={T.row}><span style={iosMuted}>Арендатор</span><span style={valText}>{arch.tenant?.full_name || '—'}</span></div>
        {arch.tenant?.phone && <div style={T.row}><span style={iosMuted}>Телефон</span><span style={valText}>{arch.tenant.phone}</span></div>}
        <div style={T.row}><span style={iosMuted}>Срок</span><span style={valText}>{arch.start_date ? parseDate(arch.start_date).toLocaleDateString('ru-RU') : '—'} — {arch.terminated_at ? new Date(arch.terminated_at).toLocaleDateString('ru-RU') : '—'}</span></div>
        <div style={T.row}><span style={iosMuted}>Аренда</span><span style={valMoney}>{Number(arch.rent_amount || 0).toFixed(0)} ₽/мес</span></div>
        {arch.termination_note && <div style={T.row}><span style={iosMuted}>Примечание</span><span style={valText}>{arch.termination_note}</span></div>}
        {archSettlement.deposit_paid != null && <div style={T.row}><span style={iosMuted}>Депозит внесён</span><span style={valMoney}>{Number(archSettlement.deposit_paid).toFixed(0)} ₽</span></div>}
        {archSettlement.frozen_total != null && Number(archSettlement.frozen_total) > 0 && <div style={T.row}><span style={iosMuted}>Удержано по штрафам</span><span style={valMoney}>{Number(archSettlement.frozen_total).toFixed(0)} ₽</span></div>}
        {archSettlement.open_debt != null && Number(archSettlement.open_debt) > 0 && <div style={T.row}><span style={iosMuted}>Долг по счетам</span><span style={valMoney}>{Number(archSettlement.open_debt).toFixed(0)} ₽</span></div>}
        <div style={{ ...T.row, borderBottom: 'none' }}>
          <span style={iosMuted}>Итог при съезде</span>
          <span style={{ ...valMoney, color: Number(archSettlement.result || 0) >= 0 ? '#1e7e34' : '#ff3b30' }}>
            {Number(archSettlement.result || 0) >= 0 ? `возвращено ${Number(archSettlement.result).toFixed(0)} ₽` : `долг ${Math.abs(Number(archSettlement.result || 0)).toFixed(0)} ₽`}
          </span>
        </div>
      </div>
      <div style={T.card}>
        <div style={T.h2}>История платежей</div>
        {archivePays.length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Платежей нет.</div>}
        {archivePays.map((h: any) => {
          const firstP = isFirstPeriod(h.period, archSd)
          const dueDay = parseDate(h.due_date)
          const confDay = h.confirmed_at ? parseDate(String(h.confirmed_at).slice(0, 10)) : null
          const late = !firstP && h.confirmed_by_landlord && confDay !== null && confDay.getTime() > dueDay.getTime() && !(archSd && dueDay < archSd)
          const early = !firstP && h.confirmed_by_landlord && confDay !== null && confDay.getTime() < dueDay.getTime()
          const sum = Number(h.base_amount || 0) + Number(h.penalty_amount || 0) + Number(h.utilities_amount || 0)
          const statusColor = late ? '#ff3b30' : early ? '#1e7e34' : h.confirmed_by_landlord ? '#8e8e93' : '#b25000'
          return (
            <div key={h.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(60,60,67,0.12)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>{parseDate(h.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}{firstP ? ' · первый месяц' : ''}</span>
                <span style={valMoney}>{sum.toFixed(0)} ₽</span>
              </div>
              <div style={{ marginTop: 2 }}>
                <span style={{ fontSize: 13, color: statusColor }}>{h.confirmed_by_landlord ? (late ? `просрочка · опл. ${confDay!.toLocaleDateString('ru-RU')}` : early ? `досрочно · ${confDay!.toLocaleDateString('ru-RU')}` : `вовремя · ${confDay!.toLocaleDateString('ru-RU')}`) : 'не подтверждён'}</span>
              </div>
            </div>
          )
        })}
      </div>
      {archiveFrozen.length > 0 && (
        <div style={T.card}>
          <div style={T.h2}>Замороженные штрафы</div>
          {archiveFrozen.map((f: any) => (
            <div key={f.id} style={T.item}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 15 }}>
                <span style={{ fontWeight: 500, color: '#1d1d1f' }}>{f.period ? parseDate(f.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : 'без месяца'}</span>
                <span style={valMoney}>{Number(f.amount).toFixed(0)} ₽</span>
              </div>
              {f.adjusted_note && <div style={T.tiny}>{f.adjusted_note}</div>}
            </div>
          ))}
          <div style={T.tiny}>Записи хранятся постоянно — это ваша защита при спорах и в суде.</div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
        <button style={iosRed} onClick={() => setArchDelOpen(true)}>Удалить из архива</button>
      </div>
      <ConfirmDelete
        open={archDelOpen}
        text="Договор и вся его история (платежи, штрафы, расчёт при съезде) будут удалены безвозвратно."
        onClose={() => setArchDelOpen(false)}
        onConfirm={deleteArchivedContract}
      />
    </div>
  )
}

export function ArchiveListView({ archived, onBack, onOpen }: { archived: any[]; onBack: () => void; onOpen: (id: string) => void }) {
  return (
    <div style={{ ...T.page, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
        <button style={iosBlue} onBack={undefined as any} onClick={onBack}>← Мои объекты</button>
      </div>
      <h1 style={T.h1}>Архив договоров</h1>
      {archived.length === 0 && (
        <div style={T.card}><div style={{ ...T.small, margin: '8px 0' }}>Завершённых договоров пока нет.</div></div>
      )}
      {archived.map((a) => (
        <div key={a.id} style={T.card}>
          <button
            onClick={() => onOpen(a.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 0', textAlign: 'left', boxSizing: 'border-box' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1d1d1f' }}>{a.object?.address || 'Объект'}</div>
              <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 4 }}>
                {a.tenant?.full_name || '—'} · завершён {a.terminated_at ? new Date(a.terminated_at).toLocaleDateString('ru-RU') : '—'}
              </div>
            </div>
            <span style={{ color: '#c7c7cc', fontSize: 18 }}>›</span>
          </button>
        </div>
      ))}
    </div>
  )
}
