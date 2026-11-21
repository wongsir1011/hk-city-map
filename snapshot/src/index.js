import { collectSnapshot } from '../collect.mjs'
import pairs from '../pairs.json' with { type: 'json' }

const BATCH = 40
const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=60',
  'access-control-allow-origin': '*',
}

async function publishBatch(env) {
  const currentText = await env.SNAPSHOTS.get('trains.json')
  const current = currentText ? JSON.parse(currentText) : { boards: {}, next: 0 }
  const start = Number(current.next) || 0
  const batch = Array.from({ length: Math.min(BATCH, pairs.length) }, (_, offset) => pairs[(start + offset) % pairs.length])
  const snapshot = await collectSnapshot(batch)
  if (snapshot.limited) return
  await env.SNAPSHOTS.put(
    'trains.json',
    JSON.stringify({
      updatedAt: snapshot.updatedAt,
      next: (start + batch.length) % pairs.length,
      boards: { ...(current.boards ?? {}), ...snapshot.boards },
    }),
  )
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(publishBatch(env))
  },
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: HEADERS })
    if (new URL(request.url).pathname !== '/trains.json') return new Response(null, { status: 404, headers: HEADERS })
    const body = await env.SNAPSHOTS.get('trains.json')
    if (!body) return new Response(null, { status: 404, headers: HEADERS })
    return new Response(body, { headers: HEADERS })
  },
}
