import { writeFile } from 'node:fs/promises'

const LIST_URL = 'https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_Tc.xml'
const PHOTO_HOST = 'tdcctv.data.one.gov.hk'

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
  return match?.[1]?.trim() ?? ''
}

const response = await fetch(LIST_URL)
if (!response.ok) throw new Error(`Camera list returned ${response.status}`)
const xml = await response.text()
const sites = []
let replaced = 0
for (const block of xml.match(/<image>[\s\S]*?<\/image>/g) ?? []) {
  const key = tag(block, 'key')
  const lat = Number(tag(block, 'latitude'))
  const lng = Number(tag(block, 'longitude'))
  if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
  const official = `https://${PHOTO_HOST}/${encodeURIComponent(key)}.JPG`
  let url = tag(block, 'url')
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.hostname !== PHOTO_HOST) {
      url = official
      replaced += 1
    }
  } catch {
    url = official
    replaced += 1
  }
  sites.push({
    key,
    region: tag(block, 'region'),
    district: tag(block, 'district'),
    description: tag(block, 'description'),
    lng,
    lat,
    url,
  })
}
if (sites.length < 1000) throw new Error(`Expected about 1013 cameras, built ${sites.length}`)
await writeFile(new URL('../public/data/cameras.json', import.meta.url), `${JSON.stringify(sites)}\n`)
console.log(`Wrote ${sites.length} cameras, replaced ${replaced} photo urls`)
