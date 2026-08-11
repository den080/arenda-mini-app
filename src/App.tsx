import { Navigate } from 'react-router-dom'
import { useTelegramUser } from './hooks/useTelegramUser'

function App() {
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxWidth: '600px',
    margin: '0 auto',
    padding: '16px',
  },
}

export default App
