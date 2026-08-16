export const C = {
  bg: '#f2f2f7',
  card: '#ffffff',
  text: '#1d1d1f',
  text2: '#8e8e93',
  blue: '#0071e3',
  red: '#ff3b30',
  green: '#1e7e34',
  orange: '#b25000',
  gray: '#e9e9eb',
}

const hair = '1px solid rgba(60,60,67,0.12)'

export const T: Record<string, any> = {
  page: { minHeight: '100vh', background: C.bg, padding: '0 16px', boxSizing: 'border-box', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif', color: C.text },
  h1: { fontSize: 28, fontWeight: 700, color: C.text, margin: '14px 0 10px' },
  h2: { fontSize: 17, fontWeight: 700, color: C.text, margin: '12px 0 2px' },
  card: { background: C.card, borderRadius: 12, margin: '0 0 10px', padding: '2px 16px', boxSizing: 'border-box' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 44, padding: '6px 0', borderBottom: hair, boxSizing: 'border-box' },
  item: { padding: '8px 0', borderBottom: hair },
  small: { fontSize: 14, color: C.text2 },
  tiny: { fontSize: 12, color: C.text2, marginTop: 4 },
  total: { fontSize: 22, fontWeight: 700, color: C.text },
  btn: { display: 'block', width: '100%', margin: '10px 0', padding: 14, borderRadius: 12, border: 'none', background: C.blue, color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', boxSizing: 'border-box' },
  btnWarn: { display: 'block', width: '100%', margin: '10px 0', padding: 14, borderRadius: 12, border: 'none', background: 'rgba(255,149,0,0.15)', color: C.orange, fontSize: 16, fontWeight: 600, cursor: 'pointer', boxSizing: 'border-box' },
  btnOff: { display: 'block', width: '100%', margin: '10px 0', padding: 14, borderRadius: 12, border: 'none', background: C.blue, color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', opacity: 0.4, boxSizing: 'border-box' },
  btnSmall: { padding: '10px 14px', borderRadius: 10, border: 'none', background: C.blue, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  input: { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(60,60,67,0.2)', background: '#fff', fontSize: 15, boxSizing: 'border-box', outline: 'none', color: C.text },
  note: { background: 'rgba(120,120,128,0.12)', color: C.text, borderRadius: 10, padding: '10px 12px', fontSize: 14, margin: '8px 0', lineHeight: 1.4 },
  noteRed: { background: 'rgba(255,59,48,0.12)', color: '#c00', borderRadius: 10, padding: '10px 12px', fontSize: 14, margin: '8px 0', lineHeight: 1.4 },
  noteGreen: { background: 'rgba(52,199,89,0.15)', color: C.green, borderRadius: 10, padding: '10px 12px', fontSize: 14, margin: '8px 0', lineHeight: 1.4 },
  chipGray: { display: 'inline-block', padding: '6px 12px', borderRadius: 999, background: 'rgba(120,120,128,0.16)', color: C.text2, fontSize: 14, fontWeight: 600 },
  chipGreen: { display: 'inline-block', padding: '6px 12px', borderRadius: 999, background: 'rgba(52,199,89,0.18)', color: C.green, fontSize: 14, fontWeight: 600 },
  chipOrange: { display: 'inline-block', padding: '6px 12px', borderRadius: 999, background: 'rgba(255,149,0,0.18)', color: C.orange, fontSize: 14, fontWeight: 600 },
  chipRed: { display: 'inline-block', padding: '6px 12px', borderRadius: 999, background: 'rgba(255,59,48,0.15)', color: '#c00', fontSize: 14, fontWeight: 600 },
}
