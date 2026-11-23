import { touchFirst } from '../lib/touch'
import { Modal } from './Modal'

// The quick start card, the ? dialog with every shortcut, and the dialog that asks before discarding work.

export function QuickStart({ onClose }: { onClose: () => void }) {
  const touch = touchFirst()
  return <section className="quick-start glass" aria-labelledby="quick-start-title">
    <h2 id="quick-start-title">Quick start</h2>
    <ol>
      <li><b>Grow:</b> {touch ? 'tap Grow' : <>press <kbd>Space</kbd></>} and watch vessels grow from the root through the model, toward attractors scattered inside it.</li>
      <li><b>Model:</b> pick a shape or open your own STL, choose Inside or On the surface, and {touch ? 'tap' : 'click'} the model with the Roots tool to add roots.</li>
      <li><b>Export:</b> save a watertight STL or 3MF of the tubes to print, OBJ centre lines for Blender or Rhino, or a picture.</li>
    </ol>
    <p>{touch ? 'Tap a greyed-out control to see why it can’t be used yet.' : 'Hover over any control to see what it does.'}</p>
    <button type="button" className="primary" data-tip="Hide this guide, which the ? button opens again." onClick={onClose}>Got it</button>
  </section>
}

const SHORTCUTS: [string, string][] = [
  ['Space', 'Grow or pause'],
  ['S', 'Grow one step'],
  ['R', 'Reset to the roots'],
  ['O', 'Roots tool: click the model to add a root'],
  ['A  B  C', 'Which system the next root starts'],
  ['Drag', 'Orbit; right-drag or two fingers pan'],
  ['Scroll, pinch', 'Zoom'],
  ['F', 'Fit the model in the view'],
  ['1  2  3  4', 'Show veins, attractors, model, roots'],
  ['⌘Z  ⇧⌘Z', 'Undo, redo'],
  ['⌘S  ⌘O', 'Save, open project'],
  ['Esc', 'Close, or leave the Roots tool'],
  ['?', 'This list'],
]

export function HelpDialog({ onClose, onQuickStart }: { onClose: () => void; onQuickStart: () => void }) {
  return <Modal labelledBy="help-title" onClose={onClose}>
    <h2 id="help-title">Keyboard shortcuts</h2>
    <dl>{SHORTCUTS.map(([keys, action]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>)}</dl>
    <p className="hint">On touch screens, one finger orbits and two fingers pan and zoom; with the Roots tool, a tap adds a root. On Windows, use Ctrl for ⌘.</p>
    <p className="hint">Vessel Studio 3D grows vessels by space colonization (Runions, Lane and Prusinkiewicz 2007): attractors fill the model, each pulls on its nearest vein, and veins grow toward them until every one is reached. Two systems can grow together and join (Kinstlinger et al. 2020) or stay apart.</p>
    <div className="confirm-actions">
      <button type="button" data-tip="Show the three-step guide again." onClick={onQuickStart}>Show quick start</button>
      <button type="button" className="primary" data-autofocus onClick={onClose}>Close</button>
    </div>
  </Modal>
}

export type Pending = { title: string; body: string; confirm: string; run: () => void }

export function ConfirmDialog({ pending, onCancel }: { pending: Pending; onCancel: () => void }) {
  return <Modal role="alertdialog" labelledBy="confirm-title" describedBy="confirm-body" onClose={onCancel}>
    <h2 id="confirm-title">{pending.title}</h2>
    <p id="confirm-body" className="hint">{pending.body}</p>
    <div className="confirm-actions">
      <button type="button" data-autofocus data-tip="Keep the current design." onClick={onCancel}>Cancel</button>
      <button type="button" className="primary" data-tip="Continue. Undo can bring the current design back during this session." onClick={() => { onCancel(); pending.run() }}>{pending.confirm}</button>
    </div>
  </Modal>
}
