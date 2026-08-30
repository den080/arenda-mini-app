import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { T } from '../theme'
import { Modal, showToast, Toaster } from './ui'
import DemoTour from './DemoTour'

const inp: React.CSSProperties = { width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 17, boxSizing: 'border-box', outline: 'none' }

const POLICY = `ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ (кратко) Оператор: владелец сервиса Roomio (самозанятый, РФ). Состав данных: имя, номер телефона, e-mail, адреса объектов, суммы аренды и депозитов, показания счётчиков, история платежей и действий. Цели: организация расчётов, уведомления, поддержка работы сервиса. Хранение: защищённая облачная база; доступ — только вы, ваш контрагент по договору и владелец сервиса для поддержки. Передача третьим лицам: не осуществляется, кроме случаев, требуемых законом. Срок: до удаления аккаунта или договора. Ваши права: запросить, изменить, удалить данные — через владельца сервиса.`

function randKey(): string {
  try {
    const a = new Uint8Array(32)
    crypto.getRandomValues(a)
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2)
  }
}

function formatPhone(v: string): string {
  const digits = (v || '').replace(/\D/g, '').slice(0, 11)
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    const x = digits.slice(1)
    let out = '+7'
    if (x.length > 0) out += ' ' + x.slice(0, 3)
    if (x.length > 3) out += ' ' + x.slice(3, 6)
    if (x.length > 6) out += ' ' + x.slice(6, 8)
    if (x.length > 8) out += ' ' + x.slice(8, 10)
    return out
  }
  return v
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading: userLoading } = useTelegramUser()
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const isTelegram = !!(window as any)?.Telegram?.WebApp
  const [stage, setStage] = useState<'landing' | 'email' | 'code'>(isTelegram ? 'email' : 'landing')
  const [consent, setConsent] = useState(false)
  const [policyOpen, setPolicyOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [demo, setDemo] = useState<boolean>(() => {
    try { return new URLSearchParams(window.location.search).has('demo') } catch { return false }
  })
  const [claimOpen, setClaimOpen] = useState(false)
  const [claimPhone, setClaimPhone] = useState('')
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimMsg, setClaimMsg] = useState('')

  const tg = (window as any)?.Telegram?.WebApp
  const tgId = String(tg?.initDataUnsafe?.user?.id || (user as any)?.telegram_id || '')
  const tgPhone = String(tg?.initDataUnsafe?.user?.phone_number || '')

  function exitDemo() {
    try { window.history.replaceState({}, '', window.location.pathname) } catch {}
    setDemo(false)
  }

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
      const key = randKey()
      localStorage.setItem('roomio_key:' + em, key)
      try { await supabase.auth.updateUser({ password: key }) } catch {}
      if (tgId || tgPhone) {
        try { await supabase.auth.updateUser({ data: { telegram_id: tgId || undefined, phone: tgPhone || undefined } }) } catch {}
      }
      if (user?.id) {
        await supabase.from('users').update({ email: em }).eq('id', user.id).then(() => {}, () => {})
      }
      // если это арендатор без договора — предлагаем привязать по телефону
      const { data: me } = await supabase.from('users').select('id, role').eq('email', em).maybeSingle()
      let needClaim = false
      if (me && me.role === 'tenant') {
        const { count } = await supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('tenant_id', me.id)
        needClaim = (count || 0) === 0
      }
      if (needClaim) { setClaimOpen(true); return }
      setHasSession(true)
      showToast('✅ Вход выполнен')
    } finally { setBusy(false) }
  }

  async function claim() {
    setClaimBusy(true)
    setClaimMsg('')
    try {
      const { data, error } = await supabase.rpc('claim_contract_by_phone', { p_phone: claimPhone })
      if (error) { showToast('Ошибка: ' + error.message); return }
      if ((data || 0) > 0) {
        showToast('✅ Договор привязан')
        setHasSession(true)
      } else {
        setClaimMsg('Договор с таким телефоном не найден. Проверьте номер или попросите арендодателя указать его в договоре.')
      }
    } finally { setClaimBusy(false) }
  }

  if (demo) return (
    <>
      <Toaster />
      <DemoTour onExit={exitDemo} />
    </>
  )

  if (!ready) return <div style={T.page}>Загрузка…</div>
  if (hasSession) return <>{children}</>

  if (claimOpen) return (
    <div style={{ ...T.page, maxWidth: 480, margin: '0 auto' }}>
      <Toaster />
      <div style={T.card}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Привязать договор</div>
        <div style={{ ...T.small, margin: '0 0 12px' }}>
          Введите телефон, на который оформлен договор у арендодателя, — откроется ваша аренда.
        </div>
        <input
          style={inp}
          value={claimPhone}
          onChange={(e) => setClaimPhone(formatPhone(e.target.value))}
          placeholder="+7 ___ ___-__-__"
          inputMode="tel"
          autoComplete="off"
        />
        {claimMsg && <div style={{ ...T.tiny, margin: '8px 0 0', color: '#c00' }}>{claimMsg}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button disabled={claimBusy} onClick={claim} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 17, cursor: 'pointer', opacity: claimBusy ? 0.6 : 1 }}>
            {claimBusy ? 'Проверка…' : 'Привязать'}
          </button>
          <button onClick={() => setHasSession(true)} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 17, cursor: 'pointer' }}>
            Пропустить
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ ...T.page, maxWidth: 480, margin: '0 auto' }}>
      <Toaster />
      <div style={T.card}>
        {stage === 'landing' ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Roomio — аренда без тетрадок и споров</div>
            <div style={{ ...T.small, margin: '0 0 12px' }}>
              Счета аренды создаются автоматически. Показания и квитанции — в приложении. Штрафы замораживаются вместо конфликтов. При съезде — прозрачный расчёт из депозита.
            </div>
            <button onClick={() => setDemo(true)} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 17, cursor: 'pointer', marginBottom: 8 }}>
              Смотреть демо без входа
            </button>
            <button onClick={() => setStage('email')} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 17, cursor: 'pointer' }}>
              Войти по e-mail
            </button>
            <div style={{ ...T.tiny, margin: '10px 0 0', textAlign: 'center' }}>
              Работает в браузере без Telegram. В Telegram — открывается через бота @roomiorent_bot.
            </div>
          </>
        ) : stage === 'email' ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Вход в Roomio</div>
            <div style={{ ...T.small, margin: '0 0 14px' }}>
              Код придёт на e-mail один раз; аккаунт привяжется к профилю, дальше входы без кода.
            </div>
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
            <button disabled={busy} onClick={sendCode} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 17, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Отправка…' : 'Получить код'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
              <button onClick={() => setDemo(true)} style={{ border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4 }}>
                Смотреть демо без входа ›
              </button>
            </div>
          </>
        ) : (
          <>
            <input style={inp} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код из письма" inputMode="numeric" autoComplete="off" />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button disabled={busy} onClick={verify} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 17, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Проверка…' : 'Войти'}
              </button>
              <button onClick={() => setStage('email')} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 17, cursor: 'pointer' }}>
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
