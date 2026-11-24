# Vessel Studio 3D

Vessel Studio 3D is a browser app that grows blood vessels, roots, coral and trees in 3D by space colonization (Runions, Lane and Prusinkiewicz 2007).

- Attractors are scattered through a model or over its surface. Each one pulls on the nearest vein that can see it, and veins grow toward them a step at a time until every attractor is reached.
- **Inside**, veins fill a closed model, like vessels in an organ or a tree in its crown. **On the surface**, they grow across the skin and stay on it, like vessels over a heart or roots round a pot.
- Grow one system, or two or three together. Two can **join**: an inlet tree and an outlet tree grow toward each other and meet, so the network runs from inlet to outlet (mutual tree attraction, Kinstlinger et al. 2020). Two or three can **interweave**: they fill the same space and never touch.
- Veins thicken toward their roots by Murray's law.
- Use one of seven built-in models, or open your own STL.
- Export the veins as watertight tubes to print (STL, or 3MF with a coloured part for each system), as centre lines with their widths for Blender, Rhino and Houdini (OBJ), or as a picture (PNG).

It is the 3D companion of [Vessel Studio](https://github.com/gil336699/vessel-studio), which grows veins inside 2D shapes.

**Use it online:** https://gil336699.github.io/vessel-studio-3d/

![Vessel Studio 3D in use: Speed is set to 1, and vessels grow through a see-through kidney from the dent where they enter; Inlet to outlet grows a red and a purple tree from the two ends of a lens until they meet and join; Surface vessels grow over a heart; Gil's woven vase, weave.stl, is opened and vessels grow over its surface; and the veins are exported as a watertight STL of 1,168,784 triangles. Growth plays at the app's real speed for Speed 1, about 60 steps a second.](docs/demo.gif)

[Watch the demo as a video](https://github.com/gil336699/vessel-studio-3d/releases/download/v1.0.0/vessel-studio-3d-demo.mp4) (MP4, 1920 × 1080, 29 seconds, recorded with 1.0.0).

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
4. **Grow:** press Space, or Grow. Growth settings change live while veins grow. Settings that place the attractors again start the veins over: the attractor settings, Where veins grow, the systems, and a new model or size.
5. **Look:** Murray's law or even widths, the tip and widest widths in mm, and colours.
6. **Export** on the Export tab, or save a project to carry on later exactly where it stopped.

### Printing

- **STL** holds the tubes as one watertight solid, in millimetres.
- **3MF** holds the same tubes with their colours. Interwoven systems are each their own part, for multi-colour printers.
- **On the surface**, choose **Veins alone** for a lattice, such as a lamp shade or a vase of veins, or **With the model** for the model with raised veins. With the model, the two are parts of one object, and the slicer joins them as it slices. An open sheet has no thickness, so it prints veins alone.
- **The underside stays clear.** On a closed model, veins don't grow on the skin it stands on, nor nearer the bed than the edge clearance, so it sits flat on the bed, and a part resting just above another, as a pot in its saucer, isn't joined to it by veins.
- **Detail** sets how fine the tube surface is: Draft, Normal or Fine. The Export tab estimates the triangles and the file size before you export.
- **Tip width:** about 0.8 mm for a filament printer with a 0.4 mm nozzle, about 0.3 mm for resin.
- **Edge clearance** keeps vein centre lines that far from the wall. To keep whole tubes inside the skin, make it more than half the widest vein near the wall.
- **Interwoven systems** keep at least the Gap between their tube surfaces in every export: tubes narrow where they pass closer.

### Your own models

- STL, binary or text, read as millimetres, up to 1,500,000 triangles.
- **Inside** needs a closed model, or one with a few openings, which are capped flat. Veins fill only what is at least the edge clearance from the wall, so thin walls leave little room.
- **On the surface** works on any model: closed, or an open sheet with rims. Veins keep the edge clearance from the rims. A model in separate pieces, such as a pot and its saucer, needs a root on each piece that should have veins.
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
| Edge clearance | 0–20 mm, at most an eighth of the model's size. How far veins, attractors and roots stay from the wall (inside), or from open rims and, on a closed model, from the bed (surface). |
| Pattern | The pattern number. The same number always places the same attractors, and the dice picks a new one. |

### Roots

| Root | What it does |
| --- | --- |
| A click with the Roots tool (O) | Inside, **On the skin**: the vessel enters where you click and grows in, as an artery enters an organ. **In the middle**: the root starts halfway through the model under the click. Shift-click gives the other one. On the surface, a root where you click, but not on the underside a closed model stands on, nor nearer an open rim than the edge clearance: the status says why. |
| Model's spots | The model's own spots again, one for each system. On the surface, a spot on the underside a closed model stands on, such as the bottom of the Sphere, moves to the nearest skin where veins can start. |
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

1. **Pair.** Every live attractor finds the nearest vein point that can see it, in the system it feeds. If that point is closer than the kill distance, the attractor is used up. Otherwise the attractor pulls it, if it is within the attraction distance. In a folded model the nearest vein is often just across a wall, where it can't grow to the attractor, so a vein on the attractor's own side grows to it instead. With Loops on, an attractor pulls every vein point of its relative neighbourhood among those that see it.
   - **Inside**, a point sees an attractor when the straight line between them stays inside the model, clear of the wall by the edge clearance. Only a point at most one kill distance farther away than the nearest vein point counts. Testing every vein would make a step in the brain about ten times slower, and a vein just round the fold is the one that matters.
   - **On the surface**, a point sees an attractor when both are on the same piece of the model and their surface normals are less than 120° apart, so veins never pair across a thin wall, a narrow gap or a gap between parts. Seeing is a quick test here, so any vein that sees an attractor counts, however far: a pot's inside walls reach its floor.
2. **Grow.** Every pulled point grows one new point a segment length away, toward the average direction of its attractors, blended with Keep heading, Wiggle and Pull.
   - **Inside**, a step that would leave the model, or come nearer the wall than the edge clearance anywhere along it, is refused.
   - **On the surface**, a step is laid along the skin. It lands on the nearest point of the surface, and at an edge it turns over the edge as the surface does, up to four times a step. A step that would jump to another sheet or another piece of the model, or come nearer an open rim than the edge clearance, is refused. Pieces are told apart by the corners their triangles share, so a vein never crosses the gap between a pot and its saucer, which a print would join.
   - **On each closed piece, veins stay off the underside it stands on:** skin that doesn't face more than 30° above level, so a vein's tube on it hangs below its centre line, with less room below it than 2.5 % of the model's size, the radius of the widest vein the presets grow. The room is measured straight down, to the bed (the model's lowest point) or to another piece of the model: a pot's bottom is underside, and so is its side just above the floor of its saucer. Veins also keep the edge clearance from the bed. No attractors go there, and roots and steps there are refused; a model's own root asked for there moves to the nearest skin where veins can start. A vein there would lift the model off the bed, or fill the gap to the part below and join the two in a print. A piece counts as closed with a small hole or a missing triangle or two, and its triangles may face in or out: its signed volume tells. Open sheets, which have no thickness to print with, aren't affected. The underside is 7.4 % of the kidney's skin, 7.6 % of the lens's, 2.5 % of the sphere's and 0.3 % of the heart's.
   - With Loops off, a refused step uses up the attractors it would have reached, since a vein or the wall already fills that space.
3. **Add.** The step's new points go in together, so the result never depends on the order points are visited.

**The model.** To grow inside, the model is sampled on a grid of about 200 points along its longest side, as a signed distance to its skin, using Growth Studio's voxel tools. A flood fill from the grid's edge finds the outside. An open model has its openings capped flat first, and sealed hollows are found by a vote of three rays. To grow on the surface, a bounding volume hierarchy (three-mesh-bvh) finds the nearest point of the skin. Normals are blended across each corner, but kept sharp where faces meet at more than 60°.

**Two systems.** Join and Interweave are described under [Systems](#systems). Join follows the mutual tree attraction that Kinstlinger et al. (2020) designed with Nervous System. Interweave keeps two tubes apart by the sum of their radii plus the gap, as Hohl et al. (2025) do for supplying and draining trees.

**Widths.** By Murray's law, a vein is the tip width times the number of vein ends it feeds to the power 1/exponent, capped at Widest. A join between the two trees is as wide as its narrower end.

**Tubes to print.** Each segment is a round cone: a ball at each end, at that end's width, joined by the cone that touches both. The tubes' exact distance is sampled on a grid in small bricks near the tubes only. Their surface is drawn with surface nets and smoothed. Pinched corners are opened and sealed bubbles filled first. Then it is checked: every edge must be shared by exactly two triangles, once each way, so the solid is watertight. The grid is as fine as the tip width and Detail ask, up to 24 million grid points. Past that it gets coarser, and the status says the finest tips came out rounder.

These rules make it fast and repeatable:

- **Cached nearest points.** Each attractor's nearest vein point, and its nearest one that can see it, are cached and updated with only each step's new points, through a small k-d tree. That is exact, because vein points never move and whether one sees an attractor never changes, and ties go to the older point, as a full search would. Every vein point nearer than the one that sees an attractor is known not to see it, so new points are tested nearest first, and only until one sees it.
- **The same result every time.** Everything is seeded, and the project file holds the whole state, the random generator's included. A test checks that a run saved half way and carried on ends bit for bit like one grown straight through. In the app, a kidney saved at step 25, reloaded and grown on ended with the same 7,074 vein points as one grown straight through. A project the app saved at 1.0.0 opens and grows on too, with a test that it always will.
- **Workers.** Growth runs off the page and sends one frame at a time, after the page has drawn the last one. Frames carry only new points. A second worker builds the tubes for export. The view draws all the tubes as copies of one shape.

**An honest note on its limits:**

- It is a picture-making model, not a physiological one. Veins grow toward free space, not toward tissue that needs blood, and widths follow Murray's law from the ends each vein feeds, not a flow solve. Join makes a network that runs from inlet to outlet, but no flow is worked out through it.
- Inside, an attractor whose nearest vein point that sees it is more than a kill distance farther away than its nearest vein waits, until a vein grows nearer. A part with no vein in it, such as a separate piece of the STL, needs a root of its own: see [Gil's models](#gils-models).
- Interweave keeps systems apart by narrowing tubes where they pass close, not by moving them. Guy et al. (2020) move vessels apart instead.
- The edge clearance from rims is measured in straight lines. On a crumpled sheet whose ruffled rim folds back near its middle, it can stop growth at once: set it to 0 there.

## Known limits

Measured on 2026-11-23 on this Mac (Apple M1 Max). In-app numbers come from the production build in headless Chrome, driven through the real buttons and file choosers.

### The presets

| Preset | Model, where | Attractors | Grown in | Vein points | Attractors left | Loops, joins |
| --- | --- | --- | --- | --- | --- | --- |
| Organ vessels | Kidney, inside | 3,000 | 0.37 s | 5,745 | 4 | |
| Tree | Tree, inside | 2,500, near the wall | 0.64 s | 4,967 | 5 | |
| Coral | Sphere, inside | 4,000, random | 0.67 s | 12,292 | 0 | |
| Surface vessels | Heart, surface | 3,000 | 0.76 s | 5,089 | 0 | |
| Lattice | Vase, surface | 2,500 | 1.46 s | 7,094 | 1 | 1,089 loops |
| Roots round a pot | Pot, surface | 2,500 | 0.74 s | 5,629 | 2 | |
| Inlet to outlet | Lens, inside, Join | 900, shared | 0.56 s | 3,427 | 6 | 467 joins, 311 dead ends trimmed |
| Two interwoven | Lens, inside, Interweave | 3,000 each | 1.14 s | 9,982 | 234 of 6,000 | Closest gap 0.60 mm, as set |

At the default Speed of 3 steps a frame, growth is held to the screen: about 170 steps a second (Coral grew 112 steps in 0.67 s). Surface vessels was timed again for 1.1.2 on a busy machine; the others grow exactly as with 1.1.0. Over six seeds, 1.1.0 left as many attractors as 1.0.0 on these models, give or take a few: 33 and 33 in all for Tree, 26 and 26 for Organ vessels, 10 and 12 for Surface vessels.

### Gil's models

Gil's STL files, each opened in the app and grown with Organ vessels (inside) and Surface vessels (on the surface), which fit their lengths to the model.

| Model | Triangles | Size | Preparing to grow inside | Inside: vein points, attractors left | On the surface: vein points, attractors left |
| --- | --- | --- | --- | --- | --- |
| weave.stl, open | 1,752 | 90 × 90 × 90 mm | 2.0 s | 12,136, 22 of 3,000 | 5,843, 10 of 3,000 |
| nih-brain.stl | 250,000 | 169 × 133 × 139 mm | 2.4 s | 8,975, 31 of 3,000 | 11,519, 382 of 3,000 |
| ZuluTag_v3.stl | 3,002 | 47 × 7 × 29 mm | 0.7 s | 2,298, 590 of 3,000 | 6,173, 103 of 3,000 |
| springpot.stl | 6,882 | 120 × 120 × 122 mm | 3.2 s | 486, 1,725 of 3,000 | 9,067, 489 of 3,000 (456 on the saucer, with no root) |
| Untitled.stl, open | 181,364 | 28 × 33 × 4 mm | 0.7 s | No room for a root | 3, 2,994 of 3,000 |

Preparing to grow inside includes placing the attractors. Preparing to grow on the surface took 0.5 s for the brain and 0.8 s for Untitled.stl. Growing took 0.70 s inside the brain (measured with 1.1.0, which grows it the same).

With 1.0.0, each attractor pulled only its nearest vein, even one across a wall or a fold that couldn't grow to it. These files left many more then. On the surface, 1.1.2 also keeps veins off the underside each closed model stands on:

| Model | Inside: attractors left, 1.0.0 → 1.1.2 | On the surface: attractors left, 1.0.0 → 1.1.2 |
| --- | --- | --- |
| weave.stl | 21 → 22 | 4 → 10 |
| nih-brain.stl | 212 → 31 | 776 → 382 |
| ZuluTag_v3.stl | 589 → 590 | 169 → 103 |
| springpot.stl | 1,725 → 1,725 | 1,707 → 489, 456 of them on the saucer |

Inside the brain, 1.1 left fewer with every seed tried: 212 → 31, 214 → 58, 216 → 42, 219 → 49, 220 → 43 and 230 → 41.

- **Folds.** Inside the brain, the veins now reach into its folds and growth ends Done. Over its surface, 382 of 3,000 attractors are still left, and the base it rests on stays clear.
- **Thin walls.** Inside fills only what is at least the edge clearance from the wall. The springpot's deepest point is 3.4 mm under its skin, so Inside grew 486 vein points and left 1,725 of 3,000 attractors, as before. The ZuluTag is the same: no vein can reach 590 of its attractors inside.
- **Inside a pot.** Roots round a pot on the springpot now grow over the rim, down the pot's inside walls and over its floor, but not over its bottom, which sits in the saucer, nor low on its side, just above the saucer's floor. On the pot, 18 of its 2,118 attractors are left (945 of 1,870 with 1.0.0), and 452 vein points cover the inside floor (1 with 1.0.0).
- **Separate parts.** The springpot's saucer is a separate piece of the STL. The pot's foot sits in it, and elsewhere a 1 mm gap separates them. Veins never cross from one piece to another, as a print would join them there. So all 382 of the saucer's attractors wait for a root of their own, and the status says so. (While 1.1 was being made, veins that reached the pot's foot stepped across the gap: 1,332 vein points on the saucer. 1.0.0 had put 26 there.)
- **Crumpled sheets.** Untitled.stl is a ruffled sheet. Its deepest point is 0.22 mm under the skin, so it has no room inside. On its surface, the root sits 0.48 mm from the ruffled rim in a straight line, and with the 0.33 mm edge clearance growth stopped after 3 vein points. With Edge clearance at 0, the app's engine grew 2,569 vein points there (measured in Node), leaving 1,238 of 3,000 attractors.

### Exports

The five designer jobs, each grown and exported at Normal detail through the Export tab.

| Job | Model | Preset | Vein points, attractors left | File | Triangles | Size | Made in |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vessels inside an organ | nih-brain.stl | Organ vessels | 8,975, 31 of 3,000 | STL | 1,468,668 | 73.4 MB | 4.6 s |
| | | | | 3MF | 1,468,668 | 17.2 MB | 5.6 s |
| Vessels over a heart | Heart | Surface vessels | 5,089, 0 | 3MF with the model | 1,066,204 | 12.2 MB | 4.9 s |
| | | | | STL, veins alone | 1,016,340 | 50.8 MB | 5.1 s |
| A lamp shade lattice | Vase | Lattice | 7,094, 1 (1,089 loops) | STL | 1,493,248 | 74.7 MB | 5.6 s |
| | | | | OBJ centre lines | 7,094 points | 0.3 MB | |
| Roots round a pot | springpot.stl | Roots round a pot | 12,680, 400 of 2,500 (382 on the saucer, with no root) | 3MF with the model | 2,139,406 | 24.6 MB | 9.8 s |
| A tree to print | Tree | Tree | 4,967, 5 | STL | 780,940 | 39.0 MB | 3.2 s |

Every file came out watertight by the app's own check. The four STLs were read back and welded again, as a slicer does: none has an open edge, and each is one connected piece. The pot's 3MF is 24.6 MB, not 16.5 MB as with 1.0.0, as the veins now cover the pot inside and out. The heart's and the pot's files were made again for 1.1.2 on a busy machine, which slowed the unchanged exports by 10 to 60 %, so their times are high.

**Sliced for a printer.** Each file as the app exported it, in Bambu Studio for a Bambu A1 mini (180 mm bed): PLA, 0.4 mm nozzle, 0.2 mm layers, 15 % infill, 2 walls, tree supports. None has been printed yet.

| Job | File | Print time | PLA | Time spent on supports | Slicer warnings |
| --- | --- | --- | --- | --- | --- |
| Vessels inside an organ | STL | 18 h 48 min | 230 g | 42 % | None |
| Vessels over a heart | 3MF with the model | 2 h 41 min | 72 g | 4 % | None |
| | STL, veins alone | 4 h 34 min | 44 g | 41 % | None |
| A lamp shade lattice | STL | 8 h 4 min | 105 g | 16 % | None |
| Roots round a pot | 3MF with the model | 9 h 12 min | 144 g | 6 % | None |
| A tree to print | STL | 5 h 51 min | 71 g | 20 % | None |

- Everything fits the 180 mm bed; the organ's vessels print between 14 and 168 mm.
- With 1.1.0, the pot had 12 overhangs the slicer couldn't support: roots had grown over the pot's bottom, in the 1 mm gap above its saucer. 1.1.1 kept veins off the underside a model stands on, and the warning went; a narrower underside in a 1.1.2 draft brought 2 back, from roots low on the pot's side just above the saucer's floor. 1.1.2 measures the room below each spot a vein lands on, and the pot slices with no warnings: its nearest tube now ends 0.57 mm above the saucer's floor.
- The organ's vessels and the heart's veins alone spend 41 to 42 % of their time on supports, much of it inside the network, which will be hard to remove. The heart with raised veins is the easiest print.
- Even without veins, the springpot's STL puts its pot 1 mm above its saucer, and a slicer fills that gap with supports: print the two apart.

### Growth at larger counts

The app's engine in Node, as the worker runs it, at up to the most attractors the app allows. One run each.

| Design | Attractors | Placing them | Steps | Vein points | Attractors left | Growing | Per step |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Organ vessels, kidney | 3,000 | 0.03 s | 58 | 5,745 | 4 | 0.11 s | 1.8 ms |
| | 20,000 | 0.23 s | 57 | 11,318 | 0 | 0.58 s | 10.1 ms |
| | 60,000 | 0.73 s | 57 | 14,421 | 0 | 1.72 s | 30.1 ms |
| Surface vessels, heart | 3,000 | 0.02 s | 123 | 5,064 | 0 | 0.10 s | 0.8 ms |
| | 20,000 | 0.15 s | 122 | 8,163 | 0 | 0.47 s | 3.9 ms |
| | 60,000 | 0.51 s | 122 | 10,080 | 0 | 1.49 s | 12.2 ms |

Preparing the kidney's inside took 0.8 s. At 3,000 attractors the engine grows exactly what the app does: 5,745 and 5,064 vein points. Measured with 1.1.0; 1.1.2 keeps veins off the heart's base and grows it with 5,089 vein points. A step takes up to 15 % longer than with 1.0.0 here. In the folded brain a step inside takes 5.8 ms on average, against 2.1 ms with 1.0.0, and the slowest 16 ms; testing every vein, with no limit, took 52 ms on average and 180 ms at worst.

### Other limits

- **Caps:** STL files up to 1,500,000 triangles, 60,000 attractors (each, with Interweave), 400,000 vein points, and 24 million grid points for the tubes. Growth stops at the vein point cap and says so.
- **Big prints make big files:** 0.8 to 1.5 million triangles and 39 to 75 MB as STL for the designer jobs. A 3MF is about a quarter of the size.
- **Veins never cross between separate pieces of a model.** Give each piece its own root; the status says when attractors are left on a piece without one. They keep their centre lines apart, not their tubes: on the springpot the nearest tube passed 0.04 mm from the saucer without touching it, so a wider vein there could still join the two.
- **A stray triangle far from the model makes the model bigger,** and every length that follows its size grows with it: the presets' lengths, and the underside's depth. Remove debris in your CAD app first.
- **Inside a model, changing the kill distance searches all the veins again,** as it sets how far that search reaches: at 60,000 attractors it takes about 2 s. The worker takes only the latest change of a moving slider.
- **The design isn't kept in the browser between visits.** Save a project to keep it. Closing or reloading the page with unsaved veins asks first.
- **Interwoven systems are narrowed apart only when growth pauses,** so the closest gap shows then. Exports always use the veins as they are once growth has stopped.
- **Tested in Chrome on a Mac.** Safari, Firefox and touch devices haven't been tried yet. The designer jobs have been sliced (see [Exports](#exports)), but none has been printed yet.

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
