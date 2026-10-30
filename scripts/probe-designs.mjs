// Diagnostic probe: switch to each board design on a mobile viewport and log, per tap,
// whether the CPU answered (answers delta) plus the status text — to see WHY taps miss.
import { chromium, devices } from 'playwright'

const URL = process.argv[2] ?? 'http://localhost:3000'
const settle = (ms = 900) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
try {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.board-canvas', { timeout: 15000 })
  await settle(3000)

  await page.evaluate(() => {
    window.__cpuAnswers = 0
    let episode = false
    const seen = () => {
      const texts = ['.status-text', '.thinking-badge', '.thinking-overlay']
        .map((sel) => document.querySelector(sel)?.textContent ?? '')
        .join(' | ')
      const active = /CPU/.test(texts)
      if (active && !episode) { episode = true; window.__cpuAnswers += 1 }
      else if (!active) { episode = false }
    }
    new MutationObserver(seen).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] })
  })
  const answers = () => page.evaluate(() => window.__cpuAnswers)
  const status = () => page.locator('.status-text').textContent().then((t) => (t ?? '').trim())

  for (const label of ['Carved', 'Floating', 'Neon']) {
    console.log(`\n=== ${label} ===`)
    await page.locator('.app-header').getByRole('button', { name: 'New round' }).click()
    await settle(900)
    console.log('after New round:', JSON.stringify(await status()))
    if (!/You \(X\)/.test(await status())) {
      try { await page.waitForFunction(() => /You \(X\)/.test(document.querySelector('.status-text')?.textContent ?? ''), null, { timeout: 8000 }) } catch { console.log('  human turn never arrived; status now:', JSON.stringify(await status())) }
    }
    await page.locator('.app-header').getByRole('button', { name: 'Settings', exact: true }).click()
    await page.waitForSelector('.settings-modal', { timeout: 4000 })
    await page.locator('.settings-nav').getByRole('button', { name: 'Appearance' }).click()
    await settle(300)
    await page.locator('.settings-content').getByRole('button', { name: label, exact: true }).click()
    await page.keyboard.press('Escape')
    await settle(1400)
    console.log('after design swap:', JSON.stringify(await status()), 'answers=', await answers())

    const box = await page.locator('.board-stage').boundingBox()
    const cx = box.x + box.width / 2
    let landed = false
    const probes = []
    for (const fx of [0.5, 0.32, 0.68]) {
      for (const dy of [0, 30, -30, 62, -62, 95, -95, 128, -128]) probes.push([fx, box.y + box.height / 2 + dy])
    }
    for (const [tx, ty] of probes) {
      if (landed) break
      const before = await answers()
      const beforeStatus = await status()
      await page.touchscreen.tap(tx, ty)
      const hit = await page.evaluate(async () => {
        const start = window.__cpuAnswers
        const t0 = Date.now()
        await new Promise((resolve) => {
          const check = () => { if (window.__cpuAnswers > start || Date.now() - t0 > 2200) resolve() ; requestAnimationFrame(check) }
          check()
        })
        return window.__cpuAnswers > start
      })
      const afterStatus = await status()
      console.log(`tap(${Math.round(tx)}, ${Math.round(ty)}): answers ${before}->${await answers()} status "${beforeStatus}" -> "${afterStatus}" ${hit ? '✅ LANDED' : ''}`)
      if (hit) { landed = true; await page.screenshot({ path: 'screenshots/probe-design-tapped.png' }) }
    }
    console.log(`landed=${landed}`)
    await page.screenshot({ path: `screenshots/probe-design-${label.toLowerCase()}.png` })
    if (!landed) {
      // also dump where the board actually is by sampling canvas pixels for the frame colour band
      const cols = await page.evaluate(() => {
        const canvas = document.querySelector('.board-canvas')
        const stage = document.querySelector('.board-stage')
        const rect = stage.getBoundingClientRect()
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      })
      console.log('stage rect:', JSON.stringify(cols))
    }
  }
  await ctx.close()
} finally {
  await browser.close()
}
