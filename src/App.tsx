import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useTelegramUser } from './hooks/useTelegramUser'
import LandlordDashboard from './pages/LandlordDashboard'
import TenantDashboard from './pages/TenantDashboard'
import { Toaster, showToast } from './components/ui'
import { C } from './theme'

const GLOBAL_CSS = `
  button:active { opacity: 0.55; }
  select { min-width: 0; }
  button:disabled { opacity: 0.6; }
`

const TEST_PHONES = ['+79057674225', '+77475885016', '+79651947084', '+79999110921', '+79063190766']
const TEST_IDS = ['28606967']

function normPhone(v: string): string {
  let c = (v || '').replace(/[\s\-\(\)]/g, '')
  if (c.startsWith('8') && c.length === 11) c = '+7' + c.slice(1)
  if (c && !c.startsWith('+')) c = '+' + c
  return c
}

function canLoginManual(v: string): boolean {
  if (TEST_IDS.includes(v.trim())) return true
  return TEST_PHONES.includes(normPhone(v))
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
    if (!v) return
    if (!canLoginManual(v)) {
      showToast('Вход по номеру доступен только тестовым пользователям. Откройте мини-приложение из Telegram.')
      return
    }
    loginWithId(v)
  }

  if (loading) return <div style={st.wrap}>Загрузка...</div>

  if (!user) {
    return (
      <div style={st.wrap}>
        <style>{GLOBAL_CSS}</style>
        <Toaster />
        <h2 style={st.h2}>Вход</h2>
        <p style={st.p}>{error}</p>
        <input style={st.input} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Телефон тестового пользователя" />
        <button style={st.button} onClick={tryLogin}>Войти</button>
        <p style={{ ...st.p, marginTop: 12 }}>Работаете из Telegram? Мини-приложение определит вас автоматически — вводить ничего не нужно.</p>
      </div>
    )
  }

  return (
    <div>
      <style>{GLOBAL_CSS}</style>
      <Toaster />
      <div style={st.topbar}>
        {isTester ? (
          <>
            <button style={mode === 'tenant' ? st.segActive : st.seg} onClick={() => setMode('tenant')}>Арендатор</button>
            <button style={mode === 'landlord' ? st.segActive : st.seg} onClick={() => setMode('landlord')}>Арендодатель</button>
            <button style={st.seg} onClick={logout}>Выйти</button>
          </>
        ) : (
          <>
            <div style={st.segActive}>{mode === 'landlord' ? 'Арендодатель' : 'Арендатор'}</div>
            <button style={st.seg} onClick={logout}>Выйти</button>
          </>
        )}
      </div>
      {mode === 'landlord' ? <LandlordDashboard /> : <TenantDashboard />}
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  wrap: { fontFamily: 'system-ui', maxWidth: 600, margin: '0 auto', padding: 24 },
  h2: { fontSize: 20 },
  p: { color: '#555', fontSize: 14 },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16, boxSizing: 'border-box' },
  button: { marginTop: 12, width: '100%', padding: 14, borderRadius: 10, border: 'none', background: '#2196f3', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  topbar: { display: 'flex', gap: 4, padding: 4, background: C.gray, borderRadius: 12, maxWidth: 600, margin: '12px auto 0', boxSizing: 'border-box' },
  seg: { flex: 1, padding: '9px 4px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.text2 },
  segActive: { flex: 1, padding: '9px 4px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#fff', color: C.text, boxShadow: '0 1px 3px rgba(0,0,0,0.12)', textAlign: 'center' },
}
