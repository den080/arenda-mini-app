import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useTelegramUser } from './hooks/useTelegramUser'
import LandlordDashboard from './pages/LandlordDashboard'
import TenantDashboard from './pages/TenantDashboard'
import ObjectManager from './components/ObjectManager'

export default function App() {
  const { user, loading, error, loginWithId, logout } = useTelegramUser()
  const [value, setValue] = useState('')
  const [mode, setMode] = useState<'landlord' | 'tenant' | null>(null)

  useEffect(() => {
    if (!user) { setMode(null); return }
    if (mode !== null) return
    supabase.from('objects').select('id').eq('landlord_id', user.id).limit(1).then(({ data }) => {
      setMode(data && data.length > 0 ? 'landlord' : 'tenant')
    })
  }, [user])

  if (loading) return <div style={st.wrap}>⏳ Загрузка...</div>

  if (!user) {
    return (
      <div style={st.wrap}>
        <h2 style={st.h2}>🔑 Вход</h2>
        <p style={st.p}>{error}</p>
        <input style={st.input} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Telegram ID или телефон" />
        <button style={st.button} onClick={() => value.trim() && loginWithId(value.trim())}>Войти</button>
      </div>
    )
  }

  return (
    <div>
      <div style={st.topbar}>
        <button style={st.logout} onClick={logout}>🚪 Выйти</button>
        <button style={mode === 'landlord' ? st.tabActive : st.tab} onClick={() => setMode('landlord')}>🏠 Арендодатель</button>
        <button style={mode === 'tenant' ? st.tabActive : st.tab} onClick={() => setMode('tenant')}>💧 Арендатор</button>
      </div>
      {mode === 'landlord' ? <LandlordDashboard /> : <TenantDashboard />}
      {mode === 'landlord' && <ObjectManager />}
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  wrap: { fontFamily: 'system-ui', maxWidth: 600, margin: '0 auto', padding: 24 },
  h2: { fontSize: 20 },
  p: { color: '#555', fontSize: 14 },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16, boxSizing: 'border-box' },
  button: { marginTop: 12, width: '100%', padding: 14, borderRadius: 10, border: 'none', background: '#2196f3', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  topbar: { display: 'flex', gap: 8, padding: '10px 12px', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', position: 'sticky', top: 0, zIndex: 10 },
  logout: { padding: '8px 12px', borderRadius: 8, border: 'none', background: '#eceff1', fontSize: 14, cursor: 'pointer' },
  tab: { flex: 1, padding: 10, borderRadius: 10, border: '1px solid #ddd', background: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  tabActive: { flex: 1, padding: 10, borderRadius: 10, border: '1px solid #2196f3', background: '#2196f3', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
}
