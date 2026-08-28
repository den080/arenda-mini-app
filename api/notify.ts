export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' })
  }

  const { chat_id, message } = req.body
  if (!chat_id || !message) {
    return res.status(400).json({ error: 'chat_id and message required' })
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN not set')
    return res.status(500).json({ error: 'bot token not configured' })
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        text: message,
        parse_mode: 'HTML',
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('Telegram API error:', data)
      return res.status(response.status).json({ error: data })
    }

    res.status(200).json({ ok: true })
  } catch (error) {
    console.error('Send notification error:', error)
    res.status(500).json({ error: 'failed to send notification' })
  }
}
