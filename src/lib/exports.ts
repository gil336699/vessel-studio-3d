// Export formats: the tube skin as binary STL or 3MF (one coloured object per system, for multi-colour printers), and
// the centre lines as OBJ, with each vein's width in its group's name, for Blender, Rhino and Houdini.
import type { MeshData } from './mesh'
import { writeStl } from './stl'
import { zip } from './zip'
import { LINK, type VeinNet, type VeinView } from './view'

export const stlFile = (parts: MeshData[], name: string) => {
  // All parts in one file: their triangles side by side.
  const count = parts.reduce((n, p) => n + p.positions.length, 0)
  const positions = new Float32Array(count)
  const indices = new Uint32Array(parts.reduce((n, p) => n + p.indices.length, 0))
  let pv = 0, pi = 0
  for (const p of parts) {
    positions.set(p.positions, pv)
    for (let i = 0; i < p.indices.length; i++) indices[pi + i] = p.indices[i] + pv / 3
    pv += p.positions.length; pi += p.indices.length
  }
  return writeStl({ positions, indices }, name)
}

// 3MF: millimetres, one object per part with its own colour, all in one build.
export async function threeMf(parts: (MeshData & { name: string; color: string })[], title: string): Promise<Blob> {
  const xml: string[] = []
  xml.push('<?xml version="1.0" encoding="UTF-8"?>')
  xml.push('<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">')
  xml.push(`<metadata name="Title">${title.replace(/[<&>"]/g, '')}</metadata><metadata name="Application">Vessel Studio 3D</metadata>`)
  xml.push('<resources><basematerials id="1">')
  for (const p of parts) xml.push(`<base name="${p.name.replace(/[<&>"]/g, '')}" displaycolor="${p.color.toUpperCase()}FF"/>`)
  xml.push('</basematerials>')
  parts.forEach((p, k) => {
    xml.push(`<object id="${k + 2}" type="model" name="${p.name.replace(/[<&>"]/g, '')}" pid="1" pindex="${k}"><mesh><vertices>`)
    const P = p.positions
    const rows: string[] = []
    for (let i = 0; i < P.length; i += 3) rows.push(`<vertex x="${P[i].toFixed(4)}" y="${P[i + 1].toFixed(4)}" z="${P[i + 2].toFixed(4)}"/>`)
    xml.push(rows.join(''), '</vertices><triangles>')
    const I = p.indices, tris: string[] = []
    for (let i = 0; i < I.length; i += 3) tris.push(`<triangle v1="${I[i]}" v2="${I[i + 1]}" v3="${I[i + 2]}"/>`)
    xml.push(tris.join(''), '</triangles></mesh></object>')
  })
  xml.push('</resources><build>')
  parts.forEach((_, k) => xml.push(`<item objectid="${k + 2}"/>`))
  xml.push('</build></model>')
  const enc = new TextEncoder()
  return zip([
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>') },
    { name: '3D/3dmodel.model', data: enc.encode(xml.join('')) },
  ])
}

// OBJ centre lines: every vein point once, and each segment as a line in a group named for its system and width, such
// as "A_w1.20mm", so the widths survive the import. Z is up, in millimetres.
export function centreLines(net: VeinNet, view: VeinView, names: string[]): string {
  const lines = ['# Vessel Studio 3D centre lines, millimetres, Z up', '# Each group holds the segments of one system at one width (w = diameter).']
  for (let v = 0; v < net.points; v++) lines.push(`v ${net.x[v].toFixed(4)} ${net.y[v].toFixed(4)} ${net.z[v].toFixed(4)}`)
  const groups = new Map<string, string[]>()
  const add = (a: number, b: number, sys: number, width: number) => {
    const name = `${sys === LINK ? 'joins' : names[Math.min(2, sys)]}_w${width.toFixed(2)}mm`
    const list = groups.get(name)
    const line = `l ${a + 1} ${b + 1}`
    if (list) list.push(line); else groups.set(name, [line])
  }
  for (let v = 0; v < net.points; v++) if (net.parent[v] >= 0 && (!view.keep || view.keep[v])) add(net.parent[v], v, net.sys[v], view.widths[v])
  for (let i = 0; i + 1 < net.joins.length; i += 2) add(net.joins[i], net.joins[i + 1], net.sys[net.joins[i]], Math.min(view.widths[net.joins[i]], view.widths[net.joins[i + 1]]))
  for (let i = 0; i + 1 < net.links.length; i += 2) add(net.links[i], net.links[i + 1], LINK, Math.min(view.widths[net.links[i]], view.widths[net.links[i + 1]]))
  for (const [name, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) lines.push(`g ${name}`, ...list)
  return `${lines.join('\n')}\n`
}
