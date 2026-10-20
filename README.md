# 3D printer anatomy

An interactive isometric figure of a bed-slinger FDM printer: a cut-open hot end, the moving X, Y and Z axes, and the filament from spool to bead. Hover to turn the speed dial.

- `index.html` is the whole figure: a standalone page with no dependencies. It starts in the light theme and has a Light/Dark toggle (the choice is remembered).
- `rig.mjs` is the model behind every number the figure shows.
- `build.mjs` generates the page. Run `node build.mjs` to regenerate `index.html` (`--dark` starts it in the dark theme). It imports the Anatomy skill's kit from `~/.claude/skills/anatomy`, so it only runs on a machine that has that skill installed. The built pages do not need it.
