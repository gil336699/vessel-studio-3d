// The 3D view: the model (as glass to see veins inside, or solid), the veins as shaded tubes, the attractors still in
// play and the roots. Z is up, as in CAD apps and slicers. One finger or the left button orbits, two fingers or the
// right button pan, and a click with the Roots tool places a root where it lands on the model.
import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { type ComponentRef, type MutableRefObject, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BackSide, BufferAttribute, BufferGeometry, Color, DirectionalLight, DoubleSide, FrontSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh,
  MeshStandardMaterial, NeutralToneMapping, PerspectiveCamera, TOUCH, Vector3, MOUSE,
} from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import type { MeshData, Vec3 } from '../lib/mesh'
import { meshBounds } from '../lib/mesh'
import type { Settings } from '../lib/settings'
import { LINK, type VeinView } from '../lib/view'
import type { Attractors } from '../veins/domain'
import { SHARED } from '../veins/engine'
import type { Net } from '../useVeins'

// Fast picking on big models.
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
Mesh.prototype.raycast = acceleratedRaycast

// Neutral tone mapping keeps colours true; the default, ACES, turns a white model grey (Growth Studio 0.6.1).
const RENDERER = { toneMapping: NeutralToneMapping, antialias: true, alpha: true }

// The lamp keeps its place beside the camera, a little right of and above it, so the side facing you is always lit
// (Growth Studio's CameraLamp).
function CameraLamp() {
  const lamp = useRef<DirectionalLight>(null)
  const offset = useMemo(() => new Vector3(), [])
  useFrame(({ camera }) => {
    if (!lamp.current) return
    offset.set(1, 0.7, 0.4).multiplyScalar(camera.position.distanceTo(lamp.current.target.position) * 0.4).applyQuaternion(camera.quaternion)
    lamp.current.position.copy(camera.position).add(offset)
  })
  return <directionalLight ref={lamp} intensity={2.3} />
}

// One tube template: a hemisphere at each end joined by a cone. Each vertex knows which end it belongs to (aSide) and
// where it sits on a unit sphere there (aLocal); the shader places and sizes it for each segment.
function tubeTemplate(around = 8, rings = 2): InstancedBufferGeometry {
  const local: number[] = [], side: number[] = [], index: number[] = []
  const rows: { lat: number; side: number }[] = []
  for (let r = 0; r <= rings; r++) rows.push({ lat: -Math.PI / 2 + (r / rings) * (Math.PI / 2), side: 0 })
  for (let r = 0; r <= rings; r++) rows.push({ lat: (r / rings) * (Math.PI / 2), side: 1 })
  const start: number[] = []
  rows.forEach(({ lat, side: s }) => {
    start.push(local.length / 3)
    const pole = Math.abs(Math.abs(lat) - Math.PI / 2) < 1e-9
    const count = pole ? 1 : around
    for (let i = 0; i < count; i++) {
      const a = (i / around) * Math.PI * 2
      local.push(Math.cos(lat) * Math.cos(a), Math.sin(lat), Math.cos(lat) * Math.sin(a))
      side.push(s)
    }
  })
  for (let r = 0; r + 1 < rows.length; r++) {
    const a0 = start[r], a1 = start[r + 1]
    const na = (r + 1 < rows.length ? (a1 - a0) : 0), nb = (r + 2 < rows.length ? start[r + 2] - a1 : local.length / 3 - a1)
    for (let i = 0; i < around; i++) {
      const j = (i + 1) % around
      // Wound so each triangle faces out, away from the segment's axis.
      if (na === 1) index.push(a0, a1 + i, a1 + j)
      else if (nb === 1) index.push(a0 + i, a1, a0 + j)
      else index.push(a0 + i, a1 + j, a0 + j, a0 + i, a1 + i, a1 + j)
    }
  }
  const g = new InstancedBufferGeometry()
  g.setAttribute('position', new BufferAttribute(Float32Array.from(local), 3))
  g.setAttribute('normal', new BufferAttribute(Float32Array.from(local), 3))
  g.setAttribute('aLocal', new BufferAttribute(Float32Array.from(local), 3))
  g.setAttribute('aSide', new BufferAttribute(Float32Array.from(side), 1))
  g.setIndex(index)
  return g
}

// A standard lit material that places each tube instance from its two ends and radii, and colours it. The template's
// x, y and z go to U, the axis W and V, with V = U × W so the frame stays right-handed: a mirrored frame turns every
// triangle inside out, and the tubes then show only their unlit insides.
function tubeMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ roughness: 0.55, metalness: 0 })
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aLocal; attribute float aSide; attribute vec3 aStart; attribute vec3 aEnd; attribute vec2 aRadius; attribute vec3 aColor;
varying vec3 vVein;`)
      .replace('#include <beginnormal_vertex>', `
vec3 tubeAxis = aEnd - aStart; float tubeLength = length(tubeAxis);
vec3 tubeW = tubeLength > 1e-6 ? tubeAxis / tubeLength : vec3(0.0, 0.0, 1.0);
vec3 tubeRef = abs(tubeW.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
vec3 tubeU = normalize(cross(tubeRef, tubeW)); vec3 tubeV = cross(tubeU, tubeW);
vec3 tubeDir = aLocal.x * tubeU + aLocal.y * tubeW + aLocal.z * tubeV;
vec3 objectNormal = normalize(tubeDir);
vVein = aColor;`)
      .replace('#include <begin_vertex>', `
vec3 transformed = (aSide < 0.5 ? aStart : aEnd) + (aSide < 0.5 ? aRadius.x : aRadius.y) * tubeDir;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vVein;`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vVein, opacity );')
  }
  return m
}

// How many tubes the geometry draws. three.js objects change in place; these keep that out of the component body.
function setInstanceCount(geometry: InstancedBufferGeometry, n: number) { geometry.instanceCount = n }

// Room for `size` tubes. The renderer caps how many instances it draws at the size of the buffers it last set up,
// and keeps that cap when buffers are swapped, so the old GPU copies are released and set up afresh: without that,
// only the first 1,024 tubes were drawn.
function growTubes(geometry: InstancedBufferGeometry, size: number) {
  geometry.setAttribute('aStart', new InstancedBufferAttribute(new Float32Array(size * 3), 3))
  geometry.setAttribute('aEnd', new InstancedBufferAttribute(new Float32Array(size * 3), 3))
  geometry.setAttribute('aRadius', new InstancedBufferAttribute(new Float32Array(size * 2), 2))
  geometry.setAttribute('aColor', new InstancedBufferAttribute(new Float32Array(size * 3), 3))
  geometry.dispose()
}

function VeinMesh({ view, colors }: { view: VeinView; colors: string[] }) {
  const geometry = useMemo(() => tubeTemplate(), [])
  const material = useMemo(() => tubeMaterial(), [])
  const capacityRef = useRef(0)
  const palette = useMemo(() => colors.map(c => new Color(c)), [colors])
  // Filled before the frame is drawn, so a frame never shows the tubes half updated (Growth Studio 0.5.2).
  useLayoutEffect(() => {
    const n = view.count
    if (n > capacityRef.current) {
      const size = Math.max(1024, n * 2)
      growTubes(geometry, size)
      capacityRef.current = size
    }
    const S = (geometry.getAttribute('aStart') as InstancedBufferAttribute).array as Float32Array
    const E = (geometry.getAttribute('aEnd') as InstancedBufferAttribute).array as Float32Array
    const R = (geometry.getAttribute('aRadius') as InstancedBufferAttribute).array as Float32Array
    const C = (geometry.getAttribute('aColor') as InstancedBufferAttribute).array as Float32Array
    const segs = view.segs
    for (let i = 0; i < n; i++) {
      const o = i * 8
      S[i * 3] = segs[o]; S[i * 3 + 1] = segs[o + 1]; S[i * 3 + 2] = segs[o + 2]
      E[i * 3] = segs[o + 3]; E[i * 3 + 1] = segs[o + 4]; E[i * 3 + 2] = segs[o + 5]
      R[i * 2] = segs[o + 6]; R[i * 2 + 1] = segs[o + 7]
      const sys = view.system[i], c = palette[sys === LINK ? 3 : Math.min(2, sys)]
      C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b
    }
    for (const name of ['aStart', 'aEnd', 'aRadius', 'aColor']) {
      const a = geometry.getAttribute(name) as InstancedBufferAttribute
      a.clearUpdateRanges()
      a.addUpdateRange(0, n * a.itemSize)
      a.needsUpdate = true
    }
    setInstanceCount(geometry, n)
    if (import.meta.env.DEV) (window as unknown as { vs3dTubes: unknown }).vs3dTubes = geometry
  }, [view, geometry, palette])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

// A click on the model: where it lands on the skin, the skin's outward normal there, the middle of the model along the
// line of sight (between where the ray enters and where it next leaves), and whether Shift was held.
export type Pick = { point: Vec3; normal: Vec3; middle: Vec3 | null; shift: boolean }

function ModelMesh({ mesh, look, color, picking, onPick }: { mesh: MeshData; look: Settings['modelLook']; color: string; picking: boolean; onPick: (pick: Pick) => void }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(mesh.positions, 3))
    g.setIndex(new BufferAttribute(mesh.indices, 1))
    g.computeVertexNormals()
    g.computeBoundsTree()
    return g
  }, [mesh])
  useEffect(() => () => { geometry.disposeBoundsTree(); geometry.dispose() }, [geometry])
  const down = useRef<{ x: number; y: number; t: number } | null>(null)
  const pick = {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => { if (picking && e.button === 0) down.current = { x: e.clientX, y: e.clientY, t: performance.now() } },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      const d = down.current
      down.current = null
      // A click, not the end of an orbit drag.
      if (!picking || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 600 || !e.face) return
      e.stopPropagation()
      const n = e.face.normal
      // Every crossing of the line of sight with the model, both sides, nearest first.
      const hits = (geometry.boundsTree?.raycast(e.ray, DoubleSide) ?? []).sort((a, b) => a.distance - b.distance)
      const entry = hits.findIndex(h => h.distance >= e.distance - 1e-6)
      const out = entry >= 0 ? hits.slice(entry + 1).find(h => h.distance > hits[entry].distance + 1e-4) : undefined
      const middle: Vec3 | null = out ? [(e.point.x + out.point.x) / 2, (e.point.y + out.point.y) / 2, (e.point.z + out.point.z) / 2] : null
      onPick({ point: [e.point.x, e.point.y, e.point.z], normal: [n.x, n.y, n.z], middle, shift: e.nativeEvent.shiftKey })
    },
  }
  if (look === 'solid') return <mesh geometry={geometry} {...pick}>
    <meshStandardMaterial key="solid" color={color} roughness={0.8} side={2} />
  </mesh>
  // Glass: the back faces faint, the front faces a little stronger, neither hiding the veins inside.
  return <group>
    <mesh geometry={geometry} renderOrder={1}><meshStandardMaterial key="back" color={color} transparent opacity={0.12} depthWrite={false} side={BackSide} roughness={0.3} /></mesh>
    <mesh geometry={geometry} renderOrder={2} {...pick}><meshStandardMaterial key="front" color={color} transparent opacity={0.2} depthWrite={false} side={FrontSide} roughness={0.25} /></mesh>
  </group>
}

function AttractorPoints({ attractors, used, colors, size }: { attractors: Attractors; used: Uint8Array; colors: string[]; size: number }) {
  const geometry = useMemo(() => new BufferGeometry(), [])
  const palette = useMemo(() => colors.map(c => new Color(c)), [colors])
  useLayoutEffect(() => {
    const k = attractors.p.length / 3
    const P: number[] = [], C: number[] = []
    for (let i = 0; i < k; i++) {
      if (used[i]) continue
      P.push(attractors.p[i * 3], attractors.p[i * 3 + 1], attractors.p[i * 3 + 2])
      const s = attractors.sys ? attractors.sys[i] : 0
      const c = s === SHARED ? new Color('#8a8f99') : palette[Math.min(2, s)]
      C.push(c.r, c.g, c.b)
    }
    geometry.setAttribute('position', new BufferAttribute(Float32Array.from(P), 3))
    geometry.setAttribute('color', new BufferAttribute(Float32Array.from(C), 3))
    geometry.computeBoundingSphere()
  }, [attractors, used, palette, geometry])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <points geometry={geometry}><pointsMaterial vertexColors size={size} sizeAttenuation={false} transparent opacity={0.75} depthWrite={false} /></points>
}

function RootMarkers({ net, colors, radius }: { net: Net; colors: string[]; radius: number }) {
  const spots = useMemo(() => {
    const out: { at: Vec3; color: string; entry: boolean }[] = []
    for (let v = 0; v < net.points; v++) {
      const p = net.parent[v]
      // A root: no parent, or grown straight from an entry point. Entry points get their own ring-like marker.
      if (net.fixed[v]) out.push({ at: [net.x[v], net.y[v], net.z[v]], color: colors[Math.min(2, net.sys[v])], entry: true })
      else if (p < 0 || net.fixed[p]) { if (p < 0) out.push({ at: [net.x[v], net.y[v], net.z[v]], color: colors[Math.min(2, net.sys[v])], entry: false }) }
    }
    return out
  }, [net, colors])
  return <group>{spots.map((s, i) => <mesh key={i} position={s.at} renderOrder={5}>
    <sphereGeometry args={[radius * (s.entry ? 1.25 : 1), 20, 12]} />
    <meshBasicMaterial color={s.color} transparent opacity={0.9} depthTest={false} />
  </mesh>)}</group>
}

// Lets the page take a picture of the view at any size, and fit the camera.
export type ViewHandle = {
  capture: (scale: number, transparent: boolean) => Promise<Blob | null>
  fit: () => void
  view: (dir: Vec3) => void
}

// The part of the view the floating panels and bars leave free, on wide screens where they float over it: its middle,
// as an offset from the canvas's middle, and its size, in CSS pixels.
function freeSpace(canvas: HTMLCanvasElement, width: number, height: number): { dx: number; dy: number; width: number; height: number } {
  const box = canvas.getBoundingClientRect()
  const whole = { dx: 0, dy: 0, width, height }
  const side = document.querySelector('.sidebar')?.getBoundingClientRect()
  const inspector = document.querySelector('.inspector')?.getBoundingClientRect()
  const bars = document.querySelector('.viewport-bar-row')?.getBoundingClientRect()
  const dock = document.querySelector('.timeline')?.getBoundingClientRect()
  if (!side || !inspector || !bars || !dock || box.width < 900 || side.right >= inspector.left) return whole
  const left = Math.max(0, side.right - box.left), right = Math.min(width, inspector.left - box.left)
  const top = Math.max(0, bars.bottom - box.top), bottom = Math.min(height, dock.top - box.top)
  if (right - left < 200 || bottom - top < 200) return whole
  return { dx: (left + right) / 2 - width / 2, dy: (top + bottom) / 2 - height / 2, width: right - left, height: bottom - top }
}

function Handle({ handleRef, box, controlsRef, fitKey }: { handleRef: MutableRefObject<ViewHandle | null>; box: { lo: Vec3; hi: Vec3 }; controlsRef: MutableRefObject<ComponentRef<typeof OrbitControls> | null>; fitKey: string }) {
  const { gl, scene, camera, size } = useThree()
  // The model's middle sits in the middle of the free space, not behind a panel.
  useEffect(() => {
    const cam = camera as PerspectiveCamera
    const { dx, dy } = freeSpace(gl.domElement, size.width, size.height)
    if (dx || dy) cam.setViewOffset(size.width, size.height, -dx, -dy, size.width, size.height)
    else cam.clearViewOffset()
  }, [camera, gl, size])
  useEffect(() => {
    const c = new Vector3((box.lo[0] + box.hi[0]) / 2, (box.lo[1] + box.hi[1]) / 2, (box.lo[2] + box.hi[2]) / 2)
    const radius = Math.hypot(box.hi[0] - box.lo[0], box.hi[1] - box.lo[1], box.hi[2] - box.lo[2]) / 2 || 50
    const place = (dir: Vec3) => {
      const cam = camera as PerspectiveCamera
      const free = freeSpace(gl.domElement, size.width, size.height)
      // The half-angles the free space spans, up and across; the model's bounding ball fits the narrower.
      const t = Math.tan((cam.fov * Math.PI) / 360) / Math.max(1, size.height)
      const half = Math.min(Math.atan(t * free.height), Math.atan(t * free.width))
      const fit = (radius / Math.sin(half)) * 0.92
      const d = new Vector3(...dir).normalize()
      cam.position.copy(c).addScaledVector(d, fit)
      cam.near = Math.max(0.01, fit / 200); cam.far = fit * 20
      cam.up.set(0, 0, 1)
      cam.lookAt(c)
      cam.updateProjectionMatrix()
      controlsRef.current?.target.copy(c)
      controlsRef.current?.update()
    }
    if (import.meta.env.DEV) (window as unknown as { vs3dCamera: unknown }).vs3dCamera = { camera, size, freeSpace: () => freeSpace(gl.domElement, size.width, size.height) }
    handleRef.current = {
      fit: () => place([0.9, -1.5, 0.75]),
      view: place,
      capture: (scale, transparent) => new Promise(resolve => {
        const cam = camera as PerspectiveCamera
        const ratio = gl.getPixelRatio()
        const clear = gl.getClearAlpha()
        const offset = cam.view ? { ...cam.view } : null
        // The picture is the whole view, centred on the model, without the shift for the panels.
        cam.clearViewOffset()
        gl.setPixelRatio(ratio * scale)
        gl.setSize(size.width, size.height, false)
        if (!transparent) gl.setClearColor(0xffffff, 1)
        gl.render(scene, camera)
        // Read straight after drawing, before the browser clears the buffer.
        gl.domElement.toBlob(blob => {
          gl.setPixelRatio(ratio)
          gl.setSize(size.width, size.height, false)
          gl.setClearColor(0x000000, clear)
          if (offset?.enabled) cam.setViewOffset(offset.fullWidth, offset.fullHeight, offset.offsetX, offset.offsetY, offset.width, offset.height)
          resolve(blob)
        }, 'image/png')
      }),
    }
    return () => { handleRef.current = null }
  }, [gl, scene, camera, size, box, handleRef, controlsRef])
  // A new model is framed whole. This runs inside the canvas, once its camera and controls exist.
  const framed = useRef('')
  useEffect(() => {
    if (framed.current === fitKey || !handleRef.current) return
    framed.current = fitKey
    handleRef.current.fit()
  })
  return null
}

export function Viewport({ mesh, settings, view, net, attractors, picking, onPick, handleRef, fitKey }: {
  mesh: MeshData; settings: Settings; view: VeinView; net: Net; attractors: Attractors | null
  picking: boolean; onPick: (pick: Pick) => void; handleRef: MutableRefObject<ViewHandle | null>; fitKey: string
}) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null)
  const box = useMemo(() => meshBounds(mesh.positions), [mesh])
  const colors = useMemo(() => [settings.colorA, settings.colorB, settings.colorC, settings.linkColor], [settings.colorA, settings.colorB, settings.colorC, settings.linkColor])
  const size = Math.max(box.hi[0] - box.lo[0], box.hi[1] - box.lo[1], box.hi[2] - box.lo[2])
  return <div className="stage-canvas" style={{ cursor: picking ? 'crosshair' : 'grab' }}>
    <Canvas camera={{ position: [90, -150, 75], up: [0, 0, 1], fov: 35, near: 0.5, far: 5000 }} gl={RENDERER} dpr={[1, 2]} role="img"
      aria-label="3D view of the model and its veins. Drag to orbit, scroll to zoom, right-drag to pan.">
      <ambientLight intensity={0.85} /><CameraLamp />
      {settings.showVeins && view.count > 0 && <VeinMesh view={view} colors={colors} />}
      {settings.showAttractors && attractors && <AttractorPoints attractors={attractors} used={net.used} colors={colors} size={3} />}
      {settings.showRoots && <RootMarkers net={net} colors={colors} radius={Math.max(settings.maxWidth * 0.45, size * 0.008)} />}
      {settings.showModel && <ModelMesh mesh={mesh} look={settings.modelLook} color={settings.modelColor} picking={picking} onPick={onPick} />}
      {!settings.showModel && picking && <ModelMesh mesh={mesh} look="glass" color={settings.modelColor} picking={picking} onPick={onPick} />}
      <Handle handleRef={handleRef} box={box} controlsRef={controlsRef} fitKey={fitKey} />
      <OrbitControls ref={controlsRef} makeDefault enableDamping={false}
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }} mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }} />
    </Canvas>
  </div>
}
