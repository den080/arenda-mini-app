import { useState } from 'react'
import { T } from '../theme'
import { BottomNav, Progress } from './ui'

const TABS = [
  { id: 'pay', l: 'Оплата' },
  { id: 'meters', l: 'Счётчики' },
  { id: 'contract', l: 'Договор' },
  { id: 'chat', l: 'Чат' },
]

const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 17, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
const actBlue: React.CSSProperties = { ...iosBlue, fontSize: 15 }
const iosMuted: React.CSSProperties = { color: '#8e8e93', fontSize: 15 }
const valText: React.CSSProperties = { fontSize: 17, fontWeight: 500, color: '#1d1d1f' }
const valMoney: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: '#1d1d1f', whiteSpace: 'nowrap' }
const rightInput: React.CSSProperties = { width: 110, border: 'none', outline: 'none', background: 'rgba(120,120,128,0.08)', borderRadius: 8, padding: '8px 10px', fontSize: 17, fontWeight: 600, textAlign: 'right', color: '#1d1d1f', boxSizing: 'border-box' }
const hair = { height: 1, background: 'rgba(60,60,67,0.12)' } as React.CSSProperties
const rowBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 0', textAlign: 'left', boxSizing: 'border-box' }

const HIST = [
  { p: 'сентябрь 2026 г.', sum: '49000', st: 'не подтверждён', color: '#b25000' },
  { p: 'август 2026 г.', sum: '49000', st: 'вовремя · 06.08.2026', color: '#8e8e93' },
  { p: 'июль 2026 г.', sum: '49000', st: 'вовремя · 06.07.2026', color: '#8e8e93' },
]

export function DemoMode({ onExit }: { onExit: () => void }) {
  const [role, setRole] = useState<'tenant' | 'landlord'>('tenant')
  const [screen, setScreen] = useState<'list' | 'obj'>('list')
  const [tab, setTab] = useState('pay')
  const [objects, setObjects] = useState([
    { id: 'o1', address: 'Москва, ул. Ботаническая 41 корпус 7, апарт. 7376', status: 'Просрочка 3 дн. · 49000 ₽', color: '#c00', dep: 'депозит 49000 из 49000 ₽' },
    { id: 'o2', address: 'г. Химки, кв-л. Свистуха, стр. 1Д/2, м-м 226', status: 'Первый месяц — ждёт оплаты · 7000 ₽', color: '#a80', dep: '' },
  ])
  const [newAddress, setNewAddress] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [landConfirmed, setLandConfirmed] = useState(false)
  const [partial, setPartial] = useState(false)
  const [tenantClaimed, setTenantClaimed] = useState(false)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [readingsSent, setReadingsSent] = useState(false)
  const [meterOk, setMeterOk] = useState<Record<string, boolean>>({})
  const [histOpen, setHistOpen] = useState(false)
  const [chat, setChat] = useState([
    { mine: false, text: 'Здравствуйте! Получил счёт за сентябрь, оплатил сегодня.' },
    { mine: true, text: 'Спасибо! Подтвержу получение после встречи.' },
  ])
  const [chatInput, setChatInput] = useState('')

  const seg = (a: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
    fontSize: 15, fontWeight: 600, textAlign: 'center',
    background: a ? '#fff' : 'transparent', color: a ? '#1d1d1f' : '#8e8e93',
    boxShadow: a ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
  })

  function switchRole(r: 'tenant' | 'landlord') {
    setRole(r); setScreen('list'); setTab('pay')
  }
  function sendChat() {
    if (!chatInput.trim()) return
    setChat([...chat, { mine: role === 'tenant', text: chatInput.trim() }])
    setChatInput('')
  }

  const histCard = (
    <div style={T.card}>
      <div style={T.h2}>История платежей</div>
      {(histOpen ? HIST : HIST.slice(0, 1)).map((h, i) => (
        <div key={h.p} style={{ padding: '10px 0', borderBottom: i < (histOpen ? HIST : HIST.slice(0, 1)).length - 1 ? '1px solid rgba(60,60,67,0.12)' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1d1d1f' }}>{h.p}</span>
            <span style={valMoney}>{h.sum} ₽</span>
          </div>
          <div style={{ marginTop: 2 }}><span style={{ fontSize: 13, color: h.color }}>{h.st}</span></div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 2px' }}>
        <button style={actBlue} onClick={() => setHistOpen(!histOpen)}>{histOpen ? 'Свернуть историю' : 'Показать историю'}</button>
      </div>
    </div>
  )

  const chatCard = (
    <div style={T.card}>
      <div style={T.h2}>{role === 'tenant' ? 'Чат с арендодателем' : 'Чат с арендатором'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
        {chat.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.mine ? 'flex-end' : 'flex-start',
            background: m.mine ? '#0071e3' : '#e9e9eb',
            color: m.mine ? '#fff' : '#1d1d1f',
            borderRadius: '18px 18px 5px 18px', padding: '8px 12px', maxWidth: '82%', fontSize: 15,
          }}>{m.text}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 0 4px' }}>
        <input
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') sendChat() }}
          placeholder="Сообщение…"
          style={{ flex: 1, minWidth: 0, padding: '10px 14px', borderRadius: 18, border: '1px solid rgba(60,60,67,0.12)', background: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
        />
        <button onClick={sendChat} style={{ width: 38, height: 38, borderRadius: 19, border: 'none', background: '#0071e3', color: '#fff', fontSize: 15, cursor: 'pointer', flexShrink: 0 }}>↑</button>
      </div>
    </div>
  )

  const contractCard = (
    <div style={T.card}>
      <div style={T.h2}>Договор</div>
      <div style={T.row}><span style={iosMuted}>{role === 'tenant' ? 'Арендодатель' : 'Арендатор'}</span><span style={valText}>{role === 'tenant' ? 'Кобков Денис Александрович' : 'Душин Александр Игоревич'}</span></div>
      <div style={T.row}><span style={iosMuted}>Срок</span><span style={valText}>05.11.2025 — 05.10.2026</span></div>
      <div style={T.row}><span style={iosMuted}>Аренда</span><span style={valMoney}>49000 ₽/мес</span></div>
      <div style={T.row}><span style={iosMuted}>Оплата</span><span style={valText}>до 5 числа</span></div>
      <div style={{ padding: '8px 0 4px' }}>
        <Progress value={49000} max={49000} />
      </div>
    </div>
  )

  const contactsCard = (
    <div style={T.card}>
      <div style={T.h2}>Экстренные контакты</div>
      <div style={{ ...T.row, borderBottom: 'none' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: '#1d1d1f' }}>Диспетчер УК</div>
          <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>круглосуточно</div>
        </div>
        <span style={{ color: '#0071e3', fontSize: 17, fontWeight: 600 }}>+7 905 000-00-00</span>
      </div>
    </div>
  )

  return (
    <div style={{ ...T.page, paddingBottom: 90 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '8px 0 10px' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#b25000', background: 'rgba(255,149,0,0.15)', borderRadius: 8, padding: '4px 8px' }}>ДЕМО</span>
        <button onClick={onExit} style={{ border: 'none', background: 'transparent', color: '#0071e3', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 4 }}>Выйти из демо</button>
      </div>
      <div style={{ display: 'flex', gap: 6, background: 'rgba(120,120,128,0.12)', borderRadius: 14, padding: 6, margin: '0 0 12px' }}>
        <button style={seg(role === 'tenant')} onClick={() => switchRole('tenant')}>Арендатор</button>
        <button style={seg(role === 'landlord')} onClick={() => switchRole('landlord')}>Арендодатель</button>
      </div>

      {screen === 'list' && (
        <>
          <h1 style={T.h1}>{role === 'tenant' ? 'Моя аренда' : 'Мои объекты'}</h1>
          {(role === 'tenant' ? objects.slice(0, 1) : objects).map((o) => (
            <div key={o.id} style={T.card}>
              <button style={rowBtn} onClick={() => { setScreen('obj'); setTab('pay') }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#1d1d1f' }}>{o.address}</div>
                  <div style={{ fontSize: 13, color: o.color, marginTop: 4 }}>{o.status}</div>
                  {o.dep && <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 2 }}>{o.dep}</div>}
                </div>
                <span style={{ color: '#c7c7cc', fontSize: 18 }}>›</span>
              </button>
            </div>
          ))}
          {role === 'landlord' && (
            <div style={T.card}>
              <div style={{ ...T.row, borderBottom: 'none', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Новый объект</span>
                <button style={actBlue} onClick={() => setAddOpen(!addOpen)}>Добавить объект</button>
              </div>
              {addOpen && (
                <>
                  <div style={{ fontSize: 13, color: '#8e8e93', margin: '4px 0 2px' }}>Адрес объекта *</div>
                  <input
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="Квартира, дом, гараж, коммерция"
                    style={{ width: '100%', padding: '8px 0', border: 'none', borderBottom: '1px solid rgba(60,60,67,0.12)', background: 'transparent', fontSize: 15, color: '#1d1d1f', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <button
                    style={T.btn}
                    onClick={() => {
                      if (!newAddress.trim()) return
                      setObjects([...objects, { id: `o${objects.length + 1}`, address: newAddress.trim(), status: 'Первый месяц — ждёт оплаты · 49000 ₽', color: '#a80', dep: '' }])
                      setNewAddress(''); setAddOpen(false)
                    }}
                  >Сохранить</button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {screen === 'obj' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
            <button style={iosBlue} onClick={() => setScreen('list')}>{role === 'tenant' ? '← Моя аренда' : '← Мои объекты'}</button>
          </div>
          <h1 style={T.h1}>{objects[0].address}</h1>

          {tab === 'pay' && role === 'tenant' && (
            <>
              <div style={T.card}>
                <div style={T.h2}>Счёт за сентябрь 2026</div>
                <div style={T.row}><span style={iosMuted}>Аренда</span><span style={valMoney}>49000 ₽</span></div>
                <div style={T.row}><span style={iosMuted}>Коммунальные</span><span style={valMoney}>0 ₽</span></div>
                <div style={T.row}><span style={{ ...iosMuted, color: '#ff3b30' }}>Штраф</span><span style={{ ...valMoney, color: '#ff3b30' }}>500 ₽</span></div>
                <div style={T.row}><span style={{ ...valText, fontWeight: 700 }}>Итого</span><span style={valMoney}>49500 ₽</span></div>
                <div style={{ ...T.row, borderBottom: 'none' }}>
                  <span style={iosMuted}>Срок</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#ff3b30' }}>просрочка 3 дн.</span>
                </div>
                {!tenantClaimed ? (
                  <button style={T.btn} onClick={() => setTenantClaimed(true)}>Я оплатил</button>
                ) : (
                  <div style={T.noteGreen}>Заявка отправлена — арендодатель подтвердит получение.</div>
                )}
              </div>
              <div style={T.card}>
                <div style={T.h2}>Способ оплаты</div>
                <div style={{ ...T.row, borderBottom: 'none' }}><span style={valText}>Наличные</span></div>
              </div>
              {histCard}
            </>
          )}

          {tab === 'pay' && role === 'landlord' && (
            <>
              <div style={T.card}>
                <div style={T.h2}>Подтверждение оплаты · сентябрь 2026</div>
                <div style={T.row}>
                  <span style={valText}>Безналичная оплата</span>
                  <span style={iosMuted}>не заявлена</span>
                </div>
                <div style={{ ...T.row, borderBottom: 'none' }}>
                  <span style={valText}>Оплата наличными</span>
                  <span style={iosMuted}>не заявлена</span>
                </div>
                {!landConfirmed ? (
                  <>
                    <button style={T.btn} onClick={() => setLandConfirmed(true)}>Получил оплату за сентябрь вне приложения</button>
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
                      <button style={actBlue} onClick={() => setPartial(true)}>Учесть частичную оплату</button>
                    </div>
                    {partial && <div style={T.noteGreen}>Учтено: 20 000 из 49 500 ₽</div>}
                  </>
                ) : (
                  <div style={T.noteGreen}>Оплата подтверждена: арендатору расписка, создан следующий счёт.</div>
                )}
              </div>
              {histCard}
            </>
          )}

          {tab === 'meters' && role === 'tenant' && (
            <div style={T.card}>
              <div style={T.h2}>Показания за сентябрь</div>
              {[['hw', 'Холодная вода · ХВ-034944', '322'], ['gw', 'Горячая вода · ГВ-724271', '24']].map(([id, title, last], i) => (
                <div key={id}>
                  {i > 0 && <div style={hair} />}
                  <div style={{ padding: '10px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 17, fontWeight: 600, color: '#1d1d1f' }}>{title}</span>
                      <input style={rightInput} value={vals[id] || ''} onChange={(e) => setVals({ ...vals, [id]: e.target.value })} placeholder={last} inputMode="decimal" />
                    </div>
                    <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 4 }}>последнее: {last}</div>
                  </div>
                </div>
              ))}
              {!readingsSent ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 10px' }}>
                  <button style={iosBlue} onClick={() => setReadingsSent(true)}>Передать показания</button>
                </div>
              ) : (
                <div style={T.noteGreen}>Показания переданы арендодателю.</div>
              )}
            </div>
          )}

          {tab === 'meters' && role === 'landlord' && (
            <div style={T.card}>
              <div style={T.h2}>Показания за текущий месяц</div>
              {[['hw', 'Холодная вода · ХВ-034944', '325'], ['gw', 'Горячая вода · ГВ-724271', '27']].map(([id, title, v], i) => (
                <div key={id}>
                  {i > 0 && <div style={hair} />}
                  <div style={{ padding: '10px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 17, fontWeight: 600, color: '#1d1d1f' }}>{title}</span>
                      <span style={valMoney}>{v}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 13, color: '#8e8e93' }}>{meterOk[id] ? 'подтверждены' : 'ожидают'}</span>
                      {!meterOk[id] && <button style={actBlue} onClick={() => setMeterOk({ ...meterOk, [id]: true })}>Подтвердить</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'contract' && (
            <>
              {contractCard}
              {contactsCard}
              {role === 'landlord' && (
                <div style={T.card}>
                  <div style={T.h2}>Замороженные штрафы</div>
                  <div style={{ ...T.small, margin: '8px 0' }}>Замороженных штрафов нет</div>
                </div>
              )}
            </>
          )}

          {tab === 'chat' && chatCard}

          <BottomNav
            tabs={TABS}
            tab={tab}
            setTab={setTab}
            badges={{ pay: role === 'landlord' ? !landConfirmed : !tenantClaimed, meters: role === 'tenant' ? !readingsSent : false }}
          />
        </>
      )}
    </div>
  )
}

export default DemoMode
