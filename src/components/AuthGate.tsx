import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { T } from '../theme'
import { Modal, showToast, Toaster } from './ui'
import DemoTour from './DemoTour'

const inp: React.CSSProperties = { width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 16, boxSizing: 'border-box', outline: 'none' }

const POLICY = `ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ (кратко) Оператор: владелец сервиса Roomio (самозанятый, РФ). Состав данных: имя, номер телефона, e-mail, адреса объектов, суммы аренды и депозитов, показания счётчиков, история платежей и действий. Цели: организация расчётов, уведомления, поддержка работы сервиса. Хранение: защищённая облачная база; доступ — только вы, ваш контрагент по договору и владелец сервиса для поддержки. Передача третьим лицам: не осуществляется, кроме случаев, требуемых законом. Срок: до удаления аккаунта или договора. Ваши права: запросить, изменить, удалить данные — через владельца сервиса.`

// СЛУЧАЙНЫЙ ключ устройства (64 hex-символа). В отличие от «roomio-tg-…»,
// его невозможно угадать или перебрать снаружи.
function randKey(): string {
  try {
    const a = new Uint8Array(32)
    crypto.getRandomValues(a)
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2)
  }
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading: userLoading } = useTelegramUser()
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<'email' | 'code'>('email')
  const [consent, setConsent] = useState(false)
  const [policyOpen, setPolicyOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // ДЕМО-РЕЖИМ: кнопка на экране входа или ссылка с ?demo=1 (для проверки и будущих клиентов)
  const [demo, setDemo] = useState<boolean>(() => {
    try { return new URLSearchParams(window.location.search).has('demo') } catch { return false }
  })

  const tg = (window as any)?.Telegram?.WebApp
  const tgId = String(tg?.initDataUnsafe?.user?.id || (user as any)?.telegram_id || '')
  const tgPhone = String(tg?.initDataUnsafe?.user?.phone_number || '')

  function exitDemo() {
    try { window.history.replaceState({}, '', window.location.pathname) } catch {}
    setDemo(false)
  }

  // Вход: живая сессия → тихий вход (сохранённая почта + ключ устройства) → иначе форма
  useEffect(() => {
    let cancelled = false
    if (userLoading) return
    ;(async () => {
      try {
        const { data: s } = await supabase.auth.getSession()
        let session = s?.session || null
        if (session) {
          const { error } = await supabase.auth.getUser()
          if (error) session = null
        }
        const saved = (localStorage.getItem('roomio_bound_email') || '').toLowerCase()
        if (!session && saved) {
          const key = localStorage.getItem('roomio_key:' + saved) || ''
          if (key) {
            const { data: ld } = await supabase.auth.signInWithPassword({ email: saved, password: key })
            session = ld?.session || null
          }
        }
        if (session) {
          const em = String(session.user?.email || '').toLowerCase()
          if (em) {
            localStorage.setItem('roomio_bound_email', em)
            if (user?.id) {
              supabase.from('users').update({ email: em }).eq('id', user.id).then(() => {}, () => {})
            }
            // запоминаем телефон/telegram в профиле auth — пригодится для политик «свой»
            if (tgId || tgPhone) {
              supabase.auth.updateUser({ data: { telegram_id: tgId || undefined, phone: tgPhone || undefined } }).then(() => {}, () => {})
            }
          }
        }
        if (!cancelled) { setHasSession(!!session); setReady(true) }
      } catch {
        if (!cancelled) { setHasSession(false); setReady(true) }
      }
    })()
    return () => { cancelled = true }
  }, [user?.id, userLoading])

  async function sendCode() {
    if (!consent) { showToast('Нужно согласие на обработку данных'); return }
    if (!/^\S+@\S+.\S+$/.test(email.trim())) { showToast('Проверьте e-mail'); return }
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim() })
      if (error) { showToast(`Ошибка ${error.status ?? ''}: ${error.message || 'без сообщения'}`); return }
      setStage('code')
      showToast('Код отправлен на ' + email.trim())
    } finally { setBusy(false) }
  }

  async function verify() {
    if (code.trim().length < 4) { showToast('Введите код из письма'); return }
    setBusy(true)
    try {
      const types: Array<'email' | 'signup' | 'magiclink'> = ['email', 'signup', 'magiclink']
      let lastErr: any = null
      for (const t of types) {
        const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: t })
        if (!error) { lastErr = null; break }
        lastErr = error
      }
      if (lastErr) { showToast('Неверный код: ' + lastErr.message); return }
      const em = email.trim().toLowerCase()
      localStorage.setItem('roomio_bound_email', em)
      // Новый случайный ключ устройства; старый предсказуемый пароль больше не используется
      const key = randKey()
      localStorage.setItem('roomio_key:' + em, key)
      try { await supabase.auth.updateUser({ password: key }) } catch {}
      if (tgId || tgPhone) {
        try { await supabase.auth.updateUser({ data: { telegram_id: tgId || undefined, phone: tgPhone || undefined } }) } catch {}
      }
      if (user?.id) {
        await supabase.from('users').update({ email: em }).eq('id', user.id).then(() => {}, () => {})
      }
      setHasSession(true)
      showToast('✅ Вход выполнен')
    } finally { setBusy(false) }
  }

  // демо открывается сразу, без ожидания сессии
  if (demo) return (
    <>
      <Toaster />
      <DemoTour onExit={exitDemo} />
    </>
  )

  if (!ready) return <div style={T.page}>Загрузка…</div>
  if (hasSession) return <>{children}</>

  return (
    <div style={{ ...T.page, maxWidth: 480, margin: '0 auto' }}>
      <Toaster />
      <div style={T.card}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Вход в Roomio</div>
        <div style={{ ...T.small, margin: '0 0 14px' }}>
          Код придёт на e-mail один раз; аккаунт привяжется к профилю, дальше входы без кода.
        </div>
        {stage === 'email' ? (
          <>
            <input
              style={inp}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@mail.ru"
              inputMode="email"
              autoComplete="off"
            />
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, margin: '12px 0', color: '#1d1d1f' }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2 }} />
              <span>Согласен на обработку персональных данных согласно <button style={{ border: 'none', background: 'transparent', color: '#0071e3', fontSize: 13, cursor: 'pointer', padding: 0 }} onClick={() => setPolicyOpen(true)}>политике конфиденциальности</button></span>
            </label>
            <button disabled={busy} onClick={sendCode} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Отправка…' : 'Получить код'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
              <button onClick={() => setDemo(true)} style={{ border: 'none', background: 'transparent', color: '#0071e3', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 4 }}>
                Смотреть демо без входа ›
              </button>
            </div>
          </>
        ) : (
          <>
            <input style={inp} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код из письма" inputMode="numeric" autoComplete="off" />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button disabled={busy} onClick={verify} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Проверка…' : 'Войти'}
              </button>
              <button onClick={() => setStage('email')} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
                Другой e-mail
              </button>
            </div>
            <div style={{ ...T.tiny, margin: '10px 0 0', textAlign: 'center' }}>Письмо могло попасть в «Спам» — проверьте папку.</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
              <button onClick={() => setDemo(true)} style={{ border: 'none', background: 'transparent', color: '#0071e3', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 4 }}>
                Смотреть демо без входа ›
              </button>
            </div>
          </>
        )}
      </div>
      <Modal open={policyOpen} title="Политика конфиденциальности" onClose={() => setPolicyOpen(false)}>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5, maxHeight: '60vh', overflowY: 'auto' }}>{POLICY}</div>
      </Modal>
    </div>
  )
}

export default AuthGate
