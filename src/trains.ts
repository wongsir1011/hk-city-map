import { fetchSchedule, parseHongKongTime } from './schedule'
import { fetchTrainSnapshot, type TrainSnapshot } from './snapshot'
import type { MovingTrain, Network, Station, TrackRoute, Train } from './types'

const MIN_ZOOM = 12
const MAX_QUERIES = 12
const DIRECT_MS = 30_000
const SNAPSHOT_MS = 60_000
const CONCURRENCY = 4
const SPEED_KMH = 40

export type TrainStatus = 'zoomed-out' | 'loading' | 'live' | 'limited' | 'fallback'

interface Viewport {
  zoom: number
  west: number
  south: number
  east: number
  north: number
  centerLng: number
  centerLat: number
}

interface IndexedRoute {
  route: TrackRoute
  cum: number[]
  total: number
  stations: { code: string; along: number }[]
}

interface Sighting {
  id: string
  line: string
  dest: string
  next: string
  arrivalMs: number
  route: IndexedRoute
  target: { lng: number; lat: number } | null
}

export interface TrainTracker {
  setEnabled: (enabled: boolean) => void
  onView: () => void
  stop: () => void
}

function kmBetween(a: [number, number], b: [number, number]): number {
  const earth = 6371
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLng = ((b[0] - a[0]) * Math.PI) / 180
  const lat1 = (a[1] * Math.PI) / 180
  const lat2 = (b[1] * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * earth * Math.asin(Math.sqrt(h))
}

function project(coordinates: [number, number][], cum: number[], lng: number, lat: number): { along: number; distance: number } {
  let best = { along: 0, distance: Number.POSITIVE_INFINITY }
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1]
    const end = coordinates[index]
    if (!start || !end) continue
    const dx = end[0] - start[0]
    const dy = end[1] - start[1]
    const length2 = dx * dx + dy * dy
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((lng - start[0]) * dx + (lat - start[1]) * dy) / length2))
    const point: [number, number] = [start[0] + t * dx, start[1] + t * dy]
    const distance = kmBetween(point, [lng, lat])
    if (distance < best.distance) {
      const startAlong = cum[index - 1] ?? 0
      const endAlong = cum[index] ?? startAlong
      best = { along: startAlong + t * (endAlong - startAlong), distance }
    }
  }
  return best
}

function pointAt(coordinates: [number, number][], cum: number[], along: number): { lng: number; lat: number } {
  const clamped = Math.max(0, Math.min(cum[cum.length - 1] ?? 0, along))
  for (let index = 1; index < coordinates.length; index += 1) {
    const endAlong = cum[index] ?? 0
    if (endAlong < clamped) continue
    const start = coordinates[index - 1]
    const end = coordinates[index]
    const startAlong = cum[index - 1] ?? 0
    const span = endAlong - startAlong
    const t = span === 0 ? 0 : (clamped - startAlong) / span
    return {
      lng: (start?.[0] ?? 0) + t * ((end?.[0] ?? 0) - (start?.[0] ?? 0)),
      lat: (start?.[1] ?? 0) + t * ((end?.[1] ?? 0) - (start?.[1] ?? 0)),
    }
  }
  const last = coordinates[coordinates.length - 1] ?? [0, 0]
  return { lng: last[0], lat: last[1] }
}

function indexRoutes(network: Network): IndexedRoute[] {
  return network.routes.map((route) => {
    const cum = [0]
    for (let index = 1; index < route.coordinates.length; index += 1) {
      const previous = route.coordinates[index - 1]
      const current = route.coordinates[index]
      cum.push((cum[index - 1] ?? 0) + (previous && current ? kmBetween(previous, current) : 0))
    }
    const stations = network.stations
      .filter((station) => station.lines.includes(route.line))
      .map((station) => ({ station, projected: project(route.coordinates, cum, station.lng, station.lat) }))
      .filter((item) => item.projected.distance < 0.45)
      .map((item) => ({ code: item.station.code, along: item.projected.along }))
      .sort((a, b) => a.along - b.along)
    return { route, cum, total: cum[cum.length - 1] ?? 0, stations }
  })
}

function pickRoute(routes: IndexedRoute[], line: string, dest: string, next: string, race: boolean): IndexedRoute | undefined {
  const sameLine = routes.filter((item) => item.route.line === line)
  const preferred = sameLine.filter((item) => item.route.race === race)
  const pool = preferred.length > 0 ? preferred : sameLine.filter((item) => !item.route.race)
  const contains = (item: IndexedRoute, code: string) => item.stations.some((station) => station.code === code)
  const withBoth = pool.filter((item) => contains(item, dest) && contains(item, next))
  const list = withBoth.length > 0 ? withBoth : pool.filter((item) => contains(item, next))
  return (
    list.find((item) => item.route.to === dest || item.route.from === dest) ??
    list.sort((a, b) => b.total - a.total)[0]
  )
}

function continuePast(
  route: IndexedRoute,
  nextIndex: number,
  nextStop: { along: number },
  forward: boolean,
  remaining: number,
): { lng: number; lat: number } | null {
  const direction = forward ? 1 : -1
  const following = route.stations[nextIndex + direction]
  const elapsed = -remaining
  if (!following) {
    if (elapsed > 45_000) return null
    return pointAt(route.route.coordinates, route.cum, nextStop.along)
  }
  const hopKm = Math.abs(following.along - nextStop.along)
  const travelled = Math.min(hopKm, (elapsed / 3_600_000) * SPEED_KMH)
  if (travelled >= hopKm - 0.03) return null
  return pointAt(route.route.coordinates, route.cum, nextStop.along + direction * travelled)
}

export function approachPoint(
  route: IndexedRoute,
  next: string,
  dest: string,
  arrivalMs: number,
  now: number,
): { lng: number; lat: number } | null {
  const nextIndex = route.stations.findIndex((station) => station.code === next)
  const nextStop = route.stations[nextIndex]
  if (!nextStop) return null
  const destination = route.stations.find((station) => station.code === dest)
  const forward = !destination || destination.along >= nextStop.along
  const previous = forward ? route.stations[nextIndex - 1] : route.stations[nextIndex + 1]
  const remaining = arrivalMs - now
  if (!previous) {
    if (remaining > 3 * 60 * 1000) return null
    if (remaining > 0) return pointAt(route.route.coordinates, route.cum, nextStop.along)
    return continuePast(route, nextIndex, nextStop, forward, remaining)
  }
  const segmentKm = Math.abs(nextStop.along - previous.along)
  const typicalMs = (segmentKm / SPEED_KMH) * 3600 * 1000
  if (remaining > typicalMs * 1.3) return null
  if (remaining <= 0) return continuePast(route, nextIndex, nextStop, forward, remaining)
  const ratio = Math.max(0, Math.min(1, 1 - remaining / Math.max(typicalMs, 1)))
  const along = previous.along + ratio * (nextStop.along - previous.along)
  return pointAt(route.route.coordinates, route.cum, along)
}

async function runPool<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index]
      index += 1
      if (current !== undefined) await task(current)
    }
  })
  await Promise.all(workers)
}

export function startTrains(
  network: Network,
  view: () => Viewport,
  onTrains: (trains: MovingTrain[]) => void,
  onStatus: (status: TrainStatus, updatedAt?: string) => void,
  snapshotUrl: string | null,
): TrainTracker {
  const routes = indexRoutes(network)
  let enabled = true
  let stopped = false
  let polling = false
  let lastPoll = 0
  let limitedUntil = 0
  let gapMs = snapshotUrl ? SNAPSHOT_MS : DIRECT_MS
  let snapshotFailures = 0
  let wasZoomedOut = true
  let sightings: Sighting[] = []
  const shown = new Map<string, { lng: number; lat: number }>()

  function publish(now = Date.now()): void {
    const placed: { sighting: Sighting; target: { lng: number; lat: number }; along: number; progress: number }[] = []
    for (const sighting of sightings) {
      const target = approachPoint(sighting.route, sighting.next, sighting.dest, sighting.arrivalMs, now)
      sighting.target = target
      if (!target) continue
      const along = project(sighting.route.route.coordinates, sighting.route.cum, target.lng, target.lat).along
      const destination = sighting.route.stations.find((station) => station.code === sighting.dest)
      placed.push({
        sighting,
        target,
        along,
        progress: destination ? -Math.abs(destination.along - along) : along,
      })
    }
    const kept: typeof placed = []
    const groups = new Map<string, typeof placed>()
    for (const item of placed) {
      const key = `${item.sighting.line}|${item.sighting.dest}`
      const list = groups.get(key) ?? []
      list.push(item)
      groups.set(key, list)
    }
    for (const list of groups.values()) {
      list.sort((a, b) => b.progress - a.progress)
      const accepted: typeof placed = []
      for (const item of list) {
        if (accepted.some((other) => Math.abs(other.along - item.along) < 1.2)) continue
        accepted.push(item)
        kept.push(item)
      }
    }
    const trains: MovingTrain[] = []
    const alive = new Set<string>()
    for (const item of kept) {
      const { sighting, target } = item
      const current = shown.get(sighting.id)
      const point = current
        ? {
            lng: current.lng + (target.lng - current.lng) * 0.35,
            lat: current.lat + (target.lat - current.lat) * 0.35,
          }
        : target
      shown.set(sighting.id, point)
      alive.add(sighting.id)
      let next = sighting.next
      let minutes = Math.max(0, Math.round((sighting.arrivalMs - now) / 60000))
      if (sighting.arrivalMs <= now) {
        const nextIndex = sighting.route.stations.findIndex((station) => station.code === sighting.next)
        const nextStop = sighting.route.stations[nextIndex]
        const destination = sighting.route.stations.find((station) => station.code === sighting.dest)
        const forward = !destination || !nextStop || destination.along >= nextStop.along
        const following = sighting.route.stations[nextIndex + (forward ? 1 : -1)]
        if (following && nextStop) {
          next = following.code
          const hopKm = Math.abs(following.along - nextStop.along)
          const travelled = ((now - sighting.arrivalMs) / 3_600_000) * SPEED_KMH
          minutes = Math.max(0, Math.round(((hopKm - travelled) / SPEED_KMH) * 60))
        }
      }
      trains.push({
        id: sighting.id,
        line: sighting.line,
        lng: point.lng,
        lat: point.lat,
        dest: sighting.dest,
        next,
        minutes,
      })
    }
    for (const id of shown.keys()) {
      if (!alive.has(id)) shown.delete(id)
    }
    onTrains(trains.slice(0, 40))
  }

  function queriesFor(viewport: Viewport, limit: number): { line: string; station: Station; distance: number }[] {
    const queries: { line: string; station: Station; distance: number }[] = []
    for (const station of network.stations) {
      if (station.lng < viewport.west || station.lng > viewport.east || station.lat < viewport.south || station.lat > viewport.north) {
        continue
      }
      const distance = kmBetween([viewport.centerLng, viewport.centerLat], [station.lng, station.lat])
      for (const line of station.lines) queries.push({ line, station, distance })
    }
    return queries.sort((a, b) => a.distance - b.distance).slice(0, limit)
  }

  function addSighting(found: Sighting[], line: string, next: string, train: Train): void {
    const arrival = parseHongKongTime(train.time)
    if (!arrival || !train.dest) return
    const route = pickRoute(routes, line, train.dest, next, train.route === 'RAC')
    if (!route) return
    const arrivalMs = arrival.getTime()
    if (!approachPoint(route, next, train.dest, arrivalMs, Date.now())) return
    found.push({
      id: `${line}|${train.dest}|${next}|${Math.round(arrivalMs / 60000)}`,
      line,
      dest: train.dest,
      next,
      arrivalMs,
      route,
      target: null,
    })
  }

  function sightingsFromSnapshot(viewport: Viewport, snapshot: TrainSnapshot): Sighting[] {
    const found: Sighting[] = []
    for (const query of queriesFor(viewport, 500)) {
      const board = snapshot.boards[`${query.line}-${query.station.code}`]
      if (!board || board.status !== 1) continue
      for (const train of [...board.up, ...board.down]) addSighting(found, query.line, query.station.code, train)
    }
    const unique = new Map<string, Sighting>()
    for (const sighting of found) if (!unique.has(sighting.id)) unique.set(sighting.id, sighting)
    return [...unique.values()]
  }

  async function applySnapshot(): Promise<'ok' | 'retry' | 'fallback'> {
    if (!snapshotUrl) return 'fallback'
    const snapshot = await fetchTrainSnapshot(snapshotUrl)
    if (!snapshot) {
      snapshotFailures += 1
      return snapshotFailures < 2 ? 'retry' : 'fallback'
    }
    snapshotFailures = 0
    sightings = sightingsFromSnapshot(view(), snapshot)
    publish()
    onStatus('live', snapshot.updatedAt)
    return 'ok'
  }

  async function pollDirect(degraded: boolean): Promise<void> {
    if (Date.now() < limitedUntil) {
      onStatus('limited')
      return
    }
    const viewport = view()
    const kept = new Map(sightings.map((sighting) => [sighting.id, sighting]))
    let limited = false
    let published = false
    await runPool(queriesFor(viewport, MAX_QUERIES), CONCURRENCY, async (query) => {
      const result = await fetchSchedule(query.line, query.station.code)
      if (!result.ok) {
        if (result.reason === 'rate') limited = true
        return
      }
      for (const [id, sighting] of kept) {
        if (sighting.line === query.line && sighting.next === query.station.code) kept.delete(id)
      }
      if (result.schedule.status === 1) {
        const found: Sighting[] = []
        for (const train of [...result.schedule.up, ...result.schedule.down]) {
          addSighting(found, query.line, query.station.code, train)
        }
        for (const sighting of found) kept.set(sighting.id, sighting)
      }
      sightings = [...kept.values()]
      published = true
      publish()
    })
    if (limited) {
      limitedUntil = Date.now() + DIRECT_MS * 2
      onStatus('limited')
    } else if (degraded) {
      onStatus('fallback')
    } else {
      onStatus('live')
    }
    if (!published) publish()
  }

  async function poll(force = false): Promise<void> {
    if (stopped || !enabled || polling) return
    const viewport = view()
    if (viewport.zoom < MIN_ZOOM) {
      wasZoomedOut = true
      sightings = []
      publish()
      onStatus('zoomed-out')
      return
    }
    wasZoomedOut = false
    const now = Date.now()
    if (!force && now - lastPoll < gapMs - 2000) return
    polling = true
    lastPoll = now
    if (sightings.length === 0) onStatus('loading')
    try {
      if (snapshotUrl) {
        const outcome = await applySnapshot()
        if (outcome === 'ok') {
          gapMs = SNAPSHOT_MS
          return
        }
        if (outcome === 'retry') {
          gapMs = SNAPSHOT_MS
          onStatus('limited')
          return
        }
        gapMs = DIRECT_MS
      }
      await pollDirect(Boolean(snapshotUrl))
    } finally {
      polling = false
    }
  }

  const animation = window.setInterval(() => {
    if (!stopped && enabled) publish()
  }, 1000)
  const timer = window.setInterval(() => {
    void poll(false)
  }, DIRECT_MS)
  void poll(true)

  return {
    onView() {
      if (!enabled || stopped) return
      if (view().zoom < MIN_ZOOM) {
        wasZoomedOut = true
        sightings = []
        publish()
        onStatus('zoomed-out')
        return
      }
      const entered = wasZoomedOut
      wasZoomedOut = false
      void poll(entered || Date.now() - lastPoll >= gapMs)
    },
    setEnabled(next) {
      enabled = next
      if (!next) {
        sightings = []
        shown.clear()
        onTrains([])
        return
      }
      void poll(true)
    },
    stop() {
      stopped = true
      window.clearInterval(animation)
      window.clearInterval(timer)
    },
  }
}
