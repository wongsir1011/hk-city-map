import type { CameraSite } from './types'

const CAMERA_LIST_URL =
  'https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_Tc.xml'
const PHOTO_HOST = 'tdcctv.data.one.gov.hk'

function officialPhoto(key: string, url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' && parsed.hostname === PHOTO_HOST) return parsed.toString()
  } catch {
    // The list entry has no usable photo address.
  }
  return `https://${PHOTO_HOST}/${encodeURIComponent(key)}.JPG`
}

function text(parent: Element, tag: string): string {
  return parent.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''
}

function asSites(value: unknown): CameraSite[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is CameraSite => {
    if (!item || typeof item !== 'object') return false
    const site = item as Partial<CameraSite>
    return (
      typeof site.key === 'string' &&
      typeof site.url === 'string' &&
      typeof site.lng === 'number' &&
      typeof site.lat === 'number' &&
      typeof site.region === 'string' &&
      typeof site.district === 'string' &&
      typeof site.description === 'string'
    )
  })
}

async function fetchCameraList(): Promise<CameraSite[]> {
  const response = await fetch(CAMERA_LIST_URL)
  if (!response.ok) throw new Error(`Camera list returned ${response.status}`)
  const xml = new DOMParser().parseFromString(await response.text(), 'text/xml')
  if (xml.querySelector('parsererror')) throw new Error('Camera list was not valid XML')

  const sites: CameraSite[] = []
  for (const node of xml.getElementsByTagName('image')) {
    const lat = Number(text(node, 'latitude'))
    const lng = Number(text(node, 'longitude'))
    const key = text(node, 'key')
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
    sites.push({
      key,
      region: text(node, 'region'),
      district: text(node, 'district'),
      description: text(node, 'description'),
      lng,
      lat,
      url: officialPhoto(key, text(node, 'url')),
    })
  }
  if (sites.length === 0) throw new Error('Camera list was empty')
  return sites
}

export async function fetchCameras(): Promise<CameraSite[]> {
  try {
    const response = await fetch('/data/cameras.json')
    if (response.ok) {
      const sites = asSites(await response.json())
      if (sites.length > 0) return sites
    }
  } catch {
    // The packaged list is missing, so use the official file.
  }
  return fetchCameraList()
}

export async function loadPhoto(url: string): Promise<string> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.hostname !== PHOTO_HOST) {
    throw new Error('Photo host was not recognised')
  }
  const response = await fetch(parsed, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Photo returned ${response.status}`)
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) throw new Error('Photo was not an image')
  return URL.createObjectURL(blob)
}
