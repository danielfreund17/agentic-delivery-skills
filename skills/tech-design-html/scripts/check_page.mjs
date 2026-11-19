#!/usr/bin/env node
// Check a tech design page in headless Chrome at several widths.
// Usage: node check_page.mjs <file-or-url> [--widths 1920,1440,1280,1000] [--shots <dir>]
// --shots writes <name>-<width>-full.jpg and <name>-<width>-top.jpg per width, and, at 1440 (or the first width),
// one crop per diagram, architecture block and code pair: <name>-<width>-<NN>-<what>.jpg.
// Exit 0 when every check passes, 1 otherwise. Needs Node 22+ (global WebSocket) and Google Chrome or Chromium.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const args = process.argv.slice(2)
if (!args[0] || args[0] === '-h' || args[0] === '--help') { console.log('usage: node check_page.mjs <file-or-url> [--widths 1920,1440,1280,1000] [--shots <dir>]'); process.exit(args[0] ? 0 : 2) }
const target = /^https?:|^file:/.test(args[0]) ? args[0] : 'file://' + resolve(args[0])
const opt = k => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : undefined }
const widths = (opt('--widths') || '1920,1440,1280,1000').split(',').map(Number)
const shots = opt('--shots')
const name = basename(target.split('?')[0]).replace(/\.html?$/, '') || 'page'
const cropWidth = widths.includes(1440) ? 1440 : widths[0]

const CANDIDATES = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)
const chromePath = CANDIDATES.find(p => existsSync(p))
if (!chromePath) { console.error('Chrome not found; set CHROME_PATH'); process.exit(2) }

const PAGE_CHECKS = `(() => {
  const out = { problems: [] };
  const P = m => out.problems.push(m);
  if (document.documentElement.scrollWidth > innerWidth + 1) P('page scrolls horizontally');
  document.querySelectorAll('pre').forEach(p => { if (p.scrollWidth > p.clientWidth + 1) P('code block overflows: ' + p.textContent.trim().slice(0, 50).replace(/\\s+/g, ' ')); });
  document.querySelectorAll('.seq').forEach(s => { if (s.scrollWidth > s.clientWidth + 1) P('diagram overflows: #' + s.id); });
  document.querySelectorAll('table').forEach((t, i) => { if (t.scrollWidth > t.clientWidth + 1) P('table ' + (i + 1) + ' overflows'); });
  document.querySelectorAll('.seq').forEach(s => { if (!s.querySelector('svg')) P('diagram did not render: #' + s.id); });
  document.querySelectorAll('svg').forEach((svg, n) => {
    const W = +svg.getAttribute('width'), H = +svg.getAttribute('height');
    const ts = [...svg.querySelectorAll('text')].map(t => ({ t: t.textContent, b: t.getBBox() }));
    for (let i = 0; i < ts.length; i++) {
      const a = ts[i].b;
      if (a.x < -1 || a.x + a.width > W + 1 || a.y < -1 || a.y + a.height > H + 1) P('svg ' + (n + 1) + ' text clipped: ' + ts[i].t);
      for (let j = i + 1; j < ts.length; j++) { const b = ts[j].b;
        if (a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 2 && b.y < a.y + a.height - 2) P('svg ' + (n + 1) + ' labels overlap: "' + ts[i].t + '" × "' + ts[j].t + '"'); }
    }
  });
  document.querySelectorAll('svg').forEach((svg, n) => {
    const rects = [...svg.querySelectorAll('rect')].map(r => r.getBBox());
    svg.querySelectorAll('text.edge-label').forEach(t => { const a = t.getBBox();
      if (rects.some(b => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1)) P('svg ' + (n + 1) + ' label runs into a box: ' + t.textContent);
      if (svg.classList.contains('state')) for (const l of svg.querySelectorAll('line')) {
        const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(k => +l.getAttribute(k)), steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2);
        let hit = false; for (let i = 0; i <= steps && !hit; i++) { const px = x1 + (x2 - x1) * i / steps, py = y1 + (y2 - y1) * i / steps; hit = px > a.x + 1 && px < a.x + a.width - 1 && py > a.y + 2 && py < a.y + a.height - 2; }
        if (hit) { P('svg ' + (n + 1) + ' label crosses an arrow: ' + t.textContent); break; }
      } });
  });
  document.querySelectorAll('svg.sequence').forEach((svg, n) => {
    svg.querySelectorAll('text.edge-label').forEach(t => { const b = t.getBBox(); if (b.x + b.width > +t.dataset.right - 3) P('sequence label longer than its arrow (shorten it, or raise gap): ' + t.textContent); });
    svg.querySelectorAll('text.note-label').forEach(t => { const b = t.getBBox(); if (b.x + b.width > +t.dataset.right - 2) P('sequence note outgrows its box (shorten it, or raise gap): ' + t.textContent); });
  });
  document.querySelectorAll('svg.sequence').forEach(svg => { if (+svg.dataset.gap < 150) P('sequence #' + svg.parentElement.id + ' has gap ' + svg.dataset.gap + ': lane headers overlap below 150; use fewer lanes'); });
  document.querySelectorAll('svg.sequence, svg.state').forEach(svg => {
    if (!svg.closest('.seq')) P('diagram is not inside a div.seq, so overflow checks miss it: #' + (svg.parentElement.id || '?'));
    const scale = svg.getBoundingClientRect().width / +svg.getAttribute('width');
    if (scale < 0.75) P('diagram #' + svg.parentElement.id + ' is scaled to ' + Math.round(scale * 100) + '% at this width, so its text is too small: use fewer lanes or a smaller gap');
  });
  const TAGS = new Set(['tag', 'a', 'b', 'c', 'x', 'agreed', 'proposed', 'dir']);
  document.querySelectorAll('.tag').forEach(t => [...t.classList].forEach(k => { if (!TAGS.has(k)) P('unknown tag class "' + k + '" on "' + t.textContent + '" (status: agreed, proposed, dir; owner: a, b, c, x)'); }));
  const comps = [...document.querySelectorAll('#archGrid .comp')];
  if (comps.length && typeof ARCH === 'undefined') P('architecture components exist but there is no ARCH map');
  for (const c of comps) {
    if (typeof ARCH !== 'undefined' && !(c.dataset.c in ARCH)) { P('ARCH has no entry for data-c="' + c.dataset.c + '"'); continue; }
    c.click(); if (!document.querySelector('#archDetail h5')) P('clicking "' + c.dataset.c + '" shows no detail: the wiring in the first script block is missing');
  }
  if (document.querySelector('#toc a') && !document.querySelector('#toc a.active')) P('table of contents has no active link: the scrollspy wiring in the first script block is missing');
  const ids = new Set([...document.querySelectorAll('[id]')].map(e => e.id));
  document.querySelectorAll('#toc a').forEach(a => { const id = a.getAttribute('href').slice(1); if (!ids.has(id)) P('table of contents links to missing #' + id); });
  if (/\\{\\{[A-Z_]+\\}\\}/.test(document.body.innerHTML)) P('template placeholder {{...}} left in the page');
  out.height = document.documentElement.scrollHeight; out.components = comps.length; out.diagrams = document.querySelectorAll('svg').length;
  return out;
})()`

const port = 9300 + Math.floor(Math.random() * 500)
const prof = `/tmp/check-page-${port}`
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let failed = false
try {
  let tabs
  for (let i = 0; i < 30 && !tabs; i++) { await sleep(300); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json() } catch {} }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl)
  let id = 0; const pend = new Map(); let errs = []
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0])
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push(m.params.entry.text.slice(0, 160))
  }
  await new Promise(r => (ws.onopen = r))
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable')
  if (shots) mkdirSync(shots, { recursive: true })
  for (const w of widths) {
    errs = []
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: target }); await sleep(1500)
    const r = await send('Runtime.evaluate', { expression: PAGE_CHECKS, returnByValue: true })
    const v = r.result?.result?.value
    const problems = v ? [...v.problems] : ['checks did not run: ' + JSON.stringify(r.result?.exceptionDetails?.text || r)]
    errs.forEach(e => problems.push('JS error: ' + e))
    const uniq = [...new Set(problems)]
    console.log(`${uniq.length ? 'FAIL' : 'ok  '} ${w}px  height ${v?.height}px · ${v?.diagrams} diagrams · ${v?.components} components`)
    uniq.slice(0, 15).forEach(p => console.log('     - ' + p))
    if (uniq.length) failed = true
    if (shots) {
      // reload so the page looks as a reader first sees it (the checks clicked every component)
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false })
      await send('Page.navigate', { url: target }); await sleep(1200)
      const snap = async (file, clip, beyond = false) => { const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 72, captureBeyondViewport: beyond, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); writeFileSync(`${shots}/${name}-${w}-${file}.jpg`, Buffer.from(s.result.data, 'base64')) }
      await snap('top')                                   // the first screen only
      const full = Math.min(v?.height || 900, 16000)
      await snap('full', { x: 0, y: 0, width: w, height: full }, true)
      if (w === cropWidth) {
        // one crop per diagram, architecture block and code pair: scroll it to the top, then clip inside the viewport
        const count = (await send('Runtime.evaluate', { returnByValue: true, expression: `document.querySelectorAll('.seq, #archGrid, .cols.codepair').length` })).result.result.value
        for (let n = 0; n < count; n++) {
          const r = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => { const e = document.querySelectorAll('.seq, #archGrid, .cols.codepair')[${n}]; document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 8);
            const b = e.getBoundingClientRect(), extra = e.id === 'archGrid' ? (document.getElementById('archDetail')?.getBoundingClientRect().height || 0) + 12 : 0;
            return { what: e.id || e.className.replace(/\\s+/g, '-'), x: Math.max(0, b.left - 8) + scrollX, y: Math.max(0, b.top - 8) + scrollY, width: Math.min(innerWidth, b.width + 16), height: b.height + 16 + extra } })()` })
          const c = r.result.result.value
          if (c.height > 900) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: Math.ceil(c.height) + 20, deviceScaleFactor: 1, mobile: false }); await sleep(200) }
          await sleep(150)
          await snap(String(n + 1).padStart(2, '0') + '-' + c.what, { x: c.x, y: c.y, width: c.width, height: c.height })
          if (c.height > 900) await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false })
        }
      }
    }
  }
  ws.close()
} finally { chrome.kill(); await sleep(300); rmSync(prof, { recursive: true, force: true }) }
process.exit(failed ? 1 : 0)
