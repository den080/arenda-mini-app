import { supabase } from '../lib/supabase'

export const OWNER_PHONE = '+79057674225'
export const PRO_PRICE = 299
export const SBP_PHONE = '+7 905 767-42-25'

export interface PayDetail { type: 'card' | 'sbp'; bank: string; number: string }

export const S: Record<string, React.CSSProperties> = {
  lab: { fontSize: 13, color: '#8e8e93', margin: '12px 0 2px' },
  inp: { width: '100%', padding: '8px 0', border: 'none', borderBottom: '1px solid rgba(60,60,67,0.12)', background: 'transparent', fontSize: 15, color: '#1d1d1f', outline: 'none', borderRadius: 0, boxSizing: 'border-box' },
  inpLocked: { width: '100%', padding: '8px 0', border: 'none', borderBottom: '1px solid rgba(60,60,67,0.12)', background: 'transparent', fontSize: 15, color: '#8e8e93', outline: 'none', borderRadius: 0, boxSizing: 'border-box', opacity: 0.6 },
  sel: { width: '100%', padding: '9px 10px', border: 'none', background: 'rgba(120,120,128,0.08)', borderRadius: 8, fontSize: 14, color: '#1d1d1f', outline: 'none', boxSizing: 'border-box' },
  blue: { border: 'none', background: 'transparent', color: '#0071e3', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 4 },
  red: { border: 'none', background: 'transparent', color: '#ff3b30', fontSize: 15, cursor: 'pointer', padding: 4 },
  btnRow: { display: 'flex', gap: 16, alignItems: 'center', margin: '14px 0 8px' },
}

export function normalizePhone(input: string): string {
  let cleaned = input.replace(/[\s-()]/g, '')
  if (cleaned.startsWith('8') && cleaned.length === 11) cleaned = '+7' + cleaned.slice(1)
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned
  return cleaned
}

export function formatPhoneInput(v: string): string {
  const digits = (v || '').replace(/\D/g, '').slice(0, 11)
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    const x = digits.slice(1)
    let out = '+7'
    if (x.length > 0) out += ' ' + x.slice(0, 3)
    if (x.length > 3) out += ' ' + x.slice(3, 6)
    if (x.length > 6) out += ' ' + x.slice(6, 8)
    if (x.length > 8) out += ' ' + x.slice(8, 10)
    return out
  }
  return v
}

export function formatCardInput(v: string): string {
  const d = (v || '').replace(/\D/g, '').slice(0, 16)
  return d.replace(/(.{4})/g, '$1 ').trim()
}

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function pdate(s: string): Date {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function clampDay(y: number, m: number, d: number): number {
  const last = new Date(y, m + 1, 0).getDate()
  return Math.min(Math.max(1, d), last)
}

export function moneyOk(v: string, max = 10000000): number | null {
  if (String(v).trim() === '') return 0
  const n = Number(String(v).replace(',', '.'))
  if (isNaN(n) || n < 0 || n > max) return null
  return n
}

export function validPhone(phoneInput: string): boolean {
  if (!phoneInput) return true
  return phoneInput.replace(/\D/g, '').length === 11
}

export async function findCounterparty(phoneInput: string): Promise<any | null> {
  const digits = phoneInput.replace(/\D/g, '')
  if (!digits) return null
  const { data: users } = await supabase.from('users').select('*').not('phone', 'is', null)
  return (users || []).find((u: any) => (u.phone || '').replace(/\D/g, '').slice(-10) === digits.slice(-10)) || null
}

export function compress(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const img = new Image()
      img.onload = () => {
        const max = 1280
        let w = img.width, h = img.height
        const k = Math.min(1, max / Math.max(w, h))
        w = Math.round(w * k); h = Math.round(h * k)
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        c.getContext('2d')!.drawImage(img, 0, 0, w, h)
        c.toBlob(b => b ? resolve(b) : reject(new Error('compress')), 'image/jpeg', 0.82)
      }
      img.onerror = reject
      img.src = String(fr.result)
    }
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

export function DetailsEditor({ list, onChange }: { list: PayDetail[]; onChange: (v: PayDetail[]) => void }) {
  return (
    <div>
      {list.map((d, i) => (
        <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(60,60,67,0.12)' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={d.type} onChange={e => { const v = [...list]; v[i] = { ...v[i], type: e.target.value as 'card' | 'sbp', number: '' }; onChange(v) }} style={{ ...S.sel, width: '45%' }}>
              <option value="card">Карта банка</option>
              <option value="sbp">СБП по телефону</option>
            </select>
            <input
              value={d.bank}
              onChange={e => { const v = [...list]; v[i] = { ...v[i], bank: e.target.value }; onChange(v) }}
              placeholder="Название банка"
              style={{ ...S.inp, flex: 1, borderBottom: 'none', background: 'rgba(120,120,128,0.08)', borderRadius: 8, padding: '9px 10px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
            <input
              value={d.number}
              onChange={e => { const v = [...list]; v[i] = { ...v[i], number: d.type === 'card' ? formatCardInput(e.target.value) : formatPhoneInput(e.target.value) }; onChange(v) }}
              placeholder={d.type === 'card' ? '0000 0000 0000 0000' : '+7 000 000 00-00'}
              style={{ ...S.inp, flex: 1 }}
              inputMode="numeric"
            />
            <button style={S.red} onClick={() => onChange(list.filter((_, x) => x !== i))}>удалить</button>
          </div>
        </div>
      ))}
      <div style={{ padding: '10px 0' }}>
        <button style={S.blue} onClick={() => onChange([...list, { type: 'sbp', bank: '', number: '' }])}>+ Добавить способ оплаты</button>
      </div>
    </div>
  )
}

export function ReadingsModeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select style={S.sel} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="manual">Арендатор подаёт показания вручную</option>
      <option value="auto">Показания передаются автоматически</option>
      <option value="self">Арендатор оплачивает полную квитанцию самостоятельно</option>
    </select>
  )
}

export const methodOptions = (
  <>
    <option value="card">Безналичный расчёт</option>
    <option value="cash">Наличные</option>
    <option value="both">Наличный и безналичный расчёт</option>
  </>
)
