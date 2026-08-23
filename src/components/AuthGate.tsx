import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { T } from '../theme'
import { Modal, showToast, Toaster } from './ui'

const inp: React.CSSProperties = { width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 16, boxSizing: 'border-box', outline: 'none' }

const POLICY = `ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ (кратко)
Оператор: владелец сервиса Roomio (самозанятый, РФ).
Состав данных: имя, номер телефона, e-mail, адреса арендуемых/сдаваемых объектов, суммы аренды и депозитов, показания счётчиков, история платежей и действий в приложении.
Цели: организация расчётов между арендодателем и арендатором, уведомления, поддержка работы сервиса.
Хранение: защищённая облачная база данных; доступ имеют только вы и ваш контрагент по договору, а также владелец сервиса для технической поддержки.
Передача третьим лицам: не осуществляется, кроме случаев, требуемых законом.
Срок: до удаления аккаунта или договора из системы.
Ваши права: запросить, изменить, удалить данные — через владельца сервиса (кнопка «Обратная связь» или по контакту в приложении).
Согласие даётся проставлением галочки при входе и может быть отозвано письменно.`

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user } = useTelegramUser()
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<'email' | 'code'>('email')
  const [consent, setConsent] = useState(false)
  const [policyOpen, setPolicyOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const s = data.session
      if (!s) { setHasSession(false); setReady(true); return }
      // Синхронизация личностей: e-mail сессии должен совпадать с e-mail текущего профиля.
      // Переключили аккаунт в приложении — старая почтовая сессия сбрасывается,
      // и приложение попросит код на правильный адрес.
      if (user) {
        const { data: u } = await supabase.from('users').select('email').eq('id', user.id).maybeSingle()
        const sessionEmail = (s.user?.email || '').toLowerCase()
        const boundEmail = (u?.email || '').toLowerCase()
        if (boundEmail && sessionEmail && boundEmail !== sessionEmail) {
          await supabase.auth.signOut()
          setHasSession(false)
          setReady(true)
          return
        }
      }
      // Серверная проверка сессии (удалённый аккаунт = выход)
      const { error } = await supabase.auth.getUser()
      if (error) {
        await supabase.auth.signOut()
        setHasSession(false)
      } else {
        setHasSession(true)
      }
      setReady(true)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setHasSession(!!s))
    return () => sub.subscription.unsubscribe()
  }, [user])

  // автопривязка email к текущему аккаунту при наличии сессии
  useEffect(() => {
    ;(async () => {
      if (!hasSession || !user) return
      const { data } = await supabase.auth.getUser()
      const em = data.user?.email
      if (!em) return
      const { data: u } = await supabase.from('users').select('email').eq('id', user.id).maybeSingle()
      if (u && !u.email) {
        await supabase.from('users').update({ email: em }).eq('id', user.id)
      }
    })()
  }, [hasSession, user])

  async function sendCode() {
    if (!consent) { showToast('Нужно согласие на обработку данных'); return }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { showToast('Проверьте e-mail'); return }
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() })
    setBusy(false)
    if (error) { showToast(`Ошибка ${error.status ?? ''} ${error.code ?? ''}: ${error.message || 'без сообщения'}`); return }
    setStage('code')
    showToast('Код отправлен на ' + email.trim())
  }

  async function verify() {
    if (code.trim().length < 4) { showToast('Введите код из письма'); return }
    setBusy(true)
    const types: Array<'email' | 'signup' | 'magiclink'> = ['email', 'signup', 'magiclink']
    let lastErr: any = null
    for (const t of types) {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: t })
      if (!error) { lastErr = null; break }
      lastErr = error
    }
    setBusy(false)
    if (lastErr) { showToast('Неверный код: ' + lastErr.message); return }
    showToast('✅ Вход выполнен')
  }

  if (!ready) return <div style={T.page}>Загрузка…</div>
  if (hasSession) return <>{children}</>

  return (
    <div style={{ ...T.page, maxWidth: 480, margin: '0 auto' }}>
      <Toaster />
      <div style={T.card}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Вход в Roomio</div>
        <div style={{ ...T.small, margin: '0 0 14px' }}>Код придёт на e-mail. Аккаунт привяжется к вашему профилю автоматически.</div>
        {stage === 'email' ? (
          <>
            <input style={inp} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@mail.ru" inputMode="email" autoComplete="email" />
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, margin: '12px 0', color: '#1d1d1f' }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2 }} />
              <span>Согласен на обработку персональных данных согласно <button style={{ border: 'none', background: 'transparent', color: '#0071e3', fontSize: 13, cursor: 'pointer', padding: 0 }} onClick={() => setPolicyOpen(true)}>политике конфиденциальности</button></span>
            </label>
            <button disabled={busy} onClick={sendCode} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Отправка…' : 'Получить код'}
            </button>
          </>
        ) : (
          <>
            <input style={inp} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код из письма" inputMode="numeric" />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button disabled={busy} onClick={verify} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Проверка…' : 'Войти'}
              </button>
              <button onClick={() => setStage('email')} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
                Другой e-mail
              </button>
            </div>
            <div style={{ ...T.tiny, margin: '10px 0 0', textAlign: 'center' }}>Письмо могло попасть в «Спам» — проверьте папку.</div>
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
