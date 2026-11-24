# Changelog

## 1.1.1 2026-11-23

Prints sit flat.

- **On a closed model, veins stay off the underside it stands on:** skin facing down with too little room below it, down to the bed or to another part of the model. No attractors go there, and roots and steps there are refused. Slicing 1.1's designer jobs for a Bambu A1 mini found the problem: Roots round a pot had grown 745 vein points facing down on the springpot, about 470 of them on the pot's bottom in the 1 mm gap above its saucer, and the slicer found 12 overhangs it couldn't support there. Now no vein grows there, and the pot's slice has no warnings.
- **Clicking the underside with the Roots tool says why** no root goes there.
- The heart, the brain and the ZuluTag lose the few veins on their bases: over the brain, 375 of 3,000 attractors are left (326 with 1.1.0), and over the heart 4 (none with 1.1.0). Printed as veins alone, the heart's net no longer touches the bed and needs a little more support: 54 g of PLA, not 48 g.
- Open models, Inside, and the other presets grow exactly as before.
- **The README lists the six designer prints, sliced for a Bambu A1 mini:** print time, filament, supports and warnings.

## 1.1.0 2026-11-23

Veins now reach round folds and thin walls.

- **Each attractor pulls the nearest vein that can see it.** Before, it pulled only its nearest vein. When that vein was across a wall, a fold or a floor, it couldn't grow there, and the attractor waited for good. Now a vein on the attractor's own side grows to it.
- **Folded and thin models fill much further.** Inside the brain, 31 of 3,000 attractors are left, not 212, and growth ends Done instead of Stopped. Over the brain, 326 are left, not 776. Roots round a pot now cover the springpot's inside walls and floor: 31 of the pot's 1,870 attractors are left, not 945.
- **Veins stay on their own piece of the model.** On the surface, a vein could step across a narrow gap onto another piece. With 1.0.0, 26 vein points crossed the 1 mm gap from the springpot onto its saucer, a separate piece with no root of its own. The new pairing brings veins down to the pot's foot, and 1,332 would have crossed. A print joins the two parts wherever a vein crosses. Now a vein never crosses from one piece to another. The saucer's attractors wait for a root of their own, and the status says how many are on a part with no root.
- **The presets grow as before,** give or take a few attractors.
- **Growth stays quick.** Inside, a vein that sees an attractor counts only if it is at most one kill distance farther away than the nearest vein. Testing every vein would make a step in the brain about ten times slower. On the surface, where seeing is a quick test of two normals, any vein counts. The brain grows in 0.70 s inside and 0.83 s over its surface.
- **Loops:** a vein across a wall no longer keeps another vein from joining a source.
- **Projects saved with 1.0.0 open as before,** and grow on with the new pairing.

## 1.0.0 2026-11-23

The first release.

- **Grow veins in 3D, inside a model or over its surface.** Inside, vessels fill a closed model, like arteries in a kidney or a tree in its crown. On the surface, they grow across the skin, turn over its edges and stay on it, like vessels over a heart or roots round a pot.
- **Seven built-in models** (sphere, kidney, lens, heart, tree, vase, pot), or **your own STL**, binary or text, up to 1,500,000 triangles. An open model grown inside has its openings capped flat, and sealed hollows inside a model are found and kept empty.
- **Eight presets:** Organ vessels, Tree, Coral, Surface vessels, Lattice, Roots round a pot, Inlet to outlet and Two interwoven. Each fits its lengths to the model's size.
- **Two or three systems at once.** Join grows an inlet tree and an outlet tree that meet and join, and trims the ends that never met, so every vein runs from inlet to outlet. Interweave grows two or three systems through the same space and keeps a gap between their tubes in every export.
- **Roots where you click.** Inside, a vessel enters where you click, or starts in the middle of the model under the click. On the surface, roots can also go along an open rim or round the top of a closed pot. On a model you open, the first roots go where it suits best.
- **Prints:** a watertight STL of the tubes, or a 3MF with a coloured part for each system. On the surface, print the veins alone as a lattice, or with the model as raised veins. Draft, Normal and Fine detail, with the file size estimated first. Tips too thin to print are flagged.
- **For other apps:** OBJ centre lines grouped by system and width for Blender, Rhino and Houdini, and PNG pictures at 1×, 2× or 4×, with or without the background.
- **Projects** save everything, the veins and the random generator's state included, so growth carries on exactly where it stopped.
- Help on every control, a quick start, a **?** list of shortcuts, undo and redo, light and dark modes, and layouts for desktop, tablet and phone.
