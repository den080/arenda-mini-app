import { supabase } from './supabase'

function parseDate(d: any): Date { const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, dd || 1) }
function toISO(d: Date): string { const m = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0'); return `${d.getFullYear()}-${m}-${dd}` }
function clampDay(y: number, m: number, d: number): number { const last = new Date(y, m + 1, 0).getDate(); return Math.min(Math.max(1, d), last) }

export async function latestOffer(contractId: string): Promise<any> {
  const { data } = await supabase.from('renewal_offers').select('*').eq('contract_id', contractId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data
}

export async function addOffer(o: { contract_id: string; offered_by: 'tenant' | 'landlord'; rent_amount: number; months: number; start_date: string; round: number }) {
  return supabase.from('renewal_offers').insert({ ...o, status: 'proposed' })
}

export async function markOffer(id: string, status: string) {
  return supabase.from('renewal_offers').update({ status }).eq('id', id)
}

// Принятие предложения: создаётся НОВЫЙ договор, старый уходит в архив,
// депозит/замороженные штрафы/последние показания переносятся.
export async function acceptRenewal(offer: any, oldContract: any): Promise<{ error?: string }> {
  try {
    const startD = parseDate(offer.start_date)
    const months = Number(offer.months) || 11
    const endD = new Date(startD.getFullYear(), startD.getMonth() + months, startD.getDate())
    const { data: nc, error } = await supabase.from('contracts').insert({
      object_id: oldContract.object_id,
      tenant_id: oldContract.tenant_id,
      rent_amount: Number(offer.rent_amount) || Number(oldContract.rent_amount) || 0,
      deposit_amount: Number(oldContract.deposit_amount || 0),
      deposit_paid: Number(oldContract.deposit_paid || 0),
      balance: Number(oldContract.balance || 0),
      payment_day: Number(oldContract.payment_day || 1),
      meter_deadline_day: oldContract.meter_deadline_day ?? null,
      readings_mode: oldContract.readings_mode || 'manual',
      start_date: toISO(startD),
      end_date: toISO(endD),
      payment_method: oldContract.payment_method || 'both',
      payment_details: oldContract.payment_details || [],
      card_number: oldContract.card_number || null,
      reminder_days_before: oldContract.reminder_days_before ?? 3,
      status: 'active',
    }).select().single()
    if (error) return { error: error.message }

    const { data: rules } = await supabase.from('penalty_rules').select('*').eq('contract_id', oldContract.id)
    if (rules && rules.length) {
    await supabase.from('penalty_rules').insert(rules.map((r: any) => ({ contract_id: nc.id, violation_type: r.violation_type, rate: r.rate, rate_unit: r.rate_unit, starts_after_days: r.starts_after_days })))
    }

    await supabase.from('frozen_penalties').update({ contract_id: nc.id }).eq('contract_id', oldContract.id)
    await supabase.from('deferred_debts').update({ contract_id: nc.id }).eq('contract_id', oldContract.id)

    const { data: meters } = await supabase.from('object_meters').select('id').eq('object_id', oldContract.object_id).eq('is_active', true)
    for (const m of meters || []) {
      const { data: last } = await supabase.from('meter_readings').select('*').eq('object_meter_id', m.id).eq('contract_id', oldContract.id).order('submitted_at', { ascending: false }).limit(1).maybeSingle()
      if (last) {
        await supabase.from('meter_readings').insert({ object_meter_id: m.id, contract_id: nc.id, value: last.value, period: `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-01`, submitted_at: new Date().toISOString(), status: 'confirmed' })
      }
    }

    const periodD = new Date(startD.getFullYear(), startD.getMonth(), 1)
    let due = new Date(periodD.getFullYear(), periodD.getMonth(), clampDay(periodD.getFullYear(), periodD.getMonth(), Number(oldContract.payment_day) || 1))
    if (due.getTime() < startD.getTime()) due = startD
    await supabase.from('payments').insert({ contract_id: nc.id, period: toISO(periodD), due_date: toISO(due), base_amount: Number(offer.rent_amount) || Number(oldContract.rent_amount) || 0, penalty_amount: 0, utilities_amount: 0 })

    await supabase.from('contracts').update({ status: 'terminated', terminated_at: new Date().toISOString(), termination_note: `продлён новым договором с ${toISO(startD)}`, settlement: { deposit_carried: Number(oldContract.deposit_paid || 0), renewed_to: nc.id } }).eq('id', oldContract.id)
    await supabase.from('renewal_offers').update({ status: 'accepted' }).eq('id', offer.id)
    return {}
  } catch (e: any) {
    return { error: e?.message || 'Ошибка продления' }
  }
}
