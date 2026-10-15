# Upstream 0.1.17 integration acceptance

Phase 0.5 is in progress. The user approved the proposed 0.1.17 migration designs except the layer inspector redesign. Keep the current encoded layer inspector. Do not publish a release or start the next roadmap phase until these checks are completed and the user explicitly accepts this phase.

## Required checks

| Area | Acceptance check | Status |
| --- | --- | --- |
| Native plates | Add, rename, select, hide, move, and delete plates; verify model assignment and saved VOXL scene round trips. | Pending manual check |
| Slicing | Slice the current plate and all populated plates; verify each plate's bounds, geometry, thumbnail, progress, and Printing handoff. | Pending manual check |
| Filenames | Existing saved patterns load; placeholder chips and mm/µm control edit the pattern; preview matches the selected printer, material, plate, and extension. Batch names stay unique, unsafe characters are adjusted, unknown placeholders block saving, and one job can override its proposed name. | Unit checks and focused browser editor checks passed; native file and manual override checks pending |
| Export | Individual and all-plate exports use the intended names and locations; existing files trigger an overwrite decision before a batch writes. | Pending manual check |
| Fork features | Material color variants, resin conversions, CTB timing, range motion and PWM, and the existing encoded inspector round trip through 0.1.17. | Pending integration checks |
| Installer boundary | The fork upgrades its own 0.4.0 installation, keeps separate data and executable identity, leaves official file associations and COM thumbnail registration alone, and offers manual fork updates. | Pending Windows package and upgrade check |
| Build and docs | Install dependencies, run TypeScript, targeted tests, build, documentation, and CI checks on the integrated tree. | TypeScript, tests, lint, i18n, docs, and plugin guards passed; full build and native package pending |

## Checks actually performed

- Filename parser unit tests: 11 passed locally on 2026-10-15, including distinct plate names, explicit output extension, long Unicode name truncation, and saved pattern unit conversion. This tests pure naming logic; it does not verify native file output.
- TypeScript passed with `npx tsc --noEmit --pretty false` on 2026-10-15 after integration fixes.
- Focused headless Edge checks against the development app passed on 2026-10-15: Settings → Slicing opened; the example timestamp remained fixed during edits; switching an existing layer-height token to µm updated the pattern and preview; a plate token inserted at the cursor; invalid filename syntax blocked Apply without changing saved storage; Cancel discarded a draft; Apply persisted a valid pattern across reopening. There were no page errors. This did not write a native slice file.
- On 2026-10-15, the full unit suite passed 1,888 tests with one skipped; the DOM suite passed 30 tests; and the clean-directory lint check passed all 42 directories. These suites ran before the final source-snapshot and UI polish; the focused filename tests and TypeScript check were rerun afterward.
- Documentation accuracy passed for 166 documents, i18n literal checks passed for 59 paths and 162 files, and plugin allowlist, generated-registry, and boundary checks passed on 2026-10-15. The full build and native package remain pending.
- Static installer/update audit on 2026-10-15 found the fork product name, executable, bundle identifier, and publisher in Tauri configuration; updater artifacts disabled; the Windows NSIS hook limited to the Visual C++ prerequisite and styling; and Settings linking to the fork releases page. This does not prove an installed 0.4.0 upgrades cleanly or that Windows associations remain unchanged on a real machine.

Record later UI, build, package, and hardware checks here only after they are performed. Physical printer behavior remains separate from encoded-file verification.
