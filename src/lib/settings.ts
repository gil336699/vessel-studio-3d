// Every setting of a design, its default and the range it may take. Lengths are millimetres.
import type { Coupling, GrowthParams, PullMode } from '../veins/engine'
import type { InsidePlacement } from '../veins/inside'
import type { WidthRule, WidthSettings } from '../veins/network'
import type { SurfacePlacement } from '../veins/surface'
import type { ModelId } from './models'

export type Mode = 'inside' | 'surface'
export type ModelLook = 'glass' | 'solid'

export type Settings = {
  // Where veins grow: through the model or across its skin.
  mode: Mode
  model: ModelId | 'imported'
  // Attractors
  count: number; insidePlacement: InsidePlacement; surfacePlacement: SurfacePlacement; shell: number; seed: number
  // How far veins stay from the model's walls (inside) or open rims (surface).
  clearance: number
  // Systems growing together: 1, 2 or 3, and how two couple.
  systems: number; coupling: Coupling; gap: number; repel: number; tipPull: number; trim: boolean
  // Growth. attraction 0 means no limit.
  segment: number; kill: number; attraction: number; loops: boolean
  inertia: number; wiggle: number; pull: number; pullMode: PullMode; apart: boolean; speed: number
  // Look
  widthRule: WidthRule; tipWidth: number; maxWidth: number; exponent: number
  colorA: string; colorB: string; colorC: string; linkColor: string; modelColor: string
  modelLook: ModelLook
  // What the view shows, which is also what the exports hold
  showVeins: boolean; showAttractors: boolean; showModel: boolean; showRoots: boolean
}

export const DEFAULTS: Settings = {
  mode: 'inside', model: 'bean',
  count: 3000, insidePlacement: 'even', surfacePlacement: 'even', shell: 6, seed: 1,
  clearance: 1,
  systems: 1, coupling: 'join', gap: 0.6, repel: 0.3, tipPull: 0.6, trim: true,
  segment: 1, kill: 2, attraction: 0, loops: false,
  inertia: 0.3, wiggle: 0.08, pull: 0, pullMode: 'up', apart: true, speed: 3,
  widthRule: 'murray', tipWidth: 0.8, maxWidth: 5, exponent: 2.5,
  colorA: '#c0392b', colorB: '#6b55b8', colorC: '#2e86c1', linkColor: '#d4a017', modelColor: '#d9dde4',
  modelLook: 'glass',
  showVeins: true, showAttractors: false, showModel: true, showRoots: true,
}

export const LIMITS = {
  count: [100, 60_000], shell: [0.5, 50], seed: [1, 999_999], clearance: [0, 20],
  systems: [1, 3], gap: [0, 20], repel: [0, 1], tipPull: [0, 1],
  segment: [0.1, 20], kill: [0.1, 100], attraction: [0, 2000],
  inertia: [0, 0.95], wiggle: [0, 1.5], pull: [0, 1], speed: [1, 40],
  tipWidth: [0.05, 20], maxWidth: [0.05, 60], exponent: [1.5, 4],
} as const

const CHOICES = {
  mode: ['inside', 'surface'],
  model: ['sphere', 'bean', 'lens', 'heart', 'tree', 'vase', 'pot', 'imported'],
  insidePlacement: ['even', 'random', 'wall', 'shell'],
  surfacePlacement: ['even', 'random'],
  coupling: ['interweave', 'join'],
  pullMode: ['up', 'down', 'out', 'in'],
  widthRule: ['murray', 'even'],
  modelLook: ['glass', 'solid'],
} as const

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v))

// Settings from a file or the last session: unknown keys are dropped, missing ones take their default and
// out-of-range numbers are brought into range.
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const s: Settings = { ...DEFAULTS }
  const out = s as Record<string, unknown>
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const value = r[key], base = DEFAULTS[key]
    if (typeof base === 'number' && typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (typeof base === 'boolean' && typeof value === 'boolean') out[key] = value
    else if (typeof base === 'string' && typeof value === 'string') out[key] = value
  }
  for (const [key, list] of Object.entries(CHOICES)) if (!(list as readonly string[]).includes(out[key] as string)) out[key] = DEFAULTS[key as keyof typeof CHOICES]
  for (const [key, range] of Object.entries(LIMITS)) out[key] = clamp(out[key] as number, range)
  s.count = Math.round(s.count); s.seed = Math.round(s.seed); s.speed = Math.round(s.speed); s.systems = Math.round(s.systems)
  for (const key of ['colorA', 'colorB', 'colorC', 'linkColor', 'modelColor'] as const) if (!/^#[0-9a-f]{6}$/i.test(s[key])) s[key] = DEFAULTS[key]
  return s
}

export const joining = (s: Pick<Settings, 'systems' | 'coupling'>) => s.systems === 2 && s.coupling === 'join'
export const interweaving = (s: Pick<Settings, 'systems' | 'coupling'>) => s.systems > 1 && !joining(s)

export const widthSettings = (s: Settings): WidthSettings => ({ rule: s.widthRule, tip: s.tipWidth, max: s.maxWidth, exponent: s.exponent })

// The engine's settings. Keep veins apart refuses new points closer than 0.45 of a segment to another vein.
export function growthParams(s: Settings): GrowthParams {
  return {
    segment: s.segment, kill: s.kill, attraction: s.attraction, topology: s.loops && !joining(s) ? 'closed' : 'open',
    inertia: s.inertia, wiggle: s.wiggle, pull: s.pull, pullMode: s.pullMode,
    crowd: s.apart ? 0.45 : 0, clearance: s.clearance, minLoop: 8, maxPoints: 400_000, seed: s.seed,
    systems: s.systems, coupling: s.coupling, gap: s.gap, repel: s.repel, tipPull: s.tipPull, widths: widthSettings(s),
  }
}

// Attractor settings, which place them anew when they change.
export type ScatterSpec = { mode: Mode; count: number; placement: string; shell: number; seed: number; clearance: number; systems: number; coupling: Coupling }
export const scatterSpec = (s: Settings): ScatterSpec => ({
  mode: s.mode, count: s.count, placement: s.mode === 'inside' ? s.insidePlacement : s.surfacePlacement,
  shell: s.shell, seed: s.seed, clearance: s.clearance, systems: s.systems, coupling: s.coupling,
})
export const scatterKey = (s: Settings) => JSON.stringify(scatterSpec(s))

// Where a preset's or a model's roots go: named spots on the model's skin, worked out from its box.
export type RootRule = 'bottom' | 'top' | 'hilum' | 'ends' | 'rim' | 'trunk'

export type PresetName = 'organ' | 'tree' | 'coral' | 'surface' | 'lattice' | 'roots' | 'join' | 'interweave'
type PresetValues = Partial<Settings>

// Presets set the growth and the look together. Lengths scale with the model, from a 100 mm reference, so a preset
// looks the same on a 30 mm pendant or a 300 mm lamp. model: the model a preset brings with it, unless the user's own
// STL is open.
export const PRESETS: { id: PresetName; label: string; tip: string; values: PresetValues; model?: ModelId; roots?: RootRule }[] = [
  { id: 'organ', label: 'Organ vessels', tip: 'Vessels that enter an organ at one spot and fill it, like arteries in a kidney.', model: 'bean',
    values: { mode: 'inside', systems: 1, count: 3000, insidePlacement: 'even', inertia: 0.3, wiggle: 0.08, pull: 0, loops: false, exponent: 2.5, colorA: '#c0392b' } },
  { id: 'tree', label: 'Tree', tip: 'A trunk that climbs into the crown and branches there, pulled upward, with more twigs near the crown’s edge.', model: 'tree', roots: 'trunk',
    values: { mode: 'inside', systems: 1, count: 2500, insidePlacement: 'wall', inertia: 0.35, wiggle: 0.12, pull: 0.3, pullMode: 'up', loops: false, exponent: 2.2, colorA: '#6b4a2f' } },
  { id: 'coral', label: 'Coral', tip: 'Wandering branches that change direction often and fill a ball, like coral or neurons.', model: 'sphere', roots: 'bottom',
    values: { mode: 'inside', systems: 1, count: 4000, insidePlacement: 'random', inertia: 0.1, wiggle: 0.7, pull: 0, loops: false, exponent: 3, colorA: '#d3542f' } },
  { id: 'surface', label: 'Surface vessels', tip: 'Vessels across a surface, like coronary arteries over a heart.', model: 'heart', roots: 'top',
    values: { mode: 'surface', systems: 1, count: 3000, surfacePlacement: 'even', inertia: 0.35, wiggle: 0.05, pull: 0, loops: false, exponent: 2.5, colorA: '#b3261e' } },
  { id: 'lattice', label: 'Lattice', tip: 'Veins that meet and join into one connected net over a vase: a lamp shade or vase to print as veins alone.', model: 'vase', roots: 'rim',
    values: { mode: 'surface', systems: 1, count: 2500, surfacePlacement: 'even', inertia: 0.1, wiggle: 0.05, pull: 0, loops: true, exponent: 2.2, colorA: '#2f4a1f' } },
  { id: 'roots', label: 'Roots round a pot', tip: 'Roots that start at the rim and grow down and round a pot.', model: 'pot', roots: 'rim',
    values: { mode: 'surface', systems: 1, count: 2500, surfacePlacement: 'even', inertia: 0.4, wiggle: 0.2, pull: 0.25, pullMode: 'down', loops: false, exponent: 2.4, colorA: '#7a5230' } },
  { id: 'join', label: 'Inlet to outlet', tip: 'An inlet tree and an outlet tree grow from opposite ends and join where they meet, so flow can pass through (mutual tree attraction).', model: 'lens', roots: 'ends',
    values: { mode: 'inside', systems: 2, coupling: 'join', count: 900, insidePlacement: 'even', inertia: 0.3, wiggle: 0.08, pull: 0, loops: false, trim: true, tipPull: 0.6, exponent: 3, colorA: '#c0392b', colorB: '#6b55b8' } },
  { id: 'interweave', label: 'Two interwoven', tip: 'Two separate systems that fill the same space without touching, like arteries and veins side by side.', model: 'lens', roots: 'ends',
    values: { mode: 'inside', systems: 2, coupling: 'interweave', count: 3000, insidePlacement: 'even', inertia: 0.3, wiggle: 0.08, pull: 0, loops: false, gap: 0.6, repel: 0.3, exponent: 2.5, colorA: '#c0392b', colorB: '#6b55b8' } },
]

// Lengths that follow the model's size, from a 100 mm reference.
export function scaledLengths(size: number): Partial<Settings> {
  const k = Math.max(0.05, size / 100)
  const r = (v: number, digits = 2) => Math.max(10 ** -digits, Number(v.toFixed(digits)))
  return { segment: r(1 * k), kill: r(2 * k), clearance: r(1 * k), shell: r(6 * k), tipWidth: r(0.8 * k), maxWidth: r(5 * k), gap: r(0.6 * k) }
}

export function applyPreset(s: Settings, name: PresetName, size: number): Settings {
  const preset = PRESETS.find(p => p.id === name)
  if (!preset) return s
  const lengths = scaledLengths(size)
  if (name === 'tree') { lengths.kill = Number((3 * size / 100).toFixed(2)); lengths.maxWidth = Number((9 * size / 100).toFixed(2)); lengths.tipWidth = Number((1 * size / 100).toFixed(2)) }
  if (name === 'lattice') lengths.kill = Number((1.6 * size / 100).toFixed(2))
  if (name === 'join') { lengths.segment = Number((1 * size / 100).toFixed(2)); lengths.kill = Number((2 * size / 100).toFixed(2)); lengths.maxWidth = Number((4 * size / 100).toFixed(2)) }
  // Glass shows veins inside a model; on its surface they need a solid one to sit on.
  const mode = preset.values.mode ?? s.mode
  return sanitizeSettings({ ...s, ...preset.values, ...lengths, modelLook: mode === 'surface' ? 'solid' : 'glass' })
}

// The roots a model starts with, by rule.
export function defaultRootRule(model: ModelId | 'imported', mode: Mode): RootRule {
  switch (model) {
    case 'bean': return 'hilum'
    case 'lens': return 'ends'
    case 'heart': return 'top'
    case 'tree': return 'trunk'
    case 'vase': case 'pot': return mode === 'surface' ? 'rim' : 'bottom'
    default: return 'bottom'
  }
}

// The systems' names, for roots, colours and exports.
export const SYSTEM_NAMES = ['A', 'B', 'C']

// How fine the printable skin is: grid points across the thinnest tip's radius.
export type Detail = 'draft' | 'normal' | 'fine'
export const DETAIL_PER_TIP: Record<Detail, number> = { draft: 1.1, normal: 1.6, fine: 2.4 }
