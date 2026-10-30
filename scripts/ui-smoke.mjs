// Headless-browser smoke test for the 3D board.
// Usage:  npm run ui:smoke [url]      (default url: http://localhost:3000, the dist server)
// Needs:  npm i -D playwright && npx playwright install chromium --only-shell
// It boots the page with SwiftShader software WebGL, walks the UI (themes, settings modal
// sections, fullscreen, win overlay), simulates touch taps/drags, and drops
// screenshots in ./screenshots for eyeballing.
import { mkdirSync } from 'node:fs'

import { chromium, devices } from 'playwright'

const URL = process.argv[2] ?? 'http://localhost:3000'
const OUT = 'screenshots'
mkdirSync(OUT, { recursive: true })

const passes = []
const fails = []
const consoleNotes = new Set()
const shots = []

const pass = (name) => passes.push(name)
const fail = (name, detail = '') => fails.push(`${name}${detail ? `: ${detail}` : ''}`)
const settle = (ms = 900) => new Promise((resolve) => setTimeout(resolve, ms))

function watch(page, label) {
  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') consoleNotes.add(`[${label}] ${type}: ${msg.text()}`)
  })
  page.on('pageerror', (err) => fails.push(`page error [${label}]: ${err.message}`))
}

async function shoot(page, name, target) {
  const file = `${OUT}/${name}.png`
  await (target ?? page.locator('body')).screenshot({ path: file })
  shots.push(file)
}

const statusText = (page) => page.locator('.status-text').textContent().then((t) => (t ?? '').trim())

async function waitForHumanTurn(page, timeout = 6000) {
  try {
    await page.waitForFunction(() => /You \(X\)/.test(document.querySelector('.status-text')?.textContent ?? ''), null, { timeout })
    return true
  } catch {
    return false
  }
}

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })

try {
  /* ---------------- desktop pass ---------------- */

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  const page = await ctx.newPage()
  watch(page, 'desktop')
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.board-canvas', { timeout: 15000 })
  await settle(2500)

  if (await page.locator('.board-fallback').isVisible()) {
    fail('webgl', 'Board3D fell back to the no-WebGL panel — cannot render headless')
  } else {
    const maxTexture = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')
      return gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0
    })
    if (maxTexture >= 4096) pass(`webgl2 active (SwiftShader, MAX_TEXTURE_SIZE ${maxTexture})`)
    else fail('webgl', `weak webgl2 (${maxTexture})`)
  }

  await shoot(page, '01-neon-violet', page.locator('.board-stage'))

  for (let i = 0; i < 7; i += 1) {
    await page.keyboard.press('t')
    await settle(1400)
    const tagline = await page.locator('.tagline').textContent()
    const slug = (tagline ?? '').split('·').pop().trim().toLowerCase().replace(/\s+/g, '-')
    await shoot(page, `theme-${i + 2}-${slug}`, page.locator('.board-stage'))
  }

  // settings modal: header button opens it, the section sidebar swaps sections,
  // backdrop click / Escape close it and the S key toggles it
  const headerSettings = page.locator('.app-header').getByRole('button', { name: 'Settings', exact: true })
  await headerSettings.click()
  await page.waitForSelector('.settings-modal', { timeout: 4000 })
  await settle(500)
  const matchScore = (await page.locator('.settings-content .panel--scores').count()) > 0
  await page.locator('.settings-nav').getByRole('button', { name: 'Appearance' }).click()
  await settle(400)
  const themeGrid = (await page.locator('.settings-content .theme-grid').count()) > 0
  await shoot(page, 'settings-modal-appearance')
  await page.locator('.settings-nav').getByRole('button', { name: /Motion & sound/ }).click()
  await settle(400)
  const motionGroup = (await page.locator('.settings-content [role="group"][aria-label="Motion"]').count()) > 0
  if (matchScore && themeGrid && motionGroup) pass('settings modal section nav swaps Match/Appearance/Motion')
  else fail('settings section nav', `match=${matchScore} appearance=${themeGrid} motion=${motionGroup}`)

  await page.mouse.click(24, 24) // top-left corner is the dimmed backdrop, not the card
  await settle(400)
  const closedByBackdrop = (await page.locator('.settings-modal').count()) === 0
  await page.keyboard.press('s')
  await settle(400)
  const openedByS = (await page.locator('.settings-modal').count()) > 0
  await page.keyboard.press('Escape')
  await settle(400)
  const closedByEscape = (await page.locator('.settings-modal').count()) === 0
  if (closedByBackdrop && openedByS && closedByEscape) pass('modal closes on backdrop click, S key reopens, Escape closes')
  else fail('modal open/close', `backdrop=${closedByBackdrop} sKey=${openedByS} escape=${closedByEscape}`)

  // fullscreen focus mode
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click()
  await page.waitForSelector('.hud-bar', { timeout: 4000 })
  await settle(1300)
  const headerGone = !(await page.locator('.app-header').isVisible())
  const scoreInHud = (await page.locator('.hud-score').textContent()).includes('draws')
  if (headerGone && scoreInHud) pass('fullscreen hides chrome and shows score HUD')
  else fail('fullscreen', `headerVisible=${!headerGone} score=${scoreInHud}`)
  await shoot(page, 'fullscreen')
  await page.locator('.hud-actions').getByRole('button', { name: 'Settings' }).click()
  await settle(900)
  const overFullscreen =
    (await page.locator('.settings-modal').count()) > 0 &&
    (await page.getAttribute('.app', 'data-fullscreen')) === 'true'
  if (overFullscreen) pass('HUD Settings opens the modal on top of fullscreen')
  else fail('HUD Settings wiring', 'modal not mounted or fullscreen was dropped')
  await shoot(page, 'settings-modal-fullscreen')
  await page.keyboard.press('Escape')
  await settle(500)
  const modalGoneStillFullscreen =
    (await page.locator('.settings-modal').count()) === 0 &&
    (await page.getAttribute('.app', 'data-fullscreen')) === 'true'
  if (modalGoneStillFullscreen) pass('Escape closes the modal without leaving fullscreen')
  else fail('Escape priority', 'modal and fullscreen state out of sync after Escape')
  await page.keyboard.press('Escape') // second press leaves fullscreen
  await settle(700)

  // finish a round: pvp via saved settings, keyboard plays a row, overlay + beam
  await page.evaluate(() => {
    localStorage.setItem('tic-tac-toe-3d:v1', JSON.stringify({
      version: 1,
      settings: { mode: 'pvp', startingRule: 'X', autoAdvance: false, sound: false },
      theme: { presetId: 'neon-violet', colors: {} },
      scores: { X: 0, O: 0, draws: 0 },
    }))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(2500)
  for (const key of ['9', '1', '7', '2', '8']) {
    await page.keyboard.press(key)
    await settle(220)
  }
  await page.waitForSelector('.overlay', { timeout: 5000 })
  const overlayTitle = (await page.locator('.overlay-title').textContent()) ?? ''
  if (overlayTitle.includes('X wins')) pass('win detection + result overlay')
  else fail('result overlay', overlayTitle)
  await settle(1600) // winning beam animation
  await shoot(page, 'win-overlay', page.locator('.board-canvas'))

  // the win moment on the neon lattice: rails warm to the win colour, beam survives the swap
  await headerSettings.click()
  await page.waitForSelector('.settings-modal', { timeout: 4000 })
  await page.locator('.settings-nav').getByRole('button', { name: 'Appearance' }).click()
  await settle(400)
  await page.locator('.settings-content').getByRole('button', { name: 'Neon', exact: true }).click()
  await page.keyboard.press('Escape')
  await settle(2300)
  if ((await page.locator('.overlay').count()) > 0) pass('win state and beam survive a mid-win design swap')
  else fail('design swap during win', 'overlay vanished after the swap')
  await shoot(page, 'design-neon-win', page.locator('.board-canvas'))
  await ctx.close()

  /* ---------------- touch pass ---------------- */

  const touchCtx = await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1 })
  const mobile = await touchCtx.newPage()
  watch(mobile, 'touch')
  await mobile.goto(URL, { waitUntil: 'domcontentloaded' })
  await mobile.waitForSelector('.board-canvas', { timeout: 15000 })
  await settle(2800)

  const prevented = await mobile.evaluate(() => {
    const canvas = document.querySelector('.board-canvas')
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    canvas.dispatchEvent(event)
    return event.defaultPrevented
  })
  if (prevented) pass('long-press menu suppressed on the board')
  else fail('long-press suppression')

  const box = await mobile.locator('.board-stage').boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // In-page oracle: count every episode where the game says the CPU is thinking. Each registered
  // human tap is followed by exactly one such episode, so a tap landing can be verified through a
  // persistent counter instead of a transient status-text window that SwiftShader render jank can
  // hide from any polling helper.
  await mobile.evaluate(() => {
    window.__cpuAnswers = 0
    let episode = false
    const seen = () => {
      const texts = ['.status-text', '.thinking-badge', '.thinking-overlay']
        .map((sel) => document.querySelector(sel)?.textContent ?? '')
        .join(' | ')
      const active = /CPU/.test(texts)
      if (active && !episode) {
        episode = true
        window.__cpuAnswers += 1
      } else if (!active) {
        episode = false
      }
    }
    new MutationObserver(seen).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    })
  })
  const cpuAnswers = () => mobile.evaluate(() => window.__cpuAnswers)
  const landedSince = (from, timeout = 2400) =>
    mobile.waitForFunction((n) => window.__cpuAnswers > n, from, { timeout }).then(() => true, () => false)

  // 1. calibrate first: on a short mobile stage the exact center can land on the sky gap,
  //    so probe a few offsets along the centre column until one registers a play.
  const playPoint = { x: cx, y: cy, dy: 0 }
  let tapped = false
  for (const dy of [0, 30, -30, 62, -62, 95, -95, 128, -128]) {
    const from = await cpuAnswers()
    await mobile.touchscreen.tap(cx, cy + dy)
    if (await landedSince(from)) {
      playPoint.y = cy + dy
      playPoint.dy = dy
      tapped = true
      await waitForHumanTurn(mobile)
      break
    }
  }
  if (tapped) pass(`touch tap placed a piece (CPU answered; stage center landed on it at dy=${playPoint.dy})`)
  else fail('touch tap', 'no centre-column offset registered a move')

  // 2. tapping an occupied cell must do nothing (reuse the square we just played)
  const occupiedAnswersBefore = await cpuAnswers()
  const before = await statusText(mobile)
  await mobile.touchscreen.tap(playPoint.x, playPoint.y)
  await settle(1600)
  const after = await statusText(mobile)
  const occupiedAnswersAfter = await cpuAnswers()
  if (tapped && before === after && after.includes('You (X)') && occupiedAnswersAfter === occupiedAnswersBefore) {
    pass('tap on an occupied cell is ignored')
  } else if (!tapped) {
    fail('occupied-cell tap', 'skipped: calibration tap never landed')
  } else {
    fail('occupied-cell tap', `"${before}" -> "${after}", answers ${occupiedAnswersBefore}->${occupiedAnswersAfter}`)
  }

  // 3. a one-finger drag must orbit (or at least never count as a play)
  const cdp = await mobile.context().newCDPSession(mobile)
  const startX = box.x + box.width * 0.68
  const startY = box.y + box.height * 0.42
  const statusBeforeDrag = await statusText(mobile)
  const answersBeforeDrag = await cpuAnswers()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: startY }] })
  for (let i = 1; i <= 6; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: startX + i * 28, y: startY + i * 4 }],
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await settle(1000)
  const statusAfterDrag = await statusText(mobile)
  const answersAfterDrag = await cpuAnswers()
  if (statusAfterDrag === statusBeforeDrag && answersAfterDrag === answersBeforeDrag) {
    pass('finger drag did not play a move (orbit gesture)')
  } else {
    fail('drag guard', `"${statusBeforeDrag}" -> "${statusAfterDrag}", answers ${answersBeforeDrag}->${answersAfterDrag}`)
  }

  // 4. play several answered moves via taps only (a dense candidate grid survives modest camera
  //    drift; rounds auto-advance, so the answer counter keeps climbing across a fresh board)
  const candidates = []
  for (const fx of [0.28, 0.4, 0.52, 0.64, 0.76]) {
    for (const fy of [0.34, 0.42, 0.5, 0.58, 0.66]) candidates.push([fx, fy])
  }
  for (const fx of [0.2, 0.5, 0.8]) {
    for (const fy of [0.28, 0.5, 0.72]) candidates.push([fx, fy])
  }

  let resultText = ''
  for (const [fx, fy] of candidates) {
    if (await cpuAnswers() >= 5) break
    if (/CPU/.test(await statusText(mobile))) await waitForHumanTurn(mobile)
    const from = await cpuAnswers()
    await mobile.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy)
    if (await landedSince(from)) await waitForHumanTurn(mobile)
    const live = await statusText(mobile)
    if (!resultText && /win|draw|tie/i.test(live)) resultText = live
  }
  const answers = await cpuAnswers()
  const endStatus = await statusText(mobile)
  // 4 CPU answers = at least 4 taps landed on distinct cells and every one was answered.
  // A draw/win round-end adds more answers via auto-advance, so the bar is met either way.
  if (answers >= 4) {
    pass(`playable end-to-end with touch taps (${answers} CPU answers${resultText ? `, first round result: ${resultText}` : ''}; end status: "${endStatus}")`)
  } else {
    fail('touch plays', `only ${answers} CPU answers recorded (end status: "${endStatus}")`)
  }

  await settle(2600)
  await shoot(mobile, 'touch-final')

  // 5. board design picker: swap the 3D architecture mid-session and keep playing with taps.
  //    each round is cleared first, so the swapped-in board must accept at least one tap.
  const designTaps = [[0.5, 0.5], [0.3, 0.36], [0.7, 0.64], [0.28, 0.5], [0.72, 0.42], [0.5, 0.3], [0.5, 0.7], [0.3, 0.66], [0.7, 0.34]]
  for (const label of ['Carved', 'Floating', 'Neon']) {
    await mobile.locator('.app-header').getByRole('button', { name: 'New round' }).click()
    await settle(700)
    if (!/You \(X\)/.test(await statusText(mobile))) await waitForHumanTurn(mobile)
    await mobile.locator('.app-header').getByRole('button', { name: 'Settings', exact: true }).click()
    await mobile.waitForSelector('.settings-modal', { timeout: 4000 })
    await mobile.locator('.settings-nav').getByRole('button', { name: 'Appearance' }).click()
    await settle(400)
    await mobile.locator('.settings-content').getByRole('button', { name: label, exact: true }).click()
    await mobile.keyboard.press('Escape')
    await settle(1200)
    // clicking side-panel controls scrolls the page and lifts the board out of the viewport:
    // bring the stage back into view and re-anchor the tap coordinates before probing
    await mobile.locator('.board-stage').scrollIntoViewIfNeeded()
    await settle(500)
    const stageBox = await mobile.locator('.board-stage').boundingBox()
    let landed = false
    for (const [fx, fy] of designTaps) {
      const from = await cpuAnswers()
      await mobile.touchscreen.tap(stageBox.x + stageBox.width * fx, stageBox.y + stageBox.height * fy)
      if (await landedSince(from, 2600)) {
        landed = true
        break
      }
    }
    if (landed) pass(`board design "${label}" swaps live and plays on touch`)
    else fail(`board design ${label}`, 'no tap registered after the swap')
    await settle(1500)
    await shoot(mobile, `design-${label.toLowerCase()}`, mobile.locator('.board-stage'))
  }

  await touchCtx.close()
} finally {
  await browser.close()
}

console.log(`url: ${URL}`)
console.log('screenshots: ' + shots.join(', '))
if (consoleNotes.size > 0) console.log(`\nconsole notes:\n${[...consoleNotes].join('\n')}`)
console.log(`\npasses (${passes.length}):`)
for (const line of passes) console.log(`  PASS  ${line}`)
if (fails.length > 0) {
  console.log(`\nfails (${fails.length}):`)
  for (const line of fails) console.log(`  FAIL  ${line}`)
}
process.exitCode = fails.length > 0 ? 1 : 0
