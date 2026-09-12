// Единые финансовые функции (ТЗ п.16, 18, 53): даты и штрафы считаются только здесь

export function parseDate(d: any): Date {
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, dd || 1)
}

export function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

// Срок оплаты с корректным клампом 28/29/30/31 (ТЗ п.16)
export function getPaymentDueDate(period: string, paymentDay: number): Date {
  const p = parseDate(`${period}-01`)
  const y = p.getFullYear()
  const m = p.getMonth()
  const last = new Date(y, m + 1, 0).getDate()
  return new Date(y, m, Math.min(Math.max(1, Number(paymentDay) || 1), last))
}

export function calculateOutstanding(payment: any): number {
  if (!payment) return 0
  const total = Number(payment.base_amount || 0) + Number(payment.utilities_amount || 0) + Number(payment.penalty_amount || 0)
  return Math.max(0, total - Number(payment.paid_amount || 0))
}

export function getPaymentStatus(payment: any, today = new Date()): string {
  if (!payment) return 'pending'
  if (payment.status === 'cancelled') return 'cancelled'
  const outstanding = calculateOutstanding(payment)
  if (outstanding <= 0) return 'paid'
  if (Number(payment.paid_amount || 0) > 0) return 'partially_paid'
  const mid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (mid.getTime() > parseDate(payment.due_date).getTime()) return 'overdue'
  return 'pending'
}

// Точка старта штрафа: ретро → ручной перенос → льготный период → авто-сдвиг по встрече
export function getPenaltyStart(payment: any, contract: any, meeting: any): Date | null {
  if (!payment?.due_date) return null
  const due = parseDate(payment.due_date)
  // ретро-защита: встреча прошла без оплаты или наличный расчёт закрыт без получения
  if (payment.meeting_no_pay || (payment.cash_closed && !payment.confirmed_by_landlord && !payment.confirmed_cash)) return due
  // ручной перенос на конкретный месяц
  if (payment.penalty_start_at) return parseDate(String(payment.penalty_start_at).slice(0, 10))
  // льготный период договора (по умолчанию 0)
  let start = addDays(due, Math.max(0, Number(contract?.cash_grace_days) || 0))
  // авто-сдвиг по подтверждённой встрече: штраф со следующего дня после встречи
  if (meeting && meeting.status === 'confirmed' && meeting.meeting_date) {
    const m = addDays(parseDate(meeting.meeting_date), 1)
    if (m.getTime() > start.getTime()) start = m
  }
  return start
}

export function calculateOverdueDays(payment: any, contract: any, meeting: any, today = new Date()): number {
  const start = getPenaltyStart(payment, contract, meeting)
  if (!start || calculateOutstanding(payment) <= 0) return 0
  const mid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const d = daysBetween(start, mid)
  return d > 0 ? d : 0
}

export function calculatePenalty(overdueDays: number, ratePerDay: number): number {
  return Math.max(0, overdueDays) * Math.max(0, Number(ratePerDay) || 0)
}
