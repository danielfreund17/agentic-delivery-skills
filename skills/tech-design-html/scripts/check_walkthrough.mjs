#!/usr/bin/env node
// Check the optional audio walkthrough of a tech-design page in headless Chrome.
// Usage: node check_walkthrough.mjs <file-or-url> [--widths 1920,1440,1280,1000]
// Checks: the bar is hidden at load and no audio is decoded; open + play advances the clock about 1 s per second;
// +15 s seeks; at 1.5x the clock runs about 3 s per 2 s and the stretched copy is about duration / 1.5; choosing a
// chapter seeks to it and scrolls its section to the top; pause stops the clock; close hides the bar; no page errors;
// no horizontal overflow with the bar open at every width. Exit 0 when all pass, 1 otherwise. Needs Node 22+ and Chrome.
import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
if (!args[0] || args[0] === '-h' || args[0] === '--help') { console.log('usage: node check_walkthrough.mjs <file-or-url> [--widths 1920,1440,1280,1000]'); process.exit(args[0] ? 0 : 2) }
const target = /^https?:|^file:/.test(args[0]) ? args[0] : 'file://' + resolve(args[0])
const opt = k => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : undefined }
const widths = (opt('--widths') || '1920,1440,1280,1000').split(',').map(Number)

const CANDIDATES = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)
const chromePath = CANDIDATES.find(p => existsSync(p))
if (!chromePath) { console.error('Chrome not found; set CHROME_PATH'); process.exit(2) }

const port = 9800 + Math.floor(Math.random() * 500)
const prof = `/tmp/check-walk-${port}`
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = []
const check = (ok, what, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? '  (' + detail + ')' : ''}`) }

try {
  let tabs
  for (let i = 0; i < 30 && !tabs; i++) { await sleep(300); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json() } catch {} }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl)
  let id = 0; const pend = new Map(); const errs = []
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0])
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push(m.params.entry.text.slice(0, 160))
  }
  await new Promise(r => (ws.onopen = r))
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  const js = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(expr.slice(0, 60) + ': ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result.result.value }
  const until = async (expr, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(expr)) return true; await sleep(200) } return false }
  const click = sel => js(`document.querySelector(${JSON.stringify(sel)}).click()`)
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: target }); await sleep(1500)

  // at load: present, hidden, nothing decoded, no placeholders left
  const load = await js(`({ btn: !!document.getElementById('walkOpen'), bar: !!document.getElementById('walkbar'), hidden: document.getElementById('walkbar')?.hidden,
    walk: typeof window.__walk === 'object', decoded: window.__walk?.stretched.size ?? -1,
    placeholders: /__AUDIO_B64__|__CHAPTERS__|__DURATION__/.test(document.documentElement.innerHTML),
    chapters: window.__walk?.chapters?.length ?? 0, duration: window.__walk?.duration ?? 0,
    missing: (window.__walk?.chapters || []).filter(c => !document.getElementById(c[2])).map(c => c[2]) })`)
  check(load.btn && load.bar && load.walk, 'the page has the button, the bar and the player')
  if (!(load.btn && load.bar && load.walk)) throw new Error('no walkthrough on this page; add it with walkthrough_embed.py')
  check(!load.placeholders, 'no __PLACEHOLDER__ left')
  check(load.hidden === true, 'the bar is hidden at load')
  check(load.decoded === 0, 'nothing is decoded at load', `${load.decoded} buffers`)
  check(load.chapters > 0 && load.missing.length === 0, 'every chapter points at a section on the page', load.missing.join(', ') || `${load.chapters} chapters, ${(load.duration / 60).toFixed(1)} min`)

  // open and play
  await click('#walkOpen')
  check(await js(`!document.getElementById('walkbar').hidden`), 'opening shows the bar')
  await click('#wbPlay')
  const started = await until(`window.__walk.playing && window.__walk.now() > 0.2`, 20000)
  check(started, 'play starts the audio')
  if (started) {
    let a = await js('window.__walk.now()'); await sleep(2000); let b = await js('window.__walk.now()')
    check(b - a > 1.5 && b - a < 2.5, 'the clock runs about 1 s per second', `${(b - a).toFixed(2)} s in 2 s`)

    // +15 s, when there is room
    if (load.duration > b + 20) {
      a = await js('window.__walk.now()'); await click('#wbFwd'); await sleep(300); b = await js('window.__walk.now()')
      check(b - a > 13.5 && b - a < 16.5, '+15s seeks forward', `${(b - a).toFixed(2)} s`)
    }

    // 1.5x keeps pitch through a stretched copy
    await js(`(() => { const s = document.getElementById('wbRate'); s.value = '1.5'; s.dispatchEvent(new Event('change')); })()`)
    const fast = await until(`window.__walk.rate === 1.5`, 90000)
    check(fast, 'switching to 1.5x finishes preparing')
    if (fast) {
      a = await js('window.__walk.now()'); await sleep(2000); b = await js('window.__walk.now()')
      check(b - a > 2.4 && b - a < 3.6, 'at 1.5x the clock runs about 3 s per 2 s', `${(b - a).toFixed(2)} s in 2 s`)
      const ratio = await js(`(() => { const s = window.__walk.stretched; return s.get(1).duration / s.get(1.5).duration })()`)
      check(Math.abs(ratio - 1.5) < 0.06, 'the stretched copy is about duration / 1.5', `ratio ${ratio.toFixed(3)}`)
    }

    // choose a chapter: seek + scroll
    if (load.chapters > 1) {
      const k = load.chapters - 1
      await click('#wbChap')
      check(await js(`!document.getElementById('wbList').hidden`), 'the chapter list opens')
      await js(`document.querySelectorAll('#wbList button')[${k}].click()`); await sleep(1800)
      const r = await js(`(() => { const c = window.__walk.chapters[${k}]; return { t: window.__walk.now(), start: c[0], top: document.getElementById(c[2]).getBoundingClientRect().top, maxScroll: document.documentElement.scrollHeight - innerHeight - scrollY } })()`)
      check(r.t >= r.start - 0.5 && r.t < r.start + 4, 'choosing a chapter seeks to it', `${r.t.toFixed(1)} s, chapter starts at ${r.start} s`)
      check((r.top > -4 && r.top < 80) || r.maxScroll < 2, 'choosing a chapter scrolls its section to the top', `section top at ${Math.round(r.top)} px`)
    }

    // pause and close
    await click('#wbPlay'); a = await js('window.__walk.now()'); await sleep(1000); b = await js('window.__walk.now()')
    check(!(await js('window.__walk.playing')) && Math.abs(b - a) < 0.05, 'pause stops the clock', `${(b - a).toFixed(3)} s in 1 s`)
  }
  await click('#wbClose')
  check(await js(`document.getElementById('walkbar').hidden`), 'close hides the bar')

  // layout with the bar open
  for (const w of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false })
    await sleep(300)
    await js(`document.getElementById('walkbar').hidden = false`)
    await sleep(150)
    const l = await js(`(() => { const b = document.getElementById('walkbar').getBoundingClientRect(); return { scroll: document.documentElement.scrollWidth - innerWidth, left: b.left, right: innerWidth - b.right, row: document.querySelector('#walkbar .wb-row').scrollWidth - document.querySelector('#walkbar .wb-row').clientWidth } })()`)
    check(l.scroll <= 1 && l.left >= 0 && l.right >= 0 && l.row <= 1, `no overflow with the bar open at ${w}px`, l.scroll > 1 ? `page scrolls ${l.scroll}px` : l.row > 1 ? `controls overflow ${l.row}px` : '')
    await js(`document.getElementById('walkbar').hidden = true`)
  }
  check(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '))
  ws.close()
} catch (e) {
  check(false, 'the check ran to the end', e.message)
} finally { chrome.kill(); await sleep(300); rmSync(prof, { recursive: true, force: true }) }
process.exit(results.every(Boolean) ? 0 : 1)
