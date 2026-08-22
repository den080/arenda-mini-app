import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useTelegramUser } from './hooks/useTelegramUser'
import LandlordDashboard from './pages/LandlordDashboard'
import TenantDashboard from './pages/TenantDashboard'
import AdminDashboard from './pages/AdminDashboard'
import FeedbackButton from './components/Feedback'
import AuthGate from './components/AuthGate'
import { Toaster, showToast } from './components/ui'
import { C } from './theme'

const GLOBAL_CSS = `button:active { opacity: 0.55; } select { min-width: 0; } button:disabled { opacity: 0.6; }`

// ========== ЗАГЛУШКА (вход в закрытую бету) ==========
const LOCKDOWN = true
const ALLOWED_IDS = ['28606967']
const ALLOWED_PHONES = ['+79057674225', '+77475885016', '+79651947084', '+79999110921', '+79063190766']
const OWNER_PHONE = '+79057674225'
// =====================================================

function normPhone(v: string): string {
  let c = (v || '').replace(/[\s-()]/g, '')
  if (c.startsWith('8') && c.length === 11) c = '+7' + c.slice(1)
  if (c && !c.startsWith('+')) c = '+' + c
  return c
}

function isAllowed(v: string): boolean {
  const t = v.trim()
  if (ALLOWED_IDS.includes(t)) return true
  return ALLOWED_PHONES.includes(normPhone(t))
}

export { LOCKDOWN, ALLOWED_IDS, ALLOWED_PHONES, isAllowed, normPhone }

function AppInner() {
  const { user, loading, error, loginWithId, logout, accessDenied } = useTelegramUser()
  const [value, setValue] = useState('')
  const [mode, setMode] = useState<'landlord' | 'tenant' | null>(null)
  const [adminMode, setAdminMode] = useState(false)
  const [adminUnlocked, setAdminUnlocked] = useState(() => { try { return sessionStorage.getItem('admin_ok') === '1' } catch { return false } })
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [accessList, setAccessList] = useState<any[]>([])
  const [accessLoading, setAccessLoading] = useState(true)

  // Роли (tester/admin) берутся из таблицы access_control — управляется в Админке → «Доступ»
  useEffect(() => {
    supabase.from('access_control').select('*').then(({ data }) => {
      setAccessList(data || [])
      setAccessLoading(false)
    }).catch(() => setAccessLoading(false))
  }, [])

  const userPhone = normPhone(user?.phone || '')
  const isTester = !!user && accessList.some(a => (a.role === 'tester' || a.role === 'admin') && normPhone(a.phone) === userPhone)
  const isOwner = (!!user && accessList.some(a => a.role === 'admin' && normPhone(a.phone) === userPhone)) || (!!user && userPhone === normPhone(OWNER_PHONE))

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp
    if (tg) {
      try {
        tg.ready()
        tg.expand()
        if (typeof tg.onEvent === 'function') {
          tg.onEvent('viewportChanged', () => {
            if (!tg.isExpanded) tg.expand()
          })
        }
      } catch {}
    }
  }, [])

  useEffect(() => {
    if (!user) { setMode(null); return }
    if (mode !== null) return
    supabase.from('contracts').select('id').eq('tenant_id', user.id).eq('status', 'active').limit(1).then(({ data }) => {
      setMode(data && data.length > 0 ? 'tenant' : 'landlord')
    })
  }, [user])

  function tryLogin() {
    const v = value.trim()
    if (v) loginWithId(v)
  }

  function openAdmin() {
    if (adminUnlocked) { setAdminMode(!adminMode); return }
    setPin('')
    setPinOpen(true)
  }

  async function checkPin() {
    if (pinBusy) return
    setPinBusy(true)
    try {
      const { data, error } = await supabase.rpc('check_admin_pin', { pin: pin.trim() })
      if (error) { showToast('Ошибка проверки: ' + error.message); return }
      if (data === true) {
        try { sessionStorage.setItem('admin_ok', '1') } catch {}
        setAdminUnlocked(true)
        setPinOpen(false)
        setAdminMode(true)
        showToast('✅ Добро пожаловать')
      } else {
        showToast('Неверный PIN')
      }
    } finally {
      setPinBusy(false)
    }
  }

  if (loading || accessLoading) return <div style={st.wrap}>Загрузка...</div>
  if (accessDenied) {
    return (
      <div style={{ ...st.wrap, textAlign: 'center', paddingTop: 60 }}>
        <style>{GLOBAL_CSS}</style>
        <Toaster />
        <h2 style={{ ...st.h2, fontSize: 22, marginBottom: 8 }}>Доступ закрыт</h2>
        <p style={st.p}>Приложение сейчас доступно ограниченному кругу пользователей. Попробуйте позже или обратитесь к администратору.</p>
      </div>
    )
  }
  if (!user) {
    return (
      <div style={st.wrap}>
        <style>{GLOBAL_CSS}</style>
        <Toaster />
        <h2 style={st.h2}>Вход</h2>
        <p style={st.p}>{error}</p>
        <input style={st.input} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Телефон" />
        <button style={st.button} onClick={tryLogin}>Войти</button>
        {LOCKDOWN && (
          <p style={{ ...st.p, marginTop: 12, fontSize: 13 }}>
            Сейчас приложение работает в закрытом режиме. Вход — для разрешённых пользователей и команды пула.
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      <style>{GLOBAL_CSS}</style>
      <Toaster />
      <div style={st.topbar}>
        <button style={mode === 'tenant' ? st.segActive : st.seg} onClick={() => { setMode('tenant'); setAdminMode(false) }}>Арендатор</button>
        <button style={mode === 'landlord' ? st.segActive : st.seg} onClick={() => { setMode('landlord'); setAdminMode(false) }}>Арендодатель</button>
        {isTester && (
          <button style={st.seg} onClick={logout}>Выйти</button>
        )}
        <FeedbackButton />
        {isOwner && (
          <button style={adminMode ? st.segActive : st.seg} onClick={openAdmin}>{adminMode ? 'В приложение' : 'Админка'}</button>
        )}
      </div>
      {adminMode && isOwner && adminUnlocked
        ? <AdminDashboard />
        : mode === 'landlord' ? <LandlordDashboard /> : <TenantDashboard />}
      {pinOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 320 }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>Вход в админку</div>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 18, letterSpacing: 4, boxSizing: 'border-box', outline: 'none', textAlign: 'center' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button disabled={pinBusy} onClick={checkPin} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Войти</button>
              <button onClick={() => setPinOpen(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <AuthGate>
      <AppInner />
    </AuthGate>
  )
}

const st: Record<string, React.CSSProperties> = {
  wrap: { fontFamily: 'system-ui', maxWidth: 600, margin: '0 auto', padding: 24 },
  h2: { fontSize: 20 },
  p: { color: '#555', fontSize: 14 },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16, boxSizing: 'border-box' },
  button: { marginTop: 12, width: '100%', padding: 14, borderRadius: 10, border: 'none', background: '#2196f3', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  topbar: { display: 'flex', gap: 4, padding: 4, background: C.gray, borderRadius: 12, maxWidth: 600, margin: '12px auto 0', boxSizing: 'border-box', alignItems: 'center' },
  seg: { flex: 1, padding: '9px 4px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.text2 },
  segActive: { flex: 1, padding: '9px 4px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#fff', color: C.text, boxShadow: '0 1px 3px rgba(0,0,0,0.12)', textAlign: 'center' },
}
