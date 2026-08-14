import { supabase } from './supabase'

// Если последний платёж подтверждён, а следующего нет — создаёт счёт за следующий месяц
export async function ensureNextPayment(contractId: string) {
  const { data: pays } = await supabase
    .from('payments').select('*')
    .eq('contract_id', contractId)
    .order('period', { ascending: false })
  if (!pays || pays.length === 0) return
  const last = pays[0]
  if (!last.confirmed_by_landlord) return
  const { data: con } = await supabase.from('contracts').select('*').eq('id', contractId).maybeSingle()
  if (!con) return
  const periodDate = parsePeriod(last.period)
  const nextPeriod = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 1)
  const nextISO = toISO(nextPeriod)
  if (pays.some(p => toISO(parsePeriod(p.period)) === nextISO)) return
  const payDay = Number(con.payment_day) || 1
  const due = new Date(nextPeriod.getFullYear(), nextPeriod.getMonth(), payDay)
  await supabase.from('payments').insert({
    contract_id: contractId,
    period: nextISO,
    due_date: toISO(due),
    base_amount: Number(con.rent_amount) || Number(last.base_amount) || 0,
    penalty_amount: 0,
    utilities_amount: 0,
  })
  window.dispatchEvent(new Event('rentflow-refresh'))
}

function parsePeriod(d: any): Date {
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, dd || 1)
}

function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}
