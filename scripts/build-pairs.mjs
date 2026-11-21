import { readFile, writeFile } from 'node:fs/promises'

const network = JSON.parse(await readFile(new URL('../public/data/network.json', import.meta.url), 'utf8'))
const pairs = []
for (const station of network.stations) {
  for (const line of station.lines) pairs.push({ line, sta: station.code })
}
pairs.sort((left, right) => left.line.localeCompare(right.line) || left.sta.localeCompare(right.sta))
await writeFile(new URL('../snapshot/pairs.json', import.meta.url), `${JSON.stringify(pairs)}\n`)
console.log(`Wrote ${pairs.length} line-station pairs`)
if (pairs.length < 100) throw new Error('Too few line-station pairs')
