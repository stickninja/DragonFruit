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
independent waits, lift/retract distances and speeds, and the stored PWM byte
out of 255 with its percentage. Loading and read
errors replace the values; settings are never inferred from the currently edited
material. Retract distance 1 is displayed as total lift minus retract distance 2.
The inspector sits on the left directly above the printer/material statistics
card, matching its width. It can collapse like the Printing panel. Both panels
use bounded scrollable bodies to keep their controls accessible without overlap
in smaller windows; the inspector includes all encoded fields and the estimate
explanation.

## CTB timing and startup dummy

For CTB V4/V5 profiles, open the material's **Timing** tab and enable
**Use per-layer CTB settings**. This switch governs both per-layer timing and
range lift/retract motion. Set separate bottom and normal timings. Range overrides use
inclusive, one-based **model layer** numbers. Single-layer overrides use the
same start and end. Later matching rules take precedence only for the fields
they specify. The LOD calculator adds constant-speed motion time to the desired
pre-exposure rest; it leaves the independent wait fields unchanged.

Simple CTB has separate bottom and normal PWM controls, like Two Stage and All
Fields. Set new bottom/normal values from 1 to 100%. A range may set PWM from 0
to 100%; blank leaves an earlier matching PWM in place, or inherits the bottom
or normal default. Later matching ranges replace PWM only when they set it,
independently of timing and motion overrides. Explicit range 0% exports PWM
byte 0. A legacy bottom/normal default of 0 keeps its full-power fallback.
With per-layer timing enabled, the percentage is rounded to a 0–255 byte; the
inspector shows that stored byte and its percentage. Legacy native defaults
outside the per-layer plan retain their existing encoding. Range PWM follows
the enabled CTB timing gate for plain or encrypted V4/V5 in Simple, Two Stage,
and All Fields.

For Phase 0.4, a range can also override lift and retract motion when enabled
CTB timing uses V4/V5, plain or encrypted, in Simple or Two Stage. All Fields
still rejects range motion overrides. No firmware identification or
confirmation is required. The encoded file and inspector show the written
values; confirm behavior on the intended printer separately.

In the Timing tab, blank motion fields inherit independently from the bottom
or normal settings; later matching ranges win per field. Simple mode exposes
lift travel and lift/retract speeds, with retract travel equal to total lift.
Two Stage mode also exposes the second lift stage and the second-stage retract
distance and speed. Retract stage 1 uses the remaining travel. The startup
dummy is outside the one-based model-layer ranges.

Choose a default or range in the LOD calculator, review the effective motion,
then click **Apply raw LOD**. A default Apply changes only that default. If a
range spans different effective motion, split it into the shown homogeneous
groups before applying a value to each group. A motion or calculator input
change after Apply leaves saved raw LOD and waits untouched and prompts you to
reapply. Invalid speeds or a retract split larger than total lift show errors
and block export until corrected. If Two Stage values remain after switching
to Simple, clear them in the Timing tab or switch back to Two Stage.

The optional startup dummy adds one file layer before model layer 1. It uses a
tiny pixel, short exposure, fixed PWM byte 1 and minimal lift. It shares the
first real layer's Z; every model layer retains its original Z and raster sample
height.
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
