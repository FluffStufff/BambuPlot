# BambuPlot

Turn a Bambu Lab 3D printer into a pen plotter.

This version started as a fork of [Joep648's original BambuPlot](https://github.com/Joep648/BambuPlot).

I opened it intending to make a few small tweaks for my own setup.

That got slightly out of hand.

Huge credit to **Joep648** for making BambuPlot in the first place. This version wouldn't exist without it.

> **Note:** This is a fan-made project and is not affiliated with or endorsed by Bambu Lab.

---

## The basic flow

Choose your printer and drawing tool, add something to the bed, position it, then generate the G-code.

The **Preview** is worth running before the real print. It shows the actual sequence, including homing, when to attach the pen, material placement and pen changes.

For a first test, a normal ballpoint or fineliner on scrap paper is a good place to start and run your first file with no pen installed to understand what will happen.

---

## Single-colour plots

For a normal one-pen drawing:

1. Create or import your artwork.
2. Position and resize it on the bed.
3. Generate the G-code.
4. Preview the run.
5. Download the `.gcode` file and copy it to the printer's microSD card.
6. Start the print with **no pen attached**.
7. Let the printer home and measure the bed.
8. BambuPlot moves the head to the front edge.
9. Attach the pen when prompted.
10. Let it draw.

If you're using material alignment, BambuPlot draws the corner marks first, then moves the head to the back so you can reach the bed and place your material on them.

When the plot is finished, the head moves out of the way so you can collect the drawing.

---

## Multicolour plots

Each layer can have its own pen colour.

You can either generate one file with timed pen changes, or download a ZIP containing a separate numbered file for each colour.

For example:

`01_Black_000000.gcode`  
`02_Blue_1D4ED8.gcode`  
`03_Red_E63946.gcode`

For the numbered ZIP:

1. Start **every file with no pen attached**.
2. Let the printer home and measure the bed.
3. Wait for BambuPlot to move the head to the front.
4. Attach the pen listed for that pass.
5. Let the pass finish.
6. Remove the pen.
7. Start the next numbered file with no pen attached.
8. Keep the material and magnets exactly where they are between passes.

Each numbered file homes again before drawing. The pen needs to stay off during that step.

Only the first file draws the optional material-alignment crosses.

The preview also shows the next numbered filename at the handoff, so you know exactly which file comes next.

---

## Some fun stuff

### Photo plotting

Drop in a photo and turn it into hatch lines.

You can adjust darkness, density, direction and cross-hatching while seeing the result before you add it to the bed.

With Pencil, Crayon or Chalk selected, dynamic pressure allows for enhanced shading when enabled in the settings.

### SVGs and gradients

SVGs stay vector where possible.

You can plot outlines, single lines, shape-following fills, light fills or straight-line fills.

Flat colours can be split into separate pen layers, and SVG gradients can drive variable pressure.

### Variable pressure

Pencil, Crayon and Chalk can use small changes in Z height to simulate pressure.

This works especially well with photos, gradients and shaded fills.

Start with a small pressure range and test it on scrap first.

### Your own handwriting

You can draw your own alphabet inside BambuPlot and use it like a font.

You can even save several versions of the same character so repeated letters don't all look identical.

### 3MF models

Drop in a `.3mf` file, choose a side, and turn that view into a 2D plot.

Top, front, back, left, right and bottom views are supported.

### Drawing tools

There are presets for:

- Ballpoint / Gel pen
- Fineliner
- Felt-tip / Marker
- Pencil
- Crayon
- Chalk
- Highlighter
- Paint marker
- Other / custom

The tip widths are only starting points. If your pen draws differently, just change it.

### Layers

Artwork can be reordered, grouped, recoloured, duplicated and edited after it's been added to the bed.

Plot order runs **top → bottom** in the Layers panel.

---

## Safety

A pen plotter is still a moving 3D printer.

A few things worth keeping in mind:

- Start homing with the pen removed.
- Only attach the pen when BambuPlot moves the head to the front and asks you to.
- Keep magnets and clips away from the toolhead path.
- Test unfamiliar holders, materials and pressure settings on scrap first.
- Make sure the pen holder has enough vertical movement or flex.
- Watch the first run of a new setup.
- Preview unfamiliar jobs before running them.

BambuPlot keeps the heaters off during its Bambu plotting workflow.

You are responsible for checking that your own pen holder, printer setup and material are safe to use.

---

## Credit

This version is based on the original **BambuPlot by Joep648**:

https://github.com/Joep648/BambuPlot

I only meant to tinker with it, but ended up taking it quite a bit further.

Please check out the original project too. It gave me the amazing starting point for everything here.

---

## Licence note

At the time this fork was created, the original BambuPlot repository did not include a licence.

Because of that, the licensing position for the original code isn't completely clear.

I've kept the original project clearly credited here and I'm treating this as a custom fork/continuation.

If you're planning to redistribute, relicense or build on this version, please also check the original repository and its licensing status.