import { supabase } from './supabase'

function parseDate(d: any): Date { const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, dd || 1) }
function toISO(d: Date): string { const m = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0'); return `${d.getFullYear()}-${m}-${dd}` }
function clampDay(y: number, m: number, d: number): number { const last = new Date(y, m + 1, 0).getDate(); return Math.min(Math.max(1, d), last) }

export interface RenewalOffer {
  id?: string | null
  contract_id: string
  offered_by: 'landlord' | 'tenant'
  rent_amount: number
  months: number
  start_date: string
  round: number
  status?: string
}

export async function addOffer(o: RenewalOffer) {
  await supabase.from('renewal_offers').insert({
    contract_id: o.contract_id,
    offered_by: o.offered_by,
    rent_amount: o.rent_amount,
    months: o.months,
    start_date: o.start_date,
    round: o.round || 1,
    status: 'proposed',
  })
}

export async function markOffer(id: string, status: string) {
  if (!id) return
  await supabase.from('renewal_offers').update({ status }).eq('id', id)
}

export async function latestOffer(contractId: string): Promise<any | null> {
  const { data } = await supabase
    .from('renewal_offers')
    .select('*')
    .eq('contract_id', contractId)
    .order('round', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data || null
}

export async function acceptRenewal(offer: RenewalOffer, oldContract: any): Promise<{ error?: string }> {
  try {
    if (!oldContract || !oldContract.id) return { error: 'договор не найден' }

    // Защита от дублей: если по объекту уже есть другой активный «новый» договор — второй не создаём
    const { data: dupActive } = await supabase
      .from('contracts')
      .select('id')
      .eq('object_id', oldContract.object_id)
      .eq('status', 'active')
      .neq('id', oldContract.id)
      .limit(1)
    if (dupActive && dupActive.length > 0) {
      return { error: 'Договор уже продлён: по объекту есть действующий новый договор' }
    }

    const startD = parseDate(offer.start_date)
    const endD = new Date(startD.getFullYear(), startD.getMonth() + Number(offer.months || 11), startD.getDate())

    // 1) Новый договор: условия копируются из старого, аренда — из предложения
    const { data: newCon, error: e1 } = await supabase.from('contracts').insert({
      object_id: oldContract.object_id,
      tenant_id: oldContract.tenant_id,
      rent_amount: Number(offer.rent_amount) || Number(oldContract.rent_amount) || 0,
      payment_day: oldContract.payment_day,
      meter_deadline_day: oldContract.meter_deadline_day,
      reminder_days_before: oldContract.reminder_days_before,
      payment_method: oldContract.payment_method,
      card_number: oldContract.card_number,
      cash_slots: oldContract.cash_slots,
      readings_mode: oldContract.readings_mode,
      tenant_in_app: oldContract.tenant_in_app,
      deposit_amount: Number(oldContract.deposit_amount || 0),
      deposit_paid: Number(oldContract.deposit_paid || 0),
      balance: Number(oldContract.balance || 0),
      start_date: toISO(startD),
      end_date: toISO(endD),
      status: 'active',
    }).select('*').maybeSingle()
    if (e1 || !newCon) return { error: e1?.message || 'не удалось создать новый договор' }

    // 2) Старый договор: завершён с пометкой «продлён», депозит и баланс перенесены (обнулены в старом)
    const frozenTotal = await supabase.from('frozen_penalties').select('amount').eq('contract_id', oldContract.id)
    const fSum = (frozenTotal.data || []).reduce((s: number, f: any) => s + Number(f.amount || 0), 0)
    await supabase.from('contracts').update({
      status: 'terminated',
      terminated_at: new Date().toISOString(),
      deposit_paid: 0,
      balance: 0,
      settlement: {
        renewed_to: newCon.id,
        deposit_paid: Number(oldContract.deposit_paid || 0),
        frozen_total: fSum,
        result: 0,
      },
    }).eq('id', oldContract.id)

    // 3) Замороженные штрафы переезжают в новый договор
    await supabase.from('frozen_penalties').update({ contract_id: newCon.id }).eq('contract_id', oldContract.id)

    // 4) Убираем открытые «будущие» счета старого договора (новый создаст свои)
    const { data: oldPays } = await supabase.from('payments').select('*').eq('contract_id', oldContract.id)
    for (const p of oldPays || []) {
      if (!p.confirmed_by_landlord && Number(p.paid_amount || 0) === 0 && !p.card_claimed) {
        await supabase.from('payments').delete().eq('id', p.id)
      }
    }

    // 5) Первый счёт нового договора: авансовый срок — payment_day предыдущего месяца, но не раньше старта
    const periodD = new Date(startD.getFullYear(), startD.getMonth(), 1)
    const dueMonth = new Date(periodD.getFullYear(), periodD.getMonth() - 1, 1)
    let due = new Date(dueMonth.getFullYear(), dueMonth.getMonth(), clampDay(dueMonth.getFullYear(), dueMonth.getMonth(), Number(oldContract.payment_day) || 1))
    if (due.getTime() < startD.getTime()) due = startD
    await supabase.from('payments').insert({
      contract_id: newCon.id,
      period: toISO(periodD),
      due_date: toISO(due),
      base_amount: Number(offer.rent_amount) || Number(oldContract.rent_amount) || 0,
      penalty_amount: 0,
      utilities_amount: 0,
    })

    // 6) Предложение помечаем принятым
    if (offer.id) await markOffer(offer.id, 'accepted')

    return {}
  } catch (e: any) {
    return { error: String(e?.message || e) }
  }
}
