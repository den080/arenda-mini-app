import ObjectEdit from '../../components/ObjectEdit'
import ContactsEditor from '../../components/ContactsEditor'
import AmendmentWizard from '../../components/AmendmentWizard'
import TerminationWizard from '../../components/TerminationWizard'
import { Progress } from '../../components/ui'
import { T } from '../../theme'
import { useLCtx } from './ctx'
import { actBlue, actRed, iosMuted, valMoney, valText, secHead, hair, parseDate } from './helpers'

export function ContractTab() {
  const C = useLCtx()
  const { current, contract } = C

  if (!contract) return <ObjectEdit objectId={current.id} />

  return (
    <>
      <div style={T.card}>
        <div style={T.h2}>Договор</div>
        <div style={T.row}><span style={iosMuted}>Арендатор</span><span style={valText}>{(contract as any).tenant?.full_name || '—'}</span></div>
        {(contract as any).tenant?.phone && <div style={T.row}><span style={iosMuted}>Телефон</span><span style={valText}>{(contract as any).tenant.phone}</span></div>}
        {(contract as any).tenant?.email && <div style={T.row}><span style={iosMuted}>E-mail</span><span style={valText}>{(contract as any).tenant.email}</span></div>}
        {(contract as any).start_date && (contract as any).end_date && (
          <div style={T.row}><span style={iosMuted}>Срок</span><span style={valText}>{parseDate((contract as any).start_date).toLocaleDateString('ru-RU')} — {parseDate((contract as any).end_date).toLocaleDateString('ru-RU')}</span></div>
        )}
        <div style={T.row}><span style={iosMuted}>Аренда</span><span style={valMoney}>{Number(contract.rent_amount).toFixed(0)} ₽/мес</span></div>
        {(contract as any).amendment_at && (
          <div style={T.row}><span style={iosMuted}>Допсоглашение</span><span style={valText}>{Number(contract.rent_amount).toFixed(0)} ₽ с {(contract as any).amendment_from ? new Date((contract as any).amendment_from).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : new Date((contract as any).amendment_at).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })} · со следующего счёта</span></div>
        )}
        {C.contractBalance > 0 && (
          <div style={T.row}><span style={iosMuted}>Баланс (переплата)</span><span style={valMoney}>{C.contractBalance.toFixed(0)} ₽</span></div>
        )}
        <div style={T.row}><span style={iosMuted}>Оплата</span><span style={valText}>до {contract.payment_day} числа</span></div>
        {C.deposit > 0 && (
          <div style={{ padding: '8px 0 4px' }}>
            <Progress value={C.depositPaid} max={C.deposit} />
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <button style={actBlue} onClick={() => C.setDepModal('add')}>Внести</button>
              <button style={actBlue} onClick={() => C.setDepModal('edit')}>Изменить</button>
            </div>
          </div>
        )}
      </div>
      <div style={secHead}>Экстренные контакты</div>
      <ContactsEditor objId={current.id} />
      <div style={T.card}>
        <div style={T.h2}>Способ оплаты</div>
        {[
          { v: 'card', l: 'Безналичный расчёт' },
          { v: 'cash', l: 'Наличные' },
          { v: 'both', l: 'Оба способа' },
        ].map((o, i) => (
          <div key={o.v}>
            {i > 0 && <div style={hair} />}
            <button
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 44, border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 0', fontSize: 16, fontWeight: 500, color: '#1d1d1f' }}
              onClick={() => C.updatePaymentMethod(contract.id, o.v as any)}
            >
              {o.l}
              {contract.payment_method === o.v && <span style={{ color: '#0071e3', fontWeight: 600 }}>✓</span>}
            </button>
          </div>
        ))}
        {contract.payment_method === 'both' && <div style={T.tiny}>Способ оплаты выбирает арендатор: карта или наличные.</div>}
      </div>
      <div style={T.card}>
        <div style={T.h2}>Замороженные штрафы</div>
        {(current.frozenRows || []).length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Замороженных штрафов нет</div>}
        {(current.frozenRows || []).map((f: any) => (
          <div key={f.id} style={T.item}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#1d1d1f' }}>{f.period ? parseDate(f.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : 'без месяца'}</span>
              <span style={valMoney}>{Number(f.amount).toFixed(0)} ₽</span>
            </div>
            {f.adjusted_note && <div style={T.tiny}>{f.adjusted_note}</div>}
            <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
              <button style={actBlue} onClick={() => C.openAdjust(f.id, false)}>изменить</button>
              <button style={actRed} onClick={() => C.openAdjust(f.id, true)}>обнулить</button>
            </div>
          </div>
        ))}
        {!!current.frozenTotal && current.frozenTotal > 0 && (
          C.deposit > 0
            ? (C.deposit >= (current.frozenTotal || 0)
              ? <div style={T.small}>Будет удержано из депозита; остаток: {(C.deposit - (current.frozenTotal || 0)).toFixed(0)} ₽</div>
              : <div style={{ ...T.small, color: '#ff3b30' }}>Сверх депозита долг: {((current.frozenTotal || 0) - C.deposit).toFixed(0)} ₽</div>)
            : <div style={{ ...T.small, color: '#ff3b30' }}>Долг арендатора (депозита нет)</div>
        )}
        <div style={T.tiny}>Записи не удаляются до конца договора; каждое изменение сохраняется с примечанием и датой.</div>
      </div>
      {contract.status === 'active' && (
        <>
          <div style={secHead}>Допсоглашение</div>
          <AmendmentWizard contractId={contract.id} tenantId={contract.tenant_id} />
          <div style={secHead}>Завершение договора</div>
          <TerminationWizard contractId={contract.id} />
        </>
      )}
      <ObjectEdit objectId={current.id} />
    </>
  )
}

export default ContractTab
