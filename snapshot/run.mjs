import { readFile, writeFile } from 'node:fs/promises'
import { collectSnapshot } from './collect.mjs'

const pairs = JSON.parse(await readFile(new URL('./pairs.json', import.meta.url), 'utf8'))
const snapshot = await collectSnapshot(pairs)
const body = JSON.stringify({ updatedAt: snapshot.updatedAt, boards: snapshot.boards })
const output = process.argv[2]
if (output) await writeFile(output, body)
console.log(
  `pairs ${snapshot.total} ok ${snapshot.okCount} limited ${snapshot.limited} bytes ${body.length} at ${snapshot.updatedAt}`,
)
if (snapshot.okCount * 2 < snapshot.total) process.exitCode = 1
