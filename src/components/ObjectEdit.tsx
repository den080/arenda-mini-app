import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { ensureNextPayment } from '../lib/nextPayment'
import { T } from '../theme'
import { ConfirmDelete, Modal, showToast } from './ui'
import {
  S, PayDetail, normalizePhone, formatPhoneInput, iso, pdate, clampDay,
  moneyOk, validPhone, DetailsEditor, ReadingsModeSelect, methodOptions,
} from './objectShared'

export function ObjectEdit({ objectId }: { objectId: string }) {
  const [ready, setReady] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [repairOpen, setRepairOpen] = useState(false)
  const [repairOk, setRepairOk] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [locked, setLocked] = useState(false)
  const [editContractId, setEditContractId] = useState<string | null>(null)
  const [editCounterId, setEditCounterId] = useState<string | null>(null)
  const [cRent, setCRent] = useState(0)
  const [cPayDay, setCPayDay] = useState(1)
  const [eAddress, setEAddress] = useState('')
  const [eNotes, setENotes] = useState('')
  const [eDocName, setEDocName] = useState('')
  const [eName, setEName] = useState('')
  const [ePhone, setEPhone] = useState('')
  const [eStartDate, setEStartDate] = useState('')
  const [eRent, setERent] = useState('')
  const [eDeposit, setEDeposit] = useState('')
  const [ePaymentDay, setEPaymentDay] = useState('')
  const [eMeterDay, setEMeterDay] = useState('15')
  const [eReadingsMode, setEReadingsMode] = useState('manual')
  const [eEndDate, setEEndDate] = useState('')
  const [eMethod, setEMethod] = useState('both')
  const [ePenPay, setEPenPay] = useState('')
  const [ePenRead, setEPenRead] = useState('')
  const [eRemind, setERemind] = useState('')
  const [eDetails, setEDetails] = useState<PayDetail[]>([])
  const [editDetailsErr, setEditDetailsErr] = useState<string | null>(null)
  const [showBar, setShowBar] = useState(false)
  const barAnchor = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    (async () => {
      const { data: o } = await supabase.from('objects').select('*').eq('id', objectId).maybeSingle()
      if (!o) return
      setEAddress(o.address || '')
      setENotes(o.notes || '')
      setEDocName((o as any).landlord_doc_name || '')
      const { data: contract } = await supabase.from('contracts').select('*').eq('object_id', objectId).eq('status', 'active').maybeSingle()
      if (contract) {
        setEditContractId(contract.id)
        setCRent(Number(contract.rent_amount) || 0)
        setCPayDay(Number(contract.payment_day) || 1)
        setEStartDate(contract.start_date || '')
        setERent(String(contract.rent_amount ?? ''))
        setEDeposit(String(contract.deposit_amount ?? ''))
        setEPaymentDay(String(contract.payment_day ?? ''))
        setEMeterDay(String(contract.meter_deadline_day || 15))
        setEReadingsMode(contract.readings_mode || 'manual')
        setEEndDate(contract.end_date || '')
        setEMethod(contract.payment_method || 'both')
        setERemind(String(contract.reminder_days_before ?? ''))
        setEDetails((contract.payment_details as PayDetail[]) || [])
        setEditCounterId(contract.tenant_id)
        const { data: counter } = await supabase.from('users').select('*').eq('id', contract.tenant_id).maybeSingle()
        setEName(counter?.full_name || '')
        setEPhone(counter?.phone || '')
        const { data: rules } = await supabase.from('penalty_rules').select('*').eq('contract_id', contract.id)
        const rp = (rules || []).find((r: any) => r.violation_type === 'payment_overdue')
        const rr = (rules || []).find((r: any) => r.violation_type === 'readings_overdue')
        setEPenPay(rp ? String(rp.rate) : '')
        setEPenRead(rr ? String(rr.rate) : '')
        const { data: pays } = await supabase.from('payments').select('confirmed_by_landlord').eq('contract_id', contract.id)
        const list = pays || []
        setLocked(list.some((p: any) => p.confirmed_by_landlord) || list.length > 1)
      }
      setReady(true)
    })()
  }, [objectId])

  useEffect(() => {
    function onScroll() {
      const el = barAnchor.current
      if (!el) { setShowBar(false); return }
      setShowBar(el.getBoundingClientRect().top < 0)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [ready])

  async function doRepair() {
    if (!editContractId || repairing) return
    setRepairing(true)
    try {
      const today0 = new Date()
      const tMid = new Date(today0.getFullYear(), today0.getMonth(), today0.getDate())
      const { data: pays } = await supabase.from('payments').select('*').eq('contract_id', editContractId).order('period', { ascending: true })
      const list = pays || []
      for (const p of list) {
        if (!p.confirmed_by_landlord && pdate(p.due_date) < tMid) {
          await supabase.from('payments').update({ confirmed_by_landlord: true, confirmed_at: p.due_date, penalty_amount: 0 }).eq('id', p.id)
        }
      }
      const { data: pays2 } = await supabase.from('payments').select('*').eq('contract_id', editContractId).order('period', { ascending: true })
      const list2 = pays2 || []
      if (list2.length) {
        const last = list2[list2.length - 1]
        let next = new Date(pdate(last.period).getFullYear(), pdate(last.period).getMonth() + 1, 1)
        const rows: any[] = []
        let guard = 0
        while (guard++ < 240) {
          const due = new Date(next.getFullYear(), next.getMonth(), clampDay(next.getFullYear(), next.getMonth(), cPayDay))
          if (due >= tMid) break
          rows.push({ contract_id: editContractId, period: iso(next), due_date: iso(due), base_amount: cRent, penalty_amount: 0, utilities_amount: 0, confirmed_by_landlord: true, confirmed_at: iso(due) })
          next = new Date(next.getFullYear(), next.getMonth() + 1, 1)
        }
        if (rows.length) await supabase.from('payments').insert(rows)
      }
      await ensureNextPayment(editContractId)
      showToast('✅ История выровнена: прошлые месяцы оплачены, создан текущий счёт')
      setRepairOpen(false)
      setRepairOk(false)
      window.dispatchEvent(new Event('rentflow-refresh'))
    } finally {
      setRepairing(false)
    }
  }

  async function saveEdit() {
    if (!validPhone(ePhone)) { showToast('Проверьте номер телефона арендатора'); return }
    if (eMethod !== 'cash' && eDetails.length === 0) { setEditDetailsErr('Добавьте хотя бы один способ безналичной оплаты'); return }
    setEditDetailsErr(null)
    const eRentRaw = locked ? Number(eRent) || 0 : moneyOk(eRent)
    if (!locked && (eRentRaw === null || eRentRaw <= 0)) { showToast('Сумма аренды — число больше 0'); return }
    const eRentN = eRentRaw ?? 0
    const eDepRaw = locked ? Number(eDeposit) || 0 : moneyOk(eDeposit)
    if (!locked && eDepRaw === null) { showToast('Депозит — число не меньше 0'); return }
    const eDepN = eDepRaw ?? 0
    const ePayDayN = Math.round(Number(ePaymentDay) || 1)
    if (!locked && (ePayDayN < 1 || ePayDayN > 31)) { showToast('День платежа — число от 1 до 31'); return }
    const eMeterDayN = Math.round(Number(eMeterDay) || 15)
    if (eMeterDayN < 1 || eMeterDayN > 31) { showToast('День показаний — число от 1 до 31'); return }
    const ePenPayRaw = locked ? Number(ePenPay) || 0 : moneyOk(ePenPay)
    if (!locked && ePenPayRaw === null) { showToast('Штраф за просрочку оплаты — число не меньше 0'); return }
    const ePenPayN = ePenPayRaw ?? 0
    const ePenReadRaw = locked ? Number(ePenRead) || 0 : moneyOk(ePenRead)
    if (!locked && ePenReadRaw === null) { showToast('Штраф за показания — число не меньше 0'); return }
    const ePenReadN = ePenReadRaw ?? 0
    const eRemindN = Math.round(Number(eRemind) || 3)
    if (eRemindN < 0 || eRemindN > 30) { showToast('Напоминание — от 0 до 30 дней'); return }
    if (eStartDate && eEndDate && pdate(eEndDate) <= pdate(eStartDate)) { showToast('Окончание договора должно быть позже начала'); return }
    if (eMethod !== 'cash') {
      for (const d of eDetails) {
        if (!d.bank || !d.bank.trim()) { showToast('Укажите название банка в способах оплаты'); return }
        const dg = (d.number || '').replace(/\D/g, '')
        if (d.type === 'card' ? dg.length !== 16 : dg.length !== 11) { showToast('Проверьте номер карты или СБП в способах оплаты'); return }
      }
    }
    const { error: oe } = await supabase.from('objects').update({ address: eAddress, notes: eNotes || null, landlord_doc_name: eDocName.trim() || null }).eq('id', objectId)
    if (oe) { showToast('Ошибка: ' + oe.message); return }
    if (editContractId) {
      const firstCard = eDetails.find(d => d.type === 'card')
      const upd: any = {
        payment_method: eMethod,
        card_number: firstCard ? firstCard.number : null,
        payment_details: eDetails,
        reminder_days_before: eRemindN,
        meter_deadline_day: eMeterDayN,
        readings_mode: eReadingsMode,
        end_date: eEndDate || null,
      }
      if (!locked) {
        upd.rent_amount = eRentN
        upd.deposit_amount = eDepN
        upd.payment_day = ePayDayN
        upd.start_date = eStartDate || null
      }
      const { error: ce } = await supabase.from('contracts').update(upd).eq('id', editContractId)
      if (ce) { showToast('Ошибка: ' + ce.message); return }
      if (!locked) {
        const rules: Array<['payment_overdue' | 'readings_overdue', number]> = [
          ['payment_overdue', ePenPayN],
        ]
        if (eReadingsMode === 'manual') rules.push(['readings_overdue', ePenReadN])
        for (const [vt, rate] of rules) {
          const { data: ex } = await supabase.from('penalty_rules').select('id').eq('contract_id', editContractId).eq('violation_type', vt).limit(1)
          if (ex && ex.length) await supabase.from('penalty_rules').update({ rate }).eq('id', ex[0].id)
          else await supabase.from('penalty_rules').insert({ contract_id: editContractId, violation_type: vt, rate, rate_unit: 'per_day_rub', starts_after_days: 0 })
        }
        if (eReadingsMode !== 'manual') {
          const { data: ex } = await supabase.from('penalty_rules').select('id').eq('contract_id', editContractId).eq('violation_type', 'readings_overdue').limit(1)
          if (ex && ex.length) await supabase.from('penalty_rules').update({ rate: 0 }).eq('id', ex[0].id)
        }
      }
      if (editCounterId) {
        await supabase.from('users').update({ full_name: eName || 'Арендатор', phone: ePhone ? normalizePhone(ePhone) : null }).eq('id', editCounterId)
      }
    }
    showToast('✅ Изменения сохранены')
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  async function doRemove() {
    const { data: contracts } = await supabase.from('contracts').select('id').eq('object_id', objectId)
    const ids = (contracts || []).map((c: any) => c.id)
    if (ids.length) {
      await supabase.from('meter_readings').delete().in('contract_id', ids)
      await supabase.from('payments').delete().in('contract_id', ids)
      await supabase.from('penalty_rules').delete().in('contract_id', ids)
      await supabase.from('cash_meetings').delete().in('contract_id', ids)
      await supabase.from('deferred_requests').delete().in('contract_id', ids)
      await supabase.from('deferred_debts').delete().in('contract_id', ids)
      await supabase.from('frozen_penalties').delete().in('contract_id', ids)
      await supabase.from('utility_bills').delete().in('contract_id', ids)
      await supabase.from('contracts').delete().in('id', ids)
    }
    await supabase.from('object_meters').delete().eq('object_id', objectId)
    const { error } = await supabase.from('objects').delete().eq('id', objectId)
    if (error) { showToast('Ошибка: ' + error.message); return }
    showToast('Объект удалён')
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  if (!ready) return null
  return (
    <div
      style={T.card}
      onKeyDown={(e: any) => { if (e.key === 'Enter' && e.target && (e.target as any).blur) (e.target as any).blur() }}
    >
      <div ref={barAnchor} />
      {showBar && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 150, background: '#f2f2f7', borderBottom: '1px solid rgba(60,60,67,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 16px', boxSizing: 'border-box' }}>
          <span style={{ fontSize: 13, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: 0.3 }}>Договор</span>
          <button
            style={{ border: 'none', background: 'transparent', color: '#0071e3', fontWeight: 600, fontSize: 17, cursor: 'pointer', padding: 4, flexShrink: 0 }}
            onClick={() => { try { (document.activeElement as any)?.blur?.() } catch {} saveEdit() }}
          >Сохранить изменения</button>
        </div>
      )}
      <div style={T.h2}>Объект и договор</div>
      {locked && (
        <div style={T.note}>Платежи начались — ключевые условия (аренда, депозит, день оплаты, дата начала, штрафы) защищены от изменений. Остальные поля можно редактировать.</div>
      )}
      <div style={S.lab}>Адрес</div>
      <input style={S.inp} value={eAddress} onChange={(e) => setEAddress(e.target.value)} />
      <div style={S.lab}>Арендодатель (имя для документов)</div>
      <input style={S.inp} value={eDocName} onChange={(e) => setEDocName(e.target.value)} placeholder="Фамилия Имя Отчество" />
      <div style={S.lab}>Заметка</div>
      <input style={S.inp} value={eNotes} onChange={(e) => setENotes(e.target.value)} placeholder="по доверенности №" />
      <div style={S.lab}>Арендатор</div>
      <input style={S.inp} value={eName} onChange={(e) => setEName(e.target.value)} placeholder="Фамилия Имя Отчество" />
      <div style={S.lab}>Телефон арендатора</div>
      <input style={S.inp} value={ePhone} onChange={(e) => setEPhone(formatPhoneInput(e.target.value))} inputMode="tel" />
      <div style={S.lab}>Начало договора</div>
      <input style={locked ? S.inpLocked : S.inp} type="date" value={eStartDate} disabled={locked} onChange={(e) => { const v = e.target.value; setEStartDate(v); const d = Number(v.slice(8, 10)); if (d >= 1 && d <= 31) setEPaymentDay(String(d)) }} />
      <div style={S.lab}>Сумма аренды, руб</div>
      <input style={locked ? S.inpLocked : S.inp} value={eRent} disabled={locked} onChange={(e) => setERent(e.target.value)} inputMode="numeric" />
      {!locked && <div style={{ ...T.tiny, margin: '4px 0 0' }}>Новая аренда действует со следующего счёта.</div>}
      <div style={S.lab}>Залоговый депозит, руб</div>
      <input style={locked ? S.inpLocked : S.inp} value={eDeposit} disabled={locked} onChange={(e) => setEDeposit(e.target.value)} inputMode="numeric" />
      <div style={S.lab}>День платежа</div>
      <input style={locked ? S.inpLocked : S.inp} value={ePaymentDay} disabled={locked} onChange={(e) => setEPaymentDay(e.target.value)} inputMode="numeric" />
      <div style={S.lab}>Режим показаний счётчиков</div>
      <ReadingsModeSelect value={eReadingsMode} onChange={setEReadingsMode} />
      {eReadingsMode === 'manual' && (
        <div>
          <div style={S.lab}>Крайний день показаний</div>
          <input style={S.inp} value={eMeterDay} onChange={(e) => setEMeterDay(e.target.value)} inputMode="numeric" />
        </div>
      )}
      <div style={S.lab}>Окончание договора</div>
      <input style={S.inp} type="date" value={eEndDate} onChange={(e) => setEEndDate(e.target.value)} />
      <div style={S.lab}>Способ оплаты</div>
      <select style={S.sel} value={eMethod} onChange={(e) => setEMethod(e.target.value)}>{methodOptions}</select>
      {eMethod !== 'cash' && (
        <div>
          <div style={S.lab}>Способы оплаты (карта или СБП) *</div>
          <DetailsEditor list={eDetails} onChange={(v) => { setEDetails(v); if (v.length > 0) setEditDetailsErr(null) }} />
          {editDetailsErr && <div style={T.noteRed}>{editDetailsErr}</div>}
        </div>
      )}
      <div style={S.lab}>Штраф за просрочку оплаты, руб/день</div>
      <input style={locked ? S.inpLocked : S.inp} value={ePenPay} disabled={locked} onChange={(e) => setEPenPay(e.target.value)} inputMode="numeric" />
      {eReadingsMode === 'manual' && (
        <div>
          <div style={S.lab}>Штраф за просрочку показаний, руб/день</div>
          <input style={locked ? S.inpLocked : S.inp} value={ePenRead} disabled={locked} onChange={(e) => setEPenRead(e.target.value)} inputMode="numeric" />
        </div>
      )}
      <div style={S.lab}>Напоминать за сколько дней</div>
      <input style={S.inp} value={eRemind} onChange={(e) => setERemind(e.target.value)} inputMode="numeric" />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
        <button style={S.red} onClick={() => setDelOpen(true)}>Удалить объект</button>
      </div>
      <div style={{ borderTop: '1px solid rgba(60,60,67,0.12)', paddingTop: 12, marginTop: 4 }}>
        <div style={{ ...T.tiny, margin: '0 0 8px' }}>Если договор внесён задним числом и в реальности просрочек не было — выровняйте историю: прошлые счета станут «оплачены вовремя», создастся текущий счёт.</div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
          <button style={S.blue} onClick={() => { setRepairOk(false); setRepairOpen(true) }}>Выровнять историю старых платежей</button>
        </div>
      </div>
      <Modal open={repairOpen} title="Выровнять историю" onClose={() => setRepairOpen(false)}>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 12 }}>
          Все счета с прошедшей датой будут отмечены «оплачены вовремя», недостающие месяцы дозаполнятся, создастся текущий открытый счёт. Используйте, только если в реальности просрочек не было.
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 14, color: '#1d1d1f' }}>
          <input type="checkbox" checked={repairOk} onChange={(e) => setRepairOk(e.target.checked)} />
          Понимаю и подтверждаю
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            disabled={!repairOk || repairing}
            onClick={doRepair}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: repairOk ? 1 : 0.4 }}
          >{repairing ? 'Выравнивание…' : 'Выровнять'}</button>
          <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={() => setRepairOpen(false)}>Отмена</button>
        </div>
      </Modal>
      <ConfirmDelete
        open={delOpen}
        text="Объект, договор, платежи и вся история будут удалены безвозвратно."
        onClose={() => setDelOpen(false)}
        onConfirm={doRemove}
      />
    </div>
  )
}

export default ObjectEdit
