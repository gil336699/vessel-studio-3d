// The export worker: builds the watertight tube skin off the page, as it can take many seconds for a big network.
import { tubeSkin, tubeVoxel } from '../lib/tubes'

export type SkinJob = { id: number; parts: { name: string; color: string; segs: Float64Array }[]; perTip: number }
export type SkinPart = { name: string; color: string; positions: Float32Array<ArrayBuffer>; indices: Uint32Array<ArrayBuffer>; problems: number }
export type SkinResult = { id: number; ok: true; parts: SkinPart[]; voxel: number; tipLimited: boolean; ms: number } | { id: number; ok: false; message: string }

const scope = self as unknown as { postMessage: (message: unknown, transfer: Transferable[]) => void; onmessage: ((event: MessageEvent<SkinJob>) => void) | null }
scope.onmessage = ({ data }) => {
  const t0 = performance.now()
  try {
    // One grid spacing for every part, fine enough for the thinnest tip of all of them.
    const all = new Float64Array(data.parts.reduce((n, p) => n + p.segs.length, 0))
    let o = 0
    for (const p of data.parts) { all.set(p.segs, o); o += p.segs.length }
    const { voxel, tipLimited } = tubeVoxel(all, data.perTip)
    const parts: SkinPart[] = data.parts.map(p => {
      const skin = tubeSkin(p.segs, { voxel })
      return { name: p.name, color: p.color, positions: skin.mesh.positions, indices: skin.mesh.indices, problems: skin.problems }
    })
    const result: SkinResult = { id: data.id, ok: true, parts, voxel, tipLimited, ms: performance.now() - t0 }
    scope.postMessage(result, parts.flatMap(p => [p.positions.buffer, p.indices.buffer]))
  } catch (error) {
    scope.postMessage({ id: data.id, ok: false, message: error instanceof Error ? error.message : String(error) } satisfies SkinResult, [])
  }
}
