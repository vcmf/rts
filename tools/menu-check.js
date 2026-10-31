// The front menu's page check, evaluated inside app/menu.html by tools/menu-check.ts (a script: it reads the page's
// window.MENU and its DOM). `menuCheck(expected)` walks every screen and returns { failures, checked }; `expected` is
// the roster as loaded, copied before any sabotage, so a page that drops what the roster holds is caught.
// docs/systems/front-menu.md ("Checks").

/** The next two frames: the hashchange has fired and the screen is drawn. */
function settle() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

async function visit(hash) {
  location.hash = hash
  await settle()
}

function press(key) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

/** Every check: each returns a list of failures (empty when it passes). */
const MENU_CHECKS = {
  /** The page is no wider than the window on every screen it shows. */
  async overflow(expected) {
    const failures = []
    const first = expected.commanders[0]
    const plate = `#roster/commanders/${first.nation}/all/${encodeURIComponent(first.id)}`
    for (const hash of ['#home', '#history', '#roster/regiments', plate]) {
      await visit(hash)
      const over = document.documentElement.scrollWidth - innerWidth
      if (over > 0) failures.push(`overflow: ${hash} is ${over} px wider than the window`)
    }
    return failures
  },

  /** Muted items cannot be focused or chosen; the live one opens History; the arrows skip the muted. */
  async home() {
    const failures = []
    await visit('#home')
    const items = [...document.querySelectorAll('.menu-item')]
    const muted = items.filter(i => i.getAttribute('aria-disabled') === 'true')
    if (!muted.length || muted.length === items.length) failures.push('home: expected muted and live items')
    for (const item of muted) {
      if (item.tabIndex !== -1) failures.push(`muted: ${item.textContent.trim().slice(0, 20)} is focusable`)
      item.click()
      await settle()
      if (location.hash !== '#home') failures.push(`muted: a click on a muted item went to ${location.hash}`)
      await visit('#home')
    }
    press('ArrowDown')
    press('ArrowUp')
    const selected = document.querySelector('.menu-item.sel')
    if (!selected || selected.getAttribute('aria-disabled') === 'true') failures.push('home: a muted item is selected')
    press('Enter')
    await settle()
    if (location.hash !== '#history') failures.push(`home: Enter went to ${location.hash || 'nowhere'}, not History`)
    return failures
  },

  /** History's plates show the roster's counts and each opens its roster. */
  async history(expected) {
    const failures = []
    for (const kind of ['commanders', 'regiments']) {
      await visit('#history')
      const plate = document.querySelector(`#history [data-kind=${kind}]`)
      const count = plate.querySelector('.count').textContent
      if (!count.startsWith(`${expected[kind].length} `)) failures.push(`history: ${kind} count reads "${count}"`)
      plate.click()
      await settle()
      if (!location.hash.startsWith(`#roster/${kind}/`)) {
        failures.push(`history: ${kind} plate went to ${location.hash}`)
      }
    }
    return failures
  },

  /** Every army's roster of each kind (and each arm) shows exactly the roster's entries, in order. */
  async rosters(expected) {
    const failures = []
    for (const kind of ['commanders', 'regiments']) {
      for (const nation of expected.nations) {
        const arms = kind === 'regiments' ? ['all', ...expected.arms] : ['all']
        for (const arm of arms) {
          await visit(`#roster/${kind}/${nation.id}/${arm}`)
          const want = expected[kind].filter(e => e.nation === nation.id && (arm === 'all' || e.arm === arm))
          const got = [...document.querySelectorAll('#roster .card')].map(c => c.dataset.id)
          if (got.join() !== want.map(e => e.id).join()) {
            failures.push(`cards: ${kind}/${nation.id}/${arm} shows ${got.length}, the roster has ${want.length}`)
          }
        }
      }
    }
    return failures
  },

  /** A card opens its plate (modal: focus on Close, the roster inert), the arrows turn it, Esc closes it back onto
   *  the card last shown, then walks back to home one level at a time. */
  async plateAndEscape(expected) {
    const failures = []
    const nation = expected.nations[0].id
    const first = expected.regiments.filter(e => e.nation === nation)
    await visit(`#roster/regiments/${nation}/all`)
    document.querySelector('#roster .card').click()
    await settle()
    const name = () => document.querySelector('#plate [data-slot=name]').textContent
    if (document.querySelector('#plate').hidden || name() !== first[0].name) {
      failures.push('plate: a click on the first card did not open its plate')
    }
    if (document.activeElement !== document.querySelector('#plate [data-turn=close]')) {
      failures.push('plate: focus is not on its Close button')
    }
    if (!document.querySelector('#roster').inert) failures.push('plate: the roster behind it is not inert')
    press('ArrowRight')
    await settle()
    if (first.length > 1 && name() !== first[1].name) failures.push('plate: ArrowRight did not turn to the next entry')
    const back = []
    for (let i = 0; i < 3; i++) {
      press('Escape')
      await settle()
      await settle()
      back.push(location.hash.split('/')[0] + (document.querySelector('#plate').hidden ? '' : '+plate'))
      if (i === 0 && document.activeElement?.dataset.id !== first[Math.min(1, first.length - 1)].id) {
        failures.push('Esc: focus did not return to the card last shown')
      }
    }
    if (back.join() !== '#roster,#history,#home') failures.push(`Esc: walked back ${back.join(' → ')}`)
    return failures
  },

  /** A control already showing its route adds no history entry; Next at the last entry leaves focus on Close. */
  async historyAndEnds(expected) {
    const failures = []
    const nation = expected.nations[0].id
    await visit(`#roster/regiments/${nation}/all`)
    // counted at pushState: history.length stops growing at the browser's cap (50 in Chrome)
    const push = history.pushState
    let pushes = 0
    history.pushState = (...args) => {
      pushes += 1
      return push.apply(history, args)
    }
    document.querySelector('#roster [data-slot=nations] .chip[aria-pressed=true]').click()
    document.querySelector('#roster .tab[aria-selected=true]').click()
    await settle()
    history.pushState = push
    if (pushes) failures.push(`history: pressed controls added ${pushes} entries`)
    const ids = expected.regiments.filter(e => e.nation === nation).map(e => e.id)
    await visit(`#roster/regiments/${nation}/all/${encodeURIComponent(ids[ids.length - 2])}`)
    const next = document.querySelector('#plate [data-turn=next]')
    next.focus()
    next.click()
    await settle()
    if (document.activeElement !== document.querySelector('#plate [data-turn=close]')) {
      failures.push('ends: focus left the plate when Next reached the last entry')
    }
    return failures
  },

  /** Every card shows a thumbnail, and each loads. Identical paintings (a mount shared by armies) share one URL. */
  async images(expected) {
    const sources = new Set()
    let shown = 0
    for (const kind of ['commanders', 'regiments']) {
      for (const nation of expected.nations) {
        await visit(`#roster/${kind}/${nation.id}/all`)
        for (const img of document.querySelectorAll('#roster .card img')) {
          sources.add(img.src)
          shown += 1
        }
      }
    }
    const loads = [...sources].map(
      src =>
        new Promise(resolve => {
          const img = new Image()
          img.onload = () => resolve(img.naturalWidth > 0 ? null : src)
          img.onerror = () => resolve(src)
          img.src = src
        }),
    )
    const broken = (await Promise.all(loads)).filter(Boolean)
    const total = expected.commanders.length + expected.regiments.length
    const failures = broken.map(src => `images: ${src} does not load`)
    if (shown !== total) failures.push(`images: ${shown} cards with a thumbnail, ${total} in the roster`)
    return failures
  },
}

/** Runs every check against `expected`; ends back at home. The page's entry point (a script: set on window). */
window.menuCheck = async function menuCheck(expected) {
  const failures = []
  for (const [name, check] of Object.entries(MENU_CHECKS)) {
    try {
      failures.push(...(await check(expected)))
    } catch (error) {
      failures.push(`${name}: threw ${error && error.message}`)
    }
  }
  await visit('#home')
  return { failures, checked: Object.keys(MENU_CHECKS).length }
}
