import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { Modal, showToast } from './ui'

const OWNER_PHONE = '+79057674225'

function norm(v: string): string {
  let c = (v || '').replace(/[\s\-\(\)]/g, '')
  if (c.startsWith('8') && c.length === 11) c = '+7' + c.slice(1)
  if (c && !c.startsWith('+')) c = '+' + c
  return c
}

function compress(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const imgEl = new Image()
      imgEl.onload = () => {
        const max = 1280
        let w = imgEl.width, h = imgEl.height
        const k = Math.min(1, max / Math.max(w, h))
        w = Math.round(w * k); h = Math.round(h * k)
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        c.getContext('2d')!.drawImage(imgEl, 0, 0, w, h)
        resolve(c.toDataURL('image/jpeg', 0.8))
      }
      imgEl.onerror = reject
      imgEl.src = String(fr.result)
    }
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

export function FeedbackButton() {
  const { user } = useTelegramUser()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [img, setImg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onFile(e: any) {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { showToast('Можно приложить только изображение'); return }
    try {
      setImg(await compress(f))
    } catch {
      showToast('Не удалось прочитать файл')
    }
    e.target.value = ''
  }

  async function send() {
    if (!text.trim() && !img) { showToast('Добавьте сообщение или скриншот'); return }
    setBusy(true)
    try {
      let imageUrl: string | null = null
      if (img) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const blob = await (await fetch(img)).blob()
        const { error } = await supabase.storage.from('feedback').upload(`${id}.jpg`, blob, { contentType: 'image/jpeg' })
        if (!error) imageUrl = supabase.storage.from('feedback').getPublicUrl(`${id}.jpg`).data.publicUrl
      }
      const { error } = await supabase.from('feedback').insert({
        user_id: user?.id || null,
        sender_name: user?.full_name || 'Пользователь',
        sender_phone: user?.phone || '',
        message: text.trim() || '(скриншот)',
        image_url: imageUrl,
      })
      if (error) { showToast('Ошибка: ' + error.message); return }

      const { data: all } = await supabase.from('users').select('id, phone').not('phone', 'is', null)
      const owner = (all || []).find((u: any) => norm(u.phone || '') === norm(OWNER_PHONE))
      if (owner) {
        await supabase.from('notifications_log').insert({
          user_id: owner.id,
          type: 'feedback',
          related_id: user?.id || null,
          message: `📩 Обратная связь — ${user?.full_name || 'пользователь'}: ${text.trim().slice(0, 200) || '(скриншот)'}`,
          sent_at: new Date().toISOString(),
        })
      }
      showToast('✅ Отправлено. Спасибо!')
      setText(''); setImg(null); setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Обратная связь"
        style={{ border: 'none', background: 'transparent', fontSize: 16, cursor: 'pointer', padding: '4px 6px', flexShrink: 0 }}
      >✉️</button>

      <Modal open={open} title="Обратная связь" onClose={() => setOpen(false)}>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 10 }}>Опишите проблему или предложение. Прикрепите скриншот — так быстрее.</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Что случилось / что улучшить?"
          style={{ width: '100%', minHeight: 110, padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
        />
        {img && (
          <div style={{ position: 'relative', margin: '10px 0' }}>
            <img src={img} alt="" style={{ width: '100%', borderRadius: 10, maxHeight: 220, objectFit: 'cover' }} />
            <button
              onClick={() => setImg(null)}
              style={{ position: 'absolute', top: 6, right: 6, border: 'none', borderRadius: 12, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 12, padding: '4px 8px', cursor: 'pointer' }}
            >убрать</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <label style={{ color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            📎 Скриншот
            <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
          </label>
          <span style={{ flex: 1 }} />
          <button
            disabled={busy}
            onClick={send}
            style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          >{busy ? 'Отправка…' : 'Отправить'}</button>
        </div>
      </Modal>
    </>
  )
}

export default FeedbackButton
