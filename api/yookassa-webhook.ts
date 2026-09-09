import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: { code: 'METHOD', message: 'Method not allowed' } }); return }
  const header = String(req.headers.authorization || '')
  const decoded = Buffer.from(header.replace('Basic ', ''), 'base64').toString()
  const [login, pass] = decoded.split(':')
  if (login !== process.env.YOOKASSA_SHOP_ID || pass !== process.env.YOOKASSA_SECRET_KEY) {
    res.status(401).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Access denied' } }); return
  }

  const body = req.body || {}
  if (body.event !== 'payment.succeeded') { res.status(200).json({ ok: true }); return }
  const paymentId: string | undefined = body.object?.id
  if (!paymentId) { res.status(200).json({ ok: true }); return }

  const { data: ex } = await supabaseAdmin.from('yookassa_events').select('payment_id').eq('payment_id', paymentId).maybeSingle()
  if (ex) { res.status(200).json({ ok: true, dedup: true }); return }
  const { error: insErr } = await supabaseAdmin.from('yookassa_events').insert({ payment_id: paymentId })
  if (insErr) { res.status(200).json({ ok: true, dedup: true }); return } // сработал unique-индекс — повтор

  let userId = ''
  try {
    const auth = Buffer.from(`${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`).toString('base64')
    const r = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, { headers: { Authorization: `Basic ${auth}` } })
    const p: any = await r.json()
    if (!r.ok || p?.status !== 'succeeded' || String(p?.amount?.value) !== '299.00' || p?.amount?.currency !== 'RUB' || p?.metadata?.purpose !== 'subscription_pro') {
      res.status(200).json({ ok: true, ignored: true }); return
    }
    userId = String(p?.metadata?.user_id || '')
  } catch {
    res.status(500).json({ ok: false, error: { code: 'UPSTREAM', message: 'Verification failed' } }); return
  }
  if (!userId) { res.status(200).json({ ok: true, ignored: true }); return }

  const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today = new Date()
  const todayS = isoDate(today)
  const { data: sub } = await supabaseAdmin
    .from('subscriptions').select('*').eq('owner_id', userId).order('until_date', { ascending: false }).limit(1).maybeSingle()
  const base = sub && sub.until_date >= todayS ? new Date(sub.until_date + 'T12:00:00') : today
  const until = new Date(base.getTime() + 30 * 86400000)
  if (sub) {
    await supabaseAdmin.from('subscriptions').update({ until_date: isoDate(until), updated_at: new Date().toISOString() }).eq('id', sub.id)
  } else {
    await supabaseAdmin.from('subscriptions').insert({ owner_id: userId, plan: 'pro', until_date: isoDate(until) })
  }

  const { data: u } = await supabaseAdmin.from('users').select('telegram_id').eq('id', userId).maybeSingle()
  if (u?.telegram_id && process.env.TELEGRAM_BOT_TOKEN) {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: u.telegram_id, text: `✅ Подписка Roomio Pro активирована до ${isoDate(until)}` }),
    }).catch(() => {})
  }

  res.status(200).json({ ok: true })
}
