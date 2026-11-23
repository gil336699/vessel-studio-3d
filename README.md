# Vessel Studio 3D

Vessel Studio 3D is a browser app that grows blood vessels, roots, coral and trees in 3D by space colonization (Runions, Lane and Prusinkiewicz 2007).

- Attractors are scattered through a model or over its surface. Each one pulls on its nearest vein, and veins grow toward them a step at a time until every attractor is reached.
- **Inside**, veins fill a closed model, like vessels in an organ or a tree in its crown. **On the surface**, they grow across the skin and stay on it, like vessels over a heart or roots round a pot.
- Grow one system, or two or three together. Two can **join**: an inlet tree and an outlet tree grow toward each other and meet, so the network runs from inlet to outlet (mutual tree attraction, Kinstlinger et al. 2020). Two or three can **interweave**: they fill the same space and never touch.
- Veins thicken toward their roots by Murray's law.
- Use one of seven built-in models, or open your own STL.
- Export the veins as watertight tubes to print (STL, or 3MF with a coloured part for each system), as centre lines with their widths for Blender, Rhino and Houdini (OBJ), or as a picture (PNG).

It is the 3D companion of [Vessel Studio](https://github.com/gil336699/vessel-studio), which grows veins inside 2D shapes.

**Use it online:** https://gil336699.github.io/vessel-studio-3d/

![Vessel Studio 3D in use: vessels grow through a see-through kidney from the dent where they enter; the Surface vessels preset grows vessels over a heart; Two interwoven grows a red and a purple system through the same lens without touching; and the veins are exported as a watertight STL to print.](docs/demo.gif)

[Watch the demo as a video](https://github.com/gil336699/vessel-studio-3d/releases/download/v1.0.0/vessel-studio-3d-demo.mp4) (MP4, 1920 × 1080).

![The eight presets, grown in the app: Organ vessels fill a kidney from its dent; Tree climbs a trunk into its crown; Coral wanders through a ball; Surface vessels run over a heart; Lattice joins into a net over a vase; Roots round a pot grow down from the rim; Inlet to outlet joins a red and a purple tree inside a lens, with the joins in yellow; Two interwoven fills the same lens with two systems that never touch.](docs/presets.png)

## Run

```bash
npm ci
npm run dev
```

Open the address it prints, usually http://localhost:5173/. Use Node 22 or newer.

## Publish

GitHub Actions builds the app and publishes it to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`). Pages was turned on once with `gh api -X POST repos/gil336699/vessel-studio-3d/pages -f build_type=workflow`. The build uses relative paths (`base: './'`), so it also works from any other folder or host.

## Layout

- **The model** fills the window, and everything else floats over it on glass. Drag to orbit, right-drag to pan, and scroll to zoom.
- **Left:** tabs.
  - **Model:** Inside or On the surface, the model and its size, the attractors and the roots.
  - **Grow:** presets, systems and growth.
  - **Look:** widths, colours and how the model is drawn.
  - **Export:** STL and 3MF to print, OBJ centre lines, pictures and projects.
- **Top:** the Roots tool, with a button for each system when there are two or three. Then switches for what's shown (Veins, Attractors, Model, Roots), Fit, and the Front, Side and Top views.
- **Bottom:** the dock, with Grow or Pause, Step, Reset, the status, and Undo and Redo.
- **Right:** measurements: the model's size and volume or area, vein points, forks, ends or joins, loops or dead ends, the closest gap between systems, roots, attractors left, total length, the widest vein, steps and speed.
- On a tablet the panels sit side by side below the model. On a phone everything is in one column, with the model first.

## Help in the app

- Hover over any control, or focus it with the keyboard, to see what it does, with its shortcut. Each measurement explains itself the same way.
- A control that can't be used says why. Grow with no root says "No roots yet: click the model with the Roots tool (O) to add one", and Pull toward says to set Pull above 0 first.
- A three-step quick start shows on the first visit. The **?** button lists every shortcut and brings the quick start back.
- When growth stops, the status says why and what to try. A few attractors left is normal ("all but 10 of 3,000 attractors are reached; no vein has a clear path to the rest"). When most are left, it says the model may be too thin or the roots boxed in, and what to change.
- Opening a project over grown veins that aren't saved asks first, in the app's own dialog. Closing or reloading the page asks too, in the browser's. A dot by the title shows unsaved changes. Undo brings the veins back after Reset.
- Tips too thin to print are flagged on the Look and Export tabs. Under 0.8 mm suits only resin printers, and under 0.3 mm is too thin for most printers.
- Opening an STL reports its triangles, its size and whether it is closed or open. An open model grown Inside has its openings capped flat, and the status says so. A model under 20 mm or over 1 m asks you to check its size, as STL files carry no units.

## Workflow

1. **Choose where veins grow** on the Model tab: Inside or On the surface. Pick a built-in model, or open your own STL.
2. **Pick a preset** on the Grow tab. Each sets the growth and a look, with its lengths fitted to the model's size from a 100 mm reference. A preset brings its own model, unless your STL is open. On your STL, the roots go where it suits best: the deepest point inside, the point farthest from an open rim, or the top of a closed model. Lattice and Roots round a pot put six roots along the rim, or round the top of a closed model.
3. **Place roots** if you like: press O for the Roots tool and click the model. Inside, a root enters where you click, as an artery enters an organ. Choose **In the middle** (or Shift-click) to start it deep inside instead. With two or three systems, pick A, B or C first.
4. **Grow:** press Space, or Grow. Growth settings change live while veins grow. Settings that place the attractors again start the veins over: the attractor settings, Where veins grow, and the systems.
5. **Look:** Murray's law or even widths, the tip and widest widths in mm, and colours.
6. **Export** on the Export tab, or save a project to carry on later exactly where it stopped.

### Printing

- **STL** holds the tubes as one watertight solid, in millimetres.
- **3MF** holds the same tubes with their colours. Interwoven systems are each their own part, for multi-colour printers.
- **On the surface**, choose **Veins alone** for a lattice, such as a lamp shade or a vase of veins, or **With the model** for the model with raised veins. With the model, the two are parts of one object, and the slicer joins them as it slices. An open sheet has no thickness, so it prints veins alone.
- **Detail** sets how fine the tube surface is: Draft, Normal or Fine. The Export tab estimates the triangles and the file size before you export.
- **Tip width:** about 0.8 mm for a filament printer with a 0.4 mm nozzle, about 0.3 mm for resin.
- **Edge clearance** keeps vein centre lines that far from the wall. To keep whole tubes inside the skin, make it more than half the widest vein near the wall.
- **Interwoven systems** keep at least the Gap between their tube surfaces in every export: tubes narrow where they pass closer.

### Your own models

- STL, binary or text, read as millimetres, up to 1,500,000 triangles.
- **Inside** needs a closed model, or one with a few openings, which are capped flat. Veins fill only what is at least the edge clearance from the wall, so thin walls leave little room.
- **On the surface** works on any model: closed, or an open sheet with rims. Veins keep the edge clearance from the rims.
- **Longest side** on the Model tab scales the model. Choose a preset again afterwards to fit the lengths to the new size.

## Feature reference

### Where veins grow

| Choice | What it does |
| --- | --- |
| Inside | Veins grow through the inside of a closed model and fill its volume. The model is drawn as glass, so you can watch them grow. |
| On the surface | Veins grow across the model's skin and stay on it, turning over its edges. The model is drawn solid. |

### Models

| Model | What it is | Roots it starts with |
| --- | --- | --- |
| Sphere | A ball 100 mm across | One at the bottom |
| Kidney | A kidney-like bean 115 mm long, with a dent where vessels enter | One at the dent |
| Lens | A lens 100 mm long | One at each end, one for each system |
| Heart | A simple heart 100 mm tall | One at the top |
| Tree | A crown on a trunk, 140 mm tall | One at the foot of the trunk |
| Vase | An open vase 150 mm tall, a single sheet | Inside, one at the bottom. On the surface, six along the rim |
| Pot | An open plant pot 110 mm tall | As the vase |
| Your STL | Any STL, read as millimetres | Inside, the deepest point. On the surface, the point farthest from the rims along the skin, or the top of a closed model |

### Attractors

| Choice | What it does |
| --- | --- |
| Count | 100–60,000. More makes finer, denser veins. Interwoven systems get this many each. |
| Even | Evenly spread, with no clumps: Mitchell's best candidate with 12 tries a point. On the surface, spread by area. |
| Random | Scattered at random, so veins are denser in places. |
| Near the wall | Inside only. More toward the wall, so veins branch out under the skin, as a tree does near its crown's edge. |
| Shell | Inside only. Only in a layer under the wall, Shell depth deep (0.5–50 mm), for vessels just under the skin. |
| Edge clearance | 0–20 mm, at most an eighth of the model's size. How far veins, attractors and roots stay from the wall (inside) or from open rims (surface). |
| Pattern | The pattern number. The same number always places the same attractors, and the dice picks a new one. |

### Roots

| Root | What it does |
| --- | --- |
| A click with the Roots tool (O) | Inside, **On the skin**: the vessel enters where you click and grows in, as an artery enters an organ. **In the middle**: the root starts halfway through the model under the click. Shift-click gives the other one. On the surface, a root where you click. |
| Model's spots | The model's own spots again, one for each system. |
| Along the rim, Round the top | On the surface: six roots spread along an open model's rim, or round a closed model's top lip, for roots round a pot. |
| Clear roots | Removes every root, so you can place your own. |

### Systems

| Choice | What it does |
| --- | --- |
| One | One system of veins. |
| Two, Join | An inlet tree and an outlet tree share the attractors, and each attractor pulls the nearer tree. Each tree's free tips also pull the other tree (Tip pull, 0–1), and tips that come within the kill distance join. When growth ends, near misses within two kill distances join too. **Trim dead ends** leaves out vein ends that never met the other tree, so every vein shown and exported runs from inlet to outlet. Loops are off, as Join closes the network itself. |
| Two or Three, Interweave | Each system has its own attractors through the whole space. A step that would bring one system's tube nearer another's than the **Gap** (0–10 mm) is turned aside or refused, and **Repel** (0–1) steers veins away as they grow. When growth pauses, tubes narrow where two systems pass closer than the Gap, so the gap holds in every export. Measurements shows the closest gap. |

### Exports

| Export | Contents | Units |
| --- | --- | --- |
| STL | Binary STL of the tubes: each segment a round cone with its Murray widths, all joined into one watertight solid. With the model (on the surface), the model's triangles too. | mm |
| 3MF | The same tubes with their colours: one part, or one for each interwoven system. With the model, the model is a second part of the same object. | mm |
| OBJ centre lines | Every vein point, and each segment as a line, in groups named for the system and width, such as `A_w1.20mm` (w is the diameter) and `joins_w0.80mm`. Z is up. | mm |
| PNG | The view as shown, at 1×, 2× or 4× the screen's size, with or without the background. | px |
| Project | The settings, the model (a built-in one by name, your STL in full), the roots, the attractors and every vein point at full precision, with the random generator's state, as `.vessel3d.json` (schema `vessel-studio-3d`, version 1). Growth carries on exactly where it stopped. | mm |

STL, 3MF and OBJ hold the veins, so they need Veins shown; the button says so when they're hidden.

## Controls

| Control | Effect |
| --- | --- |
| Longest side | 10–2,000 mm, on the Model tab. Scales the model. |
| Segment length | 0.1–20 mm. How far a vein grows each step. Shorter makes smoother, finer veins. |
| Kill distance | 0.1–30 mm. An attractor this close to a vein that can see it is reached. Larger leaves more space between veins. |
| Attraction distance | 0–200 mm. How far a vein senses attractors; 0 means no limit. A limit makes veins grow out from the roots in waves. |
| Loops | Veins that reach the same attractor from two sides join there, closing loops into a net. Each attractor pulls every vein point of its relative neighbourhood (Runions et al. 2005). Veins less than 8 segments apart along the tree don't join. |
| Keep heading | 0–0.95. How much of its last direction a vein keeps. More makes long, smooth vessels. |
| Wiggle | 0–1.5. A seeded wobble on each step. |
| Pull, Pull toward | 0–1: a steady pull on every step, Up, Down, Out from the root, or In toward the model's middle. Up is +Z, as in CAD apps and slicers. |
| Keep veins apart | Refuses a new point within 0.45 segments of another vein of its own system. |
| Speed | 1–40 steps per frame. It changes how fast you see growth, not the result. |
| Width rule | Murray's law, from the tip width at every end, or Even. |
| Tip width, Widest | 0.05–10 mm and 0.05–30 mm: the finest veins, and a cap on the widest. |
| Murray exponent | 1.5–4. 3 is blood vessels' value; lower thickens veins faster toward the roots. |
| Colours | System A, B and C (or Veins), Joins and Model, for the view, the picture and the 3MF. |
| Model looks | Glass, see-through to watch veins grow inside, or Solid. |
| Detail | Draft, Normal or Fine: 1.1, 1.6 or 2.4 grid points across the finest tip's radius. |

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| Space | Grow or pause |
| S | Grow one step |
| R | Reset to the roots |
| O | Roots tool: click the model to add a root |
| Shift-click | With the Roots tool, Inside: start the root in the other place (on the skin or in the middle) |
| A, B, C | Which system the next root starts, with two or three systems |
| Drag, right-drag | Orbit, pan |
| Scroll, pinch | Zoom |
| F | Fit the model in the view |
| 1, 2, 3, 4 | Show veins, attractors, model, roots |
| ⌘Z, ⇧⌘Z | Undo, redo |
| ⌘S, ⌘O | Save, open project |
| Esc | Close a dialog, or leave the Roots tool |
| ? | Shortcuts and quick start |

On Windows, use Ctrl for ⌘. On a touch screen, one finger orbits and two fingers pan and zoom. With the Roots tool, a tap adds a root.

## How it works

Each step does three things.

1. **Pair.** Every live attractor finds its nearest vein point in the system it feeds. If that point is closer than the kill distance and can see it, the attractor is used up. Otherwise the attractor pulls it, if the point is within the attraction distance and can see it. With Loops on, it pulls every vein point of its relative neighbourhood instead.
   - **Inside**, a point sees an attractor when the straight line between them stays inside the model, clear of the wall by the edge clearance.
   - **On the surface**, a point sees an attractor when their surface normals are less than 120° apart, so veins never pair across a thin wall or a narrow gap.
2. **Grow.** Every pulled point grows one new point a segment length away, toward the average direction of its attractors, blended with Keep heading, Wiggle and Pull.
   - **Inside**, a step that would leave the model, or come nearer the wall than the edge clearance anywhere along it, is refused.
   - **On the surface**, a step is laid along the skin. It lands on the nearest point of the surface, and at an edge it turns over the edge as the surface does, up to four times a step. A step that would jump to another sheet, or come nearer an open rim than the edge clearance, is refused.
   - With Loops off, a refused step uses up the attractors it would have reached, since a vein or the wall already fills that space.
3. **Add.** The step's new points go in together, so the result never depends on the order points are visited.

**The model.** To grow inside, the model is sampled on a grid of about 200 points along its longest side, as a signed distance to its skin, using Growth Studio's voxel tools. A flood fill from the grid's edge finds the outside. An open model has its openings capped flat first, and sealed hollows are found by a vote of three rays. To grow on the surface, a bounding volume hierarchy (three-mesh-bvh) finds the nearest point of the skin. Normals are blended across each corner, but kept sharp where faces meet at more than 60°.

**Two systems.** Join and Interweave are described under [Systems](#systems). Join follows the mutual tree attraction that Kinstlinger et al. (2020) designed with Nervous System. Interweave keeps two tubes apart by the sum of their radii plus the gap, as Hohl et al. (2025) do for supplying and draining trees.

**Widths.** By Murray's law, a vein is the tip width times the number of vein ends it feeds to the power 1/exponent, capped at Widest. A join between the two trees is as wide as its narrower end.

**Tubes to print.** Each segment is a round cone: a ball at each end, at that end's width, joined by the cone that touches both. The tubes' exact distance is sampled on a grid in small bricks near the tubes only. Their surface is drawn with surface nets and smoothed. Pinched corners are opened and sealed bubbles filled first. Then it is checked: every edge must be shared by exactly two triangles, once each way, so the solid is watertight. The grid is as fine as the tip width and Detail ask, up to 24 million grid points. Past that it gets coarser, and the status says the finest tips came out rounder.

These rules make it fast and repeatable:

- **A cached nearest point.** Each attractor's nearest vein point is cached and updated with only each step's new points, through a small k-d tree. That is exact, because vein points never move, and ties go to the older point, as a full search would. Whether a point sees an attractor is cached for its nearest point.
- **The same result every time.** Everything is seeded, and the project file holds the whole state, the random generator's included. A test checks that a run saved half way and carried on ends bit for bit like one grown straight through. In the app, a kidney saved at step 25, reloaded and grown on ended with the same 7,046 vein points as one grown straight through.
- **Workers.** Growth runs off the page and sends one frame at a time, after the page has drawn the last one. Frames carry only new points. A second worker builds the tubes for export. The view draws all the tubes as copies of one shape.

**An honest note on its limits:**

- It is a picture-making model, not a physiological one. Veins grow toward free space, not toward tissue that needs blood, and widths follow Murray's law from the ends each vein feeds, not a flow solve. Join makes a network that runs from inlet to outlet, but no flow is worked out through it.
- Each attractor pairs with its nearest vein point only. When that point can't see it, because it is across a wall, a fold or a floor, the attractor waits, and a vein a little further away that could see it isn't asked. On thin or deeply folded models many attractors are left: see [Gil's models](#gils-models).
- Interweave keeps systems apart by narrowing tubes where they pass close, not by moving them. Guy et al. (2020) move vessels apart instead.
- The edge clearance from rims is measured in straight lines. On a crumpled sheet whose ruffled rim folds back near its middle, it can stop growth at once: set it to 0 there.

## Known limits

Measured on 2026-11-23 on this Mac (Apple M1 Max). In-app numbers come from the production build in headless Chrome, driven through the real buttons and file choosers.

### The presets

| Preset | Model, where | Attractors | Grown in | Vein points | Attractors left | Loops, joins |
| --- | --- | --- | --- | --- | --- | --- |
| Organ vessels | Kidney, inside | 3,000 | 0.39 s | 5,803 | 10 | |
| Tree | Tree, inside | 2,500, near the wall | 0.62 s | 4,948 | 4 | |
| Coral | Sphere, inside | 4,000, random | 0.67 s | 12,292 | 0 | |
| Surface vessels | Heart, surface | 3,000 | 0.73 s | 5,043 | 0 | |
| Lattice | Vase, surface | 2,500 | 1.48 s | 7,094 | 1 | 1,089 loops |
| Roots round a pot | Pot, surface | 2,500 | 0.75 s | 5,629 | 2 | |
| Inlet to outlet | Lens, inside, Join | 900, shared | 0.59 s | 3,353 | 7 | 397 joins, 329 dead ends trimmed |
| Two interwoven | Lens, inside, Interweave | 3,000 each | 1.16 s | 9,982 | 234 of 6,000 | Closest gap 0.60 mm, as set |

At the default Speed of 3 steps a frame, growth is held to the screen: about 170 steps a second (Coral grew 112 steps in 0.67 s, Surface vessels 127 in 0.73 s).

### Gil's models

Gil's STL files, each opened in the app and grown with Organ vessels (inside) and Surface vessels (on the surface), which fit their lengths to the model.

| Model | Triangles | Size | Preparing to grow inside | Inside: vein points, attractors left | On the surface: vein points, attractors left |
| --- | --- | --- | --- | --- | --- |
| weave.stl, open | 1,752 | 90 × 90 × 90 mm | 1.8 s | 12,140, 21 of 3,000 | 5,904, 4 of 3,000 |
| nih-brain.stl | 250,000 | 169 × 133 × 139 mm | 2.1 s | 7,835, 212 of 3,000 | 9,601, 776 of 3,000 |
| ZuluTag_v3.stl | 3,002 | 47 × 7 × 29 mm | 0.5 s | 2,317, 589 of 3,000 | 5,644, 169 of 3,000 |
| springpot.stl | 6,882 | 120 × 120 × 122 mm | 2.6 s | 486, 1,725 of 3,000 | 6,278, 1,707 of 3,000 |
| Untitled.stl, open | 181,364 | 28 × 33 × 4 mm | 0.7 s | No room for a root | 3, 2,994 of 3,000 |

Preparing a model to grow on the surface took 0.46 s for the brain and 0.34 s for Untitled.stl.

- **Folds.** On the brain's surface the veins cover the tops of the folds and leave most of the narrow valleys between them: 776 of 3,000 attractors are left.
- **Thin walls.** Inside fills only what is at least the edge clearance from the wall. The springpot's deepest point is 3.4 mm under its skin, so Inside grew 486 vein points and left 1,725 of 3,000 attractors.
- **Inside a pot, and separate parts.** Roots round a pot on the springpot grew 5,952 vein points down its walls, but left 1,481 of 2,500 attractors, mostly on its inside floor and on its saucer. The saucer is a separate piece of the STL, with no root of its own.
- **Crumpled sheets.** Untitled.stl is a ruffled sheet. Its deepest point is 0.22 mm under the skin, so it has no room inside. On its surface, the root sits 0.48 mm from the ruffled rim in a straight line, and with the 0.33 mm edge clearance growth stopped after 3 vein points. With Edge clearance at 0, the app's engine grew 2,569 vein points there (measured in Node), leaving 1,238 of 3,000 attractors.

### Exports

The five designer jobs, each grown and exported at Normal detail through the Export tab.

| Job | Model | Preset | Vein points, attractors left | File | Triangles | Size | Made in |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vessels inside an organ | nih-brain.stl | Organ vessels | 7,835, 212 of 3,000 | STL | 1,353,784 | 67.7 MB | 4.2 s |
| | | | | 3MF | 1,353,784 | 15.8 MB | 5.5 s |
| Vessels over a heart | Heart | Surface vessels | 5,043, 0 | 3MF with the model | 1,085,436 | 12.4 MB | 4.3 s |
| | | | | STL, veins alone | 1,035,572 | 51.8 MB | 4.9 s |
| A lamp shade lattice | Vase | Lattice | 7,094, 1 (1,089 loops) | STL | 1,493,248 | 74.7 MB | 5.5 s |
| | | | | OBJ centre lines | 7,094 points | 0.3 MB | |
| Roots round a pot | springpot.stl | Roots round a pot | 5,952, 1,481 of 2,500 | 3MF with the model | 1,453,666 | 16.5 MB | 5.7 s |
| A tree to print | Tree | Tree | 4,948, 4 | STL | 784,912 | 39.2 MB | 3.1 s |

Every file came out watertight by the app's own check. The four STLs were read back and welded again, as a slicer does: none has an open edge, and each is one connected piece.

### Growth at larger counts

The app's engine in Node, as the worker runs it, at up to the most attractors the app allows. One run each.

| Design | Attractors | Placing them | Steps | Vein points | Attractors left | Growing | Per step |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Organ vessels, kidney | 3,000 | 0.03 s | 63 | 5,803 | 10 | 0.10 s | 1.6 ms |
| | 20,000 | 0.22 s | 56 | 11,455 | 0 | 0.52 s | 9.2 ms |
| | 60,000 | 0.67 s | 56 | 14,677 | 0 | 1.52 s | 27.2 ms |
| Surface vessels, heart | 3,000 | 0.02 s | 127 | 5,043 | 0 | 0.08 s | 0.6 ms |
| | 20,000 | 0.15 s | 123 | 7,983 | 0 | 0.42 s | 3.4 ms |
| | 60,000 | 0.49 s | 122 | 9,613 | 0 | 1.31 s | 10.8 ms |

Preparing the kidney's inside took 0.8 s. At 3,000 attractors the engine grows exactly what the app does: 5,803 and 5,043 vein points.

### Other limits

- **Caps:** STL files up to 1,500,000 triangles, 60,000 attractors (each, with Interweave), 400,000 vein points, and 24 million grid points for the tubes. Growth stops at the vein point cap and says so.
- **Big prints make big files:** 0.8 to 1.5 million triangles and 39 to 75 MB as STL for the designer jobs. A 3MF is about a quarter of the size.
- **The design isn't kept in the browser between visits.** Save a project to keep it. Closing or reloading the page with unsaved veins asks first.
- **Interwoven systems are narrowed apart only when growth pauses,** so the closest gap shows then. Exports always use the veins as they are once growth has stopped.
- **Tested in Chrome on a Mac.** Safari, Firefox and touch devices haven't been tried yet, and no export has been sliced or printed yet.

## Development

```bash
npm run lint      # ESLint, zero warnings
npm test          # Vitest
npm run build     # type-check and build to dist/
```

| Folder | What's in it |
| --- | --- |
| `src/veins/` | The engine, plain TypeScript: `engine.ts` (growth, Join and Interweave), `inside.ts` (the inside of a model: distance grid, sight lines, attractors, roots), `surface.ts` (the skin: steps along it, folds over edges, rims, attractors, roots), `network.ts` (widths, trimming, gaps between systems, counts), `kdtree.ts`, `grid.ts`, `domain.ts`, `random.ts`, with tests, including `review.test.ts` for problems found in review and QA |
| `src/worker/` | The growth worker and its frame protocol (`runner.ts`), and the export worker that builds the tubes, with a test |
| `src/lib/` | Settings and presets, the design, project files, the built-in models, STL in and out, the tubes (`tubes.ts`, `voxel.ts`), the STL, 3MF and OBJ exports, a small zip writer, and undo |
| `src/components/` | The 3D view (React Three Fiber, with the tubes drawn as copies of one shape), the panels, bars, tooltips, dialogs and tabs |
| `src/useVeins.ts` | The page's model: the design, the worker, undo and saving state |
| `docs/` | The pictures in this README |
| `test-fixtures/` | A project saved by the app, which every later version must still open |
| `local/` | Not in git: probes, QA scripts and test models |

## Sources and credits

- The method is from Runions, Lane and Prusinkiewicz (2007), *Modeling trees with a space colonization algorithm*, and, for loops, Runions, Fuhrer, Lane, Federl, Rolland-Lagan and Prusinkiewicz (2005), *Modeling and visualization of leaf venation patterns*.
- Join follows Kinstlinger et al. (2020), *Generation of model tissues with dendritic vascular networks via sacrificial laser-sintered carbohydrate templates*, Nature Biomedical Engineering 4, 916–932, and Nervous System's interpenetrating networks.
- Interweave's gap follows Hohl, Ebrahem, Jessen, ten Eikelder and Schillinger (2025), *A multi-compartment homogenized perfusion model for deforming hierarchical vasculature*, Biomechanics and Modeling in Mechanobiology 25, 10. Guy et al. (2020), IEEE Transactions on Biomedical Engineering 67, 1650, move colliding vessels apart instead.
- The engine's core, its loops and its nearest-point cache come from Gil's [Vessel Studio](https://github.com/gil336699/vessel-studio) (MIT). The voxel tools, surface nets and STL reading come from Gil's [Growth Studio](https://github.com/gil336699/growth-studio) (MIT). Both were copied in, not imported.
- Built with three.js, React Three Fiber, drei and three-mesh-bvh (all MIT).

## License

MIT. See [LICENSE](LICENSE).
