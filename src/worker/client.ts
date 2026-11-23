// The page's side of the growth worker. Every message is fire-and-forget; frames, roots and stops come back through
// the callback.
import type { GrowthParams } from '../veins/engine'
import type { FromRunner, Load, RootRequest, ToRunner } from './runner'

export class GrowthClient {
  private worker: Worker
  private runs = 0
  // The model the worker has, so it's sent only once.
  private meshKey = ''

  constructor(onMessage: (message: FromRunner) => void) {
    this.worker = new Worker(new URL('./veins.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (event: MessageEvent<FromRunner>) => onMessage(event.data)
    this.worker.onerror = event => onMessage({ kind: 'error', message: event.message || 'The growth worker stopped.' })
  }

  private send(message: ToRunner, transfer: Transferable[] = []) { this.worker.postMessage(message, transfer) }

  load(load: Omit<Load, 'mesh'> & { mesh: Load['mesh'] }) {
    const mesh = load.meshKey === this.meshKey ? null : load.mesh
    this.meshKey = load.meshKey
    this.send({ kind: 'load', load: { ...load, mesh } })
  }
  params(params: GrowthParams) { this.send({ kind: 'params', params }) }
  roots(gen: number, requests: RootRequest[]) { this.send({ kind: 'root', gen, requests }) }
  play(steps: number | null, perBatch: number): number { this.send({ kind: 'play', run: ++this.runs, steps, perBatch }); return this.runs }
  speed(perBatch: number) { this.send({ kind: 'speed', perBatch }) }
  stop() { this.send({ kind: 'stop' }) }
  ack() { this.send({ kind: 'ack' }) }
  dispose() { this.worker.terminate() }
}
