import { Component, useState } from 'react'
import type { ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useTelegramUser } from './hooks/useTelegramUser'
import LandlordDashboard from './pages/LandlordDashboard'
import TenantDashboard from './pages/TenantDashboard'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(e: unknown) {
    return { error: String(e) }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui', color: '#c00' }}>
          <h2>Ошибка интерфейса</h2>
          <p>{this.state.error}</p>
        </div>
      )
    }
    return this.props.children
  }
}

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
          placeholder="Ваш Telegram ID (например: 28606967)"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize
