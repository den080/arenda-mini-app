import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useTelegramUser } from './hooks/useTelegramUser'
import AuthGate from './components/AuthGate'
import TenantDashboard from './pages/TenantDashboard'
import LandlordDashboard from './pages/LandlordDashboard'
import AdminDashboard from './pages/AdminDashboard'
import { Toaster, Modal, showToast } from './components/ui'

const norm10 = (s: string) => (s || '').replace(/\D/g, '').slice(-10)

export function App() {
  const { user } = useTelegramUser() as any
  const [priv, setPriv] = useState<null | 'tester' | 'admin'>(() => {
    try {
      const v = localStorage.getItem('roomio_priv')
      return v === 'tester' || v === 'admin' ? (v as any) : null
    } catch { return null }
  })
  const [privReady, setPrivReady] = useState<boolean>(() => {
    try { return localStorage.getItem('roomio_priv_ready') === '1' } catch { return false }
  })
  const [roleOverride, setRoleOverride] = useState<null | 'tenant' | 'landlord'>(null)
  const [adminView, setAdminView] = useState(false)
  const [fbOpen, setFbOpen] = useState(false)
  const [fbMsg, setFbMsg] = useState('')
  const [fbFile, setFbFile] = useState<File | null>(null)
  const [fbBusy, setFbBusy] = useState(false)

  // Служебные права (tester/admin) — по телефону из access_control.
  // Обычным пользователям ничего добавлять не нужно.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!user) {
        if (!cancelled) { setPriv(null); setPrivReady(true); try { localStorage.setItem('roomio_priv_ready', '1'); localStorage.removeItem('roomio_priv') } catch {} }
        return
      }
      try {
        const { data } = await supabase.from('access_control').select('phone, role')
        const me = norm10(user.phone || '')
        const hit = (data || []).find((r: any) => me.length === 10 && norm10(r.phone || '') === me)
        const role = hit ? (hit.role as any) : null
        if (!cancelled) {
          setPriv(role)
          setPrivReady(true)
          try {
            if (role) localStorage.setItem('roomio_priv', role)
            else localStorage.removeItem('roomio_priv')
            localStorage.setItem('roomio_priv_ready', '1')
          } catch {}
        }
      } catch { if (!cancelled) setPrivReady(true) }
    })()
    return () => { cancelled = true }
  }, [user?.id])

  const baseRole: 'tenant' | 'landlord' = user?.role === 'landlord' ? 'landlord' : 'tenant'
  const role: 'tenant' | 'landlord' = priv ? (roleOverride || baseRole) : baseRole
  const view: 'tenant' | 'landlord' | 'admin' = adminView && priv === 'admin' ? 'admin' : role

  async function logout() {
    try { await supabase.auth.signOut() } catch {}
    try { localStorage.removeItem('roomio_priv'); localStorage.removeItem('roomio_priv_ready') } catch {}
    window.location.reload()
  }

  async function sendFeedback() {
    if (!user) return
    if (!fbMsg.trim() && !fbFile) { showToast('Добавьте текст или скриншот'); return }
    setFbBusy(true)
    try {
      let url: string | null = null
      if (fbFile) {
        const ext = (fbFile.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const up = await supabase.storage.from('feedback').upload(path, fbFile, { contentType: fbFile.type || 'image/jpeg' })
        if (!up.error) url = supabase.storage.from('feedback').getPublicUrl(path).data.publicUrl
      }
      const { error } = await supabase.from('feedback').insert({
        sender_name: user.full_name || '—',
        sender_phone: user.phone || '—',
        message: fbMsg.trim() || '(скриншот)',
        image_url: url,
        status: 'new',
      })
      if (error) { showToast('Ошибка: ' + error.message); return }
      showToast('✅ Отправлено. Спасибо!')
      setFbOpen(false); setFbMsg(''); setFbFile(null)
    } finally { setFbBusy(false) }
  }

  const seg = (active: boolean): React.CSSProperties => ({
    flexShrink: 0, padding: '10px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
    fontSize: 15, fontWeight: 600,
    background: active ? '#fff' : 'transparent',
    color: active ? '#1d1d1f' : '#8e8e93',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
  })

  return (
    <AuthGate>
      <Toaster />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '10px 10px 0' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(120,120,128,0.12)', borderRadius: 14, padding: 6, margin: '0 0 10px', overflowX: 'auto', minHeight: 46 }}>
          {!privReady ? (
            // пока права не известны — пустая заглушка той же высоты, ничего не мигает
            <span style={{ padding: '8px 12px', fontSize: 14, color: 'transparent', userSelect: 'none' }}>Roomio</span>
          ) : (
            <>
              {priv ? (
                <>
                  <button style={seg(role === 'tenant')} onClick={() => { setRoleOverride('tenant'); setAdminView(false) }}>Арендатор</button>
                  <button style={seg(role === 'landlord')} onClick={() => { setRoleOverride('landlord'); setAdminView(false) }}>Арендодатель</button>
                </>
              ) : (
                <span style={{ padding: '8px 12px', fontSize: 14, color: '#8e8e93' }}>Roomio</span>
              )}
              {/* Меню есть у ВСЕХ: выйти и обратная связь */}
              <button style={seg(false)} onClick={logout}>Выйти</button>
              <button style={seg(false)} onClick={() => setFbOpen(true)}>✉️</button>
              {priv === 'admin' && (
                adminView
                  ? <button style={seg(true)} onClick={() => setAdminView(false)}>В приложение</button>
                  : <button style={seg(false)} onClick={() => setAdminView(true)}>Админка</button>
              )}
            </>
          )}
        </div>

        {!user ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#8e8e93', fontSize: 15 }}>Загрузка…</div>
        ) : view === 'tenant' ? (
          <TenantDashboard />
        ) : view === 'landlord' ? (
          <LandlordDashboard />
        ) : (
          <AdminDashboard />
        )}
      </div>

      <Modal open={fbOpen} title="Обратная связь" onClose={() => setFbOpen(false)}>
        <textarea
          value={fbMsg}
          onChange={(e) => setFbMsg(e.target.value)}
          placeholder="Опишите проблему или предложение…"
          style={{ width: '100%', minHeight: 90, padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box', outline: 'none', resize: 'vertical' }}
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFbFile(e.target.files?.[0] || null)}
          style={{ margin: '10px 0', fontSize: 14 }}
        />
        {fbFile && <div style={{ fontSize: 13, color: '#8e8e93', marginBottom: 8 }}>Файл: {fbFile.name}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            disabled={fbBusy}
            onClick={sendFeedback}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: fbBusy ? 0.6 : 1 }}
          >{fbBusy ? 'Отправка…' : 'Отправить'}</button>
          <button onClick={() => setFbOpen(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Отмена</button>
        </div>
      </Modal>
    </AuthGate>
  )
}

export default App
