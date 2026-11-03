// dingtalk-icon — stopgap brand mark for the DingTalk platform chip.
// Replaces the plain "D" monogram with the Ding (bolt/wing) SVG until the
// upstream change (PR #148404) ships in a release. Pure user-level disk
// plugin: disable or delete this folder to revert; the app hot-reloads both.
import { host } from '@hermes/plugin-sdk'

const PATH_D =
  'M5.49 0L4.78 0Q4.39 2.9 4.71 3.96Q5.02 5.02 5.68 5.88Q6.35 6.75 7.76 7.73L9.18 8.71L9.02 9.02L4.31 6.2Q4.47 9.18 5.25 10.23Q6.04 11.29 7.1 12.04L8.16 12.78L5.96 12.16Q5.8 12.63 6.58 13.69Q7.37 14.75 8.04 15.14Q8.71 15.53 9.89 15.77L11.06 16L9.73 18.9L11.76 19.14L9.02 23.92Q9.33 23.92 13.8 20.66L18.27 17.41L16.55 17.18Q19.45 13.88 19.64 12.98Q19.84 12.08 19.45 11.53Q19.06 10.98 16.82 9.21Q14.59 7.45 10.39 3.73Q6.2 0 5.49 0Z'

const SVG_NS = 'http://www.w3.org/2000/svg'
const BRAND = '#0066FF'

// Elements we painted, with the values to restore on dispose.
const painted = new Map()

const isChip = el =>
  el instanceof HTMLElement &&
  el.tagName === 'SPAN' &&
  el.className.includes &&
  el.className.includes('place-items-center')

const OTHER_PLATFORMS = /discord|slack|telegram|whatsapp|matrix|signal|mattermost|irc|wecom|weixin|feishu|lark|sms|webhook|bluebubbles|photon|email/i

const looksLikeDingTalkChip = chip => {
  // The monogram must be exactly the letter D (avatar-chip renders bare text).
  const textNodes = [...chip.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim() === 'D')
  if (!textNodes.length) return false
  // Context gate: climb to the ROW level and require a DingTalk label. Stop at
  // the first ancestor that mixes other platform names — that means we have
  // climbed past the row into a list/page container, whose text mentions
  // everything (a page-level match would wrongly paint every D chip on screen).
  let node = chip
  for (let hop = 0; hop < 5 && node; hop++) {
    const t = (node.textContent || '') + ' ' + (node.getAttribute('title') || '')
    const mine = /dingtalk|钉钉/i.test(t)
    const mixed = OTHER_PLATFORMS.test(t)
    if (mine && !mixed) return true
    if (mixed) return false   // past the row boundary; bail without a match
    node = node.parentElement
  }
  return false
}

const patchChip = chip => {
  const restore = { text: [], bg: chip.style.backgroundColor, color: chip.style.color }
  for (const n of [...chip.childNodes]) {
    if (n.nodeType === 3 && n.textContent.trim() === 'D') {
      restore.text.push(n.textContent)
      chip.removeChild(n)
    }
  }
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('data-dti', '1')
  svg.style.width = '58%'
  svg.style.height = '58%'
  svg.style.display = 'block'
  svg.appendChild(
    (() => {
      const p = document.createElementNS(SVG_NS, 'path')
      p.setAttribute('d', PATH_D)
      p.setAttribute('fill', 'currentColor')
      p.setAttribute('fill-rule', 'evenodd')
      return p
    })()
  )
  chip.dataset.dtiPatched = '1'
  chip.appendChild(svg)
  // rgba brand@16% — same paint as color-mix without the engine support risk
  chip.style.backgroundColor = 'rgba(0, 102, 255, 0.16)'
  chip.style.color = BRAND
  painted.set(chip, restore)
}

const revertAll = () => {
  for (const [chip, restore] of painted) {
    try {
      chip.querySelector('svg[data-dti]')?.remove()
      delete chip.dataset.dtiPatched
      for (const text of restore.text) chip.appendChild(document.createTextNode(text))
      chip.style.backgroundColor = restore.bg
      chip.style.color = restore.color
    } catch { /* a detached node is fine */ }
  }
  painted.clear()
}

const sweep = () => {
  for (const el of document.querySelectorAll('span[class*="place-items-center"]')) {
    if (el.dataset.dtiPatched || !isChip(el)) continue
    if (looksLikeDingTalkChip(el)) patchChip(el)
  }
}

let raf = 0
const schedule = () => {
  if (raf) return
  raf = requestAnimationFrame(() => { raf = 0; sweep() })
}

let observer = null

export default {
  id: 'dingtalk-icon',
  name: 'DingTalk brand icon',
  register(ctx) {
    observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    // One delayed pass catches rows React re-painted after mount (virtualized lists).
    const timers = [100, 500, 1500].map(ms => setTimeout(sweep, ms))
    schedule()
    ctx.onDispose(() => {
      timers.forEach(clearTimeout)
      observer?.disconnect()
      observer = null
      cancelAnimationFrame(raf); raf = 0
      revertAll()
    })
    host.logs?.('dingtalk-icon: painted bolt over the D monogram (stopgap until PR #148404 ships)')
  }
}
