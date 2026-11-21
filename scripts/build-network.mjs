/**
 * Builds the static MTR network from the official station list and
 * Lands Department station footprints. Racecourse is absent from the
 * station list, so it is added from the next-train code RAC.
 */
const CSV_URL = 'https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv'
const VENUE_URL =
  'https://mapapi.hkmapservice.gov.hk/ogc/wfs/indoor/mtr_venue_polygon?service=WFS&version=1.1.0&request=GetFeature&outputFormat=application%2Fjson'

const LINE_ORDER = ['AEL', 'TCL', 'TML', 'TKL', 'EAL', 'SIL', 'TWL', 'ISL', 'KTL', 'DRL']
const MAIN_DIRECTION = {
  AEL: 'DT',
  TCL: 'DT',
  TML: 'DT',
  TKL: 'DT',
  EAL: 'DT',
  SIL: 'DT',
  TWL: 'DT',
  ISL: 'DT',
  KTL: 'DT',
  DRL: 'DT',
}

const userAgent = 'hk-smart-city-map/0.1 (classroom; station-network build)'

function norm(value) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll('鐵路站', '')
    .replaceAll('站', '')
    .replaceAll(' ', '')
    .replaceAll('-', '')
    .replaceAll('’', '')
    .replaceAll("'", '')
    .replaceAll('荔', '茘')
    .replaceAll('台', '臺')
    .replaceAll('啓', '啟')
    .replaceAll('恆', '恒')
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') cell += char
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  const [header, ...body] = rows.filter((item) => item.some((value) => value.trim()))
  return body.map((values) =>
    Object.fromEntries(header.map((key, index) => [key.trim(), (values[index] ?? '').trim()])),
  )
}

function bboxCenter(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) return null
  const [minLng, minLat, maxLng, maxLat] = bbox.map(Number)
  if ([minLng, minLat, maxLng, maxLat].some((value) => !Number.isFinite(value))) return null
  return { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 }
}

function km(a, b) {
  const earth = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * earth * Math.asin(Math.sqrt(h))
}

function inHongKong(point) {
  return point.lng >= 113.8 && point.lng <= 114.5 && point.lat >= 22.13 && point.lat <= 22.58
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent } })
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return { text: await response.text(), headers: response.headers }
}

const csvResponse = await fetchText(CSV_URL)
const records = parseCsv(csvResponse.text)
const stations = new Map()
const byDirection = new Map()

for (const record of records) {
  const line = record['Line Code']
  const code = record['Station Code']
  if (!line || !code) continue
  if (!LINE_ORDER.includes(line)) throw new Error(`Unexpected line ${line}`)
  const direction = record.Direction
  const sequence = Number(record.Sequence)
  const key = `${line}:${direction}`
  const list = byDirection.get(key) ?? []
  list.push({ code, sequence })
  byDirection.set(key, list)
  if (!stations.has(code)) {
    stations.set(code, {
      code,
      nameZh: record['Chinese Name'],
      nameEn: record['English Name'],
      lines: [],
    })
  }
  const station = stations.get(code)
  if (!station.lines.includes(line)) station.lines.push(line)
}

const venueResponse = await fetch(VENUE_URL, { headers: { 'User-Agent': userAgent } })
if (!venueResponse.ok) throw new Error(`LandsD venues returned ${venueResponse.status}`)
const venues = (await venueResponse.json()).features ?? []
if (venues.length !== 98) throw new Error(`Expected 98 LandsD stations, received ${venues.length}`)

const usedVenues = new Set()
for (const station of stations.values()) {
  const nameZh = norm(station.nameZh)
  const nameEn = norm(station.nameEn)
  const hits = []
  venues.forEach((feature, index) => {
    const props = feature.properties ?? {}
    const venueZh = norm(props.venue_name_zh ?? '')
    const venueEn = norm(props.venue_name_en ?? '')
    if (nameZh && (nameZh === venueZh || nameZh === venueEn)) hits.push(index)
    else if (nameEn && (nameEn === venueEn || nameEn === venueZh)) hits.push(index)
  })
  const uniqueHits = [...new Set(hits)]
  if (uniqueHits.length !== 1) {
    throw new Error(`Could not match ${station.code} ${station.nameZh}: ${uniqueHits.length} venues`)
  }
  const feature = venues[uniqueHits[0]]
  const point = bboxCenter(feature.properties?.bbox)
  if (!point || !inHongKong(point)) throw new Error(`Bad coordinate for ${station.code}`)
  station.lng = Number(point.lng.toFixed(6))
  station.lat = Number(point.lat.toFixed(6))
  station.race = false
  usedVenues.add(uniqueHits[0])
}

const racecourse = venues.find((feature) => norm(feature.properties?.venue_name_zh ?? '') === '馬場')
if (!racecourse) throw new Error('LandsD racecourse station was not found')
const racecoursePoint = bboxCenter(racecourse.properties?.bbox)
if (!racecoursePoint || !inHongKong(racecoursePoint)) throw new Error('Bad racecourse coordinate')
stations.set('RAC', {
  code: 'RAC',
  nameZh: '馬場',
  nameEn: 'Racecourse',
  lines: ['EAL'],
  lng: Number(racecoursePoint.lng.toFixed(6)),
  lat: Number(racecoursePoint.lat.toFixed(6)),
  race: true,
})

function orderedCodes(line, direction) {
  const list = byDirection.get(`${line}:${direction}`) ?? []
  return list.sort((a, b) => a.sequence - b.sequence).map((item) => item.code)
}

const segments = []
for (const line of LINE_ORDER) {
  const main = orderedCodes(line, MAIN_DIRECTION[line])
  if (main.length < 2) throw new Error(`Main direction missing for ${line}`)
  segments.push({ line, kind: 'main', stations: main })
  const directions = [...byDirection.keys()]
    .filter((key) => key.startsWith(`${line}:`) && !key.endsWith(`:${MAIN_DIRECTION[line]}`))
  for (const key of directions) {
    const codes = orderedCodes(line, key.slice(line.length + 1))
    const branch = []
    for (const code of codes) {
      branch.push(code)
      if (branch.length > 1 && main.includes(code)) break
    }
    if (branch.length >= 2 && !main.includes(branch[0])) {
      segments.push({ line, kind: 'branch', stations: branch })
    }
  }
}
segments.push({ line: 'EAL', kind: 'race', stations: ['FOT', 'RAC', 'SHT'] })

let longest = { km: 0, from: '', to: '', line: '' }
for (const segment of segments) {
  for (let index = 1; index < segment.stations.length; index += 1) {
    const from = stations.get(segment.stations[index - 1])
    const to = stations.get(segment.stations[index])
    if (!from || !to) throw new Error(`Segment ${segment.line} names a missing station`)
    const distance = km(from, to)
    if (distance > longest.km) longest = { km: distance, from: from.code, to: to.code, line: segment.line }
    if (distance > 30) {
      throw new Error(`${segment.line} ${from.code}-${to.code} is ${distance.toFixed(1)} km`)
    }
  }
}

const stationList = [...stations.values()].sort((a, b) => a.code.localeCompare(b.code))
for (const station of stationList) {
  station.lines.sort((a, b) => LINE_ORDER.indexOf(a) - LINE_ORDER.indexOf(b))
}

if (stationList.length !== 98) throw new Error(`Expected 98 stations, built ${stationList.length}`)
const ealMain = segments.find((segment) => segment.line === 'EAL' && segment.kind === 'main')
const ealBranch = segments.find((segment) => segment.line === 'EAL' && segment.kind === 'branch')
const tklBranch = segments.find((segment) => segment.line === 'TKL' && segment.kind === 'branch')
if (!ealMain.stations.includes('LOW') || !ealMain.stations.includes('ADM') || ealMain.stations.includes('RAC')) {
  throw new Error('East Rail main line is incomplete')
}
if (ealBranch.stations.join(',') !== 'LMC,SHS') throw new Error(`Lok Ma Chau branch: ${ealBranch.stations}`)
if (tklBranch.stations.join(',') !== 'LHP,TKO') throw new Error(`LOHAS branch: ${tklBranch.stations}`)

const network = {
  builtAt: new Date().toISOString(),
  stationListModified: csvResponse.headers.get('last-modified'),
  stationCount: stationList.length,
  stations: stationList,
  segments: segments.map((segment) => ({
    line: segment.line,
    kind: segment.kind,
    stations: segment.stations,
    coordinates: segment.stations.map((code) => {
      const station = stations.get(code)
      return [station.lng, station.lat]
    }),
  })),
}

const output = new URL('../public/data/network.json', import.meta.url)
await import('node:fs/promises').then(({ writeFile }) =>
  writeFile(output, `${JSON.stringify(network, null, 2)}\n`),
)

console.log(`Wrote ${stationList.length} stations and ${segments.length} segments`)
console.log(
  `Longest schematic hop: ${longest.line} ${longest.from}-${longest.to} ${longest.km.toFixed(2)} km`,
)
console.log(`Station list modified: ${network.stationListModified}`)
