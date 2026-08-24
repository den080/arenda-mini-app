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
  const { user } = useTelegramUser()
  const [priv, setPriv] = useState<null | 'tester' | 'admin'>(null)
  const [view, setView] = useState<'tenant' | 'landlord' | 'admin'>('tenant')
  const [homeView, setHomeView] = useState<'tenant' | 'landlord'>('tenant')
  const [fbOpen, setFbOpen] = useState(false)
  const [fbMsg, setFbMsg] = useState('')
  const [fbFile, setFbFile] = useState<File | null>(null)
  const [fbBusy, setFbBusy] = useState(false)

  // Никаких «списков допуска»: priv влияет только на ДОП. кнопки (тестер/админ).
  useEffect(() => {
    if (!user) return
    setHomeView(user.role === 'landlord' ? 'landlord' : 'tenant')
    setView(user.role === 'landlord' ? 'landlord' : 'tenant')
    ;(async () => {
      const { data } = await supabase.from('access_control').select('phone, role')
      const hit = (data || []).find((r: any) => norm10(r.phone || '') === norm10(user.phone || '') && norm10(user.phone || '').length === 10)
      setPriv(hit ? (hit.role as any) : null)
    })()
  }, [user?.id])

  async function logout() {
    await supabase.auth.signOut()
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
      setFbOpen(false)
      setFbMsg('')
      setFbFile(null)
    } finally {
      setFbBusy(false)
    }
  }

  const segBtn = (active: boolean): React.CSSProperties => ({
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
        {priv && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(120,120,128,0.12)', borderRadius: 14, padding: 6, margin: '0 0 10px', overflowX: 'auto' }}>
            <button onClick={() => { setHomeView('tenant'); setView('tenant') }} style={segBtn(view === 'tenant')}>Арендатор</button>
            <button onClick={() => { setHomeView('landlord'); setView('landlord') }} style={segBtn(view === 'landlord')}>Арендодатель</button>
            <button onClick={logout} style={segBtn(false)}>Выйти</button>
            <button onClick={() => setFbOpen(true)} style={segBtn(false)}>✉️</button>
            {priv === 'admin' && (
              view === 'admin'
                ? <button onClick={() => setView(homeView)} style={segBtn(true)}>В приложение</button>
                : <button onClick={() => setView('admin')} style={segBtn(false)}>Админка</button>
            )}
          </div>
        )}

        {view === 'tenant' && <TenantDashboard />}
        {view === 'landlord' && <LandlordDashboard />}
        {view === 'admin' && priv === 'admin' && <AdminDashboard />}
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
