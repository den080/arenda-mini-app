import { createClient } from '@supabase/supabase-js'

const mem = new Map<string, number>()

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: { code: 'METHOD', message: 'Method not allowed' } })

  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0]
  const now = Date.now()
  const prev = mem.get(ip) || 0
  if (now - prev < 2000) return res.status(429).json({ ok: false, error: { code: 'RATE_LIMIT', message: 'Too often' } })
  mem.set(ip, now)
  if (mem.size > 1000) mem.clear()

  const chatId = String(req.body?.chat_id || '')
  if (!/^\d{5,15}$/.test(chatId)) return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'Bad chat_id' } })

  const authHeader = String(req.headers.authorization || '')
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return res.status(401).json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'No session' } })

  const authed = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  const { data: authUser, error: authErr } = await authed.auth.getUser(token)
  if (authErr || !authUser?.user) return res.status(401).json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Bad session' } })

  const admin = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  const email = String(authUser.user.email || '').toLowerCase()
  let userId: string | null = null
  if (email) {
    const { data: u } = await admin.from('users').select('id').eq('email', email).limit(1).maybeSingle()
    if (u) userId = u.id
  }
  if (!userId) {
    const { data: u } = await admin.from('users').select('id').eq('telegram_id', chatId).limit(1).maybeSingle()
    if (u) userId = u.id
  }
  if (!userId) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } })

  const { error } = await admin.from('telegram_chats').upsert({ user_id: userId, chat_id: chatId }, { onConflict: 'user_id' })
  if (error) return res.status(500).json({ ok: false, error: { code: 'DB', message: error.message } })
  res.status(200).json({ ok: true })
}
