// The page's model of a design: settings, model, roots, attractors and the veins grown so far, with undo, unsaved state
// and the growth worker. The worker owns the veins while they grow. The page keeps a mirror that each frame adds to,
// for drawing, and copies it into the design when growth stops. (The pattern of Vessel Studio's useVeins.)
import { useCallback, useEffect, useRef, useState } from 'react'
import { attractorsFor, defaultRequests, engineState, hasGrown, regrown, type Design, type Growth, type ModelDoc } from './lib/design'
import { emptyHistory, record, redo as redoStep, undo as undoStep, type History } from './lib/history'
import { growthParams, scatterKey, scatterSpec, type Settings } from './lib/settings'
import type { Attractors } from './veins/domain'
import { GrowthClient } from './worker/client'
import type { DomainInfo, Frame, FromRunner, RootRequest } from './worker/runner'

export type Status = { text: string; warning?: boolean } | null
export type Stats = { revision: number; step: number; points: number; live: number; done: Growth['done']; rate: number; freeTips: number }

function grow<T extends Float64Array | Int32Array | Uint8Array>(a: T, n: number): T {
  if (a.length >= n) return a
  const next = new (a.constructor as { new (n: number): T })(Math.max(n, a.length * 2, 256))
  next.set(a)
  return next
}

// The veins as the worker last sent them, in arrays that grow as frames add points.
export class Mirror {
  x = new Float64Array(0); y = new Float64Array(0); z = new Float64Array(0); n = new Float64Array(0)
  parent = new Int32Array(0); sys = new Int32Array(0); fixed = new Uint8Array(0)
  joins = new Int32Array(0); links = new Int32Array(0); used = new Uint8Array(0)
  points = 0; joinPairs = 0; linkPairs = 0
  step = 0; rng = 0; idle = 0; done: Growth['done'] = null; live = 0; freeTips = 0

  reset(g: Growth | null, attractors: number) {
    const n = g ? g.x.length : 0
    this.x = new Float64Array(Math.max(256, n)); this.y = new Float64Array(Math.max(256, n)); this.z = new Float64Array(Math.max(256, n))
    this.n = new Float64Array(Math.max(768, n * 3)); this.parent = new Int32Array(Math.max(256, n)); this.sys = new Int32Array(Math.max(256, n))
    this.fixed = new Uint8Array(Math.max(256, n))
    this.joins = new Int32Array(Math.max(256, g ? g.joins.length : 0)); this.links = new Int32Array(Math.max(256, g ? g.links.length : 0))
    this.used = new Uint8Array(attractors)
    if (g) {
      this.x.set(g.x); this.y.set(g.y); this.z.set(g.z); this.n.set(g.n); this.parent.set(g.parent); this.sys.set(g.sys)
      for (const i of g.fixed) this.fixed[i] = 1
      this.joins.set(g.joins); this.links.set(g.links)
      this.used.set(g.used.subarray(0, attractors))
    }
    this.points = n; this.joinPairs = g ? g.joins.length / 2 : 0; this.linkPairs = g ? g.links.length / 2 : 0
    this.step = g?.step ?? 0; this.rng = g?.rng ?? 0; this.idle = g?.idle ?? 0; this.done = g?.done ?? null
    this.live = this.used.reduce((k, u) => k + (u ? 0 : 1), 0)
    this.freeTips = 0
  }

  // Adds a frame's changes. False when the frame doesn't follow on from what's here.
  apply(f: Frame): boolean {
    if (f.from !== this.points || f.joinFrom !== this.joinPairs || f.linkFrom !== this.linkPairs) return false
    const n = this.points + f.x.length
    this.x = grow(this.x, n); this.y = grow(this.y, n); this.z = grow(this.z, n); this.n = grow(this.n, n * 3)
    this.parent = grow(this.parent, n); this.sys = grow(this.sys, n); this.fixed = grow(this.fixed, n)
    this.x.set(f.x, this.points); this.y.set(f.y, this.points); this.z.set(f.z, this.points); this.n.set(f.n, this.points * 3)
    this.parent.set(f.parent, this.points); this.sys.set(f.sys, this.points)
    for (const i of f.fixed) this.fixed[i] = 1
    this.points = n
    const j = this.joinPairs * 2 + f.joins.length
    this.joins = grow(this.joins, j); this.joins.set(f.joins, this.joinPairs * 2); this.joinPairs = j / 2
    const l = this.linkPairs * 2 + f.links.length
    this.links = grow(this.links, l); this.links.set(f.links, this.linkPairs * 2); this.linkPairs = l / 2
    for (const s of f.used) this.used[s] = 1
    this.step = f.step; this.rng = f.rng; this.idle = f.idle; this.done = f.done; this.live = f.live; this.freeTips = f.freeTips
    return true
  }

  // New growth settings may let finished growth carry on, as the engine allows. True if it was finished.
  resume(): boolean {
    if (!this.done || this.done === 'empty' || this.done === 'reached') return false
    this.done = null
    return true
  }

  view(): Net {
    const p = this.points
    return {
      x: this.x.subarray(0, p), y: this.y.subarray(0, p), z: this.z.subarray(0, p), parent: this.parent.subarray(0, p), sys: this.sys.subarray(0, p),
      fixed: this.fixed.subarray(0, p), joins: this.joins.subarray(0, this.joinPairs * 2), links: this.links.subarray(0, this.linkPairs * 2),
      used: this.used, points: p,
    }
  }

  growth(): Growth {
    const p = this.points, fixed: number[] = []
    for (let i = 0; i < p; i++) if (this.fixed[i]) fixed.push(i)
    return {
      step: this.step, rng: this.rng, idle: this.idle, done: this.done,
      x: this.x.slice(0, p), y: this.y.slice(0, p), z: this.z.slice(0, p), n: this.n.slice(0, p * 3),
      parent: this.parent.slice(0, p), sys: this.sys.slice(0, p), fixed: Int32Array.from(fixed),
      joins: this.joins.slice(0, this.joinPairs * 2), links: this.links.slice(0, this.linkPairs * 2), used: this.used.slice(),
    }
  }
}

export type Net = {
  x: Float64Array; y: Float64Array; z: Float64Array; parent: Int32Array; sys: Int32Array; fixed: Uint8Array
  joins: Int32Array; links: Int32Array; used: Uint8Array; points: number
}

// Settings that place the attractors again (and so start the veins again), and those that also need new roots.
const RESTART: (keyof Settings)[] = ['count', 'insidePlacement', 'surfacePlacement', 'shell', 'seed', 'clearance']
const NEW_ROOTS: (keyof Settings)[] = ['mode', 'model', 'systems', 'coupling']
// Settings the growth takes up as it goes.
const LIVE: (keyof Settings)[] = ['segment', 'kill', 'attraction', 'loops', 'inertia', 'wiggle', 'pull', 'pullMode', 'apart', 'gap', 'repel', 'tipPull', 'widthRule', 'tipWidth', 'maxWidth', 'exponent']

const statsOf = (m: Mirror, revision: number, rate = 0): Stats =>
  ({ revision, step: m.step, points: m.points, live: m.live, done: m.done, rate, freeTips: m.freeTips })

export function useVeins(initial: () => { design: Design; saved: boolean }, setStatus: (status: Status) => void) {
  const [first] = useState(initial)
  const [design, setDesign] = useState<Design>(first.design)
  const committed = useRef<Design>(first.design)
  const [mirror] = useState(() => { const m = new Mirror(); m.reset(first.design.growth, first.design.attractors ? first.design.attractors.p.length / 3 : 0); return m })
  const [stats, setStats] = useState<Stats>(() => statsOf(mirror, 0))
  const [net, setNet] = useState(() => mirror.view())
  const revision = useRef(0)
  // The attractors as placed for the current design, and what the worker found out about the model.
  const [attractors, setAttractors] = useState<Attractors | null>(first.design.attractors)
  const [info, setInfo] = useState<DomainInfo | null>(null)
  // Ready once the worker has built the model's domain and placed the attractors.
  const [ready, setReady] = useState(false)
  // Starting again, the worker places the roots just after it is ready: until it says where, they are pending.
  const [placingRoots, setPlacingRoots] = useState(false)
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const runningRef = useRef(false)
  const readyRef = useRef(false)
  const runId = useRef(0)
  const gen = useRef(0)
  const waiters = useRef<(() => void)[]>([])
  const history = useRef<History<Design>>(emptyHistory())
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [unsaved, setUnsaved] = useState(!first.saved)
  const client = useRef<GrowthClient | null>(null)
  // Root clicks sent to the worker and not yet answered, oldest first.
  const pending = useRef<RootRequest[]>([])
  const broken = useRef('')
  const statusRef = useRef(setStatus)
  useEffect(() => { statusRef.current = setStatus }, [setStatus])

  // The design as it is now, with the veins from the latest frame.
  const current = useCallback((): Design => ({ ...committed.current, growth: mirror.points ? mirror.growth() : null }), [mirror])
  const show = useCallback((rate = 0) => { setStats(statsOf(mirror, ++revision.current, rate)); setNet(mirror.view()) }, [mirror])
  const commit = useCallback((d: Design) => {
    committed.current = d
    setDesign(d)
    mirror.reset(d.growth, d.attractors ? d.attractors.p.length / 3 : 0)
    show()
  }, [show, mirror])
  const syncHistory = () => { setCanUndo(history.current.past.length > 0); setCanRedo(history.current.future.length > 0) }
  const remember = useCallback((before: Design, key: string | null) => {
    // About 70 bytes a vein point per copy: past 30,000 points keep 15 steps, past 100,000 keep 6.
    const points = before.growth?.x.length ?? 0
    history.current = record(history.current, before, key, Date.now(), points > 100_000 ? 6 : points > 30_000 ? 15 : 40)
    syncHistory()
  }, [])
  const load = useCallback((d: Design) => {
    readyRef.current = false
    setReady(false)
    setPlacingRoots(!d.growth && d.roots.length > 0)
    pending.current = []
    const g = ++gen.current
    client.current?.load({
      gen: g, meshKey: d.model.key, mesh: d.model.mesh, mode: d.settings.mode, scatter: scatterSpec(d.settings),
      attractors: attractorsFor(d), params: growthParams(d.settings), state: engineState(d.growth), requests: d.roots,
    })
  }, [])

  useEffect(() => {
    // Workers started in a row without a frame from any: a worker file that won't load stops the retries.
    let failures = 0
    const start = () => {
      const c = new GrowthClient(onMessage)
      client.current = c
      load(committed.current)
    }
    const onMessage = (message: FromRunner) => {
      const c = client.current
      switch (message.kind) {
        case 'error': {
          runningRef.current = false
          setRunning(false); setStopping(false)
          waiters.current.splice(0).forEach(resolve => resolve())
          // A stopped worker takes no more messages: a fresh one carries on from the veins the page has drawn.
          c?.dispose()
          committed.current = { ...committed.current, growth: mirror.points ? mirror.growth() : null }
          setDesign(committed.current)
          failures++
          if (failures <= 2) {
            start()
            statusRef.current({ text: `Growth stopped: ${message.message} Press Grow to carry on.`, warning: true })
          } else {
            client.current = null
            broken.current = `Growth can’t start: ${message.message} Reload the page to try again; your design is kept.`
            statusRef.current({ text: broken.current, warning: true })
          }
          return
        }
        case 'progress': if (message.gen === gen.current) statusRef.current({ text: message.text }); return
        case 'failed':
          if (message.gen !== gen.current) return
          statusRef.current({ text: message.message, warning: true })
          return
        case 'ready': {
          if (message.gen !== gen.current) return
          failures = 0
          const d = { ...committed.current, attractors: message.attractors, placedFor: message.placedFor === 'project' ? committed.current.placedFor : scatterKey(committed.current.settings) }
          committed.current = d
          setDesign(d)
          if (!d.growth) mirror.reset(null, message.attractors.p.length / 3)
          else if (mirror.used.length !== message.attractors.p.length / 3) mirror.reset(d.growth, message.attractors.p.length / 3)
          setAttractors(message.attractors)
          setInfo(message.info)
          readyRef.current = true
          setReady(true)
          show()
          if (message.short) statusRef.current({ text: `Only ${(message.attractors.p.length / 3).toLocaleString('en-US')} attractors fit, clear of the model’s ${d.settings.mode === 'inside' ? 'walls' : 'rims'}. Use fewer, or a smaller edge clearance.`, warning: true })
          else statusRef.current(null)
          return
        }
        case 'roots': {
          if (message.gen !== gen.current) return
          if (!message.live) setPlacingRoots(false)
          if (message.live) {
            const request = pending.current.shift()
            if (request && message.added.length) {
              committed.current = { ...committed.current, roots: [...committed.current.roots, request] }
              setDesign(committed.current)
            }
          }
          if (message.refused) statusRef.current({ text: message.refused, warning: true })
          return
        }
      }
      failures = 0
      const { frame } = message
      if (frame.gen !== gen.current) { c?.ack(); return }
      const fits = mirror.apply(frame)
      if (message.kind === 'frame') {
        show(frame.stepsPerSecond)
        // Ready for the next frame once this one is drawn, or after a moment when the browser draws no frames (a hidden
        // pane or tab), so the counts still update.
        let acked = false
        const ack = () => { if (!acked) { acked = true; c?.ack() } }
        requestAnimationFrame(ack)
        setTimeout(ack, 250)
        if (!runningRef.current && fits) { committed.current = { ...committed.current, growth: mirror.growth() }; setDesign(committed.current) }
        return
      }
      // Stopped: the worker's final veins become the design's.
      const before = committed.current.growth?.step ?? 0
      committed.current = { ...committed.current, growth: mirror.points ? mirror.growth() : null }
      setDesign(committed.current)
      show(0)
      c?.ack()
      if (message.run === runId.current) {
        runningRef.current = false
        setRunning(false); setStopping(false)
      }
      if (frame.step !== before) setUnsaved(true)
      waiters.current.splice(0).forEach(resolve => resolve())
    }
    start()
    return () => { client.current?.dispose(); client.current = null }
  }, [show, mirror, load])

  // Stops growing and waits for the worker's last veins, so nothing after it works from a stale copy.
  const halt = useCallback((): Promise<void> => {
    if (!runningRef.current) return Promise.resolve()
    if (!client.current) { runningRef.current = false; setRunning(false); setStopping(false); return Promise.resolve() }
    setStopping(true)
    client.current.stop()
    return new Promise(resolve => waiters.current.push(resolve))
  }, [])

  // Starts the veins again from the roots, for a design whose attractors or roots changed.
  const restart = useCallback((next: Design) => {
    commit(next)
    load(next)
    setUnsaved(true)
  }, [commit, load])

  const replace = useCallback(async (next: Design, remembered = true) => {
    await halt()
    if (remembered) remember(current(), null)
    commit(next)
    load(next)
    setUnsaved(true)
  }, [halt, remember, current, commit, load])

  // A settings change. Ones that start the veins again wait for growth to stop; the rest apply live.
  const change = useCallback(async (patch: Partial<Settings>, key: string | null = null, opts: { model?: ModelDoc; quiet?: boolean } = {}) => {
    const cur = current()
    const settings = { ...cur.settings, ...patch }
    const model = opts.model ?? cur.model
    const changed = (Object.keys(patch) as (keyof Settings)[]).filter(k => patch[k] !== cur.settings[k])
    if (!changed.length && model === cur.model) return
    const newRoots = Boolean(opts.model) || changed.some(k => NEW_ROOTS.includes(k))
    const restarts = newRoots || changed.some(k => RESTART.includes(k))
    if (restarts) {
      await halt()
      const now = current()
      remember(now, key)
      const next = regrown(now, { ...now.settings, ...patch }, model)
      if (newRoots) next.roots = defaultRequests(next)
      restart(next)
      if (hasGrown(now) && !opts.quiet) statusRef.current({ text: newRoots ? 'The veins started again for the new model or systems. Undo brings them back.' : 'The veins started again for the new attractors. Undo brings them back.' })
      return
    }
    remember(cur, key)
    setUnsaved(true)
    committed.current = { ...committed.current, settings }
    setDesign(committed.current)
    if (changed.some(k => LIVE.includes(k))) {
      client.current?.params(growthParams(settings))
      // New growth settings may let finished growth carry on, from where the veins are.
      if (mirror.resume()) {
        show()
        if (!opts.quiet) statusRef.current({ text: 'Growth carries on from here with the new setting. Reset to grow again from the roots with it.' })
      }
    }
    if (changed.includes('speed')) client.current?.speed(settings.speed)
  }, [current, remember, halt, restart, show, mirror])

  const notReady = () => {
    if (!client.current) { statusRef.current({ text: broken.current || 'Growth is starting up. Try again in a moment.', warning: true }); return true }
    if (!readyRef.current) { statusRef.current({ text: 'The model is still being prepared. Try again in a moment.' }); return true }
    return false
  }

  const play = useCallback(() => {
    if (runningRef.current || notReady()) return
    remember(current(), null)
    runningRef.current = true
    setRunning(true)
    statusRef.current(null)
    runId.current = client.current?.play(null, committed.current.settings.speed) ?? 0
  }, [remember, current])

  const step = useCallback(() => {
    if (runningRef.current || notReady()) return
    remember(current(), 'step')
    runningRef.current = true
    setRunning(true)
    runId.current = client.current?.play(1, 1) ?? 0
  }, [remember, current])

  const pause = useCallback(() => { if (runningRef.current) { setStopping(true); client.current?.stop() } }, [])

  const reset = useCallback(async () => {
    await halt()
    const cur = current()
    remember(cur, null)
    restart({ ...cur, growth: null })
  }, [halt, current, remember, restart])

  const undo = useCallback(async () => {
    await halt()
    const result = undoStep(history.current, current())
    if (!result) return
    history.current = result.history
    syncHistory()
    commit(result.state)
    load(result.state)
    setUnsaved(true)
  }, [halt, current, commit, load])

  const redo = useCallback(async () => {
    await halt()
    const result = redoStep(history.current, current())
    if (!result) return
    history.current = result.history
    syncHistory()
    commit(result.state)
    load(result.state)
    setUnsaved(true)
  }, [halt, current, commit, load])

  // A root at a click. Before or while growing, it joins in as a vein of its own; the worker places it, and says why
  // if it can't.
  const addRoot = useCallback((request: RootRequest) => {
    if (notReady()) return
    remember(current(), null)
    setUnsaved(true)
    pending.current.push(request)
    client.current?.roots(gen.current, [request])
  }, [current, remember])

  // Roots placed by rule (a model's own spots, or along the rim) or none: the veins start again from them.
  const setRoots = useCallback(async (roots: RootRequest[], message?: string) => {
    await halt()
    const cur = current()
    remember(cur, null)
    restart({ ...cur, roots, growth: null })
    if (message) statusRef.current({ text: message })
  }, [halt, current, remember, restart])

  const markSaved = useCallback(() => setUnsaved(false), [])

  return {
    design, stats, net, mirror, attractors, info, ready, placingRoots, running, stopping, unsaved, canUndo, canRedo,
    current, change, play, step, pause, reset, undo, redo, addRoot, setRoots, replace, markSaved, halt,
  }
}
