import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { T } from '../theme'
import { Modal, showToast, Toaster } from './ui'

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

const demoBtn: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4 }

// ===== ПУБЛИЧНОЕ ДЕМО: продукт без входа =====
function DemoView({ onExit }: { onExit: () => void }) {
  const [role, setRole] = useState<'landlord' | 'tenant'>('landlord')
  const tap = () => showToast('Это демо-режим: данные тестовые. Регистрация — по e-mail за минуту.')
  const seg = (a: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
    fontSize: 15, fontWeight: 600, textAlign: 'center',
    background: a ? '#fff' : 'transparent', color: a ? '#1d1d1f' : '#8e8e93',
    boxShadow: a ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
  })
  return (
    <div style={{ ...T.page, maxWidth: 480, margin: '0 auto', paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'rgba(255,149,0,0.15)', borderRadius: 12, padding: '8px 12px', margin: '10px 0' }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#b25000' }}>Демо-режим: продукт без регистрации</span>
        <button onClick={onExit} style={{ border: 'none', background: '#fff', color: '#b25000', fontWeight: 700, fontSize: 13, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', flexShrink: 0 }}>Выйти</button>
      </div>
      <div style={{ display: 'flex', gap: 6, background: 'rgba(120,120,128,0.12)', borderRadius: 14, padding: 6, margin: '0 0 10px' }}>
        <button style={seg(role === 'landlord')} onClick={() => setRole('landlord')}>Арендодатель</button>
        <button style={seg(role === 'tenant')} onClick={() => setRole('tenant')}>Арендатор</button>
      </div>
      {role === 'landlord' ? (
        <>
          <div style={T.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={T.h2}>Ждут подтверждения: 2</div>
              <span style={{ color: '#0071e3', fontSize: 15, fontWeight: 600 }}>открыть ›</span>
            </div>
            <div style={T.row}><span style={{ fontSize: 17, fontWeight: 600 }}>Реутов, ул. Лесная д.11, кв.4</span><span style={{ fontSize: 15, color: '#8e8e93' }}>сентябрь · 67 000 ₽</span></div>
            <div style={{ ...T.row, borderBottom: 'none' }}><span style={{ fontSize: 17, fontWeight: 600 }}>Москва, ул. Тверская 7, кв.12</span><span style={{ fontSize: 15, color: '#8e8e93' }}>сентябрь · 45 000 ₽</span></div>
            <div style={T.tiny}>Центр подтверждений: отметили галочками полученные оплаты — «Подтвердить выбранные». Частичные — внутрь объекта.</div>
          </div>
          <div style={T.card}>
            <div style={T.h2}>Объекты</div>
            <div style={T.row}><span style={{ fontSize: 17, fontWeight: 600 }}>Реутов, ул. Лесная д.11, кв.4</span><span style={{ fontSize: 13, color: '#080' }}>До оплаты 8 дн. · 67 000 ₽</span></div>
            <div style={{ ...T.row, borderBottom: 'none' }}><span style={{ fontSize: 17, fontWeight: 600 }}>Москва, ул. Тверская 7, кв.12</span><span style={{ fontSize: 13, color: '#a80' }}>Ждём показания · 45 000 ₽</span></div>
          </div>
          <div style={T.card}>
            <div style={T.h2}>Замороженные штрафы</div>
            <div style={T.row}><span style={{ fontSize: 17 }}>август · просрочка показаний</span><span style={{ fontSize: 17, fontWeight: 600 }}>1 300 ₽</span></div>
            <div style={T.tiny}>Штраф не давит на арендатора сразу: учитывается только при съезде из депозита. Каждое изменение — с причиной и датой.</div>
          </div>
          <div style={T.card}>
            <div style={T.h2}>Тариф Pro</div>
            <div style={T.small}>Массовое подтверждение оплат, совместный доступ (менеджер/наблюдатель), пулы аренды. Бесплатно — весь учёт, подтверждения вручную внутри объекта.</div>
          </div>
        </>
      ) : (
        <>
          <div style={T.card}>
            <div style={T.h2}>Моя аренда</div>
            <div style={T.row}><span style={{ fontSize: 17, fontWeight: 600 }}>Реутов, ул. Лесная д.11, кв.4</span></div>
            <div style={{ ...T.row, borderBottom: 'none' }}><span style={{ fontSize: 13, color: '#8e8e93' }}>Срок: 05.11.2025 — 05.10.2026 · оплата до 5 числа</span></div>
          </div>
          <div style={T.card}>
            <div style={T.h2}>Счёт за сентябрь</div>
            <div style={T.row}><span style={{ fontSize: 17 }}>Аренда</span><span style={{ fontSize: 17, fontWeight: 600 }}>67 000 ₽</span></div>
            <div style={T.row}><span style={{ fontSize: 17 }}>Ресурсы по квитанции</span><span style={{ fontSize: 17, fontWeight: 600 }}>4 200 ₽</span></div>
            <div style={{ ...T.row, borderBottom: 'none' }}><span style={{ fontSize: 17, fontWeight: 700 }}>Итого</span><span style={{ fontSize: 17, fontWeight: 700 }}>71 200 ₽</span></div>
            <button style={T.btn} onClick={tap}>Я оплатил</button>
            <div style={T.tiny}>Арендодатель получит уведомление и подтвердит оплату — придёт расписка и создастся следующий счёт.</div>
          </div>
          <div style={T.card}>
            <div style={T.h2}>Показания за сентябрь</div>
            <div style={T.row}><span style={{ fontSize: 17 }}>Холодная вода · ХВ-034944</span><span style={{ fontSize: 15, color: '#8e8e93' }}>прошлые: 322</span></div>
            <div style={{ ...T.row, borderBottom: 'none' }}><span style={{ fontSize: 17 }}>Горячая вода · ГВ-724271</span><span style={{ fontSize: 15, color: '#8e8e93' }}>прошлые: 24</span></div>
            <button style={T.btn} onClick={tap}>Передать показания</button>
            <div style={T.tiny}>Не передадите к дедлайну — начислится замороженный штраф (увидите его только при съезде).</div>
          </div>
        </>
      )}
      <div style={T.card}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#1d1d1f' }}>Понравилось?</div>
        <div style={{ fontSize: 15, color: '#8e8e93', margin: '6px 0 10px' }}>Регистрация занимает минуту: e-mail + код. Тестовые данные заменятся вашими реальными объектами и договорами.</div>
        <button style={T.btn} onClick={onExit}>Создать аккаунт</button>
      </div>
    </div>
  )
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
      setHasSession(true)
      showToast('✅ Вход выполнен')
    } finally { setBusy(false) }
  }

  if (demo) return (
    <>
      <Toaster />
      <DemoView onExit={exitDemo} />
    </>
  )

  if (!ready) return <div style={T.page}>Загрузка…</div>
  if (hasSession) return <>{children}</>

  return (
    <div style={{ ...T.page, maxWidth: 480, margin: '0 auto' }}>
      <Toaster />
      <div style={T.card}>
        {stage === 'landing' ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Roomio — аренда без тетрадок и споров</div>
            <div style={{ ...T.small, margin: '0 0 12px' }}>
              Сервис учёта аренды для арендодателей и арендаторов. Работает в браузере и в Telegram.
            </div>
            <div style={{ fontSize: 15, color: '#1d1d1f', lineHeight: 1.5, margin: '0 0 12px' }}>
              • Счета аренды создаются автоматически, оплаты под контролем<br />
              • Показания счётчиков и квитанции — в приложении<br />
              • Штрафы замораживаются вместо конфликтов, учёт при съезде — из депозита<br />
              • Расписки, история платежей и допсоглашения — хранятся постоянно
            </div>
            <button onClick={() => setDemo(true)} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 17, cursor: 'pointer', marginBottom: 8 }}>
              Смотреть демо без входа
            </button>
            <button onClick={() => setStage('email')} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: '#e8e8ed', fontWeight: 600, fontSize: 17, cursor: 'pointer' }}>
              Войти по e-mail
            </button>
            <div style={{ ...T.tiny, margin: '10px 0 0', textAlign: 'center' }}>
              В Telegram — открывается через бота @roomiorent_bot.{' '}
              <button style={{ ...demoBtn, fontSize: 13 }} onClick={() => setPolicyOpen(true)}>Политика конфиденциальности</button>
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
              <button onClick={() => setDemo(true)} style={demoBtn}>Смотреть демо без входа ›</button>
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
