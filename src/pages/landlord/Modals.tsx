import { Modal, PromptNumber, ConfirmDelete } from '../../components/ui'
import { useLCtx } from './ctx'

export function Modals() {
  const C = useLCtx()
  const { current } = C
  return (
    <>
      <Modal open={!!C.payConfirm} title="Подтверждение оплаты" onClose={() => C.setPayConfirm(null)}>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 12 }}>
          Счёт за {C.pcMonth} на {C.pcSum.toFixed(0)} ₽.{' '}
          {C.payConfirm?.kind === 'cash-close'
            ? 'Наличный расчёт будет завершён без отметки о получении.'
            : 'Платёж будет отмечен полученным (в т. ч. досрочно), создастся следующий счёт. Действие необратимо.'}
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 14, color: '#1d1d1f' }}>
          <input type="checkbox" checked={C.payConfirmOk} onChange={(e) => C.setPayConfirmOk(e.target.checked)} />
          Деньги фактически получены
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            disabled={!C.payConfirmOk}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: C.payConfirmOk ? 1 : 0.4 }}
            onClick={() => {
              const k = C.payConfirm!.kind
              C.setPayConfirm(null)
              if (!current?.paymentId) return
              if (k === 'cash-close') C.confirmChannel(current.paymentId, 'cash', true)
              else if (k === 'cash') C.confirmChannel(current.paymentId, 'cash')
              else C.confirmChannel(current.paymentId, 'card')
            }}
          >Подтвердить</button>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => C.setPayConfirm(null)}>Отмена</button>
        </div>
      </Modal>
      <Modal open={!!C.receiptFor} title="Расписка" onClose={() => C.setReceiptFor(null)}>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, background: 'rgba(120,120,128,0.08)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          {C.receiptFor ? C.receiptText(C.receiptFor) : ''}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }} onClick={() => C.copyReceipt(C.receiptFor)}>Скопировать</button>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => C.setReceiptFor(null)}>Закрыть</button>
        </div>
      </Modal>
      <ConfirmDelete
        open={!!C.undoId}
        text="Подтверждение оплаты будет отменено, счёт снова станет открытым. Арендатор получит уведомление."
        onClose={() => C.setUndoId(null)}
        onConfirm={() => { if (C.undoId) C.undoConfirm(C.undoId) }}
      />
      <PromptNumber
        open={C.receiptOpen}
        title="Частичная оплата"
        label={`Сумма к учёту, ₽. Счёт на ${C.pcSum.toFixed(0)} ₽, получено ${C.pcPaid.toFixed(0)} ₽.`}
        onClose={() => C.setReceiptOpen(false)}
        onSubmit={(n: number) => C.recordReceipt(n)}
      />
      <PromptNumber
        open={C.depModal === 'add'}
        title="Взнос по депозиту"
        label={`Внесено ${C.depositPaid.toFixed(0)} из ${C.deposit.toFixed(0)} ₽. Сумма взноса:`}
        onClose={() => C.setDepModal(null)}
        onSubmit={(n: number) => C.doAddDeposit(n)}
      />
      <PromptNumber
        open={C.depModal === 'edit'}
        title="Изменить «внесено»"
        label={`Общая сумма депозита ${C.deposit.toFixed(0)} ₽. Новое значение «внесено»:`}
        initial={String(C.depositPaid || 0)}
        onClose={() => C.setDepModal(null)}
        onSubmit={(n: number) => C.doEditDeposit(n)}
      />
      <Modal open={!!C.fz} title={C.fz?.zero ? 'Обнулить замороженный штраф' : 'Изменить замороженный штраф'} onClose={() => C.setFz(null)}>
        {!C.fz?.zero && (
          <>
            <div style={{ fontSize: 14, marginBottom: 8 }}>Новая сумма, ₽</div>
            <input value={C.fzAmount} onChange={(e) => C.setFzAmount(e.target.value)} inputMode="decimal" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 16, boxSizing: 'border-box', marginBottom: 12 }} />
          </>
        )}
        <div style={{ fontSize: 14, marginBottom: 8 }}>{C.fz?.zero ? 'Причина обнуления (обязательно)' : 'Примечание к изменению (обязательно)'}</div>
        <input value={C.fzNote} onChange={(e) => C.setFzNote(e.target.value)} placeholder="например: договорились с арендатором" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 16, boxSizing: 'border-box', marginBottom: 14 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }} onClick={C.confirmAdjust}>Сохранить</button>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => C.setFz(null)}>Отмена</button>
        </div>
      </Modal>
    </>
  )
}

export default Modals
