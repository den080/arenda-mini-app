import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../theme'

export function Chat({ contractId, myId }: { contractId: string; myId: string }) {
  const [rows, setRows] = useState<any[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  async function load() {
    const { data } = await supabase
      .from('messages').select('*, sender:users!sender_id(full_name)')
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

  async function send() {
    if (busy || !text.trim()) return
    setBusy(true)
    try {
      const { error } = await supabase.from('messages').insert({ contract_id: contractId, sender_id: myId, body: text.trim() })
      if (error) { alert('Ошибка: ' + error.message); return }
      setText('')
      load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div ref={boxRef} style={st.box}>
        {rows.length === 0 && <div style={T.tiny}>Сообщений пока нет — напишите первым!</div>}
        {rows.map(m => {
          const mine = m.sender_id === myId
          return (
            <div key={m.id} style={{ ...st.bubble, ...(mine ? st.mine : st.their) }}>
              <div style={st.body}>{m.body}</div>
              <div style={st.meta}>
                {mine ? 'вы' : m.sender?.full_name || '—'} · {new Date(m.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          )
        })}
      </div>
      <div style={st.form}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder="Сообщение…"
          style={{ ...T.input, marginBottom: 0, flex: 1 }}
        />
        <button style={busy ? T.btnOff : T.btnSmall} disabled={busy} onClick={send}>Отправить</button>
      </div>
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  box: { maxHeight: 320, overflowY: 'auto', padding: 4, display: 'flex', flexDirection: 'column', gap: 8 },
  bubble: { maxWidth: '85%', borderRadius: 14, padding: '8px 12px' },
  mine: { alignSelf: 'flex-end', background: '#0071e3', color: '#fff' },
  their: { alignSelf: 'flex-start', background: '#e8e8ed', color: '#1d1d1f' },
  body: { fontSize: 14, whiteSpace: 'pre-wrap' },
  meta: { fontSize: 10, opacity: 0.7, marginTop: 2 },
  form: { display: 'flex', gap: 8, marginTop: 8 },
}

export default Chat
