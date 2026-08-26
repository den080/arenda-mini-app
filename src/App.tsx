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

  // Кеш с НОВЫМ ключом — старый неправильный кеш ('roomio_admin') игнорируется
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try { return localStorage.getItem('roomio_admin_v2') === '1' } catch { return false }
  })
  const [adminReady, setAdminReady] = useState<boolean>(() => {
    try { return localStorage.getItem('roomio_admin_v2_ready') === '1' } catch { return false }
  })
  const [roleOverride, setRoleOverride] = useState<null | 'tenant' | 'landlord'>(null)
  const [adminView, setAdminView] = useState(false)
  const [fbOpen, setFbOpen] = useState(false)
  const [fbMsg, setFbMsg] = useState('')
  const [fbFile, setFbFile] = useState<File | null>(null)
  const [fbBusy, setFbBusy] = useState(false)

  // Админ — только если СВОЙ e-mail или СВОЙ телефон найден в списках админов.
  // Не зависит от того, открыта база или нет: сверяем на устройстве.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let admin = false
        let meEmail = String(user?.email || '').toLowerCase()
        const mePhone = norm10(user?.phone || '')
        if (!meEmail) {
          const { data: au } = await supabase.auth.getUser()
          meEmail = String(au?.user?.email || '').toLowerCase()
        }
        const { data: ae } = await supabase.from('admin_emails').select('email')
        admin = (ae || []).some((r: any) => !!meEmail && String(r.email || '').toLowerCase() === meEmail)
        if (!admin) {
          const { data: ac } = await supabase.from('access_control').select('phone, role')
          admin = (ac || []).some((r: any) => r.role === 'admin' && mePhone.length === 10 && norm10(r.phone || '') === mePhone)
        }
        if (!cancelled) {
          setIsAdmin(admin)
          setAdminReady(true)
          try {
            localStorage.setItem('roomio_admin_v2', admin ? '1' : '0')
            localStorage.setItem('roomio_admin_v2_ready', '1')
          } catch {}
        }
      } catch {
        if (!cancelled) setAdminReady(true)
      }
    })()
    return () => { cancelled = true }
  }, [user?.id])

  // Переключатель «Арендатор / Арендодатель» — у ВСЕХ пользователей
  const baseRole: 'tenant' | 'landlord' = user?.role === 'landlord' ? 'landlord' : 'tenant'
  const role: 'tenant' | 'landlord' = roleOverride || baseRole
  const view: 'tenant' | 'landlord' | 'admin' = adminView && isAdmin ? 'admin' : role

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
          {!adminReady ? (
            // пока проверка идёт — пустая полоска той же высоты, ничего не мигает
            <span style={{ padding: '8px 12px', fontSize: 14, color: 'transparent', userSelect: 'none' }}>Roomio</span>
          ) : (
            <>
              <button style={seg(role === 'tenant' && !adminView)} onClick={() => { setRoleOverride('tenant'); setAdminView(false) }}>Арендатор</button>
              <button style={seg(role === 'landlord' && !adminView)} onClick={() => { setRoleOverride('landlord'); setAdminView(false) }}>Арендодатель</button>
              <button style={seg(false)} onClick={() => setFbOpen(true)}>✉️</button>
              {isAdmin && (
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
