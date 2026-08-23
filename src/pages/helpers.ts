import type { CSSProperties } from 'react'

export function parseDate(d: any): Date {
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, dd || 1)
}

export function isFirstPeriod(period: any, sd: Date | null): boolean {
  if (!sd) return false
  const p = parseDate(period)
  return p.getMonth() === sd.getMonth() && p.getFullYear() === sd.getFullYear()
}

export function clampDay(y: number, m: number, d: number): number {
  const last = new Date(y, m + 1, 0).getDate()
  return Math.min(Math.max(1, d), last)
}

export function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

export const OBJ_TABS = [
  { id: 'pay', l: 'Оплата' },
  { id: 'meters', l: 'Счётчики' },
  { id: 'contract', l: 'Договор' },
  { id: 'chat', l: 'Чат' },
]

export const iosBlue: CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
export const iosRed: CSSProperties = { border: 'none', background: 'transparent', color: '#ff3b30', fontSize: 15, cursor: 'pointer', padding: 4, flexShrink: 0 }
export const actBlue: CSSProperties = { ...iosBlue, fontSize: 14 }
export const actRed: CSSProperties = { ...iosRed, fontSize: 14 }
export const iosOk: CSSProperties = { color: '#1e7e34', fontSize: 14, fontWeight: 600 }
export const iosMuted: CSSProperties = { color: '#8e8e93', fontSize: 14 }
export const valText: CSSProperties = { fontSize: 16, fontWeight: 500, color: '#1d1d1f' }
export const valMoney: CSSProperties = { fontSize: 16, fontWeight: 600, color: '#1d1d1f', whiteSpace: 'nowrap' }
export const secHead: CSSProperties = { fontSize: 13, color: '#8e8e93', margin: '14px 16px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }
export const hair = { height: 1, background: 'rgba(60,60,67,0.12)' } as CSSProperties

export function getNotificationText(type: string) {
  switch (type) {
    case 'payment_claimed': return '✅ Арендатор сообщил об оплате'
    case 'payment_confirmed': return '🟢 Арендодатель подтвердил оплату'
    case 'payment_partial': return '💰 Частичная оплата учтена'
    case 'payment_undo': return '↩️ Подтверждение оплаты отменено'
    case 'meter_submitted': return '💦 Переданы новые показания'
    case 'cash_proposed': return '💵 Предложено время встречи наличными'
    case 'cash_confirmed': return '🤝 Встреча по оплате согласована'
    case 'deferred_proposed': return '🙏 Арендатор попросил отсрочку штрафа'
    case 'deferred_confirmed': return '🧊 Замороженный штраф обновлён'
    case 'bill_uploaded': return '📄 Арендатор загрузил квитанцию'
    case 'bill_paid': return '🧾 Арендатор приложил подтверждение оплаты'
    case 'bill_confirmed': return '✅ Квитанция подтверждена'
    case 'contract_terminated': return '🏁 Договор завершён'
    case 'amendment': return '📝 Допсоглашение по аренде'
    default: return type
  }
}
