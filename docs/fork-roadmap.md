# Fork roadmap

This roadmap orders the accepted changes to this fork. Complete and review each phase's acceptance checks, then obtain the user's explicit acceptance before starting the next phase or publishing a release. Keep upstream changes easy to merge by limiting edits to the active phase. Follow the developer guide's [architecture](dev/architecture-overview.md), [storage contract](dev/data-storage.md), and [documentation standards](dev/contributing.md) as behavior changes.

| Phase | Scope | Status or exit condition |
| --- | --- | --- |
| 0.1 | Configurable output filenames, including a saved pattern and live preview. | **Accepted by the user on 2026-09-23.** See [verification and remaining limits](phase-1-acceptance.md). |
| 0.2 | Material colors and independent variants. | Define acceptance checks with representative workflows, implement and verify them, then obtain user acceptance. |
| 0.3 | CTB timing; individual and range overrides; an LOD calculator; startup dummy; and a per-layer preview inspector. Cover Saturn 2 and Saturn 3, simple and TSMC workflows. | Define acceptance checks using representative printer profiles and output inspection, implement and verify them, then obtain user acceptance. |
| 0.4 | Multiple visible build plates sharing one printer and material selection. | Define acceptance checks for plate visibility, assignment, slicing, and saved scenes, implement and verify them, then obtain user acceptance. |

## Release boundary

The fork is based on the upstream `0.1.9` baseline. Its first Windows package is **0.1.0**, separate from the accepted Phase 0.1 feature. The unsigned Windows x64 NSIS package uses product name **DragonFruit (stickninja)**, publisher **stickninja**, identifier `io.github.stickninja.dragonfruit`, and executable `dragonfruit-stickninja`. It has separate app data and profiles, leaves the official installation and `.voxl` registration intact, and omits automatic migration and COM thumbnail registration. Updates are manual from the fork's releases until its own signed updater and feed are ready. The optimized build and silent installer check passed. See the [0.1.0 release notes](releases/0.1.0.md).
