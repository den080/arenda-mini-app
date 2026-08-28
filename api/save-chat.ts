import { createClient } from '@supabase/supabase-js'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { user_id, chat_id } = req.body || {}
  if (!user_id || !chat_id) return res.status(400).json({ error: 'user_id and chat_id required' })

  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  try {
    const { error } = await supabase
      .from('telegram_chats')
      .upsert({ user_id, chat_id }, { onConflict: 'user_id' })
    if (error) return res.status(500).json({ error: error.message })
    res.status(200).json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed' })
  }
}
