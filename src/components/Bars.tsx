import { memo, type ReactNode } from 'react'
import { count, long, mm } from '../lib/format'
import type { MeshData } from '../lib/mesh'
import { meshBounds } from '../lib/mesh'
import { interweaving, joining, SYSTEM_NAMES, type Settings } from '../lib/settings'
import { touchFirst } from '../lib/touch'
import type { VeinView } from '../lib/view'
import { networkStats } from '../veins/network'
import type { Net, Stats } from '../useVeins'
import type { DomainInfo } from '../worker/runner'
import { Button } from './Controls'
import { Icon } from './Icon'

// The floating bars round the model: tools and what's shown on top, growth controls and status below, and the
// measurements panel.

export type ViewKey = 'showVeins' | 'showAttractors' | 'showModel' | 'showRoots'
const VIEW: { key: ViewKey; label: string; name: string; shortcut: string; tip: string }[] = [
  { key: 'showVeins', label: 'Veins', name: 'Show veins', shortcut: '1', tip: 'Show or hide the veins; exports hold what’s shown.' },
  { key: 'showAttractors', label: 'Attractors', name: 'Show attractors', shortcut: '2', tip: 'Show or hide the attractors still in play, the points veins grow toward.' },
  { key: 'showModel', label: 'Model', name: 'Show the model', shortcut: '3', tip: 'Show or hide the model the veins grow in or on.' },
  { key: 'showRoots', label: 'Roots', name: 'Show roots', shortcut: '4', tip: 'Show or hide the roots, where veins start.' },
]

const CAPTION = {
  orbit: 'Drag to orbit · Right-drag to pan · Scroll to zoom · O for the Roots tool',
  roots: 'Click the model to add a root · Drag to orbit · Esc to stop adding roots',
}
const TOUCH_CAPTION = {
  orbit: 'Drag to orbit · Two fingers to pan and zoom',
  roots: 'Tap the model to add a root · Drag to orbit',
}

export function ViewBar({ s, rooting, setRooting, system, setSystem, toggle, onFit, onView }: {
  s: Settings; rooting: boolean; setRooting: (on: boolean) => void; system: number; setSystem: (t: number) => void
  toggle: (key: ViewKey) => void; onFit: () => void; onView: (dir: [number, number, number]) => void
}) {
  const systems = s.systems
  return <div className="viewport-bars">
    <div className="viewport-bar-row">
      <div className="floating-bar glass" role="toolbar" aria-label="Tools">
        <Button pressed={rooting} shortcut="O" label="Roots tool" tip="Click the model to add a root, where a vein starts. Inside, it enters the model there." onClick={() => setRooting(!rooting)}>
          <Icon name="pin" /><span className="compact-label">Roots</span></Button>
        {systems > 1 && SYSTEM_NAMES.slice(0, systems).map((name, t) => <Button key={name} pressed={system === t} shortcut={name} label={`Next root starts system ${name}`}
          tip={`The next root you add starts system ${name}.`} onClick={() => { setSystem(t); setRooting(true) }}>
          <span className="system-dot" style={{ background: [s.colorA, s.colorB, s.colorC][t] }} aria-hidden="true" />{name}</Button>)}
      </div>
      <div className="floating-bar glass" role="toolbar" aria-label="Show">
        {VIEW.map(v => <Button key={v.key} pressed={s[v.key]} shortcut={v.shortcut} tip={v.tip} label={v.name} onClick={() => toggle(v.key)}>{v.label}</Button>)}
        <span className="bar-divider" aria-hidden="true" />
        <Button className="icon-button" shortcut="F" label="Fit the model in the view" tip="Fit the whole model in the view." onClick={onFit}><Icon name="fit" /></Button>
        <Button className="view-step" label="View from the front" tip="Look at the model from the front." onClick={() => onView([0, -1, 0.0001])}>Front</Button>
        <Button className="view-step" label="View from the side" tip="Look at the model from the right side." onClick={() => onView([1, 0, 0.0001])}>Side</Button>
        <Button className="view-step" label="View from the top" tip="Look down on the model from above." onClick={() => onView([0.0001, -0.0001, 1])}>Top</Button>
      </div>
    </div>
    <p className="view-caption"><span>{(touchFirst() ? TOUCH_CAPTION : CAPTION)[rooting ? 'roots' : 'orbit']}</span></p>
  </div>
}

export function Dock({ running, stopping, canGrow, onGrow, onPause, onStep, onReset, canReset, status, warning, canUndo, canRedo, onUndo, onRedo }: {
  running: boolean; stopping: boolean; canGrow: string | false
  onGrow: () => void; onPause: () => void; onStep: () => void; onReset: () => void; canReset: string | false
  status: ReactNode; warning: boolean; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void
}) {
  const busy = running && 'Pause the growth first.'
  return <div className="dock">
    <div className="timeline glass">
      <div className="transport" role="group" aria-label="Growth">
        {running
          ? <Button className="primary" shortcut="Space" unavailable={stopping && 'Stopping after the current step…'} tip="Pause the growth. Press Grow to carry on." onClick={onPause}>
            <Icon name="pause" />{stopping ? 'Stopping…' : 'Pause'}</Button>
          : <Button className="primary" shortcut="Space" unavailable={canGrow} tip="Grow the veins until every attractor is reached or you pause, changing growth settings as they grow if you like." onClick={onGrow}>
            <Icon name="play" />Grow</Button>}
        <Button shortcut="S" unavailable={busy || canGrow} tip="Grow by a single step." onClick={onStep}><Icon name="step" /><span className="compact-label">Step</span></Button>
        <Button shortcut="R" unavailable={canReset} tip="Go back to the roots, before any growth; Undo brings the veins back." onClick={onReset}><Icon name="reset" /><span className="compact-label">Reset</span></Button>
      </div>
      <span className="timeline-status" role="status" aria-live={running ? 'off' : 'polite'} data-warning={warning} data-tip={typeof status === 'string' && status.length > 90 ? status : undefined}>{status}</span>
      <div className="transport" role="group" aria-label="History">
        <Button className="icon-button" label="Undo" shortcut="⌘Z" unavailable={!canUndo && 'Nothing to undo yet.'} tip="Undo the last change, pausing growth first if the veins are growing." onClick={onUndo}><Icon name="undo" /></Button>
        <Button className="icon-button" label="Redo" shortcut="⇧⌘Z" unavailable={!canRedo && 'Nothing to redo.'} tip="Redo the change you undid." onClick={onRedo}><Icon name="redo" /></Button>
      </div>
    </div>
  </div>
}

// Memoised on the frame counter, so it measures the veins once per frame.
export const Inspector = memo(function Inspector({ s, stats, net, view, mesh, modelName, info, attractors, running }: {
  s: Settings; stats: Stats; net: Net; view: VeinView; mesh: MeshData; modelName: string; info: DomainInfo | null; attractors: number; running: boolean
}) {
  const n = networkStats(net.x, net.y, net.z, net.parent, net.joins, net.points)
  const { lo, hi } = meshBounds(mesh.positions)
  let widest = 0
  for (let v = 0; v < net.points; v++) if (net.parent[v] >= 0 && view.widths[v] > widest) widest = view.widths[v]
  let roots = 0
  for (let v = 0; v < net.points; v++) if (!net.fixed[v] && (net.parent[v] < 0 || net.fixed[net.parent[v]])) roots++
  const size = `${Math.round(hi[0] - lo[0])} × ${Math.round(hi[1] - lo[1])} × ${Math.round(hi[2] - lo[2])} mm`
  const rows: [string, ReactNode, string][] = [
    ['Model', modelName, 'The model the veins grow in or on.'],
    ['Size', size, 'Width × depth × height of the model, in millimetres.'],
    info?.mode === 'inside' ? ['Volume', `${(info.volume / 1000).toFixed(1)} ml`, 'The space inside the model, where the veins can grow.'] : ['Area', info ? `${(info.area / 100).toFixed(0)} cm²` : '—', 'The area of the model’s surface.'],
    ['Vein points', count(n.points), 'Points the veins are made of, one segment length apart.'],
    ['Forks', count(n.forks), 'Vein points where a vein splits in two or more.'],
    joining(s)
      ? ['Joins', count(net.links.length / 2), 'Places where the inlet tree and the outlet tree met and joined.']
      : ['Vein ends', count(n.ends), 'Veins that end freely, not in a loop.'],
    joining(s)
      ? ['Dead ends', s.trim ? `${count(stats.freeTips)} trimmed` : count(stats.freeTips), 'Vein ends that never met the other tree, so no flow reaches them. Trim dead ends (Grow tab) leaves them out of the view and the exports.']
      : ['Loops', count(n.loops), 'Places where veins from two sides met at an attractor and joined, with Loops on (Grow tab).'],
    ...(interweaving(s) ? [['Closest gap', running ? 'after growing' : Number.isFinite(view.closest) ? mm(view.closest, 2) : '—', 'The closest the tube surfaces of two different systems come, after narrowing where they pass close.'] as [string, ReactNode, string]] : []),
    ['Roots', count(roots), 'Where veins start, added with the Roots tool.'],
    ['Attractors left', `${count(stats.live)} of ${count(attractors)}`, 'Attractors no vein has reached yet.'],
    ['Total length', long(n.length), 'Length of every vein added together.'],
    ['Widest vein', widest ? mm(widest, 2) : '—', 'The widest vein, near the roots; Widest caps it, and a lower Murray exponent thickens veins faster.'],
    ['Steps', count(stats.step), 'Growth steps since the roots.'],
    ['Speed', stats.rate ? `${count(stats.rate)} steps/s` : '—', 'Steps per second while growing.'],
  ]
  return <section className="measurements" aria-labelledby="measure-title">
    <h2 id="measure-title">Measurements</h2>
    <dl>{rows.map(([term, value, tip]) => <div key={term}><dt data-tip={tip} tabIndex={0}>{term}</dt><dd>{value}</dd></div>)}</dl>
  </section>
}, (a, b) => a.stats.revision === b.stats.revision && a.s === b.s && a.view === b.view && a.attractors === b.attractors && a.info === b.info && a.running === b.running && a.mesh === b.mesh)
