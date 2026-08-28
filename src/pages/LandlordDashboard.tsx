return (
  <div style={{ ...T.page, paddingBottom: 90 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
      <button style={iosBlue} onClick={() => setOpenId(null)}>← Мои объекты</button>
    </div>
    <h1 style={T.h1}>{current.address}</h1>
    {tab === 'pay' && (
      <>
        {contract && firstMonthPending && (
          <div style={T.card}>
            <div style={T.h2}>Первый месяц</div>
            <button style={T.btn} onClick={() => confirmSigning(current.paymentId!)}>Подтвердить: первый месяц получен при подписании</button>
          </div>
        )}
        {contract && current.paymentId && !current.payment?.confirmed_by_landlord && !firstMonthPending && (
          <div style={T.card}>
            <div style={T.h2}>Подтверждение оплаты · {pcMonth}</div>
            {pcPaid > 0 && (
              <div style={T.row}>
                <span style={iosMuted}>Получено</span>
                <span style={valMoney}>{pcPaid.toFixed(0)} из {pcSum.toFixed(0)} ₽</span>
              </div>
            )}
            {contractBalance > 0 && (
              <div style={T.row}>
                <span style={iosMuted}>Баланс (переплата)</span>
                <span style={valMoney}>{contractBalance.toFixed(0)} ₽</span>
              </div>
            )}
            <div style={T.row}>
              <span style={valText}>Безналичная оплата</span>
              {current.payment?.confirmed_card
                ? <span style={iosOk}>получена</span>
                : current.payment?.card_claimed
                  ? <button style={actBlue} onClick={() => { setPayConfirmOk(false); setPayConfirm({ kind: 'card' }) }}>Подтвердить</button>
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
                        <button style={actRed} onClick={() => { setPayConfirmOk(false); setPayConfirm({ kind: 'cash-close' }) }}>завершить</button>
                        <button style={actBlue} onClick={() => { setPayConfirmOk(false); setPayConfirm({ kind: 'cash' }) }}>Подтвердить</button>
                      </span>
                    )
                    : <span style={iosMuted}>не заявлена</span>}
            </div>
            {!current.payment?.card_claimed && !current.hasConfirmedCashMeeting && (
              daysToPay <= 7 || pcPaid > 0 ? (
                <>
                  <div style={{ ...T.tiny, margin: '10px 0 6px' }}>Арендатор не отмечал оплату в приложении? Если деньги получены наличными или переводом напрямую — подтвердите здесь, заявка арендатора не нужна.</div>
                  <button style={T.btn} onClick={() => { setPayConfirmOk(false); setPayConfirm({ kind: 'full' }) }}>{pcPaid > 0 ? `Подтвердить получение остатка за ${pcMonth} (${Math.max(0, pcSum - pcPaid).toFixed(0)} ₽)` : `Получил оплату за ${pcMonth} вне приложения`}</button>
                </>
              ) : (
                <>
                  <div style={{ ...T.tiny, margin: '10px 0 6px' }}>До оплаты ещё {daysToPay} дн. Если деньги уже получены досрочно — отметьте это здесь.</div>
                  {!earlyPayOpen ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                      <button style={actBlue} onClick={() => setEarlyPayOpen(true)}>Отметить оплату вне приложения (досрочно)</button>
                    </div>
                  ) : (
                    <button style={T.btn} onClick={() => { setPayConfirmOk(false); setPayConfirm({ kind: 'full' }) }}>Получил оплату за {pcMonth} вне приложения</button>
                  )}
                </>
              )
            )}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
              <button style={actBlue} onClick={() => setReceiptOpen(true)}>Учесть частичную оплату</button>
            </div>
          </div>
        )}
        {showUtilities && (
          <div style={T.card}>
            <div style={T.h2}>Ресурсы по квитанции</div>
            <div style={T.row}>
              <span style={iosMuted}>Сумма по квитанции</span>
              <input
                type="number"
                value={utilInputs[current.id] ?? String(current.utilitiesAmount || '')}
                onChange={(e) => setUtilInputs({ ...utilInputs, [current.id]: e.target.value })}
                placeholder="0"
                style={{ width: 110, border: 'none', outline: 'none', background: 'rgba(120,120,128,0.08)', borderRadius: 8, padding: '8px 10px', fontSize: 16, fontWeight: 600, textAlign: 'right', color: '#1d1d1f', boxSizing: 'border-box' }}
                inputMode="numeric"
              />
            </div>
            <div style={{ ...T.row, justifyContent: 'center' }}>
              <button style={actBlue} onClick={() => saveUtilitiesNext(utilInputs[current.id] ?? String(current.utilitiesAmount || 0))}>Включить в платёж</button>
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
                <button style={actBlue} onClick={() => confirmDeferral(r.id, contract.id, r.payment_id, Number(r.amount), contract.tenant_id)}>Подтвердить</button>
              </div>
            ))}
            {(current.penaltyAmount || 0) > 0 && !current.payment?.confirmed_by_landlord && (
              <div style={{ ...T.row, borderBottom: 'none' }}>
                <span style={valText}>Текущий штраф: {(current.penaltyAmount || 0).toFixed(0)} ₽</span>
                <button style={actBlue} onClick={() => freezePenalty(current.paymentId!)}>Заморозить</button>
              </div>
            )}
          </div>
        )}
        {contract && tenantChoseCash && (
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
          {objHistory.length === 0 ? (
            <div style={{ ...T.small, margin: '8px 0' }}>Платежей пока нет</div>
          ) : (
            objHistory.map((h: any) => {
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
                        <button style={actBlue} onClick={() => setReceiptFor(h)}>расписка</button>
                        {canUndo(h) && <button style={actRed} onClick={() => setUndoId(h.id)}>отменить</button>}
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </>
    )}
    {tab === 'meters' && (
      <>
        {current.readingsMode === 'manual' && contract && (
          <>
            <div style={secHead}>Показания за текущий месяц</div>
            <ReadingsReview contractId={contract.id} tenantId={contract.tenant_id} />
          </>
        )}
        <div style={secHead}>Настройка счётчиков</div>
        <MetersEditor objId={current.id} />
      </>
    )}
    {tab === 'contract' && !contract && (
      <ObjectEdit objectId={current.id} />
    )}
    {tab === 'contract' && contract && (
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
          {contractBalance > 0 && (
            <div style={T.row}><span style={iosMuted}>Баланс (переплата)</span><span style={valMoney}>{contractBalance.toFixed(0)} ₽</span></div>
          )}
          <div style={T.row}><span style={iosMuted}>Оплата</span><span style={valText}>до {contract.payment_day} числа</span></div>
          {deposit > 0 && (
            <div style={{ padding: '8px 0 4px' }}>
              <Progress value={depositPaid} max={deposit} />
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <button style={actBlue} onClick={() => setDepModal('add')}>Внести</button>
                <button style={actBlue} onClick={() => setDepModal('edit')}>Изменить</button>
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
                onClick={() => updatePaymentMethod(contract.id, o.v as any)}
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
                <button style={actBlue} onClick={() => openAdjust(f.id, false)}>изменить</button>
                <button style={actRed} onClick={() => openAdjust(f.id, true)}>обнулить</button>
              </div>
            </div>
          ))}
          {!!current.frozenTotal && current.frozenTotal > 0 && (
            deposit > 0
              ? (deposit >= (current.frozenTotal || 0)
                ? <div style={T.small}>Будет удержано из депозита; остаток: {(deposit - (current.frozenTotal || 0)).toFixed(0)} ₽</div>
                : <div style={{ ...T.small, color: '#ff3b30' }}>Сверх депозита долг: {((current.frozenTotal || 0) - deposit).toFixed(0)} ₽</div>)
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
    )}
    {tab === 'chat' && contract && (
      <div style={T.card}>
        <div style={T.h2}>Чат с арендатором</div>
        <Chat contractId={contract.id} myId={user!.id} />
      </div>
    )}
    <BottomNav tabs={OBJ_TABS} tab={tab} setTab={setTab} badges={{ pay: payBadge, meters: metersBadge }} />
    <Modal open={!!payConfirm} title="Подтверждение оплаты" onClose={() => setPayConfirm(null)}>
      <div style={{ fontSize: 14, color: '#555', marginBottom: 12 }}>
        Счёт за {pcMonth} на {pcSum.toFixed(0)} ₽.{' '}
        {payConfirm?.kind === 'cash-close'
          ? 'Наличный расчёт будет завершён без отметки о получении.'
          : 'Платёж будет отмечен полученным (в т. ч. досрочно), создастся следующий счёт. Действие необратимо.'}
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 14, color: '#1d1d1f' }}>
        <input type="checkbox" checked={payConfirmOk} onChange={(e) => setPayConfirmOk(e.target.checked)} />
        Деньги фактически получены
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          disabled={!payConfirmOk}
          style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: payConfirmOk ? 1 : 0.4 }}
          onClick={() => {
            const k = payConfirm!.kind
            setPayConfirm(null)
            if (!current?.paymentId) return
            if (k === 'cash-close') confirmChannel(current.paymentId, 'cash', true)
            else if (k === 'cash') confirmChannel(current.paymentId, 'cash')
            else confirmChannel(current.paymentId, 'card')
          }}
        >Подтвердить</button>
        <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => setPayConfirm(null)}>Отмена</button>
      </div>
    </Modal>
    <Modal open={!!receiptFor} title="Расписка" onClose={() => setReceiptFor(null)}>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, background: 'rgba(120,120,128,0.08)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
        {receiptFor ? receiptText(receiptFor) : ''}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }} onClick={() => copyReceipt(receiptFor)}>Скопировать</button>
        <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => setReceiptFor(null)}>Закрыть</button>
      </div>
    </Modal>
    <ConfirmDelete
      open={!!undoId}
      text="Подтверждение оплаты будет отменено, счёт снова станет открытым. Арендатор получит уведомление."
      onClose={() => setUndoId(null)}
      onConfirm={() => { if (undoId) undoConfirm(undoId) }}
    />
    <PromptNumber
      open={receiptOpen}
      title="Частичная оплата"
      label={`Сумма к учёту, ₽. Счёт на ${pcSum.toFixed(0)} ₽, получено ${pcPaid.toFixed(0)} ₽.`}
      onClose={() => setReceiptOpen(false)}
      onSubmit={(n) => recordReceipt(n)}
    />
    <PromptNumber
      open={depModal === 'add'}
      title="Взнос по депозиту"
      label={`Внесено ${depositPaid.toFixed(0)} из ${deposit.toFixed(0)} ₽. Сумма взноса:`}
      onClose={() => setDepModal(null)}
      onSubmit={(n) => doAddDeposit(n)}
    />
    <PromptNumber
      open={depModal === 'edit'}
      title="Изменить «внесено»"
      label={`Общая сумма депозита ${deposit.toFixed(0)} ₽. Новое значение «внесено»:`}
      initial={String(depositPaid || 0)}
      onClose={() => setDepModal(null)}
      onSubmit={(n) => doEditDeposit(n)}
    />
    <Modal open={!!fz} title={fz?.zero ? 'Обнулить замороженный штраф' : 'Изменить замороженный штраф'} onClose={() => setFz(null)}>
      {!fz?.zero && (
        <>
          <div style={{ fontSize: 14, marginBottom: 8 }}>Новая сумма, ₽</div>
          <input value={fzAmount} onChange={(e) => setFzAmount(e.target.value)} inputMode="decimal" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 16, boxSizing: 'border-box', marginBottom: 12 }} />
        </>
      )}
      <div style={{ fontSize: 14, marginBottom: 8 }}>{fz?.zero ? 'Причина обнуления (обязательно)' : 'Примечание к изменению (обязательно)'}</div>
      <input value={fzNote} onChange={(e) => setFzNote(e.target.value)} placeholder="например: договорились с арендатором" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 16, boxSizing: 'border-box', marginBottom: 14 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }} onClick={confirmAdjust}>Сохранить</button>
        <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => setFz(null)}>Отмена</button>
      </div>
    </Modal>
  </div>
)
}

export default LandlordDashboard
