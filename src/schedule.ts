import type { ScheduleResult, Train } from './types'

function asTrains(value: unknown): Train[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Train => {
    if (!item || typeof item !== 'object') return false
    const train = item as Partial<Train>
    return typeof train.dest === 'string' && typeof train.ttnt === 'string'
  })
}

export async function fetchSchedule(line: string, station: string): Promise<ScheduleResult> {
  const url = new URL('https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php')
  url.searchParams.set('line', line)
  url.searchParams.set('sta', station)
  url.searchParams.set('lang', 'TC')

  let response: Response
  try {
    response = await fetch(url)
  } catch {
    return { ok: false, reason: 'network' }
  }
  if (response.status === 429) return { ok: false, reason: 'rate' }
  if (!response.ok) return { ok: false, reason: 'network' }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { ok: false, reason: 'network' }
  }
  if (!body || typeof body !== 'object') return { ok: false, reason: 'network' }

  const record = body as Record<string, unknown>
  const status = Number(record.status)
  const data = record.data
  const board =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>)[`${line}-${station}`]
      : undefined
  const direction = board && typeof board === 'object' ? (board as Record<string, unknown>) : {}

  return {
    ok: true,
    schedule: {
      status: Number.isFinite(status) ? status : 0,
      message: typeof record.message === 'string' ? record.message : '',
      url: typeof record.url === 'string' ? record.url : undefined,
      isdelay: typeof record.isdelay === 'string' ? record.isdelay : undefined,
      sysTime: typeof record.sys_time === 'string' ? record.sys_time : '',
      up: asTrains(direction.UP),
      down: asTrains(direction.DOWN),
    },
  }
}

const HONG_KONG_OFFSET_MS = 8 * 60 * 60 * 1000

/** Parse an MTR timestamp as Hong Kong time, independent of the browser zone. */
export function parseHongKongTime(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const utc = Date.UTC(year, month - 1, day, hour, minute, second) - HONG_KONG_OFFSET_MS
  const date = new Date(utc)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatWait(train: Train, referenceTime: string): string {
  const arrival = parseHongKongTime(train.time)
  const reference = parseHongKongTime(referenceTime)
  if (!arrival || !reference) return '時間未確定'
  let diffMs = arrival.getTime() - reference.getTime()
  if (diffMs < -12 * 60 * 60 * 1000) diffMs += 24 * 60 * 60 * 1000
  const minutes = Math.round(diffMs / 60000)
  if (!Number.isFinite(minutes)) return '時間未確定'
  if (minutes <= 0) return '即將開出或已到站'
  return `${minutes} 分鐘`
}

export function formatClock(value: string): string {
  const match = value.match(/(\d{2}:\d{2}):\d{2}$/)
  return match?.[1] ?? ''
}

export function formatDataTime(value: string): string {
  if (!value || value === '-') return ''
  const clock = formatClock(value)
  return clock ? `資料時間 ${clock}（香港時間）` : ''
}
