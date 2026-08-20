import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../theme'
import { showToast, ConfirmDelete } from './ui'

const PRESETS = ['Управляющая компания', 'Аварийная служба', 'Диспетчер', 'Электрик', 'Сантехник', 'Охрана', 'Другое']

const inp: React.CSSProperties = { width: '100%', padding: '8px 0', border: 'none', borderBottom: '1px solid rgba(60,60,67,0.12)', background: 'transparent', fontSize: 15, color: '#1d1d1f', outline: 'none', borderRadius: 0, boxSizing: 'border-box' }
const blue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4 }
const red: React.CSSProperties = { border: 'none', background: 'transparent', color: '#ff3b30', fontSize: 15, cursor: 'pointer', padding: 4, flexShrink: 0 }

function formatPhoneInput(v: string): string {
  const digits = (v || '').replace(/\D/g, '').slice(0, 11)
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    const x = digits.slice(1)
    let out = '+7'
    if (x.length > 0) out += ' ' + x.slice(0, 3)
    if (x.length > 3) out += ' ' + x.slice(3, 6)
    if (x.length > 6) out += ' ' + x.slice(6, 8)
    if (x.length > 8) out += ' ' + x.slice(8, 10)
    return out
  }
  return v
}

export function ContactsEditor({ objId }: { objId: string }) {
  const [rows, setRows] = useState<any[]>([])
  const [ready, setReady] = useState(false)
  const [del, setDel] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from('object_contacts').select('*')
      .eq('object_id', objId)
      .order('sort', { ascending: true })
      .order('created_at', { ascending: true })
    setRows(data || [])
    setReady(true)
  }

  useEffect(() => { load() }, [objId])

  async function addRow() {
    const { data, error } = await supabase
      .from('object_contacts')
      .insert({ object_id: objId, label: 'Новый контакт', phone: '', sort: rows.length })
      .select().single()
    if (error) { showToast('Ошибка: ' + error.message); return }
    setRows([...rows, data])
  }

  async function patch(id: string, field: string, value: string) {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r))
    const { error } = await supabase.from('object_contacts').update({ [field]: value }).eq('id', id)
    if (error) showToast('Ошибка: ' + error.message)
  }

  async function remove(id: string) {
    await supabase.from('object_contacts').delete().eq('id', id)
    setRows(rows.filter(r => r.id !== id))
    showToast('Контакт удалён')
  }

  if (!ready) return null

  return (
    <div style={T.card}>
      {rows.length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Пока пусто — добавьте первый контакт.</div>}
      {rows.map((r) => (
        <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(60,60,67,0.12)' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              list={`contact-presets-${objId}`}
              value={r.label}
              onChange={(e) => patch(r.id, 'label', e.target.value)}
              placeholder="Кто это"
              style={{ ...inp, flex: 1 }}
            />
            <button style={red} onClick={() => setDel(r.id)}>удалить</button>
          </div>
          <input
            value={r.phone}
            onChange={(e) => patch(r.id, 'phone', formatPhoneInput(e.target.value))}
            placeholder="+7 ___ ___-__-__"
            inputMode="tel"
            style={{ ...inp, marginTop: 6 }}
          />
          <input
            value={r.note || ''}
            onChange={(e) => patch(r.id, 'note', e.target.value)}
            placeholder="Комментарий: часы работы и т. п."
            style={{ ...inp, marginTop: 6 }}
          />
        </div>
      ))}
      <datalist id={`contact-presets-${objId}`}>
        {PRESETS.map(p => <option key={p} value={p} />)}
      </datalist>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 8px' }}>
        <button style={blue} onClick={addRow}>Добавить контакт</button>
      </div>
      <div style={{ ...T.tiny, margin: '0 0 10px' }}>Арендатор увидит контакты в «Договоре» и сможет позвонить в один тап.</div>

      <ConfirmDelete
        open={!!del}
        text="Контакт исчезнет у арендатора сразу."
        onClose={() => setDel(null)}
        onConfirm={() => { if (del) remove(del) }}
      />
    </div>
  )
}

export default ContactsEditor
