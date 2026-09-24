# Printing Preview and Send Workflow

Use Printing mode to inspect generated slice layers and export/send the final print artifact.

## 1) Enter Printing mode

Printing mode is available when printing workspace data exists.

If scene changes invalidate the current slice, DragonFruit can require re-slicing before continuing.

Before slicing, choose the material profile in the material selector. Legacy
profiles keep their original label; profiles with color metadata show the
material name with its color name or swatch. A color variant is a separate
profile with its own print settings, so select the profile whose settings
should apply to the job. Statistics and slicing use a composite label that
includes the material color, and that label supplies the `{material_name}`
filename placeholder.

## 2) Scrub layers

Use the vertical layer slider to inspect layers:

- drag upper (and optional lower) thumb
- wheel to nudge layers
- Shift for fine movement during drag
- optionally toggle cross-section rendering mode (`smooth`/`rasterized`)

During scrubbing, DragonFruit can use fast preview rendering paths to keep interaction responsive.

For CTB V4/V5, the **Encoded layer settings** inspector reads the selected layer
from the generated file on disk. It shows Z, exposure, light-off delay, three
independent waits, lift/retract distances and speeds, and PWM. Loading and read
errors replace the values; settings are never inferred from the currently edited
material. Retract distance 1 is displayed as total lift minus retract distance 2.
The inspector sits on the left directly above the printer/material statistics
card, matching its width. It can collapse like the Printing panel. Both panels
use bounded scrollable bodies to keep their controls accessible without overlap
in smaller windows; the inspector includes all encoded fields and the estimate
explanation.

## CTB timing and startup dummy

For Saturn 2 and Saturn 3 CTB profiles, open the material's **Timing** tab and
enable CTB timing. Set separate bottom and normal timings. Range overrides use
inclusive, one-based **model layer** numbers. Single-layer overrides use the
same start and end. Later matching rules take precedence only for the fields
they specify. The LOD calculator adds constant-speed motion time to the desired
pre-exposure rest; it leaves the independent wait fields unchanged.

The optional startup dummy adds one file layer before model layer 1. It uses a
tiny pixel, short exposure, low PWM and minimal lift. It shares the first real
layer's Z; every model layer retains its original Z and raster sample height.
The slider and total count use file layers, while the preview and inspector
also label model layers and the startup dummy. During dummy preview loading,
the preview stays blank instead of showing model geometry.

Timing controls require CTB V4/V5 (including encrypted variants). Unsupported
versions fail before mesh preparation; disable timing or select a supported
version. With timing disabled, legacy export behavior is preserved. Changes to
enabled CTB timing, exposure or motion settings invalidate the current artifact
and require re-slicing.

**Reslice Now** regenerates the preview without overwriting the previously saved
file. The completed action becomes Preview, the old saved path is cleared, and
**Export as file** becomes available. Export again to save the updated timings.
This also applies when CTB timing is disabled before re-slicing. Previously the
reslice handoff retained the earlier “Saved to” path; that inherited display bug
is fixed.

## 3) Review print summary

In the Printing panel, confirm:

- printer profile
- resin profile
- estimated print time
- estimated volume
- generated file name/format/size

For enabled CTB timing, the estimate uses the completed job's settings snapshot:
exposure + all three waits + the greater of motion time and light-off delay,
summed over every file layer including the dummy. This UVtools-style estimate
is not a firmware timing guarantee.

## 4) Export or send

Available actions depend on slice intent and connected integrations:

- **Export as file**
- **Send to printer** (with optional target picker)
- **Retry/Cancel** during send operations

If file intent was used, DragonFruit can reveal the saved file location in desktop runtime.

## Practical checks

- Verify key support-heavy layers before sending.
- Re-slice after geometry/support modifications.
- Confirm final file format and target printer compatibility.

## Related workflows

- [Raft and Export](./raft-and-export.md)
- [Island Analysis Workflow](./island-analysis-workflow.md)

![Printing workflow placeholder](../assets/placeholders/workflow-printing-preview-send.png)

> Screenshot placeholder: Printing mode with layer scrub slider and printing action panel.
