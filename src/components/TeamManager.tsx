import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { T } from '../theme'
import { showToast, errText, ConfirmDelete } from './ui'

interface MemberRow {
  user_id: string
  full_name: string | null
  phone: string | null
  email: string | null
  role: string | null
}

export function TeamManager() {
  const { user } = useTelegramUser()
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [ownerInfo, setOwnerInfo] = useState<{ id: string; full_name: string | null; phone: string | null } | null>(null)
  const [newPhone, setNewPhone] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<'manager' | 'viewer'>('manager')
  const [busy, setBusy] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  async function resolveOrCreateTeam(ownerUid: string): Promise<string | null> {
    try {
      const { data: existing } = await supabase
        .from('teams')
        .select('id')
        .eq('owner_id', ownerUid)
        .order('created_at', { ascending: true })
        .limit(1)

      if (existing && existing.length > 0) return existing[0].id

      const { data: created, error: e2 } = await supabase
        .from('teams')
        .insert({ owner_id: ownerUid, name: 'Пул аренды' })
        .select('id')
        .single()

      if (e2) throw e2
      return created?.id ?? null
    } catch (err: any) {
      showToast('Ошибка определения команды: ' + errText(err))
      return null
    }
  }

  async function loadAll() {
    if (!user) return
    setLoading(true)
    try {
      let ownerId = user.id
      
      if (user.role !== 'landlord' && user.role !== 'admin') {
        const { data: tm } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()
        if (tm?.team_id) {
          const { data: t } = await supabase.from('teams').select('owner_id').eq('id', tm.team_id).maybeSingle()
          if (t?.owner_id) ownerId = t.owner_id
        }
      }

      const { data: ow } = await supabase.from('users').select('id, full_name, phone').eq('id', ownerId).maybeSingle()
      setOwnerInfo(ow)

      const tid = await resolveOrCreateTeam(ownerId)
      setTeamId(tid)
      if (!tid) { setMembers([]); setLoading(false); return }

      const { data: rows, error } = await supabase
        .from('team_members')
        .select('user_id, role, users(full_name, phone, email)')
        .eq('team_id', tid)
      
      if (error) throw error

      const mapped: MemberRow[] = (rows || []).map((r: any) => ({
        user_id: r.user_id,
        full_name: r.users?.full_name || null,
        phone: r.users?.phone || null,
        email: r.users?.email || null,
        role: r.role,
      }))
      setMembers(mapped)
    } catch (e: any) {
      showToast(errText(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [user?.id])

  async function addMember() {
    if (!teamId || !user) { showToast('Команда не определена'); return }
    const cleanPhone = String(newPhone).replace(/\D/g, '')
    if (cleanPhone.length < 10) { showToast('Введите корректный телефон'); return }
    if (busy) return
    setBusy(true)
    try {
      const last10 = cleanPhone.slice(-10)
      let targetUserId: string | null = null
      
      for (const candidate of [`+7${last10}`, `8${last10}`, last10]) {
        const q = await supabase.from('users').select('id').eq('phone', candidate).limit(1).maybeSingle()
        if (q.data?.id) { targetUserId = q.data.id; break }
      }

      if (!targetUserId) {
        const { data: created, error: ce } = await supabase
          .from('users')
          .insert({
            phone: `+7${last10}`,
            full_name: newName.trim() || null,
            role: newRole === 'viewer' ? 'viewer' : 'manager',
          })
          .select('id')
          .single()
        if (ce) throw ce
        targetUserId = created?.id ?? null
      } else if (newName.trim()) {
        await supabase.from('users').update({ full_name: newName.trim() }).eq('id', targetUserId).then(() => {}, () => {})
      }

      if (!targetUserId) throw new Error('Не удалось получить ID пользователя')

      const dupCheck = await supabase
        .from('team_members')
        .select('id')
        .eq('user_id', targetUserId)
        .eq('team_id', teamId)
        .limit(1)
        .maybeSingle()

      if (dupCheck.data) {
        showToast('Этот человек уже состоит в команде')
        setNewPhone(''); setNewName('')
        return
      }

      const { error: te } = await supabase
        .from('team_members')
        .insert({ user_id: targetUserId, team_id: teamId, role: newRole })
      if (te) throw te

      showToast(`✅ Доступ выдан: ${newRole === 'viewer' ? 'наблюдатель' : 'менеджер'}`)
      setNewPhone(''); setNewName(''); setNewRole('manager')
      await loadAll()
    } catch (e: any) {
      showToast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  async function removeMember(uid: string) {
    if (!teamId) return
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('user_id', uid)
        .eq('team_id', teamId)
      if (error) throw error
      showToast('✅ Участник удалён из команды')
      setRemoveId(null)
      await loadAll()
    } catch (e: any) {
      showToast(errText(e))
    }
  }

  // === ДИЗАЙН-ТОКЕНЫ (единая шкала Apple HIG) ===
  const iosBlue: React.CSSProperties = { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4, flexShrink: 0 }
  const actRed: React.CSSProperties = { border: 'none', background: 'transparent', color: '#ff3b30', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: '4px 0', flexShrink: 0 }
  const inpStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 17, boxSizing: 'border-box' }
  const secHead: React.CSSProperties = { fontSize: 13, color: '#8e8e93', margin: '14px 16px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }

  if (loading) return <div style={{ ...T.card }}><div style={T.small}>Загрузка состава команды...</div></div>

  return (
    <>
      <div style={secHead}>Доступ</div>
      <div style={T.card}>
        <div style={T.h2}>Совместный доступ</div>
        
        {/* --- Блок Владельца --- */}
        {ownerInfo && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>{ownerInfo.full_name || 'Вы'}</div>
            <div style={{ fontSize: 13, color: '#8e8e93' }}>{ownerInfo.phone} · Владелец</div>
          </div>
        )}
        
        {/* --- Список Менеджеров --- */}
        {members.filter(m => m.user_id !== ownerInfo?.id).length === 0 && (
          <div style={{ fontSize: 13, color: '#8e8e93', fontStyle: 'italic', padding: '8px 0' }}>
            Пока нет других участников — добавьте менеджера ниже
          </div>
        )}
        {members.filter(m => m.user_id !== ownerInfo?.id).map(m => (
          <div key={m.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid rgba(60,60,67,0.12)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#1d1d1f' }}>{m.full_name || '—'}</div>
              <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>
                {m.phone || '—'} · {m.role === 'viewer' ? 'Наблюдатель' : 'Менеджер'}
              </div>
            </div>
            {/* ИСПРАВЛЕНО: Компактная текстовая ссылка вместо большой кнопки */}
            <button style={actRed} onClick={() => setRemoveId(m.user_id)}>Отключить</button>
          </div>
        ))}

        {/* --- Форма Добавления --- */}
        <div style={{ paddingTop: 12 }}>
          <div style={{ fontSize: 13, color: '#8e8e93', margin: '4px 0 2px' }}>Телефон</div>
          <input style={inpStyle} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+7 ___ ___-__-__" inputMode="tel" />
          <div style={{ fontSize: 13, color: '#8e8e93', margin: '8px 0 2px' }}>Имя (необязательно)</div>
          <input style={inpStyle} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Например: Мария" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 15, color: '#1d1d1f' }}>Роль</span>
            <select style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 17, background: '#fff' }} value={newRole} onChange={(e) => setNewRole(e.target.value as any)}>
              <option value="manager">Менеджер</option>
              <option value="viewer">Наблюдатель</option>
            </select>
          </div>
          <button
            disabled={busy}
            style={{ width: '100%', marginTop: 12, padding: 12, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1 }}
            onClick={addMember}
          >{busy ? 'Выдача...' : 'Выдать доступ'}</button>
        </div>

        {/* --- Раскрывающийся текст --- */}
        <button style={{ ...iosBlue, alignSelf: 'flex-start', marginTop: 8 }} onClick={() => setShowDetails(!showDetails)}>
          {showDetails ? '› Свернуть' : '› Подробнее'}
        </button>
        {showDetails && (
          <div style={{ marginTop: 8, fontSize: 13, color: '#8e8e93', lineHeight: 1.45 }}>
            • Менеджеры видят все объекты пула и могут подтверждать оплаты.<br/>
            • Наблюдатели читают данные, но не изменяют их.<br/>
            • Новый участник должен один раз открыть мини-апп через бота Roomio.<br/>
            • Все менеджеры одного владельца находятся в общей команде «Пул аренды».
          </div>
        )}
      </div>

      <ConfirmDelete
        open={!!removeId}
        text="Человек потеряет доступ к объектам команды."
        onClose={() => setRemoveId(null)}
        onConfirm={() => { if (removeId) removeMember(removeId) }}
      />
    </>
  )
}

export default TeamManager
