export interface LineStyle {
  nameZh: string
  color: string
}

export const LINES: Record<string, LineStyle> = {
  AEL: { nameZh: '機場快綫', color: '#00857d' },
  TCL: { nameZh: '東涌綫', color: '#f7941d' },
  TML: { nameZh: '屯馬綫', color: '#9a3e2a' },
  TKL: { nameZh: '將軍澳綫', color: '#7d499b' },
  EAL: { nameZh: '東鐵綫', color: '#53b7e8' },
  SIL: { nameZh: '南港島綫', color: '#b5bd00' },
  TWL: { nameZh: '荃灣綫', color: '#ed1c24' },
  ISL: { nameZh: '港島綫', color: '#007dc5' },
  KTL: { nameZh: '觀塘綫', color: '#00a040' },
  DRL: { nameZh: '迪士尼綫', color: '#f06aaa' },
}

export const LINE_ORDER = Object.keys(LINES)

export function lineStyle(code: string): LineStyle {
  return LINES[code] ?? { nameZh: code, color: '#5f584c' }
}
