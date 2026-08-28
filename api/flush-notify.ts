import { createClient } from '@supabase/supabase-js'

let lastRun = 0

export default async function handler(req: any, res: any) {
  // не чаще раза в 30 секунд
  const now = Date.now()
  if (now - lastRun < 30000) return res.status(200).json({ ok: true, skipped: true })
  lastRun = now

  const token = process.env.TELEGRAM_BOT_TOKEN || ''
  if (!token) return res.status(500).json({ error: 'no bot token' })

  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  const { data: rows } = await supabase
    .from('telegram_outbox')
    .select('*')
    .is('sent_at', null)
    .order('created_at', { ascending: true })
    .limit(20)

  let sent = 0
  for (const r of rows || []) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: r.chat_id, text: r.message, parse_mode: 'HTML' }),
      })
      if (resp.ok) sent++
    } catch {}
    // помечаем отправленным в любом случае, чтобы не зациклиться
    await supabase.from('telegram_outbox').update({ sent_at: new Date().toISOString() }).eq('id', r.id)
  }

  res.status(200).json({ ok: true, sent })
}
