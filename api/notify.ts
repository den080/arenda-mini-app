import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.status(405).end(); return }
  if (req.headers['x-notify-secret'] !== process.env.NOTIFY_SECRET) { res.status(401).end(); return }
  const { userId, text } = req.body || {}
  if (!userId || !text) { res.json({ ok: true }); return }
  const { data: u } = await supabaseAdmin.from('users').select('telegram_id').eq('id', userId).maybeSingle()
  const chatId = u?.telegram_id
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) { res.json({ ok: true }); return }
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: `Roomio · ${text}` }),
  }).catch(() => {})
  res.json({ ok: true })
}
