import { collectSnapshot } from '../collect.mjs'
import pairs from '../pairs.json' with { type: 'json' }

async function publish(env) {
  const snapshot = await collectSnapshot(pairs)
  if (snapshot.okCount * 2 < pairs.length) return
  await env.SNAPSHOTS.put('trains.json', JSON.stringify({ updatedAt: snapshot.updatedAt, boards: snapshot.boards }), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'public, max-age=60',
    },
  })
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(publish(env))
  },
  async fetch() {
    return new Response(null, { status: 404 })
  },
}
