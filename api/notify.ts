import { createClient } from '@supabase/supabase-js'

const mem = new Map<string, number>()
const MAX_LEN = 4000

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: { code: 'METHOD', message: 'Method not allowed' } })
  const secret = process.env.NOTIFY_API_SECRET
  if (!secret || req.headers['x-notify-secret'] !== secret) return res.status(401).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Access denied' } })

  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0]
  const now = Date.now()
  const prev = mem.get(ip) || 0
  if (now - prev < 1000) return res.status(429).json({ ok: false, error: { code: 'RATE_LIMIT', message: 'Too often' } })
  mem.set(ip, now)
  if (mem.size > 1000) mem.clear()

  const { user_id, message } = req.body || {}
  const text = String(message || '').slice(0, MAX_LEN)
  if (!user_id || !text) return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'user_id and message required' } })

  const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  const { data: chat } = await supabase.from('telegram_chats').select('chat_id').eq('user_id', user_id).maybeSingle()
  if (!chat) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Chat not found' } })
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return res.status(500).json({ ok: false, error: { code: 'CONFIG', message: 'Bot token not configured' } })
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat.chat_id, text: escapeHtml(text), parse_mode: 'HTML' }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(502).json({ ok: false, error: { code: 'UPSTREAM', message: String(data?.description || r.status) } })
    res.status(200).json({ ok: true })
  } catch {
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to send' } })
  }
}
