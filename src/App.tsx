import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useTelegramUser } from './hooks/useTelegramUser'
import LandlordDashboard from './pages/LandlordDashboard'
import TenantDashboard from './pages/TenantDashboard'
import ObjectManager from './components/ObjectManager'

const GLOBAL_CSS = `
  button:active { opacity: 0.55; }
  select { min-width: 0; }
  button:disabled { opacity: 0.6; }
`

const TEST_PHONES = ['+79057674225', '+77475885016', '+79651947084', '+79999110921', '+79063190766']
const TEST_IDS = ['28606967', '999999999']

function normPhone(v: string): string {
  let c = (v || '').replace(/[\s\-\(\)]/g, '')
  if (c.startsWith('8') && c.length === 11) c = '+7' + c.slice(1)
  if (c && !c.startsWith('+')) c = '+' + c
  return c
}

export default function App() {
  const { user, loading, error, loginWithId, logout } = useTelegramUser()
  const [value, setValue] = useState('')
  const [mode, setMode] = useState<'landlord' | 'tenant' | null>(null)

  const isTester = !!user && (
    TEST_IDS.includes(String(user.telegram_id || '')) ||
    TEST_PHONES.includes(normPhone(user.phone || ''))
  )

  useEffect(() => {
    if (!user) { setMode(null); return }
    if (mode !== null) return
    Promise.all([
      supabase.from('objects').select('id').eq('landlord_id', user.id).limit(1),
      supabase.from('contracts').select('id').eq('tenant_id', user.id).eq('status', 'active').limit(1),
    ]).then(([{ data: o }, { data: c }]) => {
      const hasO = !!(o && o.length)
      const hasC = !!(c && c.length)
      if (isTester) setMode(hasO ? 'landlord' : hasC ? 'tenant' : 'landlord')
      else setMode(hasO ? 'landlord' : 'tenant')
    })
  }, [user, isTester])

  if (loading) return <div style={st.wrap}>⏳ Загрузка...</div>

  if (!user) {
    return (
      <div style={st.wrap}>
        <style>{GLOBAL_CSS}</style>
        <h2 style={st.h2}>🔑 Вход</h2>
        <p style={st.p}>{error}</p>
        <input style={st.input} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Telegram ID или телефон" />
        <button style={st.button} onClick={() => value.trim() && loginWithId(value.trim())}>Войти</button>
      </div>
    )
  }

  return (
    <div>
      <style>{GLOBAL_CSS}</style>
      <div style={st.topbar}>
        <button style={st.logout} onClick={logout}>🚪 Выйти</button>
        {isTester ? (
          <>
            <button style={mode === 'landlord' ? st.tabActive : st.tab} onClick={() => setMode('landlord')}>🏠 Арендодатель</button>
            <button style={mode === 'tenant' ? st.tabActive : st.tab} onClick={() => setMode('tenant')}>💧 Арендатор</button>
          </>
        ) : (
          <div style={mode === 'landlord' ? st.tabActive : st.tab}>
            {mode === 'landlord' ? '🏠 Арендодатель' : '💧 Арендатор'}
          </div>
        )}
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
  tab: { flex: 1, padding: 10, borderRadius: 10, border: '1px solid #ddd', background: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'center' },
  tabActive: { flex: 1, padding: 10, borderRadius: 10, border: '1px solid #2196f3', background: '#2196f3', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'center' },
}
