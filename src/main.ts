import '@fontsource/noto-sans-tc/chinese-traditional-400.css'
import '@fontsource/noto-sans-tc/chinese-traditional-700.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import { fetchCameras, loadPhoto } from './cameras'
import { createCityMap } from './map'
import { renderDetail, renderLegend, renderSearchResults, type DetailState } from './panel'
import { fetchSchedule } from './schedule'
import type { CameraSite, Network, Station } from './types'
import './style.css'

const detail = document.querySelector<HTMLElement>('#detail')
const results = document.querySelector<HTMLElement>('#search-results')
const legend = document.querySelector<HTMLElement>('#legend')
const loadNote = document.querySelector<HTMLElement>('#load-note')
const search = document.querySelector<HTMLInputElement>('#station-search')
const searchForm = document.querySelector<HTMLFormElement>('#search-form')
const mapCanvas = document.querySelector<HTMLElement>('#map-canvas')
const mtrToggle = document.querySelector<HTMLButtonElement>('#toggle-mtr')
const cameraToggle = document.querySelector<HTMLButtonElement>('#toggle-cam')
const fitButton = document.querySelector<HTMLButtonElement>('#fit-hk')

function requireElement<T extends Element>(element: T | null, name: string): T {
  if (!element) throw new Error(`Missing ${name}`)
  return element
}

const detailEl = requireElement(detail, 'detail')
const resultsEl = requireElement(results, 'search results')
const legendEl = requireElement(legend, 'legend')
const loadNoteEl = requireElement(loadNote, 'status')
const searchEl = requireElement(search, 'search')
const searchFormEl = requireElement(searchForm, 'search form')
const mapEl = requireElement(mapCanvas, 'map')
const mtrToggleEl = requireElement(mtrToggle, 'mtr toggle')
const cameraToggleEl = requireElement(cameraToggle, 'camera toggle')
const fitButtonEl = requireElement(fitButton, 'fit button')

function isNetwork(value: unknown): value is Network {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<Network>
  return Array.isArray(record.stations) && Array.isArray(record.segments) && record.stations.length > 0
}

async function loadNetwork(): Promise<Network | null> {
  try {
    const response = await fetch('/data/network.json')
    if (!response.ok) return null
    const body: unknown = await response.json()
    return isNetwork(body) ? body : null
  } catch {
    return null
  }
}

function stationName(stations: Map<string, Station>, code: string): string {
  return stations.get(code)?.nameZh ?? code
}

async function main(): Promise<void> {
  renderLegend(legendEl)
  const network = await loadNetwork()
  if (!network) {
    loadNoteEl.textContent = '暫時未能載入港鐵路綫。'
    renderDetail(detailEl, { kind: 'hint' }, { onLine: () => undefined, onReloadPhoto: () => undefined, stationName: (code) => code })
    return
  }

  const stations = new Map(network.stations.map((station) => [station.code, station]))
  let mapFailed = false
  const city = createCityMap(mapEl, network, {
    onStation: (station) => {
      const line = station.lines[0]
      if (line) void openStation(station, line)
    },
    onCamera: (site) => {
      void openCamera(site)
    },
    onMapError: () => {
      if (mapFailed) return
      mapFailed = true
      loadNoteEl.textContent = '暫時未能載入底圖。請檢查網路後重新整理。'
    },
  })

  let requestId = 0
  let photoUrl: string | null = null
  let activeCamera: CameraSite | null = null

  function revokePhoto(): void {
    if (!photoUrl) return
    URL.revokeObjectURL(photoUrl)
    photoUrl = null
  }

  function show(state: DetailState): void {
    renderDetail(detailEl, state, {
      onLine: (line) => {
        if (state.kind === 'station' || state.kind === 'station-loading') void openStation(state.station, line)
      },
      onReloadPhoto: () => {
        if (activeCamera) void openCamera(activeCamera)
      },
      stationName: (code) => stationName(stations, code),
    })
  }

  async function openStation(station: Station, line: string): Promise<void> {
    const token = ++requestId
    activeCamera = null
    revokePhoto()
    searchEl.value = ''
    resultsEl.replaceChildren()
    city.selectCamera(null)
    city.selectStation(station.code)
    city.focusStation(station)
    show({ kind: 'station-loading', station, line })
    const result = await fetchSchedule(line, station.code)
    if (token !== requestId) return
    show({ kind: 'station', station, line, result })
  }

  async function openCamera(site: CameraSite): Promise<void> {
    const token = ++requestId
    activeCamera = site
    revokePhoto()
    city.selectStation(null)
    city.selectCamera(site.key)
    city.focusCamera(site)
    show({ kind: 'camera-loading', site })
    try {
      const nextUrl = await loadPhoto(site.url)
      if (token !== requestId) {
        URL.revokeObjectURL(nextUrl)
        return
      }
      photoUrl = nextUrl
      show({ kind: 'camera', site, photoUrl })
    } catch {
      if (token !== requestId) return
      show({ kind: 'camera', site, photoUrl: null })
    }
  }

  show({ kind: 'hint' })
  searchEl.addEventListener('input', () => {
    renderSearchResults(resultsEl, network.stations, searchEl.value, (station) => {
      const line = station.lines[0]
      if (line) void openStation(station, line)
    })
  })
  searchFormEl.addEventListener('submit', (event) => {
    event.preventDefault()
    const first = resultsEl.querySelector<HTMLButtonElement>('button')
    first?.click()
  })

  mtrToggleEl.addEventListener('click', () => {
    const visible = mtrToggleEl.getAttribute('aria-pressed') !== 'true'
    mtrToggleEl.setAttribute('aria-pressed', String(visible))
    city.setMtrVisible(visible)
  })
  cameraToggleEl.addEventListener('click', () => {
    const visible = cameraToggleEl.getAttribute('aria-pressed') !== 'true'
    cameraToggleEl.setAttribute('aria-pressed', String(visible))
    city.setCamerasVisible(visible)
  })
  fitButtonEl.addEventListener('click', () => city.fitHongKong())

  loadNoteEl.textContent = '正在載入快拍點…'
  try {
    const sites = await fetchCameras()
    city.setCameras(sites)
    loadNoteEl.textContent = `已載入 ${sites.length} 個快拍點。縮小地圖時，鄰近的點會合成一組。`
  } catch {
    loadNoteEl.textContent = '暫時未能載入快拍點。車站資料仍可使用。'
  }
}

void main()
