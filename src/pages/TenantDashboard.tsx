function TenantRental({ contract, tab }: { contract: any; tab: string }) {
  const { user } = useTelegramUser()
  const [data, setData] = useState<any>(null)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [frozenOpen, setFrozenOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({})

  async function load() {
    if (!user) return
    const { data: obj } = await supabase.from('objects').select('*').eq('id', contract.object_id).maybeSingle()
    const { data: landlord } = await supabase.from('users').select('*').eq('id', obj?.landlord_id).maybeSingle()
    const { data: payments } = await supabase.from('payments').select('*').eq('contract_id', contract.id).order('period', { ascending: false })
    const { data: meters } = await supabase.from('object_meters').select('*').eq('object_id', contract.object_id).eq('is_active', true)
    const { data: meterTypes } = await supabase.from('meter_types').select('*')
    const { data: penaltyRules } = await supabase.from('penalty_rules').select('*').eq('contract_id', contract.id)
    const { data: frozenRows } = await supabase.from('frozen_penalties').select('*').eq('contract_id', contract.id).order('period', { ascending: true })
    const { data: deferredReqs } = await supabase.from('deferred_requests').select('*').eq('contract_id', contract.id).order('created_at', { ascending: false }).limit(1)

    const ids = (meters || []).map((m: any) => m.id)
    const readingsByMeter: Record<string, any[]> = {}
    if (ids.length) {
      const { data: rd } = await supabase
        .from('meter_readings').select('*')
        .in('object_meter_id', ids)
        .order('submitted_at', { ascending: false })
      for (const r of rd || []) {
        if (!readingsByMeter[r.object_meter_id]) readingsByMeter[r.object_meter_id] = []
        readingsByMeter[r.object_meter_id].push(r)
      }
    }

    setData({ obj, landlord, payments: payments || [], meters: meters || [], meterTypes: meterTypes || [], penaltyRules: penaltyRules || [], frozenRows: frozenRows || [], deferredReqs: deferredReqs || [], readingsByMeter })
  }

  useEffect(() => {
    load()
    const on = () => load()
    window.addEventListener('rentflow-refresh', on)
    return () => window.removeEventListener('rentflow-refresh', on)
  }, [contract.id])

  async function choosePayMethod(m: string) {
    const { error: e } = await supabase.from('contracts').update({ tenant_pay_method: m }).eq('id', contract.id)
    if (e) setMsg('Ошибка: ' + e.message)
    else load()
  }

  async function claimPaid() {
    if (!data?.landlord) return
    const payment = data.payments[0]
    if (!payment) return
    const { error: e } = await supabase.from('payments').update({ card_claimed: true }).eq('id', payment.id)
    if (e) { setMsg('Ошибка: ' + e.message); return }
    await supabase.from('notifications_log').insert({
      user_id: data.landlord.id, type: 'payment_claimed', related_id: payment.id, sent_at: new Date().toISOString(),
    })
    setMsg('✅ Арендодатель уведомлён: безнал заявлен, ждёт подтверждения')
    load()
  }

  async function requestDeferral() {
    if (!data?.landlord) return
    const payment = data.payments[0]
    if (!payment || Number(payment.penalty_amount) <= 0) return
    const { error: e } = await supabase.from('deferred_requests').insert({
      contract_id: contract.id, payment_id: payment.id,
      amount: Number(payment.penalty_amount), status: 'proposed',
    })
    if (e) { setMsg('Ошибка: ' + e.message); return }
    await supabase.from('notifications_log').insert({
      user_id: data.landlord.id, type: 'deferred_proposed', related_id: contract.id, sent_at: new Date().toISOString(),
    })
    setMsg('✅ Заявка на отсрочку штрафа отправлена арендодателю')
    load()
  }

  async function submitMeters() {
    if (!data) return
    const period = new Date().toISOString().slice(0, 7) + '-01'
    const rows: any[] = []
    for (const m of data.meters) {
      const v = vals[m.id]
      if (v) rows.push({ object_meter_id: m.id, contract_id: contract.id, value: Number(v), period, submitted_at: new Date().toISOString(), status: 'proposed' })
    }
    if (rows.length === 0) { setMsg('Введите показания счётчиков'); return }
    const { error: e } = await supabase.from('meter_readings').insert(rows)
    setMsg(e ? 'Ошибка: ' + e.message : '✅ Показания переданы и ждут подтверждения арендодателем')
    setVals({})
    if (!e) {
      await supabase.from('notifications_log').insert({
        user_id: user!.id, type: 'meter_submitted', related_id: contract.id, sent_at: new Date().toISOString()
      })
      load()
    }
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setMsg(`✅ Скопировано: ${label}`)
      setTimeout(() => setMsg(null), 2000)
    } catch {
      setMsg('Не удалось скопировать')
    }
  }

  if (!data) return <div style={T.card}>Загрузка…</div>

  const { obj, landlord, payments, meters, meterTypes, penaltyRules, frozenRows, deferredReqs, readingsByMeter } = data
  const readingsMode = contract.readings_mode || 'manual'
  const reminder = contract.reminder_days_before || 3
  const payment = payments[0]
  const today = new Date()
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const utilities = Number(payment?.utilities_amount || 0)
  const total = payment ? Number(payment.base_amount) + Number(payment.penalty_amount || 0) + utilities : Number(contract.rent_amount)
  const monthLabel = payment ? new Date(payment.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : ''
  const deposit = Number(contract.deposit_amount || 0)
  const frozenTotal = (frozenRows || []).reduce((sum: number, f: any) => sum + Number(f.amount || 0), 0)

  const chip = (stt: string) => (stt || 'proposed') === 'confirmed' ? '🟢 получены' : (stt || 'proposed') === 'incomplete' ? '🔴 не полностью' : '🟡 ждут'

  const latests = (meters || []).map((m: any) => ((readingsByMeter || {})[m.id] || [])[0]).filter(Boolean)
  const overallReading = latests.length === 0
    ? 'none'
    : latests.some((r: any) => (r.status || 'proposed') === 'incomplete')
      ? 'incomplete'
      : latests.every((r: any) => (r.status || 'proposed') === 'confirmed')
        ? 'confirmed'
        : 'proposed'

  const effectiveMethod = contract.payment_method === 'both'
    ? (contract.tenant_pay_method || 'card')
    : contract.payment_method

  let statusChip: any = T.chipGray
  let statusText = 'Нет счёта'
  let isOverdue = false

  if (payment) {
    if (!payment.confirmed_by_landlord) {
      const dueMid = parseDate(payment.due_date)
      const sd = contract.start_date ? parseDate(contract.start_date) : null
      const firstMonthGrace = !!sd && dueMid.getMonth() === sd.getMonth() && dueMid.getFullYear() === sd.getFullYear() && todayMid < new Date(sd.getFullYear(), sd.getMonth() + 1, 1)
      const daysUntilDue = firstMonthGrace && todayMid > dueMid ? 0 : Math.round((dueMid.getTime() - todayMid.getTime()) / 86400000)
      if (todayMid > dueMid && !firstMonthGrace) { isOverdue = true; statusChip = T.chipRed; statusText = `Просрочка ${-daysUntilDue} дн.` }
      else if (daysUntilDue === 0) { statusChip = T.chipOrange; statusText = firstMonthGrace ? 'Первый месяц — просрочка не начисляется' : 'Сегодня последний день оплаты' }
      else if (daysUntilDue <= reminder) { statusChip = T.chipOrange; statusText = `До оплаты ${daysUntilDue} дн.` }
      else { statusChip = T.chipGreen; statusText = `До оплаты ${daysUntilDue} дн.` }
    } else {
      const periodDate = parseDate(payment.period)
      const nextDue = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, contract.payment_day || 1)
      const daysLeft = Math.round((nextDue.getTime() - todayMid.getTime()) / 86400000)
      if (daysLeft < 0) { statusChip = T.chipRed; statusText = `Следующий платёж просрочен на ${-daysLeft} дн.` }
      else if (daysLeft === 0) { statusChip = T.chipOrange; statusText = 'Следующая оплата: сегодня последний день' }
      else if (daysLeft <= reminder) { statusChip = T.chipOrange; statusText = `${daysLeft} дн. до следующей оплаты` }
      else { statusChip = T.chipGreen; statusText = `${daysLeft} дн. до следующей оплаты` }
    }
  }

  const paymentOverdueRule = penaltyRules.find((r: any) => r.violation_type === 'payment_overdue')
  const penaltyRate = paymentOverdueRule ? Number(paymentOverdueRule.rate) : 500
  const readingsRule = penaltyRules.find((r: any) => r.violation_type === 'readings_overdue')

  const lastDeferral = deferredReqs && deferredReqs[0] ? deferredReqs[0] : null
  const deferralPending = !!(lastDeferral && lastDeferral.status === 'proposed' && payment && String(lastDeferral.payment_id) === String(payment.id))

  const details: PayDetail[] = Array.isArray(contract.payment_details) && contract.payment_details.length > 0
    ? contract.payment_details
    : (contract.card_number ? [{ type: 'card', bank: 'Банк не указан', number: contract.card_number }] : [])

  return (
    <div>
      {tab === 'overview' && (
        <>
          <div style={T.card}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{obj?.address}</div>
            <div style={T.small}>Арендодатель: {landlord?.full_name}{landlord?.phone ? ', ' + formatPhoneDisplay(landlord.phone) : ''}</div>
            {contract.start_date && contract.end_date && <div style={T.tiny}>Срок аренды: с {parseDate(contract.start_date).toLocaleDateString('ru-RU')} по {parseDate(contract.end_date).toLocaleDateString('ru-RU')}</div>}
            {deposit > 0 && <div style={T.tiny}>Депозит: {deposit.toFixed(0)} ₽</div>}
            {frozenTotal > 0 && <div style={T.tiny}>🧊 Замороженные штрафы: {frozenTotal.toFixed(0)} ₽ (подробнее во вкладке «Договор»)</div>}
          </div>
          <div style={T.card}>
            <div style={T.h2}>Счёт за {monthLabel}</div>
            <div style={T.row}><span style={{ color: C.text2 }}>Итого</span><span style={T.total}>{total.toFixed(2)} ₽</span></div>
            {payment && <div style={T.small}>Оплатить до: {parseDate(payment.due_date).toLocaleDateString('ru-RU')}</div>}
            <div style={{ marginTop: 10 }}><span style={statusChip}>{statusText}</span></div>
            {isOverdue && <div style={T.noteRed}>⚠️ +{penaltyRate} руб за каждый день просрочки</div>}
          </div>
        </>
      )}

      {tab === 'pay' && (
        <>
          <div style={T.card}>
            <div style={T.h2}>Счёт за {monthLabel}</div>
            <div style={T.row}><span style={{ color: C.text2 }}>Аренда</span><b>{Number(payment?.base_amount ?? contract.rent_amount).toFixed(2)} ₽</b></div>
            <div style={T.row}><span style={{ color: C.text2 }}>Штраф</span><b>{Number(payment?.penalty_amount || 0).toFixed(2)} ₽</b></div>
            {utilities > 0 && (
              <div style={T.row}><span style={{ color: C.text2 }}>Ресурсы по квитанции</span><b>{utilities.toFixed(2)} ₽</b></div>
            )}
            <div style={T.row}><span style={{ color: C.text2 }}>Итого</span><span style={T.total}>{total.toFixed(2)} ₽</span></div>
            {payment && <div style={T.small}>Оплатить до: {parseDate(payment.due_date).toLocaleDateString('ru-RU')}</div>}
            <div style={{ marginTop: 10 }}><span style={statusChip}>{statusText}</span></div>

            {payment && !payment.confirmed_by_landlord && Number(payment.penalty_amount) > 0 && (
              deferralPending ? (
                <div style={T.note}>🟡 Отсрочка штрафа: заявка на рассмотрении</div>
              ) : (
                <button onClick={requestDeferral} style={T.btnWarn}>Попросить отсрочку штрафа</button>
              )
            )}

            {contract.payment_method === 'both' && (
              <div style={T.sub}>
                <div style={T.h3}>Как вы будете платить</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={effectiveMethod === 'card' ? T.btnSmall : T.btnSecondary} onClick={() => choosePayMethod('card')}>💳 Безналичный расчёт</button>
                  <button style={effectiveMethod === 'cash' ? T.btnSmall : T.btnSecondary} onClick={() => choosePayMethod('cash')}>💵 Наличные</button>
                </div>
              </div>
            )}

            {effectiveMethod === 'card' && (
              <div style={T.sub}>
                <div style={T.h3}>Способы оплаты</div>
                {details.length === 0 ? (
                  <div style={T.small}>Арендодатель ещё не добавил реквизиты для безналичной оплаты.</div>
                ) : (
                  details.map((d: PayDetail, i: number) => (
                    <div key={i} style={T.item}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{d.type === 'card' ? '💳' : '⚡'} {d.type === 'card' ? d.bank : `СБП • ${d.bank}`}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 16, marginBottom: 8 }}>{d.type === 'card' ? formatCardNumber(d.number) : formatPhoneDisplay(d.number)}</div>
                      <button onClick={() => copyToClipboard(d.type === 'card' ? formatCardNumber(d.number) : d.number, d.type === 'card' ? 'номер карты' : 'номер СБП')} style={T.btnSecondary}>
                        📋 Скопировать
                      </button>
                    </div>
                  ))
                )}
                {!payment?.confirmed_by_landlord && details.length > 0 && (
                  payment.card_claimed ? (
                    <div style={T.note}>💳 Безнал заявлен: ждёт подтверждения арендодателем</div>
                  ) : (
                    <button onClick={claimPaid} style={T.btn}>✅ Я оплатил</button>
                  )
                )}
              </div>
            )}

            {effectiveMethod === 'cash' && (
              <div style={T.sub}>
                <div style={T.h3}>Оплата наличными</div>
                <CashNegotiation
                  contractId={contract.id}
                  myRole="tenant"
                  tenantId={contract.tenant_id}
                  landlordId={obj?.landlord_id}
                />
              </div>
            )}
          </div>

          <div style={T.card}>
            <div style={T.h2}>История платежей</div>
            {payments.slice(0, 5).map((p: any) => (
              <div key={p.id} style={T.row}>
                <span>{new Date(p.period).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })} {p.confirmed_by_landlord ? '🟢' : '🟡'}</span>
                <b>{(Number(p.base_amount) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0)).toFixed(2)} ₽</b>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'meters' && (
        <>
          {readingsMode === 'manual' && meters.length > 0 && (
            <div style={T.card}>
              <div style={T.h2}>Передать показания</div>
              <div style={T.small}>Срок подачи: до {contract.meter_deadline_day} числа</div>
              {overallReading === 'incomplete' && (
                <div style={T.noteRed}>🔴 Арендодатель отметил: показания получены не полностью — передайте недостающие ещё раз</div>
              )}
              {overallReading === 'confirmed' && (
                <div style={T.noteGreen}>🟢 Показания получены арендодателем</div>
              )}
              {overallReading === 'proposed' && (
                <div style={T.note}>🟡 Показания отправлены и ждут подтверждения арендодателем</div>
              )}
              {meters.map((m: any) => {
                const t = meterTypes.find((x: any) => x.id === m.meter_type_id)
                const hist = (readingsByMeter || {})[m.id] || []
                const last = hist[0]
                const open = !!historyOpen[m.id]
                return (
                  <div key={m.id} style={T.item}>
                    <input
                      value={vals[m.id] || ''}
                      onChange={(e) => setVals({ ...vals, [m.id]: e.target.value })}
                      placeholder={(t?.label || 'Счётчик') + (m.label ? ` · № ${m.label}` : '') + ', ' + (t?.unit || 'м³')}
                      style={{ ...T.input, marginBottom: 4 }}
                      inputMode="decimal"
                    />
                    {m.label && <div style={T.tiny}>номер счётчика: {m.label}</div>}
                    {last && (
                      <div style={T.link} onClick={() => setHistoryOpen({ ...historyOpen, [m.id]: !open })}>
                        🕐 последнее: {last.value} · подано {new Date(last.submitted_at).toLocaleDateString('ru-RU')} · {chip(last.status)} {open ? '▲' : '▼'}
                      </div>
                    )}
                    {open && hist.slice(0, 10).map((r: any) => (
                      <div key={r.id} style={T.tiny}>{r.value} · подано {new Date(r.submitted_at).toLocaleDateString('ru-RU')} · {chip(r.status)}</div>
                    ))}
                  </div>
                )
              })}
              <button onClick={submitMeters} style={T.btn}>📤 Передать показания</button>
            </div>
          )}
          {readingsMode === 'manual' && meters.length === 0 && (
            <div style={T.card}>На объекте нет счётчиков с ручной подачей.</div>
          )}
          {readingsMode === 'auto' && (
            <div style={T.card}>
              <div style={T.h2}>Показания счётчиков</div>
              <div style={T.small}>💡 Показания передаются автоматически — вам ничего подавать не нужно.</div>
            </div>
          )}
          {readingsMode === 'self' && (
            <div style={T.card}>
              <div style={T.h2}>Показания счётчиков</div>
              <div style={T.small}>💡 Вы платите полную квитанцию сами — показания подавать не нужно.</div>
            </div>
          )}
        </>
      )}

      {tab === 'contract' && (
        <>
          <div style={T.card}>
            <div style={T.h2}>Договор</div>
            <div style={T.row}><span style={{ color: C.text2 }}>Арендодатель</span><b>{landlord?.full_name}</b></div>
            {landlord?.phone && <div style={T.row}><span style={{ color: C.text2 }}>Телефон</span><b>{formatPhoneDisplay(landlord.phone)}</b></div>}
            {contract.start_date && contract.end_date && (
              <div style={T.row}><span style={{ color: C.text2 }}>Срок</span><b>{parseDate(contract.start_date).toLocaleDateString('ru-RU')} — {parseDate(contract.end_date).toLocaleDateString('ru-RU')}</b></div>
            )}
            <div style={T.row}><span style={{ color: C.text2 }}>Аренда</span><b>{Number(contract.rent_amount).toFixed(0)} ₽/мес</b></div>
            <div style={T.row}><span style={{ color: C.text2 }}>День платежа</span><b>{contract.payment_day} число</b></div>
            {deposit > 0 && <div style={T.row}><span style={{ color: C.text2 }}>Депозит</span><b>{deposit.toFixed(0)} ₽</b></div>}
          </div>
          <div style={T.card}>
            <div style={T.h2}>Штрафы</div>
            <div style={T.row}><span style={{ color: C.text2 }}>Просрочка оплаты</span><b>+{penaltyRate} ₽/день</b></div>
            {readingsMode === 'manual' && readingsRule && (
              <div style={T.row}><span style={{ color: C.text2 }}>Просрочка показаний</span><b>+{Number(readingsRule.rate)} ₽/день</b></div>
            )}
          </div>
          {frozenTotal > 0 && (
            <div style={T.card}>
              <div style={T.h2}>🧊 Замороженные штрафы: {frozenTotal.toFixed(0)} ₽</div>
              {(frozenRows || []).map((f: any) => (
                <div key={f.id} style={T.item}>
                  <div style={{ fontSize: 14 }}>{f.period ? parseDate(f.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : 'без месяца'} — {Number(f.amount).toFixed(0)} ₽</div>
                  {f.adjusted_note && <div style={T.tiny}>{f.adjusted_note}</div>}
                </div>
              ))}
              {deposit > 0
                ? (deposit >= frozenTotal
                  ? <div style={T.small}>Будет удержано из депозита; остаток депозита: {(deposit - frozenTotal).toFixed(0)} ₽</div>
                  : <div style={{ ...T.small, color: C.red }}>Сверх депозита долг: {(frozenTotal - deposit).toFixed(0)} ₽</div>)
                : <div style={{ ...T.small, color: C.red }}>Долг арендатора (депозита нет)</div>}
              <div style={T.tiny}>Записи хранятся до конца договора</div>
            </div>
          )}
        </>
      )}

      {msg && <div style={T.msg}>{msg}</div>}
    </div>
  )
}

export default TenantDashboard
