import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from './useTelegramUser'

export function useTeam() {
  const { user } = useTelegramUser()
  const [teamId, setTeamId] = useState<string | null>(null)
  const [role, setRole] = useState<'owner' | 'manager' | 'viewer' | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [teamName, setTeamName] = useState('Пул аренды')
  const [loading, setLoading] = useState(true)

  async function refresh() {
    if (!user) { setTeamId(null); setRole(null); setMembers([]); setLoading(false); return }
    let tid: string | null = null
    let r: any = null
    const { data: owned } = await supabase.from('teams').select('*').eq('owner_id', user.id).limit(1)
    if (owned && owned.length) { tid = owned[0].id; r = 'owner' }
    else {
      const { data: mem } = await supabase.from('team_members').select('*').eq('user_id', user.id).limit(1)
      if (mem && mem.length) { tid = mem[0].team_id; r = mem[0].role }
    }
    let ms: any[] = []
    if (tid) {
      const { data: t } = await supabase.from('teams').select('name').eq('id', tid).maybeSingle()
      if (t?.name) setTeamName(t.name)
      const { data: m } = await supabase.from('team_members').select('*, user:users(full_name, phone)').eq('team_id', tid).order('added_at', { ascending: true })
      ms = m || []
    }
    setTeamId(tid)
    setRole(r)
    setMembers(ms)
    setLoading(false)
  }

  useEffect(() => { refresh() }, [user?.id])

  return { teamId, role, members, teamName, loading, refresh }
}

export default useTeam
