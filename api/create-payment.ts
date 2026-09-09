import { createClient } from '@supabase/supabase-js'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: { code: 'METHOD', message: 'Method not allowed' } })

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
  if (!userId) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } })

  const auth = Buffer.from(`${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`).toString('base64')
  try {
    const r = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Idempotence-Key': `sub-${userId}-${Math.floor(Date.now() / 60000)}`,
      },
      body: JSON.stringify({
        amount: { value: '299.00', currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url: `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || req.headers.host}/?payment=done` },
        metadata: { user_id: userId, purpose: 'subscription_pro' },
        description: 'Roomio Pro — подписка 30 дней',
      }),
    })
    const data: any = await r.json()
    if (!r.ok) return res.status(502).json({ ok: false, error: { code: 'UPSTREAM', message: String(data?.description || r.status) } })
    res.status(200).json({ ok: true, data: { confirmation_url: data.confirmation?.confirmation_url, payment_id: data.id } })
  } catch {
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Payment creation failed' } })
  }
}
