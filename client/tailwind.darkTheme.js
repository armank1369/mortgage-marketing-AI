// Lucie's dark theme.
//
// Lucie's screens are written with light-theme Tailwind classes (bg-white, text-slate-700,
// bg-blue-50 ...). Instead of adding a `dark:` twin to every class in every component, this
// plugin gives each of those classes a dark counterpart that applies while <html> has the
// `dark` class. Neon Auth's theme provider (next-themes) sets that class from the person's
// browser or OS setting, or from the Appearance choice in Settings.
//
// Only rules for class names that appear in the source are emitted (the same way Tailwind
// purges), so new screens built from the same classes get a dark theme for free.
// Chromatic colors are read from the Tailwind theme, so palette changes in tailwind.config.js
// (for example blue -> Lucent teal) carry over to dark mode automatically.
//
// For one-off cases, the regular `dark:` variant also works (darkMode: 'class').

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DARK = '.dark'
const ROOT = path.dirname(fileURLToPath(import.meta.url))

// Every whitespace/quote separated token in the client source, like Tailwind's own scan.
function sourceTokens() {
  const tokens = new Set()
  const visit = (file) => {
    const stat = statSync(file)
    if (stat.isDirectory()) return readdirSync(file).forEach((child) => visit(path.join(file, child)))
    if (!/\.(jsx?|tsx?|html)$/.test(file) || /\.test\.js$/.test(file)) return
    for (const token of readFileSync(file, 'utf8').split(/[\s'"`{}()<>=,;]+/)) if (token) tokens.add(token)
  }
  visit(path.join(ROOT, 'src'))
  visit(path.join(ROOT, 'index.html'))
  return tokens
}

// Neutral surfaces in dark mode, darkest to lightest.
export const darkTokens = {
  // Layered slate/navy surfaces: sidebar (darkest) < page < panels < cards < hover/chips, so each
  // layer reads as separate from the next instead of everything sinking into one near-black.
  sidebar: '#161d2a', // sidebar and mobile bar
  canvas: '#1f2837', // page background
  panel: '#243042', // subtle panels on the page (light theme: slate-50)
  surface: '#2b3649', // cards, dialogs (light theme: white)
  raised: '#364359', // hover rows, chips (light theme: slate-100)
  raised2: '#425068', // pressed / stronger fills (light theme: slate-200)
  field: '#222c3c', // inputs sit slightly below the card they are on
  line: '#43506a', // default borders
  lineStrong: '#5a6985',
  ink: '#f4f7fa', // primary text
  bubble: '#1a7f95', // user chat bubble: Lucent teal, white text 5:1
  // Dark buttons (bg-slate-900, bg-lucent-navy) flip to a light fill in dark mode so the main
  // action still stands out; dark *containers* (mobile bar, sign-in side panel) are lifted.
  invertBg: '#e8edf3',
  invertBgHover: '#ffffff',
  invertInk: '#161c25',
  lifted: '#3a4760', // selected cards and other dark containers
  liftedHover: '#44526d',
}

const t = darkTokens

// Background, text and border colors for the light-theme neutrals.
const neutralBackgrounds = {
  white: t.surface,
  'slate-50': t.panel,
  'slate-100': t.raised,
  'slate-200': t.raised2,
  'slate-300': '#4d5b73',
  'slate-400': '#64738c',
  'gray-50': t.panel,
  'gray-100': t.raised,
  'gray-200': t.raised2,
  'lucent-cream': t.canvas,
}
const neutralText = {
  black: t.ink,
  'slate-900': t.ink,
  'slate-800': '#e8edf3',
  'slate-700': '#dbe2eb',
  'slate-600': '#c6cfdb',
  'slate-500': '#b0bbca',
  'slate-400': '#9aa7b8',
  'slate-300': '#7f8c9f',
  'gray-900': t.ink,
  'gray-800': '#e8edf3',
  'gray-700': '#dbe2eb',
  'gray-600': '#c6cfdb',
  'gray-500': '#b0bbca',
  'gray-400': '#9aa7b8',
  'lucent-navy': t.ink,
}
const neutralBorders = {
  'slate-100': '#38455c',
  'slate-200': t.line,
  'slate-300': t.lineStrong,
  'slate-400': '#6f7e99',
  'slate-900': '#cbd5e1',
  'gray-100': '#38455c',
  'gray-200': t.line,
  'gray-300': t.lineStrong,
  'lucent-navy': '#cbd5e1',
}

// Chromatic scales: light tints become deep tints, dark text becomes light text.
const CHROMATIC = ['blue', 'sky', 'indigo', 'cyan', 'teal', 'emerald', 'green', 'lime', 'amber', 'yellow', 'orange', 'red', 'rose', 'pink', 'fuchsia', 'purple', 'violet']
const tintBackground = { 50: ['900', 0.28], 100: ['900', 0.5], 200: ['800', 0.6] }
const tintBorder = { 100: ['800', 0.55], 200: ['700', 0.6], 300: ['600', 0.7] }
const tintText = { 600: '400', 700: '300', 800: '200', 900: '100', 950: '100' }

// Interaction variants the app uses alongside color classes. Each gets the same remap so, for
// example, hover:bg-slate-100 still lightens on hover in dark mode.
const VARIANTS = {
  '': '',
  hover: ':hover',
  focus: ':focus',
  'focus-visible': ':focus-visible',
  'focus-within': ':focus-within',
  active: ':active',
  disabled: ':disabled',
  'group-hover': null, // handled separately below
  placeholder: '::placeholder',
  backdrop: '::backdrop',
}

// Classes are matched with [class~="..."] rather than .class selectors: same specificity, but
// Tailwind doesn't mistake these rules for utilities and generate hover:/focus: copies of them.
const cls = (name) => `[class~="${name}"]`

function selectorFor(variant, name) {
  if (variant === 'group-hover') return `${DARK} ${cls('group')}:hover ${cls(`group-hover:${name}`)}`
  const prefix = variant ? `${variant}:` : ''
  return `${DARK} ${cls(prefix + name)}${VARIANTS[variant]}`
}

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function withAlpha(hex, alpha) {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return hex
  const [r, g, b] = hexToRgb(hex)
  return `rgb(${r} ${g} ${b} / ${alpha})`
}

const OPACITIES = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95]

export default function darkThemePlugin({ addBase, theme }) {
  const used = sourceTokens()
  const rules = {}
  const add = (cls, declarations) => {
    for (const variant of Object.keys(VARIANTS)) {
      if (used.has(variant ? `${variant}:${cls}` : cls)) rules[selectorFor(variant, cls)] = declarations
    }
  }
  const addWithOpacity = (prefix, key, color, property) => {
    add(`${prefix}-${key}`, { [property]: color })
    for (const o of OPACITIES) add(`${prefix}-${key}/${o}`, { [property]: withAlpha(color, o / 100) })
  }

  for (const [key, color] of Object.entries(neutralBackgrounds)) addWithOpacity('bg', key, color, 'background-color')
  // Faded cells (calendar days outside the month) must be opaque: translucent fills let the
  // lighter grid lines show through and make them brighter than the active days.
  for (const o of OPACITIES) add(`bg-slate-50/${o}`, { 'background-color': t.canvas })
  // Translucent white overlays on colored or dark fills (bg-white/10, /15) stay as they are.
  for (const o of [5, 10, 15, 20, 25]) {
    for (const variant of Object.keys(VARIANTS)) delete rules[selectorFor(variant, `bg-white/${o}`)]
  }
  for (const [key, color] of Object.entries(neutralText)) addWithOpacity('text', key, color, 'color')
  for (const [key, color] of Object.entries(neutralBorders)) {
    for (const side of ['', '-t', '-b', '-l', '-r', '-x', '-y']) addWithOpacity(`border${side}`, key, color, 'border-color')
    addWithOpacity('divide', key, color, 'border-color')
  }
  for (const o of OPACITIES) {
    add(`border-black/${o}`, { 'border-color': `rgb(255 255 255 / ${Math.min(o * 1.6, 100) / 100})` })
    add(`ring-black/${o}`, { '--tw-ring-color': `rgb(255 255 255 / ${Math.min(o * 1.6, 100) / 100})` })
    add(`border-lucent-navy/${o}`, { 'border-color': `rgb(255 255 255 / ${o / 100})` })
    // Dark backdrops behind dialogs and the mobile menu stay dark (slightly deeper).
    for (const key of ['slate-900', 'slate-800', 'black', 'lucent-navy']) add(`bg-${key}/${o}`, { 'background-color': `rgb(0 0 0 / ${Math.min(o + 15, 90) / 100})` })
  }
  // Colored shadows read as glows on a dark page; use plain black instead.
  for (const key of ['slate-900', 'slate-800', 'slate-200', 'blue-200', 'sky-900', 'black']) {
    for (const o of ['', ...OPACITIES.map((n) => `/${n}`)]) add(`shadow-${key}${o}`, { '--tw-shadow-color': 'rgb(0 0 0 / 0.45)' })
  }
  rules[['shadow', 'shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-xl'].map((k) => `${DARK} ${cls(k)}`).join(', ')] = {
    '--tw-shadow-color': 'rgb(0 0 0 / 0.45)',
    '--tw-shadow': 'var(--tw-shadow-colored)',
  }

  const colors = theme('colors')
  for (const name of CHROMATIC) {
    const scale = colors[name]
    if (!scale || typeof scale !== 'object') continue
    for (const [shade, [to, alpha]] of Object.entries(tintBackground)) {
      if (scale[to]) addWithOpacity('bg', `${name}-${shade}`, withAlpha(scale[to], alpha), 'background-color')
    }
    for (const [shade, [to, alpha]] of Object.entries(tintBorder)) {
      if (scale[to]) {
        for (const side of ['', '-t', '-b', '-l', '-r']) add(`border${side}-${name}-${shade}`, { 'border-color': withAlpha(scale[to], alpha) })
      }
    }
    for (const [shade, to] of Object.entries(tintText)) {
      if (scale[to]) add(`text-${name}-${shade}`, { color: scale[to] })
    }
  }

  // Dark fills. Buttons and links flip to a light fill with dark text; other elements
  // (bars, panels, selected cards) are lifted just enough to separate from the page.
  const darkFills = ['slate-900', 'slate-800', 'lucent-navy', 'gray-900']
  const darkFillHovers = ['slate-800', 'slate-700', 'lucent-navy-light', 'gray-800']
  const fillSel = darkFills.map((k) => cls(`bg-${k}`)).join(', ')
  const interactive = ":is(button, a, [role='button'], [role='radio'], [role='tab'])"
  rules[`${DARK} :is(${fillSel})`] = { 'background-color': t.lifted }
  // The sidebar and mobile bar (navy containers) are the darkest layer; selected cards and
  // other dark fills use the lighter `lifted` shade.
  rules[`${DARK} :is(${cls('bg-lucent-navy')}, ${cls('bg-slate-900')}):is(aside, nav, header, div[class*='md:hidden'])`] = { 'background-color': t.sidebar }
  rules[`${DARK} ${interactive}:is(${fillSel})`] = { 'background-color': t.invertBg, color: t.invertInk }
  rules[`${DARK} ${interactive}:is(${fillSel}) :is(${cls('text-white')}, ${cls('text-slate-50')})`] = { color: 'inherit' }
  for (const k of darkFillHovers) {
    rules[`${DARK} ${cls(`hover:bg-${k}`)}:hover`] = { 'background-color': t.liftedHover }
    rules[`${DARK} ${interactive}${cls(`hover:bg-${k}`)}:hover:is(${fillSel})`] = { 'background-color': t.invertBgHover }
  }

  // Buttons forced to the navy fill with `!` utilities (the chat Send button) flip like other
  // dark buttons. Their forced colors need !important to beat the utilities.
  if (used.has('!bg-lucent-navy')) {
    rules[`${DARK} ${cls('!bg-lucent-navy')}`] = { 'background-color': `${t.invertBg} !important`, color: `${t.invertInk} !important`, 'border-color': `${t.invertBg} !important` }
    rules[`${DARK} ${cls('hover:!bg-lucent-navy-light')}:hover`] = { 'background-color': `${t.invertBgHover} !important` }
  }

  // The user's chat bubble: Lucent teal instead of the bright iMessage blue, which clashes
  // with the navy surfaces.
  if (used.has('bg-imessage-blue')) rules[`${DARK} ${cls('bg-imessage-blue')}`] = { 'background-color': t.bubble }

  // Muted text written for dark fills (text-slate-300 on bg-slate-900, etc.) keeps its light
  // color there instead of being darkened like muted text on a light card.
  const keepLight = ['200', '300', '400'].map((n) => [cls(`text-slate-${n}`), colors.slate?.[n]])
  for (const [sel, color] of keepLight) if (color) rules[`${DARK} :is(${fillSel}) ${sel}, ${DARK} :is(${fillSel})${sel}`] = { color }

  addBase({
    // Borders with no color class (border, border-b ...) default to a light gray; darken them.
    // :where() keeps this at zero specificity so any border color class still wins.
    [`:where(${DARK}) *, :where(${DARK}) ::before, :where(${DARK}) ::after`]: { borderColor: t.line },
    // Form fields without a background class otherwise get the browser's gray dark-field fill.
    [`:where(${DARK}) :where(input:not([type='checkbox'], [type='radio'], [type='range'], [type='color']), textarea, select)`]: {
      backgroundColor: t.field,
      color: t.ink,
    },
    // next-themes also sets color-scheme inline; this keeps form controls and scrollbars dark
    // in the brief moment before it runs.
    [`html${DARK}`]: { colorScheme: 'dark' },
    [`html${DARK} body`]: { backgroundColor: t.canvas, color: t.ink },
  })
  // Added as base styles (not components) so Tailwind doesn't try to build hover:/focus: copies
  // of these selectors; they still win over the utilities through higher specificity.
  addBase(rules)
}
