import pairs from '../pairs.json' with { type: 'json' }

const BATCH = 40
const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=60',
  'access-control-allow-origin': '*',
}

async function publishAll(env) {
  const starts = []
  for (let start = 0; start < pairs.length; start += BATCH) starts.push(start)
  const parts = await Promise.all(
    starts.map(async (start) => {
      const response = await env.COLLECTOR.fetch(`https://collector/collect?start=${start}&count=${BATCH}`)
      if (!response.ok) return null
      return response.json()
    }),
  )
  if (parts.some((part) => !part || part.limited)) return
  const boards = {}
  let updatedAt = ''
  let okCount = 0
  for (const part of parts) {
    Object.assign(boards, part.boards)
    okCount += part.okCount
    if (part.updatedAt) updatedAt = part.updatedAt
  }
  if (okCount * 2 < pairs.length || !updatedAt) return
  await env.SNAPSHOTS.put('trains.json', JSON.stringify({ updatedAt, boards }))
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(publishAll(env))
  },
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: HEADERS })
    if (new URL(request.url).pathname !== '/trains.json') return new Response(null, { status: 404, headers: HEADERS })
    const body = await env.SNAPSHOTS.get('trains.json')
    if (!body) return new Response(null, { status: 404, headers: HEADERS })
    return new Response(body, { headers: HEADERS })
  },
}
