import { useState, useEffect, useRef } from 'react'


function haptic(type: 'success' | 'error' | 'light' = 'light') {
  try {
    const tg = (window as any).Telegram?.WebApp
    const h = tg?.HapticFeedback
    if (!h) return
    if (type === 'light') h.impactOccurred('light')
    else h.notificationOccurred(type)
  } catch {}
}

let toastFn: ((msg: string) => void) | null = null

export function showToast(msg: string) {
  haptic(msg.includes('✅') || msg.includes('🟢') ? 'success' : msg.startsWith('Ошибка') || msg.includes('⚠️') ? 'error' : 'light')
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
        <span>Депозит (залог): внесено {Number(value || 0).toFixed(0)} из {Number(max || 0).toFixed(0)}</span>
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
        <button disabled={!ok} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#ff3b30', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: ok ? 1 : 0.4 }} onClick={() => { haptic('success'); onConfirm(); onClose() }}>Удалить</button>
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
          onClick={() => { if (t.id !== tab) haptic('light'); setTab(t.id) }}
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
// ========== СКЕЛЕТОНЫ ==========
export function Skeleton({ w = '100%', h = 14, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: typeof w === 'number' ? `${w}px` : w,
      height: `${h}px`,
      borderRadius: `${r}px`,
      background: 'linear-gradient(90deg, rgba(120,120,128,0.08) 0%, rgba(120,120,128,0.16) 50%, rgba(120,120,128,0.08) 100%)',
      backgroundSize: '200% 100%',
      animation: 'rf-shimmer 1.4s ease-in-out infinite',
    }} />
  )
}

export function SkeletonRow({ labelW = 90, valueW = 60 }: { labelW?: number; valueW?: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', gap: 12 }}>
      <Skeleton w={labelW} h={14} />
      <Skeleton w={valueW} h={16} />
    </div>
  )
}

export function SkeletonCard({ rows = 4 }: { rows?: number } = {}) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
      <Skeleton w={140} h={20} />
      <div style={{ height: 10 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i}>
          {i > 0 && <div style={{ height: 1, background: 'rgba(60,60,67,0.12)', margin: '0' }} />}
          <SkeletonRow />
        </div>
      ))}
    </div>
  )
}

export function SkeletonList({ count = 3 }: { count?: number } = {}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '16px', marginBottom: 10 }}>
          <Skeleton w="70%" h={18} />
          <div style={{ height: 8 }} />
          <Skeleton w="45%" h={14} />
        </div>
      ))}
    </>
  )
}

// ========== PULL-TO-REFRESH ==========
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void> | void; children: React.ReactNode }) {
  const [drag, setDrag] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const THRESHOLD = 70
  const MAX = 120

  function onTouchStart(e: React.TouchEvent) {
    const el = (e.currentTarget as HTMLElement).parentElement
    if (!el || el.scrollTop > 0) return
    startY.current = e.touches[0].clientY
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null || refreshing) return
    const dy = Math.max(0, e.touches[0].clientY - startY.current)
    const dampened = Math.min(MAX, dy * 0.5)
    setDrag(dampened)
  }

  async function onTouchEnd() {
    if (startY.current === null) return
    startY.current = null
    if (drag >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      try { await onRefresh() } finally {
        setTimeout(() => { setRefreshing(false); setDrag(0) }, 400)
      }
    } else {
      setDrag(0)
    }
  }

  const showIndicator = drag > 20 || refreshing
  const rotation = refreshing ? 0 : Math.min(180, drag * 2)

  return (
    <div
      style={{ position: 'relative' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {showIndicator && (
        <div style={{
          position: 'absolute',
          top: drag - 40,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 28,
          height: 28,
          borderRadius: 14,
          background: 'rgba(255,255,255,0.95)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          transition: refreshing ? 'none' : 'top 0.1s ease-out',
        }}>
          <div style={{
            width: 14,
            height: 14,
            border: '2px solid rgba(120,120,128,0.2)',
            borderTopColor: '#0071e3',
            borderRadius: '50%',
            transform: `rotate(${rotation}deg)`,
            animation: refreshing ? 'rf-spin 0.8s linear infinite' : 'none',
          }} />
        </div>
      )}
      <div style={{
        transform: `translateY(${drag}px)`,
        transition: drag === 0 ? 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
      }}>
        {children}
      </div>
    </div>
  )
}

// CSS анимации — добавить один раз при монтировании
if (typeof document !== 'undefined' && !document.getElementById('rf-shimmer-css')) {
  const style = document.createElement('style')
  style.id = 'rf-shimmer-css'
  style.textContent = `
    @keyframes rf-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    @keyframes rf-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `
  document.head.appendChild(style)
}

