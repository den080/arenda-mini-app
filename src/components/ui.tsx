import { useState, useEffect } from 'react'

let toastFn: ((msg: string) => void) | null = null

export function showToast(msg: string) {
  if (toastFn) toastFn(msg)
}

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    let t: any
    toastFn = (m: string) => {
      setMsg(m)
      clearTimeout(t)
      t = setTimeout(() => setMsg(null), 2600)
    }
    return () => { toastFn = null }
  }, [])
  if (!msg) return null
  return (
    <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(30,30,33,0.9)', color: '#fff', borderRadius: 12, padding: '10px 16px', fontSize: 14, zIndex: 300, maxWidth: '90%', textAlign: 'center', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
      {msg}
    </div>
  )
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children?: any }) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, padding: 18, maxHeight: '80vh', overflowY: 'auto', boxSizing: 'border-box' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12, color: '#1d1d1f' }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

export function PromptNumber({ open, title, label, initial, onClose, onSubmit }: { open: boolean; title: string; label: string; initial?: string; onClose: () => void; onSubmit: (n: number) => void }) {
  const [v, setV] = useState('')
  useEffect(() => { if (open) setV(initial ?? '') }, [open])
  if (!open) return null
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div style={{ fontSize: 14, color: '#555', marginBottom: 10 }}>{label}</div>
      <input value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 16, boxSizing: 'border-box', marginBottom: 14 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }} onClick={() => { const n = Number(String(v).replace(',', '.')); onSubmit(n); onClose() }}>Сохранить</button>
        <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={onClose}>Отмена</button>
      </div>
    </Modal>
  )
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#8e8e93', marginBottom: 4 }}>
        <span>Внесено {Number(value || 0).toFixed(0)} из {Number(max || 0).toFixed(0)}</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(120,120,128,0.16)' }}>
        <div style={{ height: 6, borderRadius: 3, background: '#0071e3', width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ConfirmDelete({ open, text, onClose, onConfirm }: { open: boolean; text: string; onClose: () => void; onConfirm: () => void }) {
  const [ok, setOk] = useState(false)
  useEffect(() => { if (open) setOk(false) }, [open])
  if (!open) return null
  return (
    <Modal open={open} title="Подтвердите действие" onClose={onClose}>
      <div style={{ fontSize: 14, color: '#555', marginBottom: 12 }}>{text}</div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 14, color: '#1d1d1f' }}>
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        Понимаю и подтверждаю
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={!ok} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#ff3b30', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: ok ? 1 : 0.4 }} onClick={() => { onConfirm(); onClose() }}>Удалить</button>
        <button style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }} onClick={onClose}>Отмена</button>
      </div>
    </Modal>
  )
}

export function BottomNav({ tabs, tab, setTab, badges }: { tabs: { id: string; l: string }[]; tab: string; setTab: (t: string) => void; badges?: Record<string, boolean> }) {
  return (
    <div style={{
      position: 'fixed',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 200,
      background: 'rgba(249,249,251,0.92)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid rgba(60,60,67,0.12)',
      display: 'flex',
      paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
    }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            padding: '14px 0 12px',
            minHeight: 50,
            fontSize: 13,
            fontWeight: 600,
            color: tab === t.id ? '#0071e3' : '#8e8e93',
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          {badges?.[t.id] && (
            <span style={{ position: 'absolute', top: 8, left: '50%', marginLeft: 18, width: 7, height: 7, borderRadius: 4, background: '#ff3b30' }} />
          )}
          {t.l}
        </button>
      ))}
    </div>
  )
}
