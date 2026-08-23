import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTelegramUser } from '../hooks/useTelegramUser'
import { useTeam } from '../hooks/useTeam'
import { T } from '../theme'
import { Modal, showToast } from './ui'
import { OWNER_PHONE, PRO_PRICE, SBP_PHONE, S, normalizePhone, iso, compress } from './objectShared'

export function SubscriptionBlock() {
  const { user } = useTelegramUser()
  const { teamId } = useTeam()
  const [sub, setSub] = useState<any | null>(null)
  const [subOwnerId, setSubOwnerId] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [payBusy, setPayBusy] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [requests, setRequests] = useState<any[]>([])
  const [view, setView] = useState<string | null>(null)

  const isOwner = !!user && normalizePhone(user.phone || '') === normalizePhone(OWNER_PHONE)

  async function load() {
    if (!user) return
    let owner = user.id
    if (teamId) {
      const { data: t } = await supabase.from('teams').select('owner_id').eq('id', teamId).maybeSingle()
      if (t) owner = t.owner_id
    }
    setSubOwnerId(owner)
    const { data: s } = await supabase.from('subscriptions').select('*').eq('owner_id', owner).order('until_date', { ascending: false }).maybeSingle()
    const today = iso(new Date())
    setSub(s && s.until_date >= today ? s : null)
    if (isOwner) {
      const { data: r } = await supabase.from('feedback').select('*').eq('status', 'new').ilike('message', 'ПОДПИСКА%').order('created_at', { ascending: true })
      setRequests(r || [])
    }
  }

  useEffect(() => { load() }, [user, teamId])

  async function payPro() {
    if (payBusy || !subOwnerId) return
    setPayBusy(true)
    try {
      const r = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: subOwnerId }),
      })
      const data = await r.json()
      if (!r.ok || !data.confirmation_url) { showToast('Ошибка оплаты: ' + (data.error || 'не удалось создать платёж')); return }
      const tg = (window as any).Telegram?.WebApp
      if (tg && typeof tg.openLink === 'function') tg.openLink(data.confirmation_url)
      else window.open(data.confirmation_url, '_blank')
      showToast('После оплаты подписка включится автоматически')
      startPolling()
      setPayOpen(false)
    } catch (e) {
      showToast('Ошибка: ' + String(e))
    } finally {
      setPayBusy(false)
    }
  }

  function startPolling() {
    let tries = 0
    const t = setInterval(async () => {
      tries++
      await load()
      const today = iso(new Date())
      const active = sub && sub.until_date >= today
      if (active || tries > 40) clearInterval(t)
    }, 5000)
  }

  async function sendCheck(file: File) {
    if (busy || !user) return
    setBusy(true)
    try {
      const blob = await compress(file)
      const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      const { error: upErr } = await supabase.storage.from('feedback').upload(id, blob, { contentType: 'image/jpeg' })
      if (upErr) { showToast('Ошибка загрузки: ' + upErr.message); return }
      const url = supabase.storage.from('feedback').getPublicUrl(id).data.publicUrl
      const { error } = await supabase.from('feedback').insert({
        user_id: user.id,
        sender_name: user.full_name || 'Арендодатель',
        sender_phone: user.phone || '',
        message: `ПОДПИСКА: Pro ${PRO_PRICE} ₽/мес (ручная оплата)`,
        image_url: url,
      })
      if (error) { showToast('Ошибка: ' + error.message); return }
      showToast('✅ Чек отправлен. Активация — в течение часа')
      setPayOpen(false)
    } catch (e) {
      showToast('Ошибка: ' + String(e))
    } finally {
      setBusy(false)
    }
  }

  async function activate(userId: string, fbId: string) {
    const today = new Date()
    const todayS = iso(today)
    const { data: ex } = await supabase.from('subscriptions').select('*').eq('owner_id', userId).order('until_date', { ascending: false }).maybeSingle()
    const base = ex && ex.until_date >= todayS ? new Date(ex.until_date + 'T12:00:00') : today
    const until = new Date(base.getTime() + 30 * 86400000)
    if (ex) {
      await supabase.from('subscriptions').update({ until_date: iso(until), updated_at: new Date().toISOString() }).eq('id', ex.id)
    } else {
      await supabase.from('subscriptions').insert({ owner_id: userId, plan: 'pro', until_date: iso(until) })
    }
    await supabase.from('feedback').update({ status: 'done' }).eq('id', fbId)
    showToast('✅ Подписка активирована на 30 дней')
    load()
    window.dispatchEvent(new Event('rentflow-refresh'))
  }

  return (
    <div style={{ ...T.row, borderBottom: 'none', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: '#8e8e93' }}>
        {sub ? `Тариф Pro · до ${new Date(sub.until_date + 'T12:00:00').toLocaleDateString('ru-RU')}` : 'Тариф Free · 1 объект'}
      </span>
      <button style={S.blue} onClick={() => setPayOpen(true)}>{sub ? 'Продлить' : 'Оформить Pro'}</button>
      <Modal open={payOpen} title={sub ? 'Продление Pro' : 'Тариф Pro'} onClose={() => setPayOpen(false)}>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 10 }}>
          Pro — {PRO_PRICE} ₽/мес: объекты без лимита, совместный доступ, приоритетная поддержка. Free — 1 объект.
        </div>
        <button
          disabled={payBusy}
          onClick={payPro}
          style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 8, opacity: payBusy ? 0.6 : 1 }}
        >{payBusy ? 'Создание платежа…' : `Оплатить ${PRO_PRICE} ₽ (СБП / карта)`}</button>
        <div style={{ ...T.tiny, margin: '0 0 10px', textAlign: 'center' }}>Оплата через ЮKassa. Подписка включится автоматически после оплаты.</div>
        <div style={{ textAlign: 'center' }}>
          <button style={S.blue} onClick={() => setManualOpen(!manualOpen)}>Оплатили вручную? Приложить чек</button>
        </div>
        {manualOpen && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>Перевод по СБП: <b>{SBP_PHONE}</b> (Роман)</div>
            <label style={{ display: 'block', textAlign: 'center', padding: 12, borderRadius: 10, background: '#e8e8ed', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
              {busy ? 'Отправка…' : 'Приложить чек'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) sendCheck(f); e.target.value = '' }} />
            </label>
          </div>
        )}
        {isOwner && (
          <div style={{ marginTop: 16, borderTop: '1px solid rgba(60,60,67,0.12)', paddingTop: 10 }}>
            <div style={{ fontSize: 13, color: '#8e8e93', marginBottom: 6 }}>Ручные заявки ({requests.length})</div>
            {requests.length === 0 && <div style={{ fontSize: 13, color: '#8e8e93' }}>Новых заявок нет.</div>}
            {requests.map(r => (
              <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(60,60,67,0.12)' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.sender_name} · {r.sender_phone}</div>
                <div style={{ fontSize: 12, color: '#8e8e93' }}>{new Date(r.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                {r.image_url && <button style={S.blue} onClick={() => setView(r.image_url)}>смотреть чек</button>}
                <div style={{ marginTop: 4 }}>
                  <button style={S.blue} onClick={() => activate(r.user_id, r.id)}>Активировать 30 дней</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
      {view && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setView(null)}>
          <img src={view} alt="" style={{ maxWidth: '100%', maxHeight: '90%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}

export default SubscriptionBlock
