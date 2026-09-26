# Fork roadmap

This roadmap orders the accepted changes to this fork. Complete and review each phase's acceptance checks, then obtain the user's explicit acceptance before starting the next phase or publishing a release. Keep upstream changes easy to merge by limiting edits to the active phase. Follow the developer guide's [architecture](dev/architecture-overview.md), [storage contract](dev/data-storage.md), and [documentation standards](dev/contributing.md) as behavior changes.

| Phase | Scope | Status or exit condition |
| --- | --- | --- |
| 0.1 | Configurable output filenames, including a saved pattern and live preview. | **Accepted by the user on 2026-09-23.** See [verification and remaining limits](phase-1-acceptance.md). |
| 0.2 | Material colors and independent variants. | **Accepted by the user on 2026-09-24.** See [verification and remaining limits](phase-2-acceptance.md). |
| 0.3 | CTB timing; individual and range overrides; an LOD calculator; startup dummy; and a per-layer preview inspector. Cover Saturn 2 and Saturn 3, simple and TSMC workflows. | **Accepted by the user on 2026-09-26.** See [verification and remaining limits](phase-3-acceptance.md). |
| 0.4 | Resin quantity and cost conversions; per-layer lift and retract overrides. | **Planned next; not begun.** See the scope and acceptance outline below. |
| 0.5 | Multiple visible build plates sharing one printer and material selection. | Planned after Phase 0.4 acceptance. Define checks for plate visibility, assignment, slicing, and saved scenes, then implement, verify, and obtain user acceptance. |

## Phase 0.4 planned scope and acceptance

Phase 0.4 adds resin quantity/cost conversions for material/color profiles. It also plans per-layer motion overrides for CTB V4/V5 as an initial candidate, including encrypted variants. The first version continues to use one shared printer and material selection.

Resin profiles retain a weight entry in grams or kilograms, or a volume entry in millilitres, and an uncured-liquid density in g/mL for each material/color. Convert between weight and volume only with a positive finite density; if density is missing or invalid, keep volume entry valid and do not assume a value. The app computes equivalent resin volume, print mass, and cost from the effective material settings. Existing volume-based profiles remain valid and keep their current values and behavior.

Build on the existing one-based range workflow and resolved per-layer export/inspector plan. Add motion overrides for individual model layers and inclusive model-layer ranges, excluding the startup dummy. Support Simple and Two Stage settings according to Settings Mode, including lift and retract distances and speeds, and the per-stage retract split for Two Stage. Each field can inherit independently; when ranges overlap, the later matching override wins. Bottom and normal lift/retract settings remain the fallback. Two-stage constraints must remain valid, including retract distances relative to total lift. The LOD calculator uses effective overridden motion and must not silently overwrite raw user LOD or wait values; it must detect stale calculated values or require explicit reapplication. The inspector reads motion from exported output, and estimates use the effective values.

Acceptance will verify:

- Grams/kilograms and millilitres convert using a positive finite uncured-resin density for that material/color, with expected volume, mass, and cost. Missing or invalid density does not block volume entry or lead to an assumed conversion value; legacy volume profiles load and round-trip unchanged.
- Layer, range, and bottom/normal fallback values resolve with one-based inclusive boundaries, excluding the startup dummy; per-field inheritance; later-range precedence; Simple and Two Stage Settings Mode behavior; and valid two-stage lift/retract relationships.
- Calculated and estimated motion reflects effective overrides without silently replacing user-entered LOD or waits; stale results are detected or recalculation is explicitly applied. When a selected range spans different effective motion from defaults or overlapping overrides, calculate/preview per affected layer or split the range into homogeneous motion groups so one incorrect LOD value is not applied across the range.
- For printer/firmware combinations restricted to bottom/normal settings (including the reported Anycubic cases), retain those controls and mark range motion overrides unavailable until verified. Capability checks account for both output format/version and printer firmware; do not assume every CTB V4/V5 printer supports every field.
- Persisted overrides, material/color variants, duplication, and import/export round trips retain the intended settings. Independently decode exported files and compare their motion values with the UI and inspector; distinguish file-content checks from actual hardware behavior and verify supported printer models separately.

## Release boundary

The fork is based on the upstream `0.1.9` baseline. Its first Windows package was **0.1.0**, separate from the accepted Phase 0.1 feature. The unsigned Windows x64 NSIS package uses product name **DragonFruit (stickninja)**, publisher **stickninja**, identifier `io.github.stickninja.dragonfruit`, and executable `dragonfruit-stickninja`. It has separate app data and profiles, leaves the official installation and `.voxl` registration intact, and omits automatic migration and COM thumbnail registration. The **0.2.0** and **0.3.0** packages have passed optimized builds and upgrade installation checks. Updates are manual from the fork's releases until its own signed updater and feed are ready. See the [0.1.0](releases/0.1.0.md), [0.2.0](releases/0.2.0.md), and [0.3.0 release notes](releases/0.3.0.md).
