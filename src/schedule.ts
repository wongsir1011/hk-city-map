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

export function formatWait(train: Train): string {
  if (train.valid !== 'Y') return '時間未確定'
  const minutes = Number(train.ttnt)
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
