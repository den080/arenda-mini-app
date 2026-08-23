import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from './useTelegramUser'

export interface Pool { id: string; name: string; role: 'own' | 'owner' | 'manager' | 'viewer' }

export function useTeam() {
  const { user } = useTelegramUser()
  const [pools, setPools] = useState<Pool[]>([])
  const [pool, setPool] = useState<string>(() => { try { return localStorage.getItem('rentflow_pool') || 'own' } catch { return 'own' } })
  const [members, setMembers] = useState<any[]>([])
  const [teamName, setTeamName] = useState('Пул аренды')
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  async function refresh() { setTick(t => t + 1) }

  useEffect(() => {
    if (!user) { setPools([]); setMembers([]); setLoading(false); return }
    ;(async () => {
      const [ownRes, memRes] = await Promise.all([
        supabase.from('teams').select('*').eq('owner_id', user.id).order('created_at', { ascending: true }),
        supabase.from('team_members').select('role, team:teams(*)').eq('user_id', user.id),
      ])
      const list: Pool[] = [{ id: 'own', name: 'Мои объекты', role: 'own' }]
      for (const t of ownRes.data || []) list.push({ id: t.id, name: t.name || 'Пул аренды', role: 'owner' })
      for (const m of memRes.data || []) {
        const t = (m as any).team
        if (t && !list.some(p => p.id === t.id)) list.push({ id: t.id, name: t.name || 'Пул аренды', role: m.role })
      }
      setPools(list)
      setPool(p => (list.some(x => x.id === p) ? p : 'own'))
      setLoading(false)
    })()
  }, [user?.id, tick])

  const teamId = pool !== 'own' ? pool : null
  const current = pools.find(p => p.id === pool) || null
  const role: 'owner' | 'manager' | 'viewer' | null = !current ? null : current.role === 'own' ? null : current.role

  useEffect(() => {
    if (!teamId) { setMembers([]); return }
    ;(async () => {
      const { data: t } = await supabase.from('teams').select('name').eq('id', teamId).maybeSingle()
      if (t?.name) setTeamName(t.name)
      const { data: m } = await supabase.from('team_members').select('*, user:users(full_name, phone)').eq('team_id', teamId).order('added_at', { ascending: true })
      setMembers(m || [])
    })()
  }, [teamId, tick])

  function selectPool(id: string) {
    setPool(id)
    try { localStorage.setItem('rentflow_pool', id) } catch {}
  }

  return { teamId, pool, pools, selectPool, role, members, teamName, loading, refresh }
}

export default useTeam
