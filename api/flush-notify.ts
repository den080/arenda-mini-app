import { createClient } from '@supabase/supabase-js'

let lastRun = 0

export default async function handler(req: any, res: any) {
  const now = Date.now()
  if (now - lastRun < 30000) return res.status(200).json({ ok: true, skipped: true })
  lastRun = now

  const token = process.env.TELEGRAM_BOT_TOKEN || ''
  if (!token) return res.status(500).json({ error: 'no bot token' })

  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  // ===== 1) Напоминания о просрочке (1, 3, 7, 14, 30 дней) =====
  try {
    const today = new Date()
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const steps = [1, 3, 7, 14, 30]
    const { data: rows } = await supabase
      .from('payments')
      .select('id, due_date, overdue_notified_day, base_amount, penalty_amount, utilities_amount, contract:contracts(status, object:objects(address, landlord_id))')
      .eq('confirmed_by_landlord', false)

    for (const p of rows || []) {
      const c: any = (p as any).contract
      if (!c || c.status !== 'active' || !c.object?.landlord_id) continue
      const due = new Date(String(p.due_date).slice(0, 10) + 'T00:00:00')
      const days = Math.round((todayMid.getTime() - due.getTime()) / 86400000)
      if (days <= 0) continue

      const notifiedDay = Number(p.overdue_notified_day || 0)
      const lastStep = steps.filter((s) => notifiedDay >= s).pop() || 0
      const curStep = steps.filter((s) => days >= s).pop() || 0
      if (curStep <= lastStep) continue

      const sum = Number(p.base_amount || 0) + Number(p.penalty_amount || 0) + Number(p.utilities_amount || 0)
      await supabase.rpc('send_telegram_notification', {
        p_user_id: c.object.landlord_id,
        p_event_type: 'overdue_reminder',
        p_message:
          `⚠️ <b>Просрочка ${days} дн.</b>` + '\n' +
          `Объект: ${c.object.address || '—'}` + '\n' +
          `Сумма: ${sum.toFixed(0)} ₽` + '\n' +
          'Зайдите в приложение и свяжитесь с арендатором.',
      })
      await supabase.from('payments').update({ overdue_notified_day: days }).eq('id', p.id)
    }
  } catch {}

  // ===== 2) Отправка очереди в Telegram =====
  const { data: out } = await supabase
    .from('telegram_outbox')
    .select('*')
    .is('sent_at', null)
    .order('created_at', { ascending: true })
    .limit(20)

  let sent = 0
  for (const r of out || []) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: r.chat_id, text: r.message, parse_mode: 'HTML' }),
      })
      if (resp.ok) sent++
    } catch {}
    await supabase.from('telegram_outbox').update({ sent_at: new Date().toISOString() }).eq('id', r.id)
  }

  res.status(200).json({ ok: true, sent })
}
