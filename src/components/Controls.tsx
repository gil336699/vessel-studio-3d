import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'
import { rangeFill } from '../lib/rangeFill'
import { trimZeros } from '../lib/format'

// Form controls shared by the panels. Each one carries a one-sentence description (data-tip) that the
// tooltip layer shows on hover and keyboard focus. An unavailable control shows why instead.

type Tip = { tip: string; unavailable?: string | false; shortcut?: string }

export function Button({ tip, unavailable, shortcut, className, onClick, children, label, pressed }: Tip & {
  className?: string; onClick: () => void; children: ReactNode; label?: string; pressed?: boolean
}) {
  // aria-disabled keeps the button focusable and hoverable, so its reason can still be read.
  return <button type="button" className={className} aria-label={label} aria-pressed={pressed} aria-disabled={unavailable ? true : undefined}
    data-tip={unavailable || tip} data-key={shortcut} onClick={() => { if (!unavailable) onClick() }}>{children}</button>
}

export function SwitchField({ label, checked, onChange, tip, unavailable }: Tip & { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="switch-row" data-tip={unavailable || tip}>
    <span>{label}</span>
    <input type="checkbox" role="switch" checked={checked} disabled={Boolean(unavailable)} onChange={event => onChange(event.currentTarget.checked)} />
  </label>
}

export type Option<T extends string> = { value: T; label: string; tip: string; unavailable?: string | false }

// columns: how many options to a row; a long list wraps onto more rows, each its own capsule.
export function Segmented<T extends string>({ label, options, value, onChange, unavailable, hideLabel, columns }: {
  label: string; options: Option<T>[]; value: T; onChange: (value: T) => void; unavailable?: string | false; hideLabel?: boolean; columns?: number
}) {
  const id = useId()
  return <div className="field">
    {!hideLabel && <span className="field-label" id={id}>{label}</span>}
    <div className={columns && columns < options.length ? 'button-row segmented rows' : 'button-row segmented'} role="group" aria-labelledby={hideLabel ? undefined : id} aria-label={hideLabel ? label : undefined}
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}>
      {options.map(option => {
        const off = unavailable || option.unavailable
        return <button key={option.value} type="button" aria-pressed={option.value === value}
          aria-disabled={off ? true : undefined} data-tip={off || option.tip}
          onClick={() => { if (!off) onChange(option.value) }}>{option.label}</button>
      })}
    </div>
  </div>
}

export function SliderField({ label, value, min, max, step = 1, onChange, format, tip, unavailable, log }: Tip & {
  label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void
  format?: (value: number) => string; log?: boolean
}) {
  // Log sliders give equal travel to 10→100 and 1,000→10,000, which suits counts.
  const toTrack = (v: number) => (log ? Math.log(v) : v)
  const fromTrack = (t: number) => (log ? Math.exp(t) : t)
  const snap = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step))
  const id = useId()
  return <label className="field" data-tip={unavailable || tip}>
    <span className="field-label"><span id={id}>{label}</span><b aria-hidden="true">{format ? format(value) : value}</b></span>
    <input type="range" min={toTrack(min)} max={toTrack(max)} step={log ? 'any' : step} value={toTrack(value)} disabled={Boolean(unavailable)} aria-labelledby={id}
      style={rangeFill(toTrack(value), toTrack(min), toTrack(max))} aria-valuetext={format ? format(value) : String(value)}
      onChange={event => onChange(snap(fromTrack(Number(event.currentTarget.value))))} />
  </label>
}

// A number box that lets people type freely: the text stays as typed and applies on Enter or when the box
// loses focus, clamped to its range then (the App Development Standard's rule from Growth Studio 0.8.2, where
// clamping or applying each keystroke turned 80 into 100 and 300 into 1,300). Arrow keys and the spin buttons
// apply at once.
// onStep: where a spin button's or an arrow key's change goes, when it shouldn't apply at once; onLeave: called as
// the box loses focus.
export function DraftNumber({ value, min, max, step = 1, digits = 0, onChange, onStep, onLeave, disabled, className = 'number-input', labelledBy, label }: {
  value: number; min: number; max: number; step?: number; digits?: number; onChange: (value: number) => void
  onStep?: (value: number) => void; onLeave?: () => void; disabled?: boolean; className?: string; labelledBy?: string; label?: string
}) {
  // What was typed, and the value it was typed against. It shows only while that is still the value, so a
  // change from elsewhere (an import, a linked field, Undo) replaces it instead of being overwritten on blur.
  const [draft, setDraft] = useState<{ text: string; at: number } | null>(null)
  const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b))
  const typing = draft !== null && same(draft.at, value)
  const shown = typing ? draft.text : trimZeros(value.toFixed(digits))
  const commit = () => {
    // Only text that was actually typed is applied, so tabbing through a field never rounds its value. It goes on
    // as typed: what it's for brings it within its limits and can say so, as a 4,200 mm sheet becomes 3,000 mm.
    if (typing) {
      const v = Number(draft.text)
      if (draft.text.trim() !== '' && Number.isFinite(v)) onChange(v)
    }
    setDraft(null)
  }
  // An unavailable box is read-only rather than disabled, so it can still take focus and a tap, and say why.
  return <input className={className} type="number" inputMode="decimal" min={min} max={max} step={step} value={shown}
    readOnly={disabled} aria-disabled={disabled || undefined} aria-labelledby={labelledBy} aria-label={label}
    onChange={event => {
      if (disabled) return
      const text = event.currentTarget.value
      // A spin button or an arrow key changes the value without typing: apply it straight away.
      const typed = Boolean((event.nativeEvent as InputEvent).inputType)
      const v = Number(text)
      if (!typed && text.trim() !== '' && Number.isFinite(v)) { setDraft(null); (onStep ?? onChange)(Math.min(max, Math.max(min, v))); return }
      setDraft({ text, at: value })
    }}
    onBlur={() => { if (!disabled) commit(); onLeave?.() }}
    onKeyDown={event => { if (event.key === 'Enter' && !disabled) commit() }} />
}

export function NumberField({ label, value, min, max, step = 1, digits = 0, suffix, onChange, tip, unavailable, compact }: Tip & {
  label: string; value: number; min: number; max: number; step?: number; digits?: number; suffix?: string
  onChange: (value: number) => void; compact?: boolean
}) {
  return <label className={compact ? 'field compact-field' : 'field'} data-tip={unavailable || tip}>
    <span className="field-label"><span>{label}</span></span>
    <span className="number-wrap">
      <DraftNumber value={value} min={min} max={max} step={step} digits={digits} onChange={onChange} disabled={Boolean(unavailable)} />
      {suffix && <span className="suffix" aria-hidden="true">{suffix}</span>}
    </span>
  </label>
}

export function ColorField({ label, value, onChange, tip, unavailable }: Tip & { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="color-row" data-tip={unavailable || tip}>
    <span>{label}</span>
    <span className="color-value"><code>{value.toUpperCase()}</code>
      <input type="color" value={value} disabled={Boolean(unavailable)} onChange={event => onChange(event.currentTarget.value)} />
    </span>
  </label>
}

// A section of a panel. A folded one starts closed, with what it holds in its heading, so a long panel fits.
export function Section({ title, children, tip, folded }: { title: string; children: ReactNode; tip?: string; folded?: string }) {
  if (folded) return <section>
    <details className="section-fold">
      <summary data-tip={tip}><span className="fold-title">{title}</span><span className="fold-what">{folded}</span></summary>
      {children}
    </details>
  </section>
  return <section>
    <h2 data-tip={tip}>{title}</h2>
    {children}
  </section>
}

// A slider with a number box beside it, as the Illustrator panel paired them. The box takes typed values
// in the display unit; `scale` converts stored values to it (for example millimetres to points).
// onRelease: the slider applies its value when let go, not at every step of a drag, for settings that are slow
// to apply, such as Count, which places every attractor again. The number shows the value as it moves.
// Keys that change a slider's value, rather than move focus or work a shortcut.
const VALUE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])
// How long keys rest before a value they stepped to applies.
const KEYS_REST_MS = 500
const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b))

// onRelease: the value being chosen, by dragging or by keys, is held and applied once, when the pointer lets go or
// the keys rest, so a slow change such as Count places the attractors once and makes one Undo step.
export function RangeField({ label, value, min, max, step, digits, scale = 1, suffix, onChange, tip, unavailable, log, onRelease }: Tip & {
  label: string; value: number; min: number; max: number; step: number; digits: number; scale?: number; suffix?: string
  onChange: (value: number) => void; log?: boolean; onRelease?: boolean
}) {
  const id = useId()
  const [moving, setMoving] = useState<number | null>(null)
  const held = useRef<number | null>(null)
  const timer = useRef(0)
  const latest = useRef({ value, onChange })
  useEffect(() => { latest.current = { value, onChange } })
  const drop = useCallback(() => { window.clearTimeout(timer.current); held.current = null; setMoving(null) }, [])
  const release = useCallback(() => {
    const v = held.current
    drop()
    if (v !== null && !same(v, latest.current.value)) latest.current.onChange(v)
  }, [drop])
  const hold = (v: number) => { held.current = v; setMoving(v) }
  const soon = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(release, KEYS_REST_MS) }
  // A value still held when the field goes, as when its panel closes, applies.
  useEffect(() => () => { if (held.current !== null) release() }, [release])
  const shown = moving ?? value
  const toTrack = (v: number) => (log ? Math.log(v) : v)
  const fromTrack = (t: number) => (log ? Math.exp(t) : t)
  const round = (v: number) => Math.min(max, Math.max(min, v))
  return <div className="field range-field" data-tip={unavailable || tip}>
    <span className="field-label"><span id={id}>{label}</span>
      <span className="number-wrap">
        <DraftNumber value={shown * scale} min={min * scale} max={max * scale} step={step * scale} digits={digits} labelledBy={id}
          disabled={Boolean(unavailable)} className="number-input inline-number" onChange={v => { drop(); onChange(round(v / scale)) }}
          onStep={onRelease ? v => { hold(round(v / scale)); soon() } : undefined} onLeave={onRelease ? release : undefined} />
        {suffix && <span className="suffix" aria-hidden="true">{suffix}</span>}
      </span>
    </span>
    <input type="range" min={toTrack(min)} max={toTrack(max)} step={log ? 'any' : step} value={toTrack(Math.min(max, Math.max(min, shown)))}
      disabled={Boolean(unavailable)} aria-labelledby={id} style={rangeFill(toTrack(Math.min(max, Math.max(min, shown))), toTrack(min), toTrack(max))}
      onChange={event => {
        const raw = fromTrack(Number(event.currentTarget.value))
        const snapped = round(log ? raw : Math.round(raw / step) * step)
        if (!onRelease) { onChange(snapped); return }
        // The browser's own change event, after the slider is let go, carries the applied value back a hair off
        // (792.0000000000036 for 792): that's no new choice, and holding it would apply it again on the next key.
        if (held.current === null && same(snapped, value)) return
        hold(snapped)
      }}
      onPointerUp={onRelease ? release : undefined} onPointerCancel={onRelease ? release : undefined} onBlur={onRelease ? release : undefined}
      // A shortcut such as Undo works on what the slider shows: what it holds applies first.
      onKeyDown={onRelease ? event => { if (!VALUE_KEYS.has(event.key)) release() } : undefined}
      onKeyUp={onRelease ? event => { if (VALUE_KEYS.has(event.key)) soon() } : undefined} />
  </div>
}
