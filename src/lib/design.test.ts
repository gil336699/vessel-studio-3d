import { describe, expect, it } from 'vitest'
import { attractorsFor, builtInModel, regrown, scaleMesh, modelDoc, type Design } from './design'
import { DEFAULTS, scatterKey } from './settings'

// A kidney design whose attractors were placed for its settings, as the worker sends them back.
function kidney(): Design {
  const settings = { ...DEFAULTS, model: 'bean' as const }
  return {
    settings, model: builtInModel('bean'), roots: [],
    attractors: { p: Float64Array.from([1, 2, 3, 4, 5, 6]), n: null, sys: Uint8Array.from([0, 0]) },
    placedFor: scatterKey(settings), growth: null,
  }
}

describe('growing again', () => {
  it('places attractors again for a new model, even with the same attractor settings', () => {
    // Found by the demo recording: Surface vessels on the heart, then a woven vase opened with the same settings, grew
    // 19,071 vein points toward the heart's attractors and reached 373 of 3,000.
    const d = kidney()
    expect(attractorsFor(d)).toBe(d.attractors)
    const next = regrown(d, { ...d.settings, model: 'sphere' }, builtInModel('sphere'))
    expect(attractorsFor(next)).toBeNull()
    // The same model at a new size is somewhere else too.
    const bigger = regrown(d, d.settings, modelDoc(d.model.source, scaleMesh(d.model.mesh, 200)))
    expect(attractorsFor(bigger)).toBeNull()
  })

  it('keeps the attractors when only growth settings change on the same model', () => {
    const d = kidney()
    const next = regrown(d, { ...d.settings, segment: 2 }, d.model)
    expect(attractorsFor(next)).toBe(d.attractors)
    expect(next.growth).toBeNull()
  })
})
