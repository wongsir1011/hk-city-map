import '@fontsource/noto-sans-tc/chinese-traditional-400.css'
import '@fontsource/noto-sans-tc/chinese-traditional-700.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import { fetchCameras, loadPhoto } from './cameras'
import { createCityMap } from './map'
import { renderCameraResults, renderDetail, renderLegend, renderSearchResults, type DetailState } from './panel'
import { fetchSchedule } from './schedule'
import { startTrains, type TrainStatus } from './trains'
import type { CameraSite, MovingTrain, Network, Station } from './types'
import './style.css'

const detail = document.querySelector<HTMLElement>('#detail')
const results = document.querySelector<HTMLElement>('#search-results')
const legend = document.querySelector<HTMLElement>('#legend')
const mapNote = document.querySelector<HTMLElement>('#map-note')
const loadNote = document.querySelector<HTMLElement>('#load-note')
const search = document.querySelector<HTMLInputElement>('#station-search')
const searchForm = document.querySelector<HTMLFormElement>('#search-form')
const cameraSearch = document.querySelector<HTMLInputElement>('#camera-search')
const cameraSearchForm = document.querySelector<HTMLFormElement>('#camera-search-form')
const cameraResults = document.querySelector<HTMLElement>('#camera-results')
const mapCanvas = document.querySelector<HTMLElement>('#map-canvas')
const mtrToggle = document.querySelector<HTMLButtonElement>('#toggle-mtr')
const cameraToggle = document.querySelector<HTMLButtonElement>('#toggle-cam')
const fitButton = document.querySelector<HTMLButtonElement>('#fit-hk')
const trainToggle = document.querySelector<HTMLButtonElement>('#toggle-trains')
const trainNote = document.querySelector<HTMLElement>('#train-note')

function requireElement<T extends Element>(element: T | null, name: string): T {
  if (!element) throw new Error(`Missing ${name}`)
  return element
}

const detailEl = requireElement(detail, 'detail')
const resultsEl = requireElement(results, 'search results')
const legendEl = requireElement(legend, 'legend')
const mapNoteEl = requireElement(mapNote, 'map status')
const loadNoteEl = requireElement(loadNote, 'camera status')
const searchEl = requireElement(search, 'search')
const searchFormEl = requireElement(searchForm, 'search form')
const cameraSearchEl = requireElement(cameraSearch, 'camera search')
const cameraSearchFormEl = requireElement(cameraSearchForm, 'camera search form')
const cameraResultsEl = requireElement(cameraResults, 'camera results')
const mapEl = requireElement(mapCanvas, 'map')
const mtrToggleEl = requireElement(mtrToggle, 'mtr toggle')
const cameraToggleEl = requireElement(cameraToggle, 'camera toggle')
const fitButtonEl = requireElement(fitButton, 'fit button')
const trainToggleEl = requireElement(trainToggle, 'train toggle')
const trainNoteEl = requireElement(trainNote, 'train status')

function isNetwork(value: unknown): value is Network {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<Network>
  return (
    Array.isArray(record.stations) &&
    Array.isArray(record.segments) &&
    Array.isArray(record.routes) &&
    record.stations.length > 0
  )
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

function describeTrains(status: TrainStatus): string {
  if (status === 'zoomed-out') return '放大地圖後，列車會沿路軌移動。'
  if (status === 'loading') return '正在估算列車位置…'
  if (status === 'limited') return '暫時未能更新列車位置。列車會暫停，稍後再試。'
  return '列車位置按到站時間估算，大約每 30 秒更新，並非即時定位。'
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
  let trains: ReturnType<typeof startTrains> | undefined
  const city = createCityMap(mapEl, network, {
    onStation: (station) => {
      const line = station.lines[0]
      if (line) void openStation(station, line)
    },
    onCamera: (site) => {
      void openCamera(site)
    },
    onTrain: (train) => openTrain(train),
    onView: () => trains?.onView(),
    onMapError: () => {
      if (mapFailed) return
      mapFailed = true
      mapNoteEl.textContent = '暫時未能載入底圖。請檢查網路後重新整理。'
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
    const active = document.activeElement
    const focusedLine =
      active instanceof HTMLButtonElement && detailEl.contains(active) ? active.dataset.line : undefined
    renderDetail(detailEl, state, {
      onLine: (line) => {
        if (state.kind === 'station' || state.kind === 'station-loading') void openStation(state.station, line)
      },
      onReloadPhoto: () => {
        if (activeCamera) void openCamera(activeCamera)
      },
      stationName: (code) => stationName(stations, code),
    })
    if (!focusedLine) return
    detailEl.querySelector<HTMLButtonElement>(`button[data-line="${CSS.escape(focusedLine)}"]`)?.focus()
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

  function openTrain(train: MovingTrain): void {
    activeCamera = null
    revokePhoto()
    city.selectCamera(null)
    city.selectStation(null)
    show({ kind: 'train', train })
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

  let cameraSites: CameraSite[] = []
  let cameraStatus: 'loading' | 'ready' | 'unavailable' = 'loading'
  cameraSearchEl.addEventListener('input', () => {
    renderCameraResults(cameraResultsEl, cameraSites, cameraSearchEl.value, cameraStatus, (site) => {
      cameraSearchEl.value = ''
      cameraResultsEl.replaceChildren()
      void openCamera(site)
    })
  })
  cameraSearchFormEl.addEventListener('submit', (event) => {
    event.preventDefault()
    const first = cameraResultsEl.querySelector<HTMLButtonElement>('button')
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
  trainToggleEl.addEventListener('click', () => {
    const visible = trainToggleEl.getAttribute('aria-pressed') !== 'true'
    trainToggleEl.setAttribute('aria-pressed', String(visible))
    city.setTrainsVisible(visible)
    trains?.setEnabled(visible)
    if (!visible) trainNoteEl.textContent = ''
  })
  trains = startTrains(
    network,
    () => city.getViewport(),
    (moving) => city.setTrains(moving),
    (status) => {
      if (trainToggleEl.getAttribute('aria-pressed') === 'true') trainNoteEl.textContent = describeTrains(status)
    },
  )

  loadNoteEl.textContent = '正在載入快拍點…'
  try {
    cameraSites = await fetchCameras()
    cameraStatus = 'ready'
    city.setCameras(cameraSites)
    loadNoteEl.textContent = `已載入 ${cameraSites.length} 個快拍點。可搜尋地點，或在地圖上點選。縮小地圖時，鄰近的點會合成一組。`
  } catch {
    cameraStatus = 'unavailable'
    loadNoteEl.textContent = '暫時未能載入快拍點。車站資料仍可使用。'
  }
  if (cameraSearchEl.value.trim()) {
    renderCameraResults(cameraResultsEl, cameraSites, cameraSearchEl.value, cameraStatus, (site) => {
      cameraSearchEl.value = ''
      cameraResultsEl.replaceChildren()
      void openCamera(site)
    })
  }
}

void main()
