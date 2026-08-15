import { useState, useEffect } from 'react'

export function showToast(text: string) {
  window.dispatchEvent(new CustomEvent('rentflow-toast', { detail: text }))
}

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    let t: any
    const on = (e: any) => {
      setMsg(String(e.detail || ''))
      clearTimeout(t)
      t = setTimeout(() => setMsg(null), 2200)
    }
    window.addEventListener('rentflow-toast', on)
    return () => { window.removeEventListener('rentflow-toast', on); clearTimeout(t) }
  }, [])
  if (!msg) return null
  return (
    <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 96, background: 'rgba(29,29,31,0.92)', color: '#fff', padding: '10px 16px', borderRadius: 12, fontSize: 14, zIndex: 999, maxWidth: '86%', textAlign: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
      {msg}
    </div>
  )
}

export function Modal({ open, title, onClose, children }: { open: boolean; title?: string; onClose: () => void; children?: any }) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 18, width: '100%', maxWidth: 420, maxHeight: '80%', overflowY: 'auto', boxSizing: 'border-box' }} onClick={(e) => e.stopPropagation()}>
        {title && <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>{title}</div>}
        {children}
      </div>
    </div>
  )
}

export function ConfirmDelete({ open, text, onClose, onConfirm }: { open: boolean; text: string; onClose: () => void; onConfirm: () => void }) {
  const [ok, setOk] = useState(false)
  useEffect(() => { if (open) setOk(false) }, [open])
  return (
    <Modal open={open} title="Подтвердите действие" onClose={onClose}>
      <div style={{ fontSize: 14, marginBottom: 12 }}>{text}</div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, marginBottom: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        Понимаю и подтверждаю
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e53935', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: ok ? 1 : 0.5 }}
          disabled={!ok}
          onClick={() => { onConfirm(); onClose() }}
        >Удалить</button>
        <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={onClose}>Отмена</button>
      </div>
    </Modal>
  )
}

export function PromptNumber({ open, title, label, initial, onClose, onSubmit }: { open: boolean; title: string; label: string; initial?: string; onClose: () => void; onSubmit: (v: number) => void }) {
  const [v, setV] = useState(initial || '')
  useEffect(() => { if (open) setV(initial || '') }, [open, initial])
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div style={{ fontSize: 14, marginBottom: 8 }}>{label}</div>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        inputMode="decimal"
        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 16, boxSizing: 'border-box', marginBottom: 14 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          onClick={() => { const n = Number(v); if (isNaN(n)) return; onSubmit(n); onClose() }}
        >Сохранить</button>
        <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={onClose}>Отмена</button>
      </div>
    </Modal>
  )
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div>
      <div style={{ height: 8, background: '#e8e8ed', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#34c759' : '#0071e3', borderRadius: 6 }} />
      </div>
      <div style={{ fontSize: 12, color: '#86868b', marginTop: 4 }}>внесено {value.toFixed(0)} из {max.toFixed(0)} ₽ · {pct}%</div>
    </div>
  )
}

export function BottomNav({ tabs, tab, setTab, badges }: {
  tabs: { id: string; l: string }[]
  tab: string
  setTab: (t: string) => void
  badges?: Record<string, boolean>
}) {
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(249,249,251,0.98)', borderTop: '1px solid #e5e5ea', display: 'flex', padding: '4px 6px calc(10px + env(safe-area-inset-bottom))', zIndex: 900 }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          style={{ flex: 1, border: 'none', background: 'transparent', padding: '14px 2px', cursor: 'pointer', position: 'relative', color: tab === t.id ? '#0071e3' : '#86868b', fontSize: 13, fontWeight: 600 }}
        >
          {t.l}
          {badges && badges[t.id] && (
            <span style={{ position: 'absolute', top: 8, left: '50%', marginLeft: 16, width: 8, height: 8, background: '#ff3b30', borderRadius: 4 }} />
          )}
        </button>
      ))}
    </div>
  )
}
