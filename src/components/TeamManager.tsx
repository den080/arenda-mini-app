import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { useTeam } from '../hooks/useTeam'
import { T } from '../theme'
import { showToast, ConfirmDelete } from './ui'

const ROLE_LABEL: Record<string, string> = { owner: 'Владелец', manager: 'Менеджер', viewer: 'Наблюдатель' }
const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
const iosRed: React.CSSProperties = { border: 'none', background: 'transparent', color: '#ff3b30', fontSize: 15, cursor: 'pointer', padding: 4, flexShrink: 0 }
const hair = { height: 1, background: 'rgba(60,60,67,0.12)' } as React.CSSProperties
const head: React.CSSProperties = { fontSize: 13, color: '#8e8e93', margin: '14px 16px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }

export function TeamManager() {
  const { user } = useTelegramUser()
  const { teamId, role, members, refresh, selectPool } = useTeam()
  const [phone, setPhone] = useState('')
  const [newRole, setNewRole] = useState<'manager' | 'viewer'>('manager')
  const [del, setDel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (role === 'manager' || role === 'viewer') {
    return (
      <div>
        <div style={head}>Доступ</div>
        <div style={T.card}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f', margin: '12px 0 2px' }}>Совместный доступ</div>
          <div style={{ ...T.row, borderBottom: 'none' }}>
            <span style={{ fontSize: 15 }}>Вы подключены как </span>
            <b>{ROLE_LABEL[role] || role}</b>
          </div>
        </div>
      </div>
    )
  }

  async function invite() {
    if (busy) return
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) { showToast('Введите телефон полностью'); return }
    setBusy(true)
    try {
      let tid = teamId
      if (!tid) {
        const { data: t, error } = await supabase.from('teams').insert({ owner_id: user!.id, name: 'Пул аренды' }).select().single()
        if (error) { showToast('Ошибка: ' + error.message); return }
        tid = t.id
        await supabase.from('team_members').insert({ team_id: tid!, user_id: user!.id, role: 'owner' })
        await supabase.from('objects').update({ team_id: tid }).eq('landlord_id', user!.id)
        selectPool(tid!)
      }
      const norm = '+' + (digits.length === 11 ? digits : '7' + digits)
      const { data: all } = await supabase.from('users').select('*').not('phone', 'is', null)
      let target = (all || []).find((u: any) => (u.phone || '').replace(/\D/g, '').slice(-10) === digits.slice(-10))
      if (!target) {
        const { data: created, error } = await supabase.from('users').insert({ full_name: 'Команда', phone: norm, role: 'landlord' }).select().single()
        if (error) { showToast('Ошибка: ' + error.message); return }
        target = created
      }
      const { error: me } = await supabase.from('team_members').insert({ team_id: tid, user_id: target.id, role: newRole, added_by: user!.id })
      if (me) { showToast('Этот человек уже подключён или ошибка: ' + me.message); return }
      showToast(`✅ Доступ выдан: ${ROLE_LABEL[newRole]}`)
      setPhone('')
      refresh()
      window.dispatchEvent(new Event('rentflow-refresh'))
    } finally {
      setBusy(false)
    }
  }

  async function removeMember(id: string) {
    await supabase.from('team_members').delete().eq('id', id)
    showToast('Доступ отключён')
    refresh()
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  return (
    <div>
      <div style={head}>Доступ</div>
      <div style={T.card}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f', margin: '12px 0 2px' }}>Совместный доступ</div>
        {members.length === 0 && <div style={{ ...T.small, margin: '8px 0' }}>Пока только вы.</div>}
        {members.map((m: any, i: number) => (
          <div key={m.id}>
            {i > 0 && <div style={hair} />}
            <div style={T.row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{m.user?.full_name || '—'}</div>
                <div style={{ fontSize: 13, color: '#8e8e93' }}>{m.user?.phone || ''} · {ROLE_LABEL[m.role] || m.role}</div>
              </div>
              {m.role !== 'owner' && <button style={iosRed} onClick={() => setDel(m.id)}>отключить</button>}
            </div>
          </div>
        ))}
        <div style={{ ...hair, margin: '6px 0' }} />
        <div style={T.row}>
          <span style={{ fontSize: 15 }}>Телефон</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 ___ ___-__-__" inputMode="tel" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right', fontSize: 15, color: '#1d1d1f' }} />
        </div>
        <div style={T.row}>
          <span style={{ fontSize: 15 }}>Роль</span>
          <select value={newRole} onChange={(e) => setNewRole(e.target.value as any)} style={{ border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, outline: 'none', textAlign: 'right', flex: 1, minWidth: 0 }}>
            <option value="manager">Менеджер</option>
            <option value="viewer">Наблюдатель</option>
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 10px' }}>
          <button style={iosBlue} disabled={busy} onClick={invite}>Выдать доступ</button>
        </div>
        <div style={{ ...T.tiny, margin: '0 0 10px' }}>Сотрудник открывает бота со своего телефона: первый раз входит по номеру, дальше — автоматически. Менеджер работает как вы, но без выдачи доступа и удалений; наблюдатель — только просмотр.</div>
        <ConfirmDelete
          open={!!del}
          text="Сотрудник сразу потеряет доступ к пулу."
          onClose={() => setDel(null)}
          onConfirm={() => { if (del) removeMember(del) }}
        />
      </div>
    </div>
  )
}

export default TeamManager
