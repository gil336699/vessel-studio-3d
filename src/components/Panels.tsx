// The side panel's tabs: Model (where and what veins grow in), Grow (presets, systems and growth), Look (widths and
// colours) and Export (files to print and for other apps).
import { count, mm } from '../lib/format'
import { MODELS, type ModelId } from '../lib/models'
import { interweaving, joining, LIMITS, PRESETS, SYSTEM_NAMES, type Detail, type PresetName, type Settings } from '../lib/settings'
import type { DomainInfo } from '../worker/runner'
import { Button, ColorField, NumberField, RangeField, Section, Segmented, SwitchField } from './Controls'
import { Icon } from './Icon'

type Change = (patch: Partial<Settings>, key?: string | null) => void

export function ModelPanel({ s, change, modelName, triangles, open, info, size, onSize, onModel, onOpenStl, onDefaultRoots, onRimRoots, onClearRoots, roots, busy, rootPlace, setRootPlace }: {
  s: Settings; change: Change; modelName: string; triangles: number; open: boolean; info: DomainInfo | null; size: number
  onSize: (mm: number) => void; onModel: (id: ModelId) => void; onOpenStl: () => void
  onDefaultRoots: () => void; onRimRoots: () => void; onClearRoots: () => void; roots: number; busy: string | false
  rootPlace: 'skin' | 'middle'; setRootPlace: (place: 'skin' | 'middle') => void
}) {
  const inside = s.mode === 'inside'
  return <>
    <Section title="Where veins grow" tip="Through the inside of the model, or across its surface.">
      <Segmented label="Where veins grow" hideLabel value={s.mode} onChange={mode => change({ mode, modelLook: mode === 'inside' ? 'glass' : 'solid' })} options={[
        { value: 'inside', label: 'Inside', tip: 'Veins grow through the inside of a closed model and fill its volume, like vessels in an organ.' },
        { value: 'surface', label: 'On the surface', tip: 'Veins grow across the model’s skin and stay on it, like vessels over a heart or roots round a pot.' },
      ]} />
      {inside && open && <p className="hint">This model is open, so its {info?.openings && info.openings > 1 ? `${info.openings} openings are` : 'opening is'} closed with a flat cap to find its inside.</p>}
    </Section>
    <Section title="Model" tip="The shape veins grow in or on: a built-in one, or your own STL.">
      <label className="field" data-tip="A built-in model to grow in or on.">
        <span className="field-label">Shape</span>
        <select value={s.model} onChange={e => { const id = e.currentTarget.value; if (id !== 'imported') onModel(id as ModelId) }} aria-label="Shape">
          {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          {s.model === 'imported' && <option value="imported">{modelName}</option>}
        </select>
      </label>
      <Button className="wide" tip="Open an STL file of your own: a closed model to grow inside, or any model to grow over. Millimetres." onClick={onOpenStl}><Icon name="open" />Open STL…</Button>
      <p className="hint">{modelName}: {count(triangles)} triangles, {open ? 'open (a sheet with rims)' : 'closed'}.</p>
      <NumberField label="Longest side" value={Math.round(size * 10) / 10} min={10} max={2000} step={1} digits={1} suffix="mm"
        tip="The model’s size: its longest side, in millimetres. Veins start again for a new size." onChange={onSize} />
    </Section>
    <Section title="Attractors" tip="Points scattered in or on the model; veins grow toward them until every one is reached.">
      <RangeField label="Count" value={s.count} min={LIMITS.count[0]} max={LIMITS.count[1]} step={1} digits={0} log onRelease
        tip={interweaving(s) ? 'How many attractors each system gets. More means finer, denser veins.' : 'How many attractors to scatter. More means finer, denser veins.'} onChange={v => change({ count: Math.round(v) })} />
      {inside
        ? <Segmented label="Placement" columns={2} value={s.insidePlacement} onChange={insidePlacement => change({ insidePlacement })} options={[
          { value: 'even', label: 'Even', tip: 'Evenly spread through the inside, with no clumps.' },
          { value: 'random', label: 'Random', tip: 'Scattered at random, so veins are denser in places.' },
          { value: 'wall', label: 'Near the wall', tip: 'More toward the wall, so veins branch out under the skin, as a tree does near its crown’s edge.' },
          { value: 'shell', label: 'Shell', tip: 'Only in a layer under the wall, for vessels just below the skin.' },
        ]} />
        : <Segmented label="Placement" value={s.surfacePlacement} onChange={surfacePlacement => change({ surfacePlacement })} options={[
          { value: 'even', label: 'Even', tip: 'Evenly spread over the surface, by area.' },
          { value: 'random', label: 'Random', tip: 'Scattered at random over the surface.' },
        ]} />}
      {inside && s.insidePlacement === 'shell' && <RangeField label="Shell depth" value={s.shell} min={LIMITS.shell[0]} max={LIMITS.shell[1]} step={0.1} digits={1} suffix="mm" onRelease
        tip="How deep the layer of attractors under the wall is." onChange={shell => change({ shell })} />}
      <RangeField label="Edge clearance" value={s.clearance} min={LIMITS.clearance[0]} max={Math.min(LIMITS.clearance[1], size / 8)} step={0.1} digits={1} suffix="mm" onRelease
        tip={inside ? 'How far veins stay inside the model’s wall, so tubes don’t break through the skin.' : 'How far veins stay from the model’s open rims.'} onChange={clearance => change({ clearance })} />
      <div className="seed-row">
        <NumberField label="Pattern" value={s.seed} min={LIMITS.seed[0]} max={LIMITS.seed[1]} tip="The pattern number: the same number always places the same attractors." onChange={seed => change({ seed: Math.round(seed) })} />
        <Button className="icon-button" label="New pattern" tip="A new random pattern of attractors." onClick={() => change({ seed: 1 + Math.floor(Math.random() * 999_999) })}><Icon name="dice" /></Button>
      </div>
    </Section>
    <Section title="Roots" tip="Where veins start. Click the model with the Roots tool (O) to add one.">
      <p className="hint">{roots ? `${count(roots)} ${roots === 1 ? 'root' : 'roots'}.` : 'No roots yet.'} Click the model with the Roots tool (O) to add one.</p>
      {inside && <Segmented label="A click puts a root" value={rootPlace} onChange={setRootPlace} options={[
        { value: 'skin', label: 'On the skin', tip: 'The vessel enters the model where you click, as an artery enters an organ. Shift-click for the middle instead.' },
        { value: 'middle', label: 'In the middle', tip: 'The root starts deep inside, halfway through the model under the click. Shift-click for the skin instead.' },
      ]} />}
      <div className="button-row">
        <Button unavailable={busy} tip="Put roots back on the model’s own spots, one for each system." onClick={onDefaultRoots}>Model’s spots</Button>
        <Button unavailable={busy || (inside && 'Roots along the rim are for growing On the surface.')} tip={open ? 'Six roots spread along the model’s open rim, as for roots round a pot.' : 'Six roots round the model’s top lip, as for roots round a pot.'} onClick={onRimRoots}>{open ? 'Along the rim' : 'Round the top'}</Button>
      </div>
      <Button className="wide" unavailable={busy || (!roots && 'There are no roots to clear.')} tip="Remove every root, to place your own." onClick={onClearRoots}>Clear roots</Button>
    </Section>
  </>
}

export function GrowPanel({ s, change, onPreset }: { s: Settings; change: Change; onPreset: (name: PresetName) => void }) {
  const join = joining(s), weave = interweaving(s)
  return <>
    <Section title="Presets" tip="Settings and a model to start from. They keep your own STL if one is open.">
      <div className="button-row preset-row">
        {PRESETS.map(p => <Button key={p.id} tip={p.tip} onClick={() => onPreset(p.id)}>{p.label}</Button>)}
      </div>
    </Section>
    <Section title="Systems" tip="One system of veins, or two or three that grow together.">
      <Segmented label="Systems" value={String(s.systems)} onChange={v => change({ systems: Number(v), ...(Number(v) === 3 ? { coupling: 'interweave' as const } : {}) })} options={[
        { value: '1', label: 'One', tip: 'One system of veins.' },
        { value: '2', label: 'Two', tip: 'Two systems that grow together: they join into one network, or interweave and stay apart.' },
        { value: '3', label: 'Three', tip: 'Three systems that interweave and stay apart, like the artery, portal vein and hepatic vein of a liver.' },
      ]} />
      {s.systems === 2 && <Segmented label="How they grow" value={s.coupling} onChange={coupling => change({ coupling })} options={[
        { value: 'join', label: 'Join', tip: 'An inlet tree and an outlet tree grow toward each other and join where they meet, so flow can pass through (mutual tree attraction, Kinstlinger et al. 2020).' },
        { value: 'interweave', label: 'Interweave', tip: 'Two separate systems that fill the same space and never touch.' },
      ]} />}
      {join && <>
        <RangeField label="Tip pull" value={s.tipPull} min={0} max={1} step={0.05} digits={2} tip="How strongly each tree’s free tips pull the other tree, so tips meet and join." onChange={tipPull => change({ tipPull }, 'tipPull')} />
        <SwitchField label="Trim dead ends" checked={s.trim} tip="Leave out vein ends that never met the other tree, so every vein shown and exported carries flow from inlet to outlet." onChange={trim => change({ trim })} />
      </>}
      {weave && <>
        <RangeField label="Gap" value={s.gap} min={0} max={Math.min(LIMITS.gap[1], 10)} step={0.05} digits={2} suffix="mm" tip="The space kept between the tube surfaces of different systems. Where they pass closer, the tubes narrow." onChange={gap => change({ gap }, 'gap')} />
        <RangeField label="Repel" value={s.repel} min={0} max={1} step={0.05} digits={2} tip="How strongly veins steer away from other systems as they grow." onChange={repel => change({ repel }, 'repel')} />
      </>}
      {s.systems > 1 && <p className="hint">Add each system’s roots with the Roots tool: pick {SYSTEM_NAMES.slice(0, s.systems).join(', ')} in the bar above the model.</p>}
    </Section>
    <Section title="Growth" tip="How the veins grow toward the attractors.">
      <RangeField label="Segment length" value={s.segment} min={LIMITS.segment[0]} max={LIMITS.segment[1]} step={0.05} digits={2} suffix="mm" tip="How far a vein grows each step. Shorter makes smoother, finer veins." onChange={segment => change({ segment }, 'segment')} />
      <RangeField label="Kill distance" value={s.kill} min={LIMITS.kill[0]} max={Math.min(LIMITS.kill[1], 30)} step={0.05} digits={2} suffix="mm" tip="An attractor this close to a vein is reached. Larger leaves more space between veins." onChange={kill => change({ kill }, 'kill')} />
      <RangeField label="Attraction distance" value={s.attraction} min={0} max={200} step={0.5} digits={1} suffix="mm" tip="How far a vein senses attractors; 0 means no limit. A limit makes veins grow out from the roots in waves." onChange={attraction => change({ attraction }, 'attraction')} />
      <SwitchField label="Loops" checked={s.loops && !join} unavailable={join && 'Join closes the network itself, where the two trees meet.'} tip="Veins that reach the same attractor from two sides join there, closing loops into a net." onChange={loops => change({ loops })} />
      <RangeField label="Keep heading" value={s.inertia} min={0} max={LIMITS.inertia[1]} step={0.05} digits={2} tip="How much of its last direction a vein keeps. More makes long, smooth vessels." onChange={inertia => change({ inertia }, 'inertia')} />
      <RangeField label="Wiggle" value={s.wiggle} min={0} max={LIMITS.wiggle[1]} step={0.05} digits={2} tip="A wobble added to each step, so veins wander." onChange={wiggle => change({ wiggle }, 'wiggle')} />
      <RangeField label="Pull" value={s.pull} min={0} max={1} step={0.05} digits={2} tip="A steady pull on every step, in the direction below." onChange={pull => change({ pull }, 'pull')} />
      <Segmented label="Pull toward" unavailable={!(s.pull > 0) && 'Set Pull above 0 first.'} value={s.pullMode} onChange={pullMode => change({ pullMode })} options={[
        { value: 'up', label: 'Up', tip: 'Pull veins upward, as a tree grows toward light.' },
        { value: 'down', label: 'Down', tip: 'Pull veins downward, as roots grow.' },
        { value: 'out', label: 'Out', tip: 'Pull veins away from their root.' },
        { value: 'in', label: 'In', tip: 'Pull veins toward the middle of the model.' },
      ]} />
      <SwitchField label="Keep veins apart" checked={s.apart} tip="A vein can’t grow onto another vein of its own system." onChange={apart => change({ apart })} />
      <RangeField label="Speed" value={s.speed} min={LIMITS.speed[0]} max={LIMITS.speed[1]} step={1} digits={0} suffix="/frame" tip="Growth steps per frame on screen. It changes how fast you see growth, not the result." onChange={speed => change({ speed: Math.round(speed) }, 'speed')} />
    </Section>
  </>
}

// How thin a tip may be for common printers, mm.
const FDM_MIN = 0.8, RESIN_MIN = 0.3

export function LookPanel({ s, change }: { s: Settings; change: Change }) {
  const colours: [keyof Settings, string][] = [['colorA', 'System A'], ['colorB', 'System B'], ['colorC', 'System C']]
  return <>
    <Section title="Widths" tip="How wide the veins are. Exports and the view use the same widths.">
      <Segmented label="Width rule" value={s.widthRule} onChange={widthRule => change({ widthRule })} options={[
        { value: 'murray', label: 'Murray’s law', tip: 'Veins thicken toward the roots: at each fork, the widths follow Murray’s law, as in blood vessels.' },
        { value: 'even', label: 'Even', tip: 'Every vein the same width.' },
      ]} />
      <RangeField label="Tip width" value={s.tipWidth} min={LIMITS.tipWidth[0]} max={Math.min(LIMITS.tipWidth[1], 10)} step={0.05} digits={2} suffix="mm" tip="The width of the finest veins, at their tips." onChange={tipWidth => change({ tipWidth }, 'tipWidth')} />
      {s.tipWidth < RESIN_MIN
        ? <p className="hint warning">Tips under {RESIN_MIN} mm are too thin to print on most printers.</p>
        : s.tipWidth < FDM_MIN && <p className="hint">Tips under {FDM_MIN} mm suit resin printers; a filament printer needs about {FDM_MIN} mm.</p>}
      <RangeField label="Widest" value={s.maxWidth} min={LIMITS.maxWidth[0]} max={Math.min(LIMITS.maxWidth[1], 30)} step={0.05} digits={2} suffix="mm" unavailable={s.widthRule === 'even' && 'Even widths use the tip width everywhere.'} tip="The widest a vein can be, near the roots." onChange={maxWidth => change({ maxWidth }, 'maxWidth')} />
      <RangeField label="Murray exponent" value={s.exponent} min={LIMITS.exponent[0]} max={LIMITS.exponent[1]} step={0.05} digits={2} unavailable={s.widthRule === 'even' && 'Even widths don’t use it.'} tip="Lower thickens veins faster toward the roots; 3 is blood vessels’ value." onChange={exponent => change({ exponent }, 'exponent')} />
    </Section>
    <Section title="Colours" tip="Colours for the view, the picture and the 3MF file.">
      {colours.slice(0, s.systems).map(([key, label]) => <ColorField key={key} label={s.systems > 1 ? label : 'Veins'} value={s[key] as string} tip={`The colour of ${s.systems > 1 ? label : 'the veins'}.`} onChange={v => change({ [key]: v } as Partial<Settings>, key)} />)}
      {joining(s) && <ColorField label="Joins" value={s.linkColor} tip="The colour of the joins where the two trees met." onChange={linkColor => change({ linkColor }, 'linkColor')} />}
      <ColorField label="Model" value={s.modelColor} tip="The colour of the model." onChange={modelColor => change({ modelColor }, 'modelColor')} />
    </Section>
    <Section title="Model" tip="How the model is drawn.">
      <Segmented label="Model looks" value={s.modelLook} onChange={modelLook => change({ modelLook })} options={[
        { value: 'glass', label: 'Glass', tip: 'See-through, to watch veins grow inside.' },
        { value: 'solid', label: 'Solid', tip: 'Solid, to see veins on its surface.' },
      ]} />
    </Section>
  </>
}

export function ExportPanel({ s, onStl, on3mf, onObj, onPng, onSave, onOpen, detail, setDetail, transparent, setTransparent, exporting, nothing, estimate, joined, setJoined, open }: {
  s: Settings; onStl: () => void; on3mf: () => void; onObj: () => void; onPng: (scale: number) => void; onSave: () => void; onOpen: () => void
  detail: Detail; setDetail: (d: Detail) => void; transparent: boolean; setTransparent: (on: boolean) => void
  exporting: string | false; nothing: string | false; estimate: string; joined: boolean; setJoined: (on: boolean) => void; open: boolean
}) {
  const busy = exporting
  return <>
    <Section title="To print" tip="The veins as tubes: one watertight solid, ready for a slicer.">
      {s.mode === 'surface' && <Segmented label="Print" value={joined && !open ? 'joined' : 'alone'} onChange={v => setJoined(v === 'joined')} options={[
        { value: 'alone', label: 'Veins alone', tip: 'Just the veins, as one lattice where they join: a lamp shade or a vase of veins.' },
        { value: 'joined', label: 'With the model', unavailable: open && 'An open sheet has no thickness to join veins to. Print the veins alone, or close the model in your CAD app.', tip: 'The model and its raised veins together, as two parts of one object that your slicer joins as it slices.' },
      ]} />}
      <Segmented label="Detail" value={detail} onChange={setDetail} options={[
        { value: 'draft', label: 'Draft', tip: 'A coarser surface and a smaller file, quick to make.' },
        { value: 'normal', label: 'Normal', tip: 'Smooth tubes for most prints.' },
        { value: 'fine', label: 'Fine', tip: 'The smoothest tubes, and the largest file.' },
      ]} />
      <p className="hint">{estimate}</p>
      <div className="button-row">
        <Button unavailable={busy || nothing} tip="A watertight STL of the tubes, in millimetres, for any slicer." onClick={onStl}><Icon name="export" />STL</Button>
        <Button unavailable={busy || nothing} tip={s.systems > 1 ? 'A 3MF with each system as its own coloured part, for multi-colour printers.' : 'A 3MF of the tubes, in millimetres, with their colour.'} onClick={on3mf}><Icon name="export" />3MF</Button>
      </div>
      {s.tipWidth < FDM_MIN && <p className="hint">Tips are {mm(s.tipWidth, 2)} wide: fine on a resin printer; a filament printer needs about {FDM_MIN} mm (Look tab).</p>}
    </Section>
    <Section title="For other apps" tip="Centre lines and pictures for Blender, Rhino, Houdini and illustration.">
      <Button className="wide" unavailable={nothing} tip="An OBJ of the veins’ centre lines, each group named for its system and width, for Blender, Rhino and Houdini." onClick={onObj}><Icon name="export" />OBJ centre lines</Button>
      <div className="button-row three">
        {[1, 2, 4].map(scale => <Button key={scale} tip={`A PNG picture of the view at ${scale}× the screen’s size.`} onClick={() => onPng(scale)}>PNG {scale}×</Button>)}
      </div>
      <SwitchField label="Transparent background" checked={transparent} tip="Save pictures with no background, to place over other artwork." onChange={setTransparent} />
    </Section>
    <Section title="Project" tip="Save the whole design, veins and all, to carry on later.">
      <div className="button-row">
        <Button shortcut="⌘S" tip="Save the design as a project file, to open and carry on later." onClick={onSave}><Icon name="save" />Save</Button>
        <Button shortcut="⌘O" tip="Open a project file you saved." onClick={onOpen}><Icon name="open" />Open</Button>
      </div>
    </Section>
  </>
}
