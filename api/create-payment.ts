export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return }
  const userId = req.body?.userId
  if (!userId) { res.status(400).json({ error: 'userId required' }); return }
  const auth = Buffer.from(`${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`).toString('base64')
  try {
    const r = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Idempotence-Key': `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
      body: JSON.stringify({
        amount: { value: '299.00', currency: 'RUB' },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || req.headers.host}/?payment=done`,
        },
        metadata: { user_id: userId, purpose: 'subscription_pro' },
        description: 'Roomio Pro — подписка 30 дней',
      }),
    })
    const data: any = await r.json()
    if (!r.ok) { res.status(500).json(data); return }
    res.json({ confirmation_url: data.confirmation?.confirmation_url, payment_id: data.id })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
}
