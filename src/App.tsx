import { Component, ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useTelegramUser } from './hooks/useTelegramUser'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <h2 style={{ color: '#f44336' }}>Произошла ошибка</h2>
          <p style={{ color: '#666' }}>
            {this.state.error?.message || 'Неизвестная ошибка'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={styles.button}
          >
            Обновить страницу
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function AppContent() {
  const { user, loading, error } = useTelegramUser()
  
  if (loading) {
    return <div style={styles.container}>Загрузка...</div>
  }
  
  if (error) {
    return <div style={styles.container}>{error}</div>
  }
  
  if (!user) {
    return <div style={styles.container}>Пользователь не найден</div>
  }
  
  if (user.role === 'landlord') {
    return <Navigate to="/landlord" replace />
  }
  
  if (user.role === 'tenant') {
    return <Navigate to="/tenant" replace />
  }
  
  return <div style={styles.container}>Неизвестная роль</div>
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxWidth: '600px',
    margin: '0 auto',
    padding: '16px',
  },
  button: {
    padding: '12px 24px',
    fontSize: '16px',
    backgroundColor: '#007AFF',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '16px',
  },
}

export default App
