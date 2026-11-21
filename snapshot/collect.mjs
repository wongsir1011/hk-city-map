const SCHEDULE_URL = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php'
const CONCURRENCY = 4

function hongKongNow() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 19).replace('T', ' ')
}

function asTrains(value) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || typeof item.dest !== 'string' || typeof item.time !== 'string') return []
    return [
      {
        seq: typeof item.seq === 'string' ? item.seq : '',
        dest: item.dest,
        plat: typeof item.plat === 'string' ? item.plat : '',
        time: item.time,
        ttnt: typeof item.ttnt === 'string' ? item.ttnt : String(item.ttnt ?? ''),
        valid: typeof item.valid === 'string' ? item.valid : '',
        ...(typeof item.timetype === 'string' ? { timetype: item.timetype } : {}),
        ...(typeof item.route === 'string' ? { route: item.route } : {}),
      },
    ]
  })
}

async function fetchBoard(pair, fetchImpl) {
  const url = new URL(SCHEDULE_URL)
  url.searchParams.set('line', pair.line)
  url.searchParams.set('sta', pair.sta)
  url.searchParams.set('lang', 'TC')
  let response
  try {
    response = await fetchImpl(url, {
      headers: { 'User-Agent': 'hk-smart-city-map/0.1 (train snapshot)' },
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    return { limited: false, board: null }
  }
  if (response.status === 429) return { limited: true, board: null }
  if (!response.ok) return { limited: false, board: null }
  let body
  try {
    body = await response.json()
  } catch {
    return { limited: false, board: null }
  }
  const data = body?.data?.[`${pair.line}-${pair.sta}`]
  return {
    limited: false,
    board: {
      status: Number(body?.status) || 0,
      sysTime: typeof body?.sys_time === 'string' ? body.sys_time : '',
      up: asTrains(data?.UP),
      down: asTrains(data?.DOWN),
    },
  }
}

export async function collectSnapshot(pairs, fetchImpl = fetch) {
  const boards = {}
  let index = 0
  let limited = false
  let okCount = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, pairs.length) }, async () => {
    while (!limited) {
      const current = index
      index += 1
      const pair = pairs[current]
      if (!pair) return
      const result = await fetchBoard(pair, fetchImpl)
      if (result.limited) {
        limited = true
        return
      }
      if (!result.board) continue
      boards[`${pair.line}-${pair.sta}`] = result.board
      okCount += 1
    }
  })
  await Promise.all(workers)
  return { updatedAt: hongKongNow(), boards, okCount, limited, total: pairs.length }
}
