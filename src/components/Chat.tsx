import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { showToast } from './ui'

const st: Record<string, React.CSSProperties> = {
  box: { height: '52vh', minHeight: 260, overflowY: 'auto', padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: 6 },
  empty: { fontSize: 12, color: '#8e8e93', textAlign: 'center', margin: 'auto' },
  mine: { alignSelf: 'flex-end', background: '#0071e3', color: '#fff', borderRadius: '18px 18px 5px 18px', padding: '8px 12px', maxWidth: '82%', boxSizing: 'border-box' },
  their: { alignSelf: 'flex-start', background: '#e9e9eb', color: '#1d1d1f', borderRadius: '18px 18px 18px 5px', padding: '8px 12px', maxWidth: '82%', boxSizing: 'border-box' },
  body: { fontSize: 15, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  meta: { fontSize: 10, opacity: 0.6, marginTop: 3, textAlign: 'right' },
  img: { maxWidth: 220, width: '100%', borderRadius: 10, display: 'block', cursor: 'pointer', marginBottom: 4 },
  file: { fontSize: 14, textDecoration: 'underline', cursor: 'pointer', marginBottom: 4 },
  preview: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' },
  previewImg: { width: 44, height: 44, borderRadius: 8, objectFit: 'cover' },
  form: { position: 'sticky', bottom: 74, display: 'flex', gap: 6, alignItems: 'center', padding: '8px 0 4px', background: 'linear-gradient(rgba(242,242,247,0), #f2f2f7 30%)' },
  input: { flex: 1, minWidth: 0, padding: '10px 14px', borderRadius: 18, border: '1px solid rgba(60,60,67,0.12)', background: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box', color: '#1d1d1f' },
  clip: { width: 38, height: 38, borderRadius: 19, border: 'none', background: 'rgba(120,120,128,0.12)', color: '#0071e3', fontSize: 17, cursor: 'pointer', flexShrink: 0 },
  send: { width: 38, height: 38, borderRadius: 19, border: 'none', background: '#0071e3', color: '#fff', fontSize: 15, cursor: 'pointer', flexShrink: 0, opacity: 1 },
  sendOff: { width: 38, height: 38, borderRadius: 19, border: 'none', background: '#0071e3', color: '#fff', fontSize: 15, cursor: 'pointer', flexShrink: 0, opacity: 0.4 },
}

function compressImage(file: File): Promise<Blob> {
  return new Promise((res, rej) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const max = 1280
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { rej(new Error('canvas')); return }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      canvas.toBlob(b => (b ? res(b) : rej(new Error('compress'))), 'image/jpeg', 0.8)
    }
    img.onerror = () => rej(new Error('image'))
    img.src = url
  })
}

export function Chat({ contractId, myId }: { contractId: string; myId: string }) {
  const [rows, setRows] = useState<any[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [att, setAtt] = useState<{ url: string; name: string; kind: string } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    const { data } = await supabase
      .from('messages').select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: true })
      .limit(200)
    setRows(data || [])
    setTimeout(() => boxRef.current?.scrollTo({ top: 999999 }), 50)
  }

  useEffect(() => {
    load()
    const on = () => load()
    window.addEventListener('rentflow-refresh', on)
    const iv = setInterval(() => load(), 15000)
    return () => { window.removeEventListener('rentflow-refresh', on); clearInterval(iv) }
  }, [contractId])

  async function upload(file: File): Promise<string> {
    const path = `${contractId}/${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`
    const { error } = await supabase.storage.from('chat').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('chat').getPublicUrl(path)
    return data.publicUrl
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 8 * 1024 * 1024) { showToast('Файл больше 8 МБ — выберите меньший'); return }
    setBusy(true)
    try {
      let blob: Blob = f
      let name = f.name
      let kind = 'file'
      if (f.type.startsWith('image/')) {
        blob = await compressImage(f)
        name = (f.name.replace(/\.[^.]+$/, '') || 'photo') + '.jpg'
        kind = 'image'
      }
      const url = await upload(new File([blob], name, { type: kind === 'image' ? 'image/jpeg' : f.type || 'application/octet-stream' }))
      setAtt({ url, name, kind })
      showToast('✅ Вложение готово к отправке')
    } catch (err: any) {
      showToast('Ошибка: ' + (err?.message || 'не удалось загрузить'))
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    if (busy || (!text.trim() && !att)) return
    setBusy(true)
    try {
      const { error } = await supabase.from('messages').insert({
        contract_id: contractId,
        sender_id: myId,
        body: text.trim() || '',
        attachment_url: att?.url || null,
        attachment_name: att?.name || null,
        attachment_kind: att?.kind || null,
      })
      if (error) { showToast('Ошибка: ' + error.message); return }
      setText('')
      setAtt(null)
      load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div ref={boxRef} style={st.box}>
        {rows.length === 0 && <div style={st.empty}>Сообщений пока нет — напишите первым</div>}
        {rows.map(m => {
          const mine = m.sender_id === myId
          return (
            <div key={m.id} style={mine ? st.mine : st.their}>
              {m.attachment_url && m.attachment_kind === 'image' && (
                <img src={m.attachment_url} alt="" onClick={() => window.open(m.attachment_url)} style={st.img} />
              )}
              {m.attachment_url && m.attachment_kind !== 'image' && (
                <div onClick={() => window.open(m.attachment_url)} style={st.file}>📄 {m.attachment_name || 'файл'}</div>
              )}
              {m.body && <div style={st.body}>{m.body}</div>}
              <div style={st.meta}>
                {new Date(m.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          )
        })}
      </div>

      {att && (
        <div style={st.preview}>
          {att.kind === 'image'
            ? <img src={att.url} alt="" style={st.previewImg} />
            : <span style={{ fontSize: 20 }}>📄</span>}
          <span style={{ flex: 1, fontSize: 13, color: '#8e8e93', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
          <button style={{ ...st.clip, color: '#ff3b30', background: 'rgba(255,59,48,0.1)' }} onClick={() => setAtt(null)}>✕</button>
        </div>
      )}

      <div style={st.form}>
        <input type="file" ref={fileRef} style={{ display: 'none' }} accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={onFile} />
        <button style={st.clip} onClick={() => fileRef.current?.click()}>📎</button>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder="Сообщение…"
          style={st.input}
        />
        <button style={busy || (!text.trim() && !att) ? st.sendOff : st.send} disabled={busy || (!text.trim() && !att)} onClick={send}>↑</button>
      </div>
    </div>
  )
}

export default Chat
