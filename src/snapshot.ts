import type { Train } from './types'

export interface SnapshotBoard {
  status: number
  sysTime: string
  up: Train[]
  down: Train[]
}

export interface TrainSnapshot {
  updatedAt: string
  boards: Record<string, SnapshotBoard>
}

function asTrains(value: unknown): Train[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const train = item as Partial<Train>
    if (typeof train.dest !== 'string' || typeof train.time !== 'string') return []
    return [
      {
        seq: typeof train.seq === 'string' ? train.seq : '',
        dest: train.dest,
        plat: typeof train.plat === 'string' ? train.plat : '',
        time: train.time,
        ttnt: typeof train.ttnt === 'string' ? train.ttnt : String(train.ttnt ?? ''),
        valid: typeof train.valid === 'string' ? train.valid : '',
        timetype: typeof train.timetype === 'string' ? train.timetype : undefined,
        route: typeof train.route === 'string' ? train.route : undefined,
      },
    ]
  })
}

export function parseSnapshot(value: unknown): TrainSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.updatedAt !== 'string' || !record.boards || typeof record.boards !== 'object') return null
  const boards: Record<string, SnapshotBoard> = {}
  for (const [key, board] of Object.entries(record.boards as Record<string, unknown>)) {
    if (!board || typeof board !== 'object') continue
    const item = board as Record<string, unknown>
    boards[key] = {
      status: Number.isFinite(Number(item.status)) ? Number(item.status) : 0,
      sysTime: typeof item.sysTime === 'string' ? item.sysTime : '',
      up: asTrains(item.up),
      down: asTrains(item.down),
    }
  }
  return { updatedAt: record.updatedAt, boards }
}

export async function fetchTrainSnapshot(url: string): Promise<TrainSnapshot | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return null
    return parseSnapshot(await response.json())
  } catch {
    return null
  }
}
