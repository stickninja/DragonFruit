# Upstream 0.1.17 integration acceptance

Phase 0.5 is in progress. The user approved the proposed 0.1.17 migration designs except the layer inspector redesign. Keep the current encoded layer inspector. Do not publish a release or start the next roadmap phase until these checks are completed and the user explicitly accepts this phase.

On 2026-10-16 the user requested the distinguishable r2/package 0.4.2
candidate. Its normal running application identity and later actual-scene
Preview operability were confirmed; see the [Support Studio follow-up
record](support-studio-grid-acceptance.md). On 2026-10-17 the user authorized
r3/package 0.4.3 for the continued support geometry correction. That unpublished
candidate's production frontend and Windows x64/NSIS build passed from source
`07bb38ba`. Normal native setup completed successfully, and its welcome badge
plus normal-process identity confirmed installed r3; a subsequent native About
screenshot and accessibility reading also confirmed `0.1.17 · stickninja r3`.
The build-ref tooltip and copied diagnostics were not captured; package 0.4.3 is
established by build metadata. Actual-scene geometry review remains pending. Earlier build and installation evidence retains its recorded source
and version identity. Phase 0.5 and Support Studio Stages 2/3 remain unaccepted,
and no public release is authorized.

## Required checks

| Area | Acceptance check | Status |
| --- | --- | --- |
| Native plates | Add, rename, select, hide, move, and delete plates; verify model assignment and saved VOXL scene round trips. | Browser add, rename, select, delete, per-model hide/show, cross-plate move/undo, and VOXL round trip passed; separate whole-plate visibility and native-app check pending |
| Slicing | Slice the current plate and all populated plates; verify each plate's bounds, geometry, thumbnail, progress, and Printing handoff. | Browser scene setup, VOXL round trip, and native CTB contract tests passed; native GUI slicing and handoff pending |
| Filenames | Existing saved patterns load; placeholder chips and mm/µm control edit the pattern; preview matches the selected printer, material, plate, and extension. Batch names stay unique, unsafe characters are adjusted, unknown placeholders block saving, and one job can override its proposed name. | Unit checks and focused browser editor checks passed; native file and manual override checks pending |
| Export | Individual and all-plate exports use the intended names and locations; existing files trigger an overwrite decision before a batch writes. | Pending manual check |
| Fork features | Material color variants, resin conversions, CTB timing, range motion and PWM, and the existing encoded inspector round trip through 0.1.17. | Focused material/timing and variant-switching browser checks, resin conversion unit tests, and native CTB encode/decode contracts passed; GUI print mass/cost readback, GUI slice, and inspector handoff pending |
| Installer boundary | The fork upgrades its own 0.4.0 installation, keeps separate data and executable identity, leaves official file associations and COM thumbnail registration alone, and offers manual fork updates. | Windows NSIS package built and fork PE identity verified; installation, upgrade, and association checks pending |
| Build and docs | Install dependencies, run TypeScript, targeted tests, build, documentation, and CI checks on the integrated tree. | TypeScript, tests, lint, i18n, docs, plugin guards, production frontend build, and Windows release package passed |

## Checks actually performed

- Filename parser unit tests: 11 passed locally on 2026-10-15, including distinct plate names, explicit output extension, long Unicode name truncation, and saved pattern unit conversion. This tests pure naming logic; it does not verify native file output.
- TypeScript passed with `npx tsc --noEmit --pretty false` on 2026-10-15 after integration fixes.
- Focused headless Edge checks against the development app passed on 2026-10-15: Settings → Slicing opened; the example timestamp remained fixed during edits; switching an existing layer-height token to µm updated the pattern and preview; a plate token inserted at the cursor; invalid filename syntax blocked Apply without changing saved storage; Cancel discarded a draft; Apply persisted a valid pattern across reopening. There were no page errors. This did not write a native slice file.
- Separate headless browser plate QA imported a synthetic STL on Plate 1, added and renamed Plate 2, imported a second STL there, and verified one assigned model per plate while switching between them. A two-plate VOXL was downloaded (65,933 bytes); deleting Plate 2 and undoing restored its model; clearing the scene and reimporting the saved VOXL restored both plates and their assigned models. Hide/move were not exercised. The reimport offered a printer switch despite equal displayed name and dimensions; the check kept the current printer. This browser run did not use the native slicer, read a CTB file, or connect to hardware.
- A later production-server browser run reloaded the two-plate VOXL with both names and one model per plate. Hiding the second plate's model removed its canvas mesh and changed the active layer count to zero; Show restored the mesh and count of 200. Moving the original model across the plate boundary using Transform Move X reassigned it (sidebar counts 0/2); Undo restored counts of 1/1. Hide/Show are per-model controls; no separate whole-plate visibility control was exposed. The production UI had no development indicator. The run logged an uncompiled-message warning and a 593 ms main-thread stall warning, and did not exercise native slicing or hardware.
- The earlier development-server browser session logged a TopBar branding hydration warning whose conditional icon shadow was verified unchanged from both input trees. It also captured temporary hot-reload parser errors while the material editor source was being changed during the run; those are development-session edit errors, separate from the committed candidate's checks.
- Focused material-editor browser QA used a synthetic Saturn 2 fixture. A color value of `#9A6FBD`, 1.25 kg quantity, and 1.18 density persisted after reload. Burn-in and normal PWM values of 84% and 76% remained independent. The light-off-delay calculator applied 58.4 s while three normal wait values stayed unchanged. A range's explicit 0% PWM persisted, then clearing it removed the override; four named overlapping ranges persisted. Duplicate copied unsaved color, quantity, and density into an independent material; New color copied unsaved quantity and density into a separate Teal variant. The editor and document fit a 960 × 600 viewport.
- A separate disabled-plan browser path showed inactive CTB timing fields and visible Simple legacy waits while PWM stayed enabled; enabling the CTB timing plan persisted, and a fresh material started with that plan disabled. Browser checks verify editor state and persistence, not encoded output or physical printer behavior.
- The material and filename editor checks were rerun against the production server and passed without page errors. The production material script also switched between the saved Teal and Grey variant chips, confirmed distinct material IDs and persisted Teal quantity of 1.3, then returned to the copied material. Review images below show that production UI with synthetic printer/material data; the values are test fixtures, not printer-setting recommendations.
- Native CTB tests passed eight checks for image round trip, PWM zero/full-scale/quantization, legacy bottom/default behavior, dummy bottom counts, invalid-plan rejection, JavaScript Z rounding, and independent waits; one fixture-dependent test was initially ignored. That test was then run explicitly with generated frontend JSON plans and passed 16 encode/decode combinations: V4/V5, plain/encrypted, Simple/Two Stage, and dummy off/on. It checked plan estimates, per-layer flags, PWM, lift/retract stages, light-off delay, wait-before-cure, and physical Z in synthetic CTB files. These are native contract tests, not a GUI slice, encoded-inspector readback, firmware, or hardware test. The encoded inspector's diff against the accepted fork only changes its atom import and removes an unused prop; its design and readback code remain intact.
- On 2026-10-15, the full unit suite passed 1,888 tests with one skipped; the DOM suite passed 30 tests; and the clean-directory lint check passed all 42 directories. These suites ran before the final source-snapshot and UI polish; the focused filename tests and TypeScript check were rerun afterward.
- Documentation accuracy passed for 166 documents, i18n literal checks passed for 59 paths and 162 files, and plugin allowlist, generated-registry, and boundary checks passed on 2026-10-15. The production frontend build compiled in 38.3 s, passed its TypeScript step, and produced 15 static pages. The prepared frontend bundle was checked for `.git` metadata and contained none.
- Static installer/update audit on 2026-10-15 found the fork product name, executable, bundle identifier, and publisher in Tauri configuration; updater artifacts disabled; the Windows NSIS hook limited to the Visual C++ prerequisite and styling; and Settings linking to the fork releases page. This does not prove an installed 0.4.0 upgrades cleanly or that Windows associations remain unchanged on a real machine.
- The first Windows native package attempt stopped when Git's path-length limit blocked a TBB dependency checkout. A retry using process-scoped Git long-path support and a Windows PowerShell module-path workaround completed an optimized release build in 8 min 8 s from source commit `d9f83b0d`. It produced the NSIS installer `DragonFruit (stickninja)_0.4.1_x64-setup.exe` (21,979,236 bytes; SHA-256 `6C8385FA400FC0CE0F361941893EF14526A86AD46B3F528B652709ECB3866D51`). The executable's PE metadata reports ProductName `DragonFruit (stickninja)`, ProductVersion/FileVersion `0.4.1`, and CompanyName `stickninja`. The installer has not been installed or published. The packaged executable has no headless CLI, so no CLI smoke test was run; installed-app slicing, 0.4.0 upgrade, and association behavior remain pending.

## Production UI review images

These screenshots use a synthetic Saturn 2 review fixture and synthetic resin data. They show layout and interaction states, not recommended settings for a printer.

| Materials | CTB timing | Delay calculator |
| --- | --- | --- |
| [Color variants and material](images/upstream-0.1.17-review/01-materials.png) | [Timing defaults](images/upstream-0.1.17-review/02-timing.png) | [Calculated delay](images/upstream-0.1.17-review/03-delay-calculator.png) |
| [Layer overrides](images/upstream-0.1.17-review/04-layer-overrides.png) | [Filename settings](images/upstream-0.1.17-review/05-filename-settings.png) | [Multiple plates](images/upstream-0.1.17-review/06-multiple-plates.png) |

Record later installation, native-app, and hardware checks here only after they are performed. Physical printer behavior remains separate from encoded-file verification.
