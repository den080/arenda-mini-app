import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../theme'

const iosMuted: React.CSSProperties = { color: '#8e8e93', fontSize: 14 }
const secHead: React.CSSProperties = { fontSize: 13, color: '#8e8e93', margin: '14px 16px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }

export function FamilyDetector() {
  const [fams, setFams] = useState<any[]>([])
  const [tgDups, setTgDups] = useState<any[][]>([])
  const [phDups, setPhDups] = useState<any[][]>([])
  const [ready, setReady] = useState(false)

  async function load() {
    const [cRes, uRes] = await Promise.all([
      supabase.from('contracts').select('id, tenant_id, obj:objects(landlord_id, address), tenant:users!tenant_id(full_name, phone)'),
      supabase.from('users').select('id, full_name, phone, telegram_id, role'),
    ])
    // 1) один арендатор у нескольких «разных» арендодателей
    const fam: Record<string, any> = {}
    for (const c of cRes.data || []) {
      const raw = String((c as any).tenant?.phone || '')
      const digits = raw.replace(/\D/g, '')
      if (!digits) continue
      const key = digits.slice(-10)
      if (!fam[key]) fam[key] = { name: (c as any).tenant?.full_name || '—', phone: raw, landlords: {} as Record<string, string>, contracts: 0 }
      fam[key].contracts++
      const lid = (c as any).obj?.landlord_id
      if (lid) fam[key].landlords[lid] = (c as any).obj?.address || 'объект'
    }
    const famRows = Object.values(fam)
      .map((f: any) => ({ ...f, landlordList: Object.entries(f.landlords) }))
      .filter((f: any) => f.landlordList.length > 1)
      .sort((a: any, b: any) => b.landlordList.length - a.landlordList.length)
    setFams(famRows)
    // 2) один Telegram — несколько аккаунтов
    const byTg: Record<string, any[]> = {}
    for (const u of uRes.data || []) {
      const tg = String((u as any).telegram_id || '')
      if (tg) { (byTg[tg] = byTg[tg] || []).push(u) }
    }
    setTgDups(Object.values(byTg).filter(a => a.length > 1))
    // 3) один телефон — несколько аккаунтов
    const byPh: Record<string, any[]> = {}
    for (const u of uRes.data || []) {
      const p = String((u as any).phone || '').replace(/\D/g, '').slice(-10)
      if (p) { (byPh[p] = byPh[p] || []).push(u) }
    }
    setPhDups(Object.values(byPh).filter(a => a.length > 1))
    setReady(true)
  }

  useEffect(() => { load() }, [])

  if (!ready) return null
  const empty = fams.length === 0 && tgDups.length === 0 && phDups.length === 0

  return (
    <div>
      <div style={secHead}>Контроль бесплатных аккаунтов</div>
      <div style={T.card}>
        <div style={T.h2}>Детектор «семей»</div>
        <div style={{ ...T.tiny, margin: '0 0 10px' }}>Подозрительные связки: один арендатор у нескольких «разных» арендодателей или несколько аккаунтов с одного Telegram/телефона. Обычно это один человек, обходящий лимит Free. Действие — предложить Pro и объединить объекты в один кабинет.</div>
        {empty && <div style={{ ...T.small, margin: '8px 0' }}>Подозрительных связок не найдено.</div>}

        {fams.length > 0 && (
          <>
            <div style={{ ...iosMuted, margin: '10px 0 4px', fontWeight: 600 }}>Арендатор обслуживает несколько арендодателей</div>
            {fams.map((f: any) => (
              <div key={f.phone} style={{ padding: '8px 0', borderBottom: '1px solid rgba(60,60,67,0.12)' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{f.name} · {f.phone}</div>
                <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>договоров: {f.contracts} · арендодателей: {f.landlordList.length}</div>
                {f.landlordList.map(([lid, addr]: [string, any]) => (
                  <div key={lid} style={{ fontSize: 13, color: '#1d1d1f', marginTop: 2 }}>— {addr}</div>
                ))}
              </div>
            ))}
          </>
        )}

        {tgDups.length > 0 && (
          <>
            <div style={{ ...iosMuted, margin: '12px 0 4px', fontWeight: 600 }}>Один Telegram — несколько аккаунтов</div>
            {tgDups.map((arr, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(60,60,67,0.12)' }}>
                {arr.map((u: any) => (
                  <div key={u.id} style={{ fontSize: 14, color: '#1d1d1f' }}>{u.full_name || '—'} · {u.phone || 'без телефона'} · {u.role}</div>
                ))}
              </div>
            ))}
          </>
        )}

        {phDups.length > 0 && (
          <>
            <div style={{ ...iosMuted, margin: '12px 0 4px', fontWeight: 600 }}>Один телефон — несколько аккаунтов</div>
            {phDups.map((arr, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(60,60,67,0.12)' }}>
                {arr.map((u: any) => (
                  <div key={u.id} style={{ fontSize: 14, color: '#1d1d1f' }}>{u.full_name || '—'} · {u.phone} · {u.role}</div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export default FamilyDetector
