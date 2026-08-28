import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useTelegramUser } from './hooks/useTelegramUser'
import AuthGate from './components/AuthGate'
import TenantDashboard from './pages/TenantDashboard'
import LandlordDashboard from './pages/LandlordDashboard'
import AdminDashboard from './pages/AdminDashboard'
import { Toaster, Modal, showToast } from './components/ui'
import { initErrorReporting, setErrorUser } from './lib/errorlog'

const norm10 = (s: string) => (s || '').replace(/\D/g, '').slice(-10)

export function App() {
  const { user, refresh } = useTelegramUser() as any
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try { return localStorage.getItem('roomio_admin_v2') === '1' } catch { return false }
  })
  const [adminReady, setAdminReady] = useState<boolean>(() => {
    try { return localStorage.getItem('roomio_admin_v2_ready') === '1' } catch { return false }
  })
  const [roleOverride, setRoleOverride] = useState<null | 'tenant' | 'landlord'>(null)
  const [adminView, setAdminView] = useState(false)
  const [viewAsId, setViewAsId] = useState<string>(() => {
    try { return localStorage.getItem('roomio_viewas_id') || '' } catch { return '' }
  })
  const [viewPhone, setViewPhone] = useState('')
  const [fbOpen, setFbOpen] = useState(false)
  const [fbMsg, setFbMsg] = useState('')
  const [fbFile, setFbFile] = useState<File | null>(null)
  const [fbBusy, setFbBusy] = useState(false)

  useEffect(() => { initErrorReporting() }, [])
  useEffect(() => { setErrorUser(user) }, [user])

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

  const baseRole: 'tenant' | 'landlord' = user?.role === 'landlord' ? 'landlord' : 'tenant'
  const role: 'tenant' | 'landlord' = roleOverride || baseRole
  const view: 'tenant' | 'landlord' | 'admin' = adminView && isAdmin ? 'admin' : role

  async function startViewAs() {
    const digits = norm10(viewPhone)
    if (digits.length < 10) { showToast('Введите телефон полностью'); return }
    const { data } = await supabase.from('users').select('*')
    const u = (data || []).find((x: any) => norm10(x.phone || '') === digits)
    if (!u) { showToast('Пользователь с таким телефоном не найден'); return }
    try { localStorage.setItem('roomio_viewas_id', u.id) } catch {}
    window.location.reload()
  }

  function exitViewAs() {
    try { localStorage.removeItem('roomio_viewas_id') } catch {}
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

  const segFlex = (active: boolean): React.CSSProperties => ({
    flex: '1 0 auto',
    padding: '10px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
    fontSize: 15, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap',
    background: active ? '#fff' : 'transparent',
    color: active ? '#1d1d1f' : '#8e8e93',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
  })

  const iconBtn: React.CSSProperties = {
    flexShrink: 0, width: 42, height: 42, borderRadius: 12, border: 'none', cursor: 'pointer',
    background: 'transparent', fontSize: 18,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  const fixedBtn = (active: boolean): React.CSSProperties => ({
    flexShrink: 0, padding: '10px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
    fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap',
    background: active ? '#fff' : 'transparent',
    color: active ? '#1d1d1f' : '#8e8e93',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
  })

  return (
    <AuthGate>
      <Toaster />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '10px 10px 0' }}>
        {viewAsId && user && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'rgba(255,149,0,0.15)', borderRadius: 12, padding: '8px 12px', margin: '0 0 8px' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#b25000' }}>
              Режим просмотра: {user.full_name || user.phone || 'пользователь'}
            </span>
            <button
              onClick={exitViewAs}
              style={{ border: 'none', background: '#fff', color: '#b25000', fontWeight: 700, fontSize: 13, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', flexShrink: 0 }}
            >Выйти</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', background: 'rgba(120,120,128,0.12)', borderRadius: 14, padding: 6, margin: '0 0 10px', overflowX: 'auto' }}>
          {!adminReady ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 12px', color: 'transparent', userSelect: 'none', fontSize: 15, fontWeight: 600 }}>Roomio</div>
          ) : (
            <>
              <button style={segFlex(role === 'tenant' && !adminView)} onClick={() => { setRoleOverride('tenant'); setAdminView(false) }}>Арендатор</button>
              <button style={segFlex(role === 'landlord' && !adminView)} onClick={() => { setRoleOverride('landlord'); setAdminView(false) }}>Арендодатель</button>
              <button style={iconBtn} onClick={() => setFbOpen(true)}>✉️</button>
              {isAdmin && (
                adminView
                  ? <button style={fixedBtn(true)} onClick={() => setAdminView(false)}>В приложение</button>
                  : <button style={fixedBtn(false)} onClick={() => setAdminView(true)}>Админка</button>
              )}
            </>
          )}
        </div>

        {isAdmin && adminView && !viewAsId && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(120,120,128,0.08)', borderRadius: 12, padding: 8, margin: '0 0 10px' }}>
            <input
              value={viewPhone}
              onChange={(e) => setViewPhone(e.target.value)}
              placeholder="+7 ___ ___-__-__"
              inputMode="tel"
              style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box', outline: 'none' }}
            />
            <button
              onClick={startViewAs}
              style={{ flexShrink: 0, padding: '10px 14px', borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >Смотреть как</button>
          </div>
        )}

        {!user ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, marginTop: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f', marginBottom: 8 }}>Профиль не загрузился</div>
            <div style={{ fontSize: 14, color: '#8e8e93', marginBottom: 14 }}>Проверьте связь и нажмите кнопку — данные подтянутся.</div>
            <button
              onClick={refresh}
              style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
            >Повторить</button>
          </div>
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
