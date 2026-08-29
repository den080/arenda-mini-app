import { useState } from 'react'
import { T } from '../theme'
import { showToast } from './ui'

const seg = (a: boolean): React.CSSProperties => ({
  flex: 1, padding: '10px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
  fontSize: 15, fontWeight: 600, textAlign: 'center',
  background: a ? '#fff' : 'transparent', color: a ? '#1d1d1f' : '#8e8e93',
  boxShadow: a ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
})

export function DemoTour({ onExit }: { onExit: () => void }) {
  const [role, setRole] = useState<'landlord' | 'tenant'>('landlord')
  const tap = () => showToast('Это демо-режим: данные тестовые. Регистрация — по e-mail за минуту.')

  return (
    <div style={{ ...T.page, paddingBottom: 60 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'rgba(255,149,0,0.15)', borderRadius: 12, padding: '8px 12px', margin: '0 0 10px' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#b25000' }}>Демо-режим: продукт без регистрации</span>
        <button onClick={onExit} style={{ border: 'none', background: '#fff', color: '#b25000', fontWeight: 700, fontSize: 13, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', flexShrink: 0 }}>Выйти</button>
      </div>

      <div style={{ display: 'flex', gap: 6, background: 'rgba(120,120,128,0.12)', borderRadius: 14, padding: 6, margin: '0 0 10px' }}>
        <button style={seg(role === 'landlord')} onClick={() => setRole('landlord')}>Арендодатель</button>
        <button style={seg(role === 'tenant')} onClick={() => setRole('tenant')}>Арендатор</button>
      </div>

      {role === 'landlord' && (
        <>
          <div style={T.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={T.h2}>Ждут подтверждения: 2</div>
              <span style={{ color: '#0071e3', fontSize: 14, fontWeight: 600 }}>открыть ›</span>
            </div>
            <div style={T.row}><span style={{ fontSize: 15, fontWeight: 600 }}>Реутов, ул. Лесная д.11, кв.4</span><span style={{ fontSize: 14, color: '#8e8e93' }}>сентябрь · 67 000 ₽</span></div>
            <div style={{ ...T.row, borderBottom: 'none' }}><span style={{ fontSize: 15, fontWeight: 600 }}>Москва, ул. Тверская 7, кв.12</span><span style={{ fontSize: 14, color: '#8e8e93' }}>сентябрь · 45 000 ₽</span></div>
            <div style={T.tiny}>Центр подтверждений (Pro): отметили галочками полученные оплаты — «Подтвердить выбранные». Частичные — внутрь объекта.</div>
          </div>

          <div style={T.card}>
            <div style={T.h2}>Объекты</div>
            <div style={T.row}><span style={{ fontSize: 15, fontWeight: 600 }}>Реутов, ул. Лесная д.11, кв.4</span><span style={{ fontSize: 13, color: '#080' }}>До оплаты 8 дн. · 67 000 ₽</span></div>
            <div style={{ ...T.row, borderBottom: 'none' }}><span style={{ fontSize: 15, fontWeight: 600 }}>Москва, ул. Тверская 7, кв.12</span><span style={{ fontSize: 13, color: '#a80' }}>Ждём показания · 45 000 ₽</span></div>
          </div>

          <div style={T.card}>
            <div style={T.h2}>Замороженные штрафы</div>
            <div style={T.row}><span style={{ fontSize: 15 }}>август 2026 · просрочка показаний</span><span style={{ fontSize: 16, fontWeight: 600 }}>1 300 ₽</span></div>
            <div style={T.tiny}>Штраф не давит на арендатора сразу: учитывается только при съезде из депозита. Каждое изменение — с причиной и датой, история неизменяема.</div>
          </div>

          <div style={T.card}>
            <div style={T.h2}>Тариф Pro</div>
            <div style={T.small}>Массовое подтверждение оплат, совместный доступ (менеджер/наблюдатель), пулы аренды. Бесплатно — весь учёт, но подтверждения вручную внутри объекта.</div>
          </div>
        </>
      )}

      {role === 'tenant' && (
        <>
          <div style={T.card}>
            <div style={T.h2}>Моя аренда</div>
            <div style={T.row}><span style={{ fontSize: 15, fontWeight: 600 }}>Реутов, ул. Лесная д.11, кв.4</span></div>
            <div style={{ ...T.row, borderBottom: 'none' }}><span style={{ fontSize: 14, color: '#8e8e93' }}>Срок: 05.11.2025 — 05.10.2026 · оплата до 5 числа</span></div>
          </div>

          <div style={T.card}>
            <div style={T.h2}>Счёт за сентябрь 2026</div>
            <div style={T.row}><span style={{ fontSize: 15 }}>Аренда</span><span style={{ fontSize: 16, fontWeight: 600 }}>67 000 ₽</span></div>
            <div style={T.row}><span style={{ fontSize: 15 }}>Ресурсы по квитанции</span><span style={{ fontSize: 16, fontWeight: 600 }}>4 200 ₽</span></div>
            <div style={{ ...T.row, borderBottom: 'none' }}><span style={{ fontSize: 15, fontWeight: 700 }}>Итого</span><span style={{ fontSize: 16, fontWeight: 700 }}>71 200 ₽</span></div>
            <button style={T.btn} onClick={tap}>Я оплатил</button>
            <div style={T.tiny}>Арендодатель получит уведомление и подтвердит оплату — придёт расписка и создастся следующий счёт.</div>
          </div>

          <div style={T.card}>
            <div style={T.h2}>Показания за сентябрь</div>
            <div style={T.row}><span style={{ fontSize: 15 }}>Холодная вода · ХВ-034944</span><span style={{ fontSize: 15, color: '#8e8e93' }}>прошлые: 322</span></div>
            <div style={{ ...T.row, borderBottom: 'none' }}><span style={{ fontSize: 15 }}>Горячая вода · ГВ-724271</span><span style={{ fontSize: 15, color: '#8e8e93' }}>прошлые: 24</span></div>
            <button style={T.btn} onClick={tap}>Передать показания</button>
            <div style={T.tiny}>Не передадите к дедлайну — начислится замороженный штраф (увидите его только при съезде).</div>
          </div>
        </>
      )}

      <div style={T.card}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1d1f' }}>Понравилось?</div>
        <div style={{ fontSize: 14, color: '#8e8e93', margin: '6px 0 10px' }}>Регистрация занимает минуту: e-mail + код. Тестовые данные заменятся вашими реальными объектами и договорами.</div>
        <button style={T.btn} onClick={onExit}>Создать аккаунт</button>
      </div>
    </div>
  )
}

export default DemoTour
