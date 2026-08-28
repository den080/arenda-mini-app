import { createClient } from '@supabase/supabase-js'

const mem = new Map<string, number>()

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const b = req.body || {}

  // антиспам: то же самое от того же пользователя — не чаще раза в минуту
  const msg = String(b.message || 'unknown').slice(0, 300)
  const key = `${b.user?.id || 'anon'}:${msg.slice(0, 60)}`
  const now = Date.now()
  const prev = mem.get(key) || 0
  if (now - prev < 60000) return res.status(200).json({ ok: true, dedup: true })
  mem.set(key, now)
  if (mem.size > 500) mem.clear()

  // дообогащение: что пользователь делал до ошибки (экраны/входы из аналитики)
  let recent = ''
  try {
    const sb = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
    if (b.user?.id) {
      const { data } = await sb
        .from('analytics_events')
        .select('event, screen, created_at')
        .eq('user_id', b.user.id)
        .order('created_at', { ascending: false })
        .limit(6)
      recent = (data || [])
        .map((e: any) => `${String(e.created_at).slice(11, 16)} ${e.event}${e.screen ? ':' + e.screen : ''}`)
        .join(' → ')
    }
  } catch {}

  const lines = [
    '🚨 Roomio · ошибка',
    `Сборка: ${b.build || '—'} · ${new Date(b.ts || Date.now()).toLocaleString('ru-RU')}`,
    b.user
      ? `Юзер: ${b.user.name || '—'} · ${b.user.phone || '—'} · ${b.user.role || '—'} · id ${String(b.user.id).slice(0, 8)}`
      : 'Юзер: не вошёл',
    `Устройство: ${String(b.ua || '').slice(0, 90)}`,
    `Telegram: ${b.tg?.platform || '—'} · v${b.tg?.ver || '—'} · id ${b.tg?.id || '—'}`,
    `Экран: ${b.screen || '—'}`,
    `URL: ${b.url || '—'}`,
    `ОШИБКА: ${msg}`,
    b.stack ? `Стек: ${String(b.stack).split('\n').slice(0, 4).join(' | ').slice(0, 400)}` : '',
    recent ? `До ошибки: ${recent}` : '',
  ].filter(Boolean).join('\n')

  const token = process.env.TELEGRAM_BOT_TOKEN || ''
  const chat = process.env.ADMIN_CHAT_ID || '28606967'
  if (token) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: lines }),
    }).catch(() => {})
  }
  res.status(200).json({ ok: true })
}
