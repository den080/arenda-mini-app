import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../theme'

interface Alarm { sev: 0 | 1 | 2; title: string; sub: string; chip: string }

export function AdminAlarms() {
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const today = new Date()
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const periodISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const { data: cons } = await supabase
      .from('contracts')
      .select('*, objects(address), tenant:users(full_name, phone)')
      .eq('status', 'active')
    const ids = (cons || []).map((c: any) => c.id)
    let paysBy: Record<string, any[]> = {}
    let readBy: Record<string, number> = {}
    let defBy: Record<string, any[]> = {}
    if (ids.length) {
      const [paysRes, readRes, defRes] = await Promise.all([
        supabase.from('payments').select('*').in('contract_id', ids).eq('confirmed_by_landlord', false),
        supabase.from('meter_readings').select('contract_id').in('contract_id', ids).eq('period', periodISO),
        supabase.from('deferred_requests').select('*').in('contract_id', ids).eq('status', 'proposed'),
      ])
      for (const p of paysRes.data || []) (paysBy[p.contract_id] = paysBy[p.contract_id] || []).push(p)
      for (const r of readRes.data || []) readBy[r.contract_id] = (readBy[r.contract_id] || 0) + 1
      for (const d of defRes.data || []) (defBy[d.contract_id] = defBy[d.contract_id] || []).push(d)
    }
    const list: Alarm[] = []
    for (const c of cons || []) {
      const addr = (c as any).objects?.address || 'Объект'
      const who = (c as any).tenant?.full_name || 'арендатор'
      const open = (paysBy[c.id] || []).slice().sort((a: any, b: any) => String(a.period).localeCompare(String(b.period)))
      const first = open[0]
      if (first) {
        const days = Math.round((todayMid.getTime() - new Date(String(first.due_date).slice(0, 10) + 'T00:00:00').getTime()) / 86400000)
        if (days > 0) {
          list.push({ sev: days >= 60 ? 0 : days >= 7 ? 1 : 2, title: addr, sub: `${who} · просрочка ${days} дн.`, chip: days >= 60 ? 'критично' : 'просрочка' })
        }
      }
      if ((c.readings_mode || 'manual') === 'manual' && c.meter_deadline_day && today.getDate() > Number(c.meter_deadline_day) && !(readBy[c.id] > 0) && open.length) {
        list.push({ sev: 2, title: addr, sub: `${who} · показания за этот месяц не переданы`, chip: 'показания' })
      }
      if ((defBy[c.id] || []).length) {
        list.push({ sev: 1, title: addr, sub: `${who} · ждёт решения по отсрочке штрафа`, chip: 'отсрочка' })
      }
      if (c.end_date) {
        const left = Math.round((new Date(String(c.end_date).slice(0, 10) + 'T00:00:00').getTime() - todayMid.getTime()) / 86400000)
        if (left >= 0 && left <= 30) list.push({ sev: 2, title: addr, sub: `${who} · договор заканчивается через ${left} дн.`, chip: 'срок' })
      }
    }
    list.sort((a, b) => a.sev - b.sev)
    setAlarms(list)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const on = () => load()
    window.addEventListener('rentflow-refresh', on)
    return () => window.removeEventListener('rentflow-refresh', on)
  }, [])

  const chipStyle = (sev: number): React.CSSProperties => ({
    fontSize: 12, fontWeight: 600, borderRadius: 8, padding: '3px 8px', flexShrink: 0,
    background: sev === 0 ? 'rgba(255,59,48,0.12)' : sev === 1 ? 'rgba(255,149,0,0.12)' : 'rgba(255,204,0,0.15)',
    color: sev === 0 ? '#ff3b30' : sev === 1 ? '#b25000' : '#8a6d00',
  })

  return (
    <div style={T.card}>
      <div style={T.h2}>Тревоги</div>
      {loading && <div style={{ ...T.small, margin: '8px 0' }}>Проверяю…</div>}
      {!loading && alarms.length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Тревог нет — всё спокойно 🎉</div>}
      {!loading && alarms.map((a, i) => (
        <div key={i} style={{ ...T.row, ...(i === alarms.length - 1 ? { borderBottom: 'none' } : {}) }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{a.title}</div>
            <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>{a.sub}</div>
          </div>
          <span style={chipStyle(a.sev)}>{a.chip}</span>
        </div>
      ))}
    </div>
  )
}

export default AdminAlarms
