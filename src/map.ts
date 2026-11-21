import maplibregl from 'maplibre-gl'
import type { FeatureCollection, LineString, Point } from 'geojson'
import { lineStyle } from './lines'
import type { CameraSite, LineSegment, Network, Station } from './types'

const HONG_KONG: maplibregl.LngLatBoundsLike = [
  [113.83, 22.18],
  [114.46, 22.57],
]

const MTR_LAYERS = ['mtr-casing', 'mtr-line', 'mtr-race', 'station-circle', 'station-hit']
const CAMERA_LAYERS = ['camera-cluster', 'camera-count', 'camera-point']
const LABEL_ZOOM = 12

interface MapHandlers {
  onStation: (station: Station) => void
  onCamera: (site: CameraSite) => void
  onMapError: () => void
}

export interface CityMap {
  setMtrVisible: (visible: boolean) => void
  setCamerasVisible: (visible: boolean) => void
  setCameras: (sites: CameraSite[]) => void
  focusStation: (station: Station) => void
  focusCamera: (site: CameraSite) => void
  selectStation: (code: string | null) => void
  selectCamera: (key: string | null) => void
  fitHongKong: () => void
}

function motion(): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700
}

function lineCollection(segments: LineSegment[]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: segments.map((segment) => ({
      type: 'Feature',
      properties: {
        line: segment.line,
        kind: segment.kind,
        color: lineStyle(segment.line).color,
      },
      geometry: { type: 'LineString', coordinates: segment.coordinates },
    })),
  }
}

function stationCollection(stations: Station[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: stations.map((station) => ({
      type: 'Feature',
      id: station.code,
      properties: {
        code: station.code,
        color: station.lines.length === 1 ? lineStyle(station.lines[0] ?? '').color : '#1c1914',
        lineCount: station.lines.length,
      },
      geometry: { type: 'Point', coordinates: [station.lng, station.lat] },
    })),
  }
}

function cameraCollection(sites: CameraSite[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: sites.map((site) => ({
      type: 'Feature',
      id: site.key,
      properties: { key: site.key },
      geometry: { type: 'Point', coordinates: [site.lng, site.lat] },
    })),
  }
}

export function createCityMap(
  container: HTMLElement,
  network: Network,
  handlers: MapHandlers,
): CityMap {
  const stations = new Map(network.stations.map((station) => [station.code, station]))
  const cameras = new Map<string, CameraSite>()
  let mtrVisible = true
  let camerasVisible = true
  let selectedStation: string | null = null
  let selectedCamera: string | null = null
  let styleReady = false
  let pendingCameras: CameraSite[] | null = null

  const map = new maplibregl.Map({
    container,
    style: 'https://tiles.openfreemap.org/styles/bright',
    bounds: HONG_KONG,
    fitBoundsOptions: { padding: 28 },
    minZoom: 9,
    maxZoom: 18,
    attributionControl: false,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  })
  if (import.meta.env.DEV) {
    Object.assign(window, { __hkMap: map })
  }

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

  const labels = new Map<string, HTMLElement>()
  for (const station of network.stations) {
    const label = document.createElement('div')
    label.className = 'station-label'
    label.textContent = station.nameZh
    label.hidden = true
    new maplibregl.Marker({ element: label, anchor: 'top' }).setLngLat([station.lng, station.lat]).addTo(map)
    labels.set(station.code, label)
  }

  function syncLabels(): void {
    const show = mtrVisible && map.getZoom() >= LABEL_ZOOM
    for (const [code, label] of labels) {
      label.hidden = !show
      label.classList.toggle('is-selected', code === selectedStation)
    }
  }

  window.setTimeout(() => {
    if (!styleReady) handlers.onMapError()
  }, 8000)

  map.on('load', () => {
    styleReady = true
    map.addSource('mtr-lines', { type: 'geojson', data: lineCollection(network.segments) })
    map.addSource('stations', { type: 'geojson', data: stationCollection(network.stations) })
    map.addSource('cameras', {
      type: 'geojson',
      data: cameraCollection([]),
      cluster: true,
      clusterRadius: 48,
      clusterMaxZoom: 13,
    })

    map.addLayer({
      id: 'mtr-casing',
      type: 'line',
      source: 'mtr-lines',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#fffdf8',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 15, 9],
        'line-opacity': 0.95,
      },
    })
    map.addLayer({
      id: 'mtr-line',
      type: 'line',
      source: 'mtr-lines',
      filter: ['!=', ['get', 'kind'], 'race'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.4, 15, 5],
      },
    })
    map.addLayer({
      id: 'mtr-race',
      type: 'line',
      source: 'mtr-lines',
      filter: ['==', ['get', 'kind'], 'race'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.2, 15, 4.5],
        'line-dasharray': [1.2, 1.1],
      },
    })
    map.addLayer({
      id: 'camera-cluster',
      type: 'circle',
      source: 'cameras',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#24312f',
        'circle-radius': ['step', ['get', 'point_count'], 15, 25, 19, 80, 23],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fffdf8',
      },
    })
    map.addLayer({
      id: 'camera-count',
      type: 'symbol',
      source: 'cameras',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
      },
      paint: { 'text-color': '#fffdf8' },
    })
    map.addLayer({
      id: 'camera-point',
      type: 'circle',
      source: 'cameras',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': '#d4652f',
        'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 8, 5.5],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#fffdf8',
      },
    })
    map.addLayer({
      id: 'station-circle',
      type: 'circle',
      source: 'stations',
      paint: {
        'circle-color': '#fffdf8',
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          ['case', ['>', ['get', 'lineCount'], 1], 5, 4],
          15,
          ['case', ['>', ['get', 'lineCount'], 1], 8, 6.5],
        ],
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 5, 2.5],
      },
    })
    map.addLayer({
      id: 'station-hit',
      type: 'circle',
      source: 'stations',
      paint: { 'circle-color': '#000000', 'circle-radius': 16, 'circle-opacity': 0.01 },
    })

    if (pendingCameras) {
      const source = map.getSource('cameras')
      if (source instanceof maplibregl.GeoJSONSource) source.setData(cameraCollection(pendingCameras))
    }
    if (!mtrVisible) setVisibility(MTR_LAYERS, false)
    if (!camerasVisible) setVisibility(CAMERA_LAYERS, false)
    applySelection()
    syncLabels()
    for (const layer of ['station-hit', 'camera-point', 'camera-cluster']) {
      map.on('mouseenter', layer, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = ''
      })
    }
  })

  map.on('zoom', syncLabels)

  map.on('click', (event) => {
    if (!styleReady) return
    const stationHit = map.queryRenderedFeatures(event.point, { layers: ['station-hit'] })[0]
    if (stationHit && mtrVisible) {
      const code = String(stationHit.properties?.code ?? '')
      const station = stations.get(code)
      if (station) handlers.onStation(station)
      return
    }

    const cameraHit = map.queryRenderedFeatures(event.point, { layers: ['camera-point'] })[0]
    if (cameraHit && camerasVisible) {
      const site = cameras.get(String(cameraHit.properties?.key ?? ''))
      if (site) handlers.onCamera(site)
      return
    }

    const cluster = map.queryRenderedFeatures(event.point, { layers: ['camera-cluster'] })[0]
    if (!cluster || !camerasVisible || cluster.geometry.type !== 'Point') return
    const clusterId = Number(cluster.properties?.cluster_id)
    const source = map.getSource('cameras')
    if (!(source instanceof maplibregl.GeoJSONSource) || !Number.isFinite(clusterId)) return
    const [lng, lat] = cluster.geometry.coordinates
    void source.getClusterExpansionZoom(clusterId).then((zoom) => {
      map.easeTo({ center: [lng ?? 0, lat ?? 0], zoom, duration: motion() })
    })
  })

  function setVisibility(layers: string[], visible: boolean): void {
    if (!styleReady) return
    for (const layer of layers) {
      map.setLayoutProperty(layer, 'visibility', visible ? 'visible' : 'none')
    }
  }

  function applySelection(): void {
    if (!styleReady) return
    if (selectedStation) map.setFeatureState({ source: 'stations', id: selectedStation }, { selected: true })
    if (selectedCamera) map.setFeatureState({ source: 'cameras', id: selectedCamera }, { selected: true })
  }

  return {
    setMtrVisible(visible) {
      mtrVisible = visible
      setVisibility(MTR_LAYERS, visible)
      syncLabels()
    },
    setCamerasVisible(visible) {
      camerasVisible = visible
      setVisibility(CAMERA_LAYERS, visible)
    },
    setCameras(sites) {
      cameras.clear()
      for (const site of sites) cameras.set(site.key, site)
      pendingCameras = sites
      const source = map.getSource('cameras')
      if (source instanceof maplibregl.GeoJSONSource) source.setData(cameraCollection(sites))
      applySelection()
    },
    focusStation(station) {
      map.easeTo({
        center: [station.lng, station.lat],
        zoom: Math.max(map.getZoom(), 14),
        duration: motion(),
      })
    },
    focusCamera(site) {
      map.easeTo({
        center: [site.lng, site.lat],
        zoom: Math.max(map.getZoom(), 15),
        duration: motion(),
      })
    },
    selectStation(code) {
      if (styleReady && selectedStation) {
        map.setFeatureState({ source: 'stations', id: selectedStation }, { selected: false })
      }
      selectedStation = code
      applySelection()
      syncLabels()
    },
    selectCamera(key) {
      if (styleReady && selectedCamera) {
        map.setFeatureState({ source: 'cameras', id: selectedCamera }, { selected: false })
      }
      selectedCamera = key
      applySelection()
    },
    fitHongKong() {
      map.fitBounds(HONG_KONG, { padding: 28, duration: motion() })
    },
  }
}
