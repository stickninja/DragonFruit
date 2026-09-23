# Fork roadmap

This roadmap orders the accepted changes to this fork. Complete and review each phase's acceptance checks, then obtain the user's explicit acceptance before starting the next phase or publishing a release. Keep upstream changes easy to merge by limiting edits to the active phase. Follow the developer guide's [architecture](dev/architecture-overview.md), [storage contract](dev/data-storage.md), and [documentation standards](dev/contributing.md) as behavior changes.

| Phase | Scope | Exit condition |
| --- | --- | --- |
| 0.1 | Configurable output filenames, including a saved pattern and live preview. | [Phase 0.1 acceptance](phase-1-acceptance.md) is met and accepted by the user. |
| 0.2 | Material colors and independent variants. | Define acceptance checks with representative workflows, implement and verify them, then obtain user acceptance. |
| 0.3 | CTB timing; individual and range overrides; an LOD calculator; startup dummy; and a per-layer preview inspector. Cover Saturn 2 and Saturn 3, simple and TSMC workflows. | Define acceptance checks using representative printer profiles and output inspection, implement and verify them, then obtain user acceptance. |
| 0.4 | Multiple visible build plates sharing one printer and material selection. | Define acceptance checks for plate visibility, assignment, slicing, and saved scenes, implement and verify them, then obtain user acceptance. |

## Release boundary

The upstream project currently reports version `0.1.9`. This fork's first planned milestone is **0.1.0**. Before distributing a fork installer, review its version, updater destination and signing, and Windows installer identity; the current updater points to upstream feeds. Keep packaging decisions separate from Phase 0.1 feature work.
