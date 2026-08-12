import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useTelegramUser } from './hooks/useTelegramUser'
import LandlordDashboard from './pages/LandlordDashboard'
import TenantDashboard from './pages/TenantDashboard'

export default function App() {
  const { user, loading, error, loginWithId } = useTelegramUser()
  const [value, setValue] = useState('')

  if (loading) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui' }}>⏳ Загрузка...</div>

  if (!user) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 600, margin: '0 auto' }}>
        <h2 style={{ fontSize: 20 }}>🔑 Вход</h2>
        <p style={{ color: '#555', fontSize: 14 }}>{error}</p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Telegram ID или телефон (например: +79995553322)"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16, boxSizing: 'border-box' }}
        />
        <button
          onClick={() => value.trim() && loginWithId(value.trim())}
          style={{ marginTop: 12, width: '100%', padding: 14, borderRadius: 10, border: 'none', background: '#2196f3', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
        >
          Войти
        </button>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={user.role === 'landlord' ? '/landlord' : '/tenant'} replace />} />
      <Route path="/landlord" element={<LandlordDashboard />} />
      <Route path="/tenant" element={<TenantDashboard />} />
      <Route path="*" element={<Navigate to={user.role === 'landlord' ? '/landlord' : '/tenant'} replace />} />
    </Routes>
  )
}
