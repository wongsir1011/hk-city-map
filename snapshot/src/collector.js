import { collectSnapshot } from '../collect.mjs'
import pairs from '../pairs.json' with { type: 'json' }

const BATCH = 40

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const start = Math.max(0, Number(url.searchParams.get('start')) || 0)
    const count = Math.min(BATCH, Math.max(1, Number(url.searchParams.get('count')) || BATCH))
    const batch = pairs.slice(start, start + count)
    const snapshot = await collectSnapshot(batch)
    return Response.json({
      limited: snapshot.limited,
      okCount: snapshot.okCount,
      updatedAt: snapshot.updatedAt,
      boards: snapshot.boards,
    })
  },
}
