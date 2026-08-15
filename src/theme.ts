import type { CSSProperties } from 'react'

export const C = {
  blue: '#0071e3',
  green: '#34c759',
  red: '#ff3b30',
  orange: '#ff9500',
  text: '#1d1d1f',
  text2: '#8e8e93',
  line: 'rgba(60,60,67,0.12)',
  gray: '#f2f2f7',
  card: '#ffffff',
}

export const T: Record<string, CSSProperties> = {
  page: {
    fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    maxWidth: 600, margin: '0 auto', padding: '12px 16px 90px',
    background: C.gray, minHeight: '100vh', boxSizing: 'border-box',
    color: C.text,
  },
  h1: { fontSize: 28, fontWeight: 700, margin: '8px 0 12px', color: C.text },
  h2: { fontSize: 15, fontWeight: 600, color: C.text, margin: '10px 0 4px' },
  h3: { fontSize: 13, color: C.text2, margin: '12px 0 4px', textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 },
  card: { background: C.card, borderRadius: 12, margin: '0 0 10px', padding: '2px 16px 8px' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '11px 0', borderBottom: `1px solid ${C.line}`, fontSize: 15, color: C.text },
  item: { padding: '10px 0', borderBottom: `1px solid ${C.line}` },
  sub: { marginTop: 4 },
  small: { fontSize: 13, color: C.text2, margin: '6px 0' },
  tiny: { fontSize: 12, color: C.text2, margin: '4px 0' },
  link: { color: C.blue, fontSize: 14, cursor: 'pointer', padding: '8px 0', fontWeight: 500 },
  total: { fontSize: 20, fontWeight: 700, color: C.text },
  msg: { background: C.card, borderRadius: 12, margin: '0 0 10px', padding: '10px 16px', fontSize: 14, color: C.text },

  note: { background: 'rgba(255,149,0,0.12)', color: '#b25000', borderRadius: 8, padding: '8px 12px', fontSize: 13, margin: '8px 0' },
  noteRed: { background: 'rgba(255,59,48,0.1)', color: C.red, borderRadius: 8, padding: '8px 12px', fontSize: 13, margin: '8px 0' },
  noteGreen: { background: 'rgba(52,199,89,0.12)', color: '#1e7e34', borderRadius: 8, padding: '8px 12px', fontSize: 13, margin: '8px 0' },

  chipGreen: { display: 'inline-block', background: 'rgba(52,199,89,0.15)', color: '#1e7e34', borderRadius: 14, padding: '4px 10px', fontSize: 13, fontWeight: 600 },
  chipOrange: { display: 'inline-block', background: 'rgba(255,149,0,0.15)', color: '#b25000', borderRadius: 14, padding: '4px 10px', fontSize: 13, fontWeight: 600 },
  chipRed: { display: 'inline-block', background: 'rgba(255,59,48,0.12)', color: C.red, borderRadius: 14, padding: '4px 10px', fontSize: 13, fontWeight: 600 },
  chipGray: { display: 'inline-block', background: 'rgba(120,120,128,0.12)', color: C.text2, borderRadius: 14, padding: '4px 10px', fontSize: 13, fontWeight: 600 },

  btn: { display: 'block', width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none', background: C.blue, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', margin: '8px 0', boxSizing: 'border-box' },
  btnWarn: { display: 'block', width: '100%', padding: '11px 16px', borderRadius: 10, border: 'none', background: 'rgba(255,149,0,0.15)', color: '#b25000', fontSize: 15, fontWeight: 600, cursor: 'pointer', margin: '8px 0', boxSizing: 'border-box' },
  btnOff: { display: 'block', width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none', background: C.blue, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', margin: '8px 0', opacity: 0.5, boxSizing: 'border-box' },
  btnSmall: { padding: '8px 12px', borderRadius: 8, border: 'none', background: 'rgba(0,113,227,0.1)', color: C.blue, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  btnSecondary: { padding: '8px 12px', borderRadius: 8, border: 'none', background: 'rgba(120,120,128,0.12)', color: C.text, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  btnDanger: { padding: '8px 12px', borderRadius: 8, border: 'none', background: 'rgba(255,59,48,0.1)', color: C.red, fontSize: 14, fontWeight: 600, cursor: 'pointer' },

  input: { width: '100%', padding: '10px 0', border: 'none', borderBottom: `1px solid ${C.line}`, background: 'transparent', fontSize: 15, color: C.text, outline: 'none', borderRadius: 0, margin: '4px 0', boxSizing: 'border-box' },
  select: { padding: '8px 10px', border: 'none', background: 'rgba(120,120,128,0.08)', borderRadius: 8, fontSize: 14, color: C.text, outline: 'none' },
}
