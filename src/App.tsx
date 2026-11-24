// Vessel Studio 3D: grow vessels, roots and trees in 3D by space colonization, inside a model or across its surface,
// and export them as watertight tubes to print, centre lines for 3D apps, or pictures.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dock, Inspector, ViewBar, type ViewKey } from './components/Bars'
import { ConfirmDialog, HelpDialog, QuickStart, type Pending } from './components/Help'
import { ExportPanel, GrowPanel, LookPanel, ModelPanel } from './components/Panels'
import { TabPanel, Tabs } from './components/Tabs'
import { TooltipLayer } from './components/Tooltip'
import { Viewport, type Pick, type ViewHandle } from './components/Viewport'
import { builtInModel, defaultRequests, longestSide, modelDoc, rootRequests, scaleMesh, type Design } from './lib/design'
import { centreLines, stlFile, threeMf } from './lib/exports'
import { bytes, count } from './lib/format'
import { openEdges, type MeshData } from './lib/mesh'
import { MODELS, type ModelId } from './lib/models'
import { EXTENSION, parseProject, ProjectError, projectJson } from './lib/project'
import { saveFile } from './lib/saveFile'
import { applyPreset, DEFAULTS, defaultRootRule, DETAIL_PER_TIP, interweaving, joining, PRESETS, SYSTEM_NAMES, type Detail, type PresetName, type Settings } from './lib/settings'
import { parseStl, StlError } from './lib/stl'
import { countSamples } from './lib/tubes'
import { LINK, veinView } from './lib/view'
import { useMedia } from './useMedia'
import { useVeins, type Status } from './useVeins'
import type { SkinJob, SkinResult } from './worker/export.worker'
import { version } from '../package.json'

// Written into project files; it comes from package.json, so it moves with every release.
const VERSION = version
const QUICK_START_KEY = 'vessel-studio-3d:quick-start-seen'

const storage = {
  get: (key: string) => { try { return window.localStorage.getItem(key) } catch { return null } },
  set: (key: string, value: string) => { try { window.localStorage.setItem(key, value) } catch { /* private mode */ } },
}

function firstDesign(): { design: Design; saved: boolean } {
  const model = builtInModel('bean')
  const settings: Settings = { ...DEFAULTS, model: 'bean' }
  const base = { settings, model, roots: [], attractors: null, placedFor: '', growth: null }
  return { design: { ...base, roots: defaultRequests(base) }, saved: true }
}

// Attractors on a separate piece of the model with no root (of their own system, with two or three): veins never cross
// from one piece to another, so only a root there reaches them.
const rootlessText = (left: number, rootless: number, several: boolean) =>
  `Stopped: ${rootless >= left ? `all ${count(left)}` : `${count(rootless)} of the ${count(left)}`} attractors left ${rootless === 1 && left > 1 ? 'is' : 'are'} on a part of the model with no root${several ? ' of their system' : ''}. Click it with the Roots tool (O) to grow there too.`

const DONE_TEXT: Record<string, (left: number, total: number, rootless: number, several: boolean) => string> = {
  reached: () => 'Done: every attractor is reached.',
  // A few left over is normal: no vein has a clear path to them. Most left over means the veins had no room.
  stalled: (left, total, rootless, several) => rootless > 0
    ? rootlessText(left, rootless, several)
    : left <= Math.max(3, 0.02 * total)
    ? `Done: all but ${count(left)} of ${count(total)} attractors are reached; no vein has a clear path to the rest.`
    : left > 0.5 * total
      ? `Stopped early: ${count(left)} of ${count(total)} attractors can’t be reached. The model may be too thin, or the roots boxed in: try a smaller edge clearance or segment, another root, or the other mode.`
      : `Stopped: ${count(left)} of ${count(total)} attractors can’t be reached from here. A longer segment, a shorter kill distance or another root may help.`,
  'out-of-reach': (left, total, rootless, several) => rootless > 0 ? rootlessText(left, rootless, several)
    : `Stopped: ${count(left)} of ${count(total)} attractors are beyond the attraction distance. Raise it, or set it to 0 for no limit.`,
  cap: () => 'Stopped at the limit of 400,000 vein points. Use fewer attractors or a longer segment.',
  empty: () => 'No roots yet: click the model with the Roots tool (O) to add one.',
}

const modelLabel = (id: ModelId | 'imported') => MODELS.find(m => m.id === id)?.label ?? 'Your model'

export function App() {
  const [status, setStatus] = useState<Status>(null)
  const model = useVeins(firstDesign, setStatus)
  const { design, stats, net, running } = model
  const s = design.settings
  const [tab, setTab] = useState<'model' | 'grow' | 'look' | 'export'>('model')
  const [showHelp, setShowHelp] = useState(false)
  const [showQuickStart, setShowQuickStart] = useState(() => storage.get(QUICK_START_KEY) !== '1')
  const [pending, setPending] = useState<Pending | null>(null)
  const [rooting, setRooting] = useState(false)
  // Inside: whether a click puts a root where it lands on the skin, or in the middle of the model under it.
  const [rootPlace, setRootPlace] = useState<'skin' | 'middle'>('skin')
  // On the surface: print the veins alone, or joined to the model as raised veins.
  const [joined, setJoined] = useState(false)
  const [chosenSystem, setSystem] = useState(0)
  // The system the next root starts: the chosen one, while there are that many.
  const system = chosenSystem < s.systems ? chosenSystem : 0
  const [detail, setDetail] = useState<Detail>('normal')
  const [transparent, setTransparent] = useState(false)
  const [exporting, setExporting] = useState<string | false>(false)
  const handle = useRef<ViewHandle | null>(null)
  const stlInput = useRef<HTMLInputElement>(null)
  const projectInput = useRef<HTMLInputElement>(null)
  const phone = useMedia('(max-width: 599px)')

  const change = useCallback((patch: Partial<Settings>, key: string | null = null) => { void model.change(patch, key) }, [model])
  const size = useMemo(() => longestSide(design.model.mesh), [design.model.mesh])
  const open = useMemo(() => openEdges(design.model.mesh.indices).length > 0, [design.model.mesh])
  const modelName = design.model.source.kind === 'file' ? design.model.source.name : modelLabel(design.model.source.id)
  const attractorCount = model.attractors ? model.attractors.p.length / 3 : 0

  // What the view draws and the exports hold. Narrowing where systems pass close waits until growth pauses.
  const view = useMemo(() => veinView(net, s, { separate: !running }), [net, s, running])
  // A handle for checking the app from the browser console while developing; the production build leaves it out.
  useEffect(() => { if (import.meta.env.DEV) (window as unknown as { vs3d: unknown }).vs3d = { net, view, design, stats } }, [net, view, design, stats])


  // Roots, and how many each system has.
  const { roots, rootsBy } = useMemo(() => {
    let n = 0
    const by = [0, 0, 0]
    for (let v = 0; v < net.points; v++) if (!net.fixed[v] && (net.parent[v] < 0 || net.fixed[net.parent[v]])) { n++; by[Math.min(2, net.sys[v])]++ }
    return { roots: n, rootsBy: by }
  }, [net])
  // A system with no root grows nothing: Join needs both trees, and each interwoven system its own root.
  const missing = s.systems > 1 ? SYSTEM_NAMES.slice(0, s.systems).filter((_, t) => rootsBy[t] === 0) : []
  const missingText = missing.length && roots ? `System ${missing.join(' and ')} has no root yet, so it won’t grow${joining(s) ? ' and the trees can’t join' : ''}: pick ${missing[0]} in the bar above the model and click the model.` : ''

  const setModel = useCallback((doc: Design['model'], id: ModelId | 'imported') => {
    void model.change({ model: id }, null, { model: doc })
    setStatus({ text: `Using ${id === 'imported' ? doc.source.kind === 'file' ? doc.source.name : 'your model' : modelLabel(id)}.` })
  }, [model])

  const pickModel = (id: ModelId) => setModel(builtInModel(id), id)

  const resize = (mm: number) => {
    const target = Math.min(2000, Math.max(10, mm))
    if (Math.abs(target - size) < 0.05) return
    const doc = modelDoc(design.model.source, scaleMesh(design.model.mesh, target))
    void model.change({}, null, { model: doc })
    setStatus({ text: `The model is now ${target.toFixed(1)} mm on its longest side. Lengths such as Segment stay as they are: choose a preset again to fit them to the new size.` })
  }

  const readStl = async (file: File) => {
    try {
      const mesh: MeshData = parseStl(await file.arrayBuffer())
      const doc = modelDoc({ kind: 'file', name: file.name }, mesh)
      const side = longestSide(mesh)
      setModel(doc, 'imported')
      const closed = openEdges(mesh.indices).length === 0
      setStatus({ text: `Opened ${file.name}: ${count(mesh.indices.length / 3)} triangles, ${side.toFixed(1)} mm on its longest side, ${closed ? 'closed' : 'open'}.${!closed && s.mode === 'inside' ? ' Its openings are closed with flat caps to find its inside.' : ''}${side < 20 || side > 1000 ? ' Check its size: STL files carry no units, and this one is read as millimetres.' : ''}` })
    } catch (error) {
      setStatus({ text: error instanceof StlError ? error.message : `That file couldn’t be read as an STL: ${error instanceof Error ? error.message : String(error)}`, warning: true })
    }
  }

  const preset = (name: PresetName) => {
    const p = PRESETS.find(x => x.id === name)!
    const keepOwn = s.model === 'imported'
    const doc = !keepOwn && p.model && p.model !== s.model ? builtInModel(p.model) : null
    const mesh = doc ? doc.mesh : design.model.mesh
    const next = applyPreset(s, name, longestSide(mesh))
    const patch: Partial<Settings> = { ...next, model: doc ? p.model! : s.model }
    void model.change(patch, null, { model: doc ?? design.model }).then(() => {
      // A preset's roots go on its own spots, one for each system. On a model you opened, its spots mean nothing, so
      // the roots go where the model suits best, except along a rim (or round the top), which any model has.
      const mode = patch.mode ?? s.mode, systems = patch.systems ?? s.systems
      const rule = p.roots ?? defaultRootRule(keepOwn ? 'imported' : (p.model ?? s.model), mode)
      void model.setRoots(keepOwn && rule !== 'rim'
        ? Array.from({ length: systems }, (_, t) => ({ kind: 'auto' as const, system: t, systems }))
        : rootRequests(mesh, rule, mode, systems))
    })
    setStatus({ text: `${p.label}: ${p.tip} Press Grow.` })
  }

  const onPick = (pick: Pick) => {
    if (!rooting) return
    const t = Math.min(system, s.systems - 1)
    // Inside, a root can enter at the click or start in the middle of the model under it (or Shift-click).
    const middle = s.mode === 'inside' && (rootPlace === 'middle') !== pick.shift && pick.middle
    model.addRoot(middle ? { kind: 'inside', point: middle, system: t } : { kind: 'skin', point: pick.point, normal: pick.normal, system: t })
    const where = middle ? 'Added a root in the middle of the model, under the click.' : s.mode === 'inside' ? 'Added a root: the vessel enters the model there.' : 'Added a root.'
    setStatus({ text: `${where}${s.systems > 1 ? ` It starts system ${SYSTEM_NAMES[t]}.` : ''}${stats.step > 0 ? ' It grows a vein of its own. Undo removes it.' : ''}` })
  }

  // Files.
  const saveProject = async () => {
    const result = await saveFile(`vessel-studio-3d-${modelName.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').toLowerCase()}${EXTENSION}`, projectJson(model.current(), VERSION), 'application/json', 'Vessel Studio 3D project')
    if (result === 'saved' || result === 'downloaded') { model.markSaved(); setStatus({ text: result === 'saved' ? 'Project saved.' : 'Project downloaded.' }) }
    else if (result === 'failed') setStatus({ text: 'The project couldn’t be saved. Try again, or try another browser.', warning: true })
  }
  const openProject = () => {
    const go = () => projectInput.current?.click()
    if (model.unsaved && stats.step > 0) setPending({ title: 'Open a project?', body: 'The veins you have grown aren’t saved. Opening a project replaces them; Undo can bring them back during this session.', confirm: 'Open', run: go })
    else go()
  }
  const readProject = async (file: File) => {
    try {
      const d = parseProject(await file.text())
      await model.replace(d)
      model.markSaved()
      setStatus({ text: `Opened ${file.name}.` })
    } catch (error) {
      setStatus({ text: error instanceof ProjectError ? error.message : `That file couldn’t be opened: ${error instanceof Error ? error.message : String(error)}`, warning: true })
    }
  }

  const baseName = `vessel-studio-3d-${modelName.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').toLowerCase()}`
  const nothing: string | false = !s.showVeins ? 'The veins are hidden: show them (1) to export them.' : view.count === 0 ? 'Nothing has grown yet. Press Grow first.' : false

  // The skin's parts: each interwoven system on its own, or everything together.
  const skinParts = (view: ReturnType<typeof veinView>) => {
    const colors = [s.colorA, s.colorB, s.colorC]
    const systems = interweaving(s) ? s.systems : 1
    const parts: { name: string; color: string; segs: Float64Array }[] = []
    for (let t = 0; t < systems; t++) {
      const picked: number[] = []
      for (let i = 0; i < view.count; i++) if (systems === 1 || view.system[i] === t || (view.system[i] === LINK && t === 0)) picked.push(i)
      const segs = new Float64Array(picked.length * 8)
      picked.forEach((i, k) => segs.set(view.segs.subarray(i * 8, i * 8 + 8), k * 8))
      if (segs.length) parts.push({ name: systems > 1 ? `System ${SYSTEM_NAMES[t]}` : 'Vessels', color: colors[t], segs })
    }
    return parts
  }
  const skinWorker = useRef<Worker | null>(null)
  const jobs = useRef(0)
  const buildSkin = (view: ReturnType<typeof veinView>): Promise<Extract<SkinResult, { ok: true }>> => new Promise((resolve, reject) => {
    skinWorker.current ??= new Worker(new URL('./worker/export.worker.ts', import.meta.url), { type: 'module' })
    const id = ++jobs.current
    const w = skinWorker.current
    w.onmessage = (event: MessageEvent<SkinResult>) => { if (event.data.id !== id) return; if (event.data.ok) resolve(event.data); else reject(new Error(event.data.message)) }
    w.onerror = event => reject(new Error(event.message || 'The export worker stopped.'))
    const job: SkinJob = { id, parts: skinParts(view), perTip: DETAIL_PER_TIP[detail] }
    w.postMessage(job, job.parts.map(p => p.segs.buffer))
  })
  const exportSkin = async (kind: 'stl' | '3mf') => {
    if (nothing || exporting) return
    await model.halt()
    setExporting('Building the tube skin…')
    setStatus({ text: 'Building the watertight tube skin… This can take a few seconds for many veins.' })
    try {
      // The veins as they are now growth has stopped, with every width settled: the view drawn while growing can be a
      // few steps behind, and interwoven systems are only narrowed apart once growth pauses.
      const skin = await buildSkin(veinView(model.mirror.view(), s, { separate: true }))
      const problems = skin.parts.reduce((n, p) => n + p.problems, 0)
      // Joined: the model goes in as well, as another part of the same object; the slicer joins them into one solid.
      const withModel = s.mode === 'surface' && joined && !open
      const parts = withModel ? [...skin.parts, { name: 'Model', color: s.modelColor, positions: design.model.mesh.positions, indices: design.model.mesh.indices, problems: 0 }] : skin.parts
      const tris = parts.reduce((n, p) => n + p.indices.length / 3, 0)
      const data = kind === 'stl' ? stlFile(parts, 'Vessel Studio 3D') : await threeMf(parts, baseName, withModel)
      const size = data instanceof Blob ? data.size : data.byteLength
      const result = await saveFile(`${baseName}.${kind}`, data, kind === 'stl' ? 'model/stl' : 'model/3mf', kind === 'stl' ? 'STL model' : '3MF model')
      if (result === 'saved' || result === 'downloaded') setStatus({
        text: `${kind.toUpperCase()} ${result}: ${count(tris)} triangles, ${bytes(size)}, ${problems ? `${count(problems)} open edges` : 'watertight'}, made in ${(skin.ms / 1000).toFixed(1)} s.${s.mode === 'surface' && joined && !open ? ' The veins and the model are two parts of one object, which your slicer joins as it slices.' : ''}${skin.tipLimited ? ' The finest tips are rounder than the grid allowed at this size: use Fine, or wider tips, for smoother tips.' : ''}`,
        warning: problems > 0,
      })
      else if (result === 'failed') setStatus({ text: 'The file couldn’t be saved. Try again.', warning: true })
    } catch (error) {
      setStatus({ text: `The tube skin couldn’t be made: ${error instanceof Error ? error.message : String(error)}`, warning: true })
    } finally { setExporting(false) }
  }
  const exportObj = async () => {
    if (nothing) return
    await model.halt()
    const now = model.mirror.view()
    const text = centreLines(now, veinView(now, s, { separate: true }), SYSTEM_NAMES)
    const result = await saveFile(`${baseName}-centre-lines.obj`, text, 'model/obj', 'OBJ centre lines')
    if (result === 'saved' || result === 'downloaded') setStatus({ text: `OBJ ${result}: ${count(now.points)} points, grouped by system and width.` })
  }
  const exportPng = async (scale: number) => {
    const blob = await handle.current?.capture(scale, transparent)
    if (!blob) { setStatus({ text: 'The picture couldn’t be made. Try again.', warning: true }); return }
    const result = await saveFile(`${baseName}.png`, blob, 'image/png', 'PNG picture')
    if (result === 'saved' || result === 'downloaded') setStatus({ text: `Picture ${result}, ${bytes(blob.size)}.` })
  }

  const estimate = useMemo(() => {
    if (tab !== 'export' || running || !view.count) return 'Grow some veins to see the file size.'
    // The tube surface over the grid spacing's square, about two triangles a square.
    let tip = Infinity, area = 0
    for (let o = 0; o < view.segs.length; o += 8) {
      tip = Math.min(tip, view.segs[o + 6], view.segs[o + 7])
      area += Math.PI * (view.segs[o + 6] + view.segs[o + 7]) * Math.hypot(view.segs[o + 3] - view.segs[o], view.segs[o + 4] - view.segs[o + 1], view.segs[o + 5] - view.segs[o + 2])
    }
    const v = Math.max(1e-3, tip / DETAIL_PER_TIP[detail])
    const samples = countSamples(view.segs, v)
    const tris = Math.min(samples * 0.15, (2.2 * area) / (v * v))
    return `About ${count(Math.round(tris / 1e4) * 1e4)} triangles, ${bytes(tris * 50)} as STL.`
  }, [tab, running, view, detail])

  const canGrow: string | false = !model.ready ? 'The model is still being prepared.' : model.placingRoots ? 'The roots are being placed.'
    : roots === 0 ? 'No roots yet: click the model with the Roots tool (O) to add one.'
      : stats.done === 'reached' ? 'Every attractor is reached. Reset to grow again, or add more attractors.' : false
  const resetBlocked: string | false = stats.step === 0 ? 'Nothing has grown yet.' : false

  const grow = () => { setStatus(null); if (showQuickStart) closeQuickStart(); model.play() }
  const pause = () => { model.pause(); setStatus({ text: 'Paused. Press Grow to carry on.' }) }
  const toggleGrow = () => { if (running) pause(); else if (!canGrow) grow(); else setStatus({ text: canGrow }) }
  const toggle = (key: ViewKey) => change({ [key]: !s[key] }, key)
  const closeQuickStart = () => { setShowQuickStart(false); storage.set(QUICK_START_KEY, '1') }
  const reset = () => { void model.reset(); setStatus({ text: 'Back to the roots. Undo brings the veins back.' }) }

  // Keyboard shortcuts, ignored while typing. Re-registered each render so handlers see current state.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const typing = Boolean(target?.closest('input:not([type=range]):not([type=checkbox]), select, textarea'))
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (event.key === 'Escape') { setShowHelp(false); setPending(null); if (!typing) setRooting(false); return }
      if (pending || showHelp) return
      if (mod && key === 's') { event.preventDefault(); void saveProject(); return }
      if (mod && key === 'o') { event.preventDefault(); openProject(); return }
      if (typing) return
      if (mod && key === 'z') { event.preventDefault(); if (event.shiftKey) void model.redo(); else void model.undo(); return }
      if (mod && key === 'y') { event.preventDefault(); void model.redo(); return }
      if (mod || event.altKey) return
      if (event.key === ' ') { if (target?.closest('button')) return; event.preventDefault(); toggleGrow() }
      else if (key === 's') { if (!running && !canGrow) { setStatus(null); model.step() } }
      else if (key === 'r') { if (!resetBlocked) reset() }
      else if (key === 'o') setRooting(on => !on)
      else if ((key === 'a' || key === 'b' || key === 'c') && s.systems > 1) { const t = key.charCodeAt(0) - 97; if (t < s.systems) { setSystem(t); setRooting(true) } }
      else if (key === '1') toggle('showVeins')
      else if (key === '2') toggle('showAttractors')
      else if (key === '3') toggle('showModel')
      else if (key === '4') toggle('showRoots')
      else if (key === 'f') handle.current?.fit()
      else if (event.key === '?') setShowHelp(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // The design isn't kept between visits, so closing or reloading the page with grown veins that aren't saved asks
  // first, in the browser's own dialog (the only one a page may show as it closes).
  const atRisk = model.unsaved && stats.step > 0
  useEffect(() => {
    if (!atRisk) return
    const ask = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [atRisk])

  const counts = `${count(stats.points)} vein ${stats.points === 1 ? 'point' : 'points'} · ${count(stats.live)} ${stats.live === 1 ? 'attractor' : 'attractors'} left · step ${count(stats.step)}`
  const doneText = stats.done ? DONE_TEXT[stats.done](stats.live, attractorCount, stats.rootless, s.systems > 1) : ''
  const statusText = status?.text ?? (model.stopping ? 'Stopping after the current step…'
    : running ? `Growing · ${counts}` : !model.ready ? 'Preparing the model…' : model.placingRoots ? 'Placing the roots…'
      : missingText ? missingText
        : doneText ? (stats.done === 'reached' ? `${doneText} ${counts}${joining(s) ? ` · ${count(net.links.length / 2)} joins` : ''}` : doneText) : roots ? `Ready: press Grow. ${counts}` : DONE_TEXT.empty(0, 0, 0, false))

  return <main className="studio">
    <TooltipLayer />
    <div className="stage">
      <Viewport mesh={design.model.mesh} settings={s} view={view} net={net} attractors={model.attractors} picking={rooting} onPick={onPick} handleRef={handle} fitKey={design.model.key} />
    </div>

    <header className="brand glass">
      <div><p className="app-kicker" data-tip="How it works: points are scattered in or on the model, and veins grow toward them, using up each one they reach.">Space colonization in 3D</p><h1>Vessel Studio 3D</h1></div>
      <div className="brand-actions">
        {atRisk && <span className="dot" role="img" aria-label="Unsaved changes" data-tip="Unsaved changes: save a project (⌘S) to keep them." />}
        <button type="button" className="icon-button" aria-label="Keyboard shortcuts and help" data-tip="Keyboard shortcuts and the quick start." data-key="?" onClick={() => setShowHelp(true)}>?</button>
      </div>
    </header>

    <aside className="sidebar side-panel glass" aria-label="Design controls">
      <Tabs label="Design controls" idBase="design" value={tab} onChange={setTab} tabs={[
        { id: 'model', label: 'Model', title: 'Where veins grow, the model, the attractors and the roots.' },
        { id: 'grow', label: 'Grow', title: 'Presets, systems and how the veins grow.' },
        { id: 'look', label: 'Look', title: 'Vein widths by Murray’s law, and colours.' },
        { id: 'export', label: 'Export', title: 'STL and 3MF to print, OBJ centre lines, pictures, and project files.', badge: atRisk ? 'unsaved changes' : undefined },
      ]} />
      <TabPanel idBase="design" id="model" value={tab}>
        <ModelPanel s={s} change={change} modelName={modelName} triangles={design.model.mesh.indices.length / 3} open={open} info={model.info} size={size}
          onSize={resize} onModel={pickModel} onOpenStl={() => stlInput.current?.click()} roots={roots} busy={running && 'Pause the growth first.'}
          rootPlace={rootPlace} setRootPlace={place => { setRootPlace(place); setRooting(true) }}
          onDefaultRoots={() => void model.setRoots(defaultRequests(design), 'Roots are back on the model’s own spots.')}
          onRimRoots={() => void model.setRoots([{ kind: 'rim', count: 6, systems: s.systems }], 'Six roots along the rim.')}
          onClearRoots={() => { void model.setRoots([], 'Roots cleared. Click the model with the Roots tool (O) to add your own.'); setRooting(true) }} />
      </TabPanel>
      <TabPanel idBase="design" id="grow" value={tab}><GrowPanel s={s} change={change} onPreset={preset} /></TabPanel>
      <TabPanel idBase="design" id="look" value={tab}><LookPanel s={s} change={change} /></TabPanel>
      <TabPanel idBase="design" id="export" value={tab}>
        <ExportPanel s={s} detail={detail} setDetail={setDetail} transparent={transparent} setTransparent={setTransparent} exporting={exporting} nothing={nothing} estimate={estimate}
          joined={joined} setJoined={setJoined} open={open}
          onStl={() => void exportSkin('stl')} on3mf={() => void exportSkin('3mf')} onObj={() => void exportObj()} onPng={scale => void exportPng(scale)}
          onSave={() => void saveProject()} onOpen={openProject} />
      </TabPanel>
      <input ref={stlInput} type="file" accept=".stl,model/stl,application/sla" hidden aria-label="Choose an STL model" onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void readStl(file)
      }} />
      <input ref={projectInput} type="file" accept=".json,application/json" hidden aria-label="Choose a project file" onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void readProject(file)
      }} />
    </aside>

    <div className="center">
      <ViewBar s={s} rooting={rooting} setRooting={setRooting} system={system} setSystem={setSystem} toggle={toggle}
        onFit={() => handle.current?.fit()} onView={dir => handle.current?.view(dir)} />
      <div className="sheet-frame">{showQuickStart && !phone && <QuickStart onClose={closeQuickStart} />}</div>
      <Dock running={running} stopping={model.stopping} canGrow={canGrow}
        onGrow={grow} onPause={pause} onStep={() => { setStatus(null); model.step() }} onReset={reset} canReset={resetBlocked}
        status={statusText} warning={status ? Boolean(status.warning) : !running && (stats.done === 'out-of-reach' || stats.done === 'cap')}
        canUndo={model.canUndo} canRedo={model.canRedo} onUndo={() => void model.undo()} onRedo={() => void model.redo()} />
    </div>

    {showQuickStart && phone && <QuickStart onClose={closeQuickStart} />}

    <aside className="inspector side-panel glass" aria-label="Measurements">
      <Inspector s={s} stats={stats} net={net} view={view} mesh={design.model.mesh} modelName={modelName} info={model.info} attractors={attractorCount} running={running} />
    </aside>

    {pending && <ConfirmDialog pending={pending} onCancel={() => setPending(null)} />}
    {showHelp && <HelpDialog onClose={() => setShowHelp(false)} onQuickStart={() => {
      setShowHelp(false); setShowQuickStart(true)
      window.setTimeout(() => document.querySelector<HTMLElement>('.quick-start button')?.focus(), 0)
    }} />}
  </main>
}
