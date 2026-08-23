import CashNegotiation from '../../components/CashNegotiation'
import BillReview from '../../components/BillReview'
import { T } from '../../theme'
import { useLCtx } from './ctx'
import { actBlue, actRed, iosMuted, iosOk, valMoney, valText, secHead, isFirstPeriod, parseDate } from './helpers'

export function PayTab() {
  const C = useLCtx()
  const { current, contract, sd } = C
  return (
    <>
      {contract && C.firstMonthPending && (
        <div style={T.card}>
          <div style={T.h2}>Первый месяц</div>
          <button style={T.btn} onClick={() => C.confirmSigning(current.paymentId!)}>Подтвердить: первый месяц получен при подписании</button>
        </div>
      )}
      {contract && current.paymentId && !current.payment?.confirmed_by_landlord && !C.firstMonthPending && (
        <div style={T.card}>
          <div style={T.h2}>Подтверждение оплаты · {C.pcMonth}</div>
          {C.pcPaid > 0 && (
            <div style={T.row}>
              <span style={iosMuted}>Получено</span>
              <span style={valMoney}>{C.pcPaid.toFixed(0)} из {C.pcSum.toFixed(0)} ₽</span>
            </div>
          )}
          {C.contractBalance > 0 && (
            <div style={T.row}>
              <span style={iosMuted}>Баланс (переплата)</span>
              <span style={valMoney}>{C.contractBalance.toFixed(0)} ₽</span>
            </div>
          )}
          <div style={T.row}>
            <span style={valText}>Безналичная оплата</span>
            {current.payment?.confirmed_card
              ? <span style={iosOk}>получена</span>
              : current.payment?.card_claimed
                ? <button style={actBlue} onClick={() => { C.setPayConfirmOk(false); C.setPayConfirm({ kind: 'card' }) }}>Подтвердить</button>
                : <span style={iosMuted}>не заявлена</span>}
          </div>
          <div style={{ ...T.row, borderBottom: 'none' }}>
            <span style={valText}>Оплата наличными</span>
            {current.payment?.confirmed_cash
              ? <span style={iosOk}>получена</span>
              : current.payment?.cash_closed
                ? <span style={iosMuted}>расчёт завершён</span>
                : current.hasConfirmedCashMeeting
                  ? (
                    <span style={{ display: 'flex', gap: 14 }}>
                      <button style={actRed} onClick={() => { C.setPayConfirmOk(false); C.setPayConfirm({ kind: 'cash-close' }) }}>завершить</button>
                      <button style={actBlue} onClick={() => { C.setPayConfirmOk(false); C.setPayConfirm({ kind: 'cash' }) }}>Подтвердить</button>
                    </span>
                  )
                  : <span style={iosMuted}>не заявлена</span>}
          </div>
          {!current.payment?.card_claimed && !current.hasConfirmedCashMeeting && (
            <>
              <div style={{ ...T.tiny, margin: '10px 0 6px' }}>Арендатор не отмечал оплату в приложении? Если деньги получены наличными или переводом напрямую — подтвердите здесь, заявка арендатора не нужна.</div>
              <button style={T.btn} onClick={() => { C.setPayConfirmOk(false); C.setPayConfirm({ kind: 'full' }) }}>{C.pcPaid > 0 ? `Подтвердить получение остатка за ${C.pcMonth} (${Math.max(0, C.pcSum - C.pcPaid).toFixed(0)} ₽)` : `Получил оплату за ${C.pcMonth} вне приложения`}</button>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
            <button style={actBlue} onClick={() => C.setReceiptOpen(true)}>Учесть частичную оплату</button>
          </div>
        </div>
      )}
      {C.showUtilities && (
        <div style={T.card}>
          <div style={T.h2}>Ресурсы по квитанции</div>
          <div style={T.row}>
            <span style={iosMuted}>Сумма по квитанции</span>
            <input
              type="number"
              value={C.utilInputs[current.id] ?? String(current.utilitiesAmount || '')}
              onChange={(e) => C.setUtilInputs({ ...C.utilInputs, [current.id]: e.target.value })}
              placeholder="0"
              style={{ width: 110, border: 'none', outline: 'none', background: 'rgba(120,120,128,0.08)', borderRadius: 8, padding: '8px 10px', fontSize: 16, fontWeight: 600, textAlign: 'right', color: '#1d1d1f', boxSizing: 'border-box' }}
              inputMode="numeric"
            />
          </div>
          <div style={{ ...T.row, justifyContent: 'center' }}>
            <button style={actBlue} onClick={() => C.saveUtilitiesNext(C.utilInputs[current.id] ?? String(current.utilitiesAmount || 0))}>Включить в платёж</button>
          </div>
          <div style={{ ...T.tiny, margin: '0 0 10px' }}>Введённая сумма записывается как есть (заменяет предыдущую), добавляется к платежу отдельно, не растёт при просрочке и не входит в штрафы.</div>
        </div>
      )}
      {current.readingsMode === 'self' && contract && (
        <div>
          <div style={secHead}>Квитанции</div>
          <BillReview contractId={contract.id} tenantId={contract.tenant_id} />
        </div>
      )}
      {contract && ((current.deferredRequests || []).length > 0 || ((current.penaltyAmount || 0) > 0 && !current.payment?.confirmed_by_landlord)) && (
        <div style={T.card}>
          <div style={T.h2}>Штраф текущего платежа</div>
          {(current.deferredRequests || []).map((r: any) => (
            <div key={r.id} style={T.row}>
              <span style={valText}>Просьба отсрочить {Number(r.amount).toFixed(0)} ₽</span>
              <button style={actBlue} onClick={() => C.confirmDeferral(r.id, contract.id, r.payment_id, Number(r.amount), contract.tenant_id)}>Подтвердить</button>
            </div>
          ))}
          {(current.penaltyAmount || 0) > 0 && !current.payment?.confirmed_by_landlord && (
            <div style={{ ...T.row, borderBottom: 'none' }}>
              <span style={valText}>Текущий штраф: {(current.penaltyAmount || 0).toFixed(0)} ₽</span>
              <button style={actBlue} onClick={() => C.freezePenalty(current.paymentId!)}>Заморозить</button>
            </div>
          )}
        </div>
      )}
      {contract && C.tenantChoseCash && (
        <div>
          <div style={secHead}>Оплата наличными</div>
          <CashNegotiation
            contractId={contract.id}
            myRole="landlord"
            tenantId={contract.tenant_id}
            landlordId={current.landlord_id}
          />
        </div>
      )}
      <div style={T.card}>
        <div style={T.h2}>История платежей</div>
        {C.objHistory.length === 0 ? (
          <div style={{ ...T.small, margin: '8px 0' }}>Платежей пока нет</div>
        ) : (
          C.objHistory.map((h: any) => {
            const firstP = isFirstPeriod(h.period, sd)
            const dueDay = parseDate(h.due_date)
            const confDay = h.confirmed_at ? parseDate(String(h.confirmed_at).slice(0, 10)) : null
            const late = !firstP && h.confirmed_by_landlord && confDay !== null && confDay.getTime() > dueDay.getTime() && !(sd && dueDay < sd)
            const early = !firstP && h.confirmed_by_landlord && confDay !== null && confDay.getTime() < dueDay.getTime()
            const sum = Number(h.base_amount || 0) + Number(h.penalty_amount || 0) + Number(h.utilities_amount || 0)
            const statusColor = late ? '#ff3b30' : early ? '#1e7e34' : h.confirmed_by_landlord ? '#8e8e93' : '#b25000'
            return (
              <div key={h.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(60,60,67,0.12)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>{parseDate(h.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}{firstP ? ' · первый месяц' : ''}</span>
                  <span style={valMoney}>{sum.toFixed(0)} ₽</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 13, color: statusColor }}>{h.confirmed_by_landlord ? (late ? `просрочка · опл. ${confDay!.toLocaleDateString('ru-RU')}` : early ? `досрочно · ${confDay!.toLocaleDateString('ru-RU')}` : `вовремя · ${confDay!.toLocaleDateString('ru-RU')}`) : 'не подтверждён'}</span>
                  {h.confirmed_by_landlord && (
                    <span style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                      <button style={actBlue} onClick={() => C.setReceiptFor(h)}>расписка</button>
                      {C.canUndo(h) && <button style={actRed} onClick={() => C.setUndoId(h.id)}>отменить</button>}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}

export default PayTab
