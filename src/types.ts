export interface Station {
  code: string
  nameZh: string
  nameEn: string
  lng: number
  lat: number
  lines: string[]
  race: boolean
}

export interface LineSegment {
  line: string
  kind: 'main' | 'branch' | 'race'
  stations: string[]
  coordinates: [number, number][]
}

export interface Network {
  builtAt: string
  stationListModified: string | null
  stationCount: number
  stations: Station[]
  segments: LineSegment[]
}

export interface CameraSite {
  key: string
  region: string
  district: string
  description: string
  lng: number
  lat: number
  url: string
}

export interface Train {
  seq: string
  dest: string
  plat: string
  time: string
  ttnt: string
  valid: string
  timetype?: string
  route?: string
}

export interface DirectionBoard {
  trains: Train[]
}

export interface Schedule {
  status: number
  message: string
  url?: string
  isdelay?: string
  sysTime: string
  up: Train[]
  down: Train[]
}

export type ScheduleResult =
  | { ok: true; schedule: Schedule }
  | { ok: false; reason: 'rate' | 'network' }
