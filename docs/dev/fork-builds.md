# Fork build versioning

This fork retains a separate installed app identity while integrating upstream code. `package.json` is the source for three distinct values:

- `version` is the monotonic package version. `scripts/sync-app-version.mjs` copies it into the Tauri bundle and Rust package. The 0.1.17 integration uses 0.4.1 so it can upgrade an installed 0.4.0 fork package.
- `upstreamVersion` identifies the upstream code baseline, currently 0.1.17.
- `forkRevision` identifies a fork design iteration on that baseline. The UI combines these as `0.1.17 · stickninja r1`.

`next.config.ts` exposes the values to the frontend. `src/config/forkVersion.ts` forms the shared display label used by the About panel and empty-scene welcome screen, while copied build diagnostics retain the internal package version. Bump `version` for each installable upgrade; change `upstreamVersion` only when the baseline changes, and increment `forkRevision` when shipping another fork iteration on the same baseline. Do not let a sync script copy the display version into a package manifest.

The bundle uses `io.github.stickninja.dragonfruit`, `DragonFruit (stickninja)`, and `dragonfruit-stickninja`. Its Windows bundle omits official `.voxl` association and COM registration. Updates remain manual through the fork releases page; no upstream updater key or feed is configured. The integration acceptance record is [Phase 0.5](../upstream-0.1.17-acceptance.md), and the release boundary is in the [fork roadmap](../fork-roadmap.md).
