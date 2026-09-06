import { supabase } from './supabase'

function parseDate(d: any): Date { const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, dd || 1) }
function toISO(d: Date): string { const m = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0'); return `${d.getFullYear()}-${m}-${dd}` }
function clampDay(y: number, m: number, d: number): number { const last = new Date(y, m + 1, 0).getDate(); return Math.min(Math.max(1, d), last) }

// Последний счёт по договору — за месяц ПЕРЕД месяцем окончания:
// оплата за него закрывает аренду до конца договора.
// Счёт за месяц окончания создаётся ТОЛЬКО после пролонгации.
// Коммунальные в новом счёте всегда 0 — до ввода квитанции.
export async function ensureNextPayment(contractId: string) {
  try {
    const { data: con } = await supabase.from('contracts').select('*').eq('id', contractId).maybeSingle()
    if (!con || con.status !== 'active') return null
    const sd = con.start_date ? parseDate(con.start_date) : null
    const firstPeriod = sd ? new Date(sd.getFullYear(), sd.getMonth(), 1) : null
    const ed = con.end_date ? parseDate(con.end_date) : null
    const lastPeriod = ed ? new Date(ed.getFullYear(), ed.getMonth(), 1) : null

    const { data: pays } = await supabase.from('payments').select('*').eq('contract_id', contractId).order('period', { ascending: false })
    const list = pays || []

    const isBeyondEnd = (p: any) => !!(
      lastPeriod &&
      !p.confirmed_by_landlord &&
      Number(p.paid_amount || 0) === 0 &&
      !p.card_claimed &&
      parseDate(p.period).getTime() >= lastPeriod.getTime()
    )

    // уборка: счета за месяц окончания и дальше, созданные до пролонгации, не нужны
    for (const p of list) {
      if (isBeyondEnd(p)) await supabase.from('payments').delete().eq('id', p.id)
    }
    const alive = list.filter((p: any) => !isBeyondEnd(p))

    const open = alive.filter((p: any) => !p.confirmed_by_landlord)
    if (open.length > 0) return open[open.length - 1]

    const now = new Date()
    const last = alive[0]
    let next: Date
    if (!last) {
      next = firstPeriod || new Date(now.getFullYear(), now.getMonth(), 1)
    } else {
      const base = parseDate(last.period)
      next = new Date(base.getFullYear(), base.getMonth() + 1, 1)
      if (firstPeriod && next.getTime() < firstPeriod.getTime()) return null
      const maxPeriod = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      if (next.getTime() > maxPeriod.getTime()) return null
    }
    if (lastPeriod && next.getTime() >= lastPeriod.getTime()) return null

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
