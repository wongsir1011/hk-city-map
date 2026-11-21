import type { CameraSite } from './types'

const CAMERA_LIST_URL =
  'https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_Tc.xml'

function text(parent: Element, tag: string): string {
  return parent.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''
}

export async function fetchCameras(): Promise<CameraSite[]> {
  const response = await fetch(CAMERA_LIST_URL)
  if (!response.ok) throw new Error(`Camera list returned ${response.status}`)
  const xml = new DOMParser().parseFromString(await response.text(), 'text/xml')
  if (xml.querySelector('parsererror')) throw new Error('Camera list was not valid XML')

  const sites: CameraSite[] = []
  for (const node of xml.getElementsByTagName('image')) {
    const lat = Number(text(node, 'latitude'))
    const lng = Number(text(node, 'longitude'))
    const key = text(node, 'key')
    const url = text(node, 'url')
    if (!key || !url || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
    sites.push({
      key,
      region: text(node, 'region'),
      district: text(node, 'district'),
      description: text(node, 'description'),
      lng,
      lat,
      url,
    })
  }
  if (sites.length === 0) throw new Error('Camera list was empty')
  return sites
}

export async function loadPhoto(url: string): Promise<string> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Photo returned ${response.status}`)
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) throw new Error('Photo was not an image')
  return URL.createObjectURL(blob)
}
