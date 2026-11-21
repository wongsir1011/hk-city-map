import { LINE_ORDER, lineStyle } from './lines'
import { formatClock, formatDataTime, formatWait } from './schedule'
import type { CameraSite, MovingTrain, ScheduleResult, Station, Train } from './types'

export type DetailState =
  | { kind: 'hint' }
  | { kind: 'station-loading'; station: Station; line: string }
  | { kind: 'station'; station: Station; line: string; result: ScheduleResult }
  | { kind: 'camera-loading'; site: CameraSite }
  | { kind: 'camera'; site: CameraSite; photoUrl: string | null }
  | { kind: 'train'; train: MovingTrain }

interface DetailActions {
  onLine: (line: string) => void
  onReloadPhoto: () => void
  stationName: (code: string) => string
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function renderLegend(list: HTMLElement): void {
  list.replaceChildren()
  for (const code of LINE_ORDER) {
    const style = lineStyle(code)
    const item = el('li')
    const swatch = el('span', 'swatch')
    swatch.style.background = style.color
    item.append(swatch, el('span', undefined, style.nameZh))
    list.append(item)
  }
}

export function renderCameraResults(
  list: HTMLElement,
  sites: CameraSite[],
  query: string,
  status: 'loading' | 'ready' | 'unavailable',
  onPick: (site: CameraSite) => void,
): void {
  list.replaceChildren()
  const trimmed = query.trim()
  if (!trimmed) return
  if (status === 'loading') {
    list.append(el('li', 'search-empty', '正在載入快拍點…'))
    return
  }
  if (status === 'unavailable') {
    list.append(el('li', 'search-empty', '暫時未能載入快拍點。'))
    return
  }
  const folded = trimmed.toLowerCase()
  const hits = sites
    .filter(
      (site) =>
        site.description.includes(trimmed) ||
        site.district.includes(trimmed) ||
        site.region.includes(trimmed) ||
        site.key.toLowerCase().includes(folded),
    )
    .slice(0, 8)
  if (hits.length === 0) {
    list.append(el('li', 'search-empty', '找不到這個快拍點。'))
    return
  }
  for (const site of hits) {
    const item = el('li')
    const button = el('button', 'search-hit')
    button.type = 'button'
    button.textContent = site.description || site.key
    button.addEventListener('click', () => onPick(site))
    item.append(button)
    list.append(item)
  }
}

export function renderSearchResults(
  list: HTMLElement,
  stations: Station[],
  query: string,
  onPick: (station: Station) => void,
): void {
  list.replaceChildren()
  const trimmed = query.trim()
  if (!trimmed) return
  const folded = trimmed.toLowerCase()
  const hits = stations
    .filter(
      (station) =>
        station.nameZh.includes(trimmed) ||
        station.nameEn.toLowerCase().includes(folded) ||
        station.code.toLowerCase().includes(folded),
    )
    .slice(0, 8)

  if (hits.length === 0) {
    list.append(el('li', 'search-empty', '找不到這個車站。'))
    return
  }

  for (const station of hits) {
    const item = el('li')
    const button = el('button', 'search-hit')
    button.type = 'button'
    button.textContent = `${station.nameZh}　${station.nameEn}`
    button.addEventListener('click', () => onPick(station))
    item.append(button)
    list.append(item)
  }
}

function textOn(color: string): string {
  const hex = color.slice(1)
  const channel = (start: number) => Number.parseInt(hex.slice(start, start + 2), 16)
  const luminance = (0.299 * channel(0) + 0.587 * channel(2) + 0.114 * channel(4)) / 255
  return luminance > 0.64 ? '#1c1914' : '#fffdf8'
}

function appendLineTabs(parent: HTMLElement, station: Station, line: string, onLine: (line: string) => void): void {
  const tabs = el('div', 'line-tabs')
  tabs.setAttribute('aria-label', '選擇路綫')
  for (const code of station.lines) {
    const style = lineStyle(code)
    const tab = el('button', 'line-tab', style.nameZh)
    tab.type = 'button'
    tab.dataset.line = code
    tab.setAttribute('aria-pressed', String(code === line))
    tab.style.borderColor = style.color
    if (code === line) {
      tab.style.background = style.color
      tab.style.color = textOn(style.color)
    }
    tab.addEventListener('click', () => onLine(code))
    tabs.append(tab)
  }
  parent.append(tabs)
}

function appendStationHead(parent: HTMLElement, station: Station, line: string, onLine: (line: string) => void): void {
  parent.append(el('p', 'eyebrow', '港鐵站'))
  parent.append(el('h2', undefined, station.nameZh))
  parent.append(el('p', 'english', station.nameEn))
  if (station.race) {
    parent.append(el('p', 'fine', '馬場站通常只在賽馬日有列車停靠。'))
  }
  appendLineTabs(parent, station, line, onLine)
}

function trainRow(
  train: Train,
  referenceTime: string,
  stationName: (code: string) => string,
  repeatDestination: boolean,
): HTMLElement {
  const row = el('li', 'train')
  row.append(el('span', 'wait', formatWait(train, referenceTime)))
  const body = el('span', 'train-body')
  if (repeatDestination) body.append(el('span', 'dest', `往${stationName(train.dest)}`))
  const meta: string[] = []
  if (train.plat) meta.push(`月台 ${train.plat}`)
  if (train.timetype === 'A') meta.push('到達')
  if (train.timetype === 'D') meta.push('開出')
  if (train.route === 'RAC') meta.push('經馬場')
  const clock = formatClock(train.time)
  if (clock) meta.push(clock)
  if (meta.length > 0) body.append(el('span', 'meta', meta.join(' · ')))
  row.append(body)
  return row
}

function appendDirection(
  parent: HTMLElement,
  trains: Train[],
  otherHasTrains: boolean,
  referenceTime: string,
  stationName: (code: string) => string,
): void {
  if (trains.length === 0) {
    if (otherHasTrains) parent.append(el('p', 'empty-note', '另一方向現時沒有班次。'))
    return
  }
  const destinations = [...new Set(trains.map((train) => stationName(train.dest)))]
  const heading = destinations.length === 1 ? `往${destinations[0]}` : '這個方向'
  parent.append(el('h3', undefined, heading))
  const list = el('ol', 'trains')
  for (const train of trains) {
    list.append(trainRow(train, referenceTime, stationName, destinations.length > 1))
  }
  parent.append(list)
}

function renderStationBody(
  parent: HTMLElement,
  station: Station,
  line: string,
  result: ScheduleResult,
  actions: DetailActions,
): void {
  if (!result.ok) {
    parent.append(
      el(
        'p',
        'empty-note',
        result.reason === 'rate' ? '查詢太頻密，請稍後再點選一次。' : '暫時取不到到站資料。',
      ),
    )
    const retry = el('button', 'text-button', '再查一次')
    retry.type = 'button'
    retry.addEventListener('click', () => actions.onLine(line))
    parent.append(retry)
    return
  }

  const schedule = result.schedule
  if (schedule.isdelay === 'Y') parent.append(el('p', 'delay', '班次有延誤。'))
  const dataTime = formatDataTime(schedule.sysTime)
  if (dataTime) parent.append(el('p', 'fine', dataTime))

  if (schedule.status !== 1) {
    const emptyMessage = /empty/i.test(schedule.message)
    parent.append(
      el(
        'p',
        'empty-note',
        emptyMessage ? '暫時沒有這站的班次資料。' : '港鐵現時未能提供一般班次。以下是官方說明。',
      ),
    )
    if (!emptyMessage && schedule.message && schedule.message.toLowerCase() !== 'successful') {
      parent.append(el('p', 'official', schedule.message))
    }
    if (schedule.url) {
      const link = el('a', 'text-link', '查看港鐵公告')
      link.href = schedule.url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      parent.append(link)
    }
    return
  }

  if (schedule.up.length === 0 && schedule.down.length === 0) {
    parent.append(el('p', 'empty-note', '現時沒有即將到站的班次。'))
    if (station.race) parent.append(el('p', 'fine', '非賽馬日通常沒有班次。'))
    return
  }

  const board = el('div', 'board')
  board.style.borderColor = lineStyle(line).color
  appendDirection(board, schedule.up, schedule.down.length > 0, schedule.sysTime, actions.stationName)
  appendDirection(board, schedule.down, schedule.up.length > 0, schedule.sysTime, actions.stationName)
  parent.append(board)
  parent.append(el('p', 'fine', '每次最多顯示四班。時間由港鐵到站資料提供。'))
}

export function renderDetail(root: HTMLElement, state: DetailState, actions: DetailActions): void {
  root.replaceChildren()

  if (state.kind === 'train') {
    const style = lineStyle(state.train.line)
    root.append(el('p', 'eyebrow', '估算列車'))
    root.append(el('h2', undefined, style.nameZh))
    root.append(el('p', undefined, `往${actions.stationName(state.train.dest)}`))
    root.append(el('p', undefined, `下一站 ${actions.stationName(state.train.next)}`))
    root.append(
      el(
        'p',
        'loading',
        state.train.minutes <= 0 ? '即將到達下一站。' : `大約 ${state.train.minutes} 分鐘到達下一站。`,
      ),
    )
    root.append(el('p', 'fine', '位置按到站時間估算，並非即時定位。'))
    return
  }

  if (state.kind === 'hint') {
    root.append(
      el('h2', undefined, '尚未選擇'),
      el('p', undefined, '在地圖上點一個車站，查看即將到站的班次。點一個快拍點，查看該處最新路面照片。'),
      el('p', 'fine', '轉車站可以切換路綫。沒有班次或照片時，這裡會直接說明。'),
    )
    return
  }

  if (state.kind === 'station-loading' || state.kind === 'station') {
    appendStationHead(root, state.station, state.line, actions.onLine)
    if (state.kind === 'station-loading') {
      root.append(el('p', 'loading', '正在查詢到站班次…'))
      return
    }
    renderStationBody(root, state.station, state.line, state.result, actions)
    return
  }

  root.append(el('p', 'eyebrow', '交通快拍'))
  root.append(el('h2', undefined, state.site.description || state.site.key))
  const place = [state.site.district, state.site.region].filter(Boolean).join(' · ')
  if (place) root.append(el('p', 'english', place))
  root.append(el('p', 'fine', `編號 ${state.site.key}`))

  if (state.kind === 'camera-loading') {
    root.append(el('p', 'loading', '正在載入最新照片…'))
    return
  }

  if (state.photoUrl) {
    const figure = el('figure', 'photo')
    const image = el('img')
    image.src = state.photoUrl
    image.alt = state.site.description || '交通情況快拍'
    image.width = 320
    image.height = 240
    figure.append(image)
    root.append(figure)
  } else {
    root.append(el('p', 'empty-note', '暫時未能顯示這張快拍。'))
  }

  root.append(
    el(
      'p',
      'fine',
      '照片約每兩分鐘更新。若畫面寫著「暫時未能提供服務」，即是運輸署現時未能提供這張快拍。',
    ),
  )
  const reload = el('button', 'text-button', '重新載入照片')
  reload.type = 'button'
  reload.addEventListener('click', actions.onReloadPhoto)
  root.append(reload)
}
