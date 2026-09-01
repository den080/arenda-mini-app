import { supabase } from './supabase'

function parseDate(d: any): Date { const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, dd || 1) }
function toISO(d: Date): string { const m = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0'); return `${d.getFullYear()}-${m}-${dd}` }
function clampDay(y: number, m: number, d: number): number { const last = new Date(y, m + 1, 0).getDate(); return Math.min(Math.max(1, d), last) }

// Счета создаются НЕ РАНЬШЕ месяца начала аренды.
// Первый счёт = месяц начала договора (оплачивается заранее), дальше — цепочкой.
export async function ensureNextPayment(contractId: string) {
  try {
    const { data: con } = await supabase.from('contracts').select('*').eq('id', contractId).maybeSingle()
    if (!con || con.status !== 'active') return null
    const sd = con.start_date ? parseDate(con.start_date) : null
    const firstPeriod = sd ? new Date(sd.getFullYear(), sd.getMonth(), 1) : null
    const { data: pays } = await supabase.from('payments').select('*').eq('contract_id', contractId).order('period', { ascending: false })
    const list = pays || []
    const open = list.filter((p: any) => !p.confirmed_by_landlord)
    if (open.length > 0) return open[open.length - 1]

    const now = new Date()
    const last = list[0]
    let next: Date
    if (!last) {
      // первый счёт — месяц начала аренды, даже если он в будущем
      next = firstPeriod || new Date(now.getFullYear(), now.getMonth(), 1)
    } else {
      const base = parseDate(last.period)
      next = new Date(base.getFullYear(), base.getMonth() + 1, 1)
      // следующие счета — не раньше месяца начала и не дальше +1 месяца вперёд
      if (firstPeriod && next.getTime() < firstPeriod.getTime()) return null
      const maxPeriod = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      if (next.getTime() > maxPeriod.getTime()) return null
    }
    const due = new Date(next.getFullYear(), next.getMonth(), clampDay(next.getFullYear(), next.getMonth(), Number(con.payment_day) || 1))
    const { error } = await supabase.from('payments').insert({
      contract_id: contractId,
      period: toISO(next),
      due_date: toISO(due),
      base_amount: Number(con.rent_amount) || 0,
      penalty_amount: 0,
      utilities_amount: 0,
    })
    if (error) return null
    return null
  } catch {
    return null
  }
}
