# Fork build versioning

This fork retains a separate installed app identity while integrating upstream code. `package.json` is the source for three distinct values:

- `version` is the monotonic package version. `scripts/sync-app-version.mjs` copies it into the Tauri bundle and Rust package. The current 0.1.17 integration candidate uses 0.4.3 so it can upgrade earlier fork packages, including 0.4.2.
- `upstreamVersion` identifies the upstream code baseline, currently 0.1.17.
- `forkRevision` identifies a fork design iteration on that baseline. The current candidate UI combines these as `0.1.17 · stickninja r3`.

`next.config.ts` exposes the values to the frontend. `src/config/forkVersion.ts` forms the shared display label used by the About panel and empty-scene welcome screen, while copied build diagnostics retain the internal package version. Bump `version` for each installable upgrade; change `upstreamVersion` only when the baseline changes, and increment `forkRevision` when shipping another fork iteration on the same baseline. Do not let a sync script copy the display version into a package manifest.

On 2026-10-16 the user requested the r2 label and package 0.4.2 to distinguish
the corrected review candidate from older r1 installations. This is an
unreleased test candidate, not phase acceptance or release authorization. Version
metadata alone does not establish that a new build was installed: launch through
the normal shortcut and verify the About label, its build-ref tooltip, and copied
package diagnostics in that running window. Filesystem hashes from a different
launch context do not establish which build the user opened. Keep any package
cache or device-specific paths out of public records.

On 2026-10-17 the user authorized r3/package 0.4.3 for the continued support
geometry correction. Its production frontend and Windows x64/NSIS build passed
from source `07bb38ba`. Native setup completed successfully in the normal
installation; its welcome badge, subsequent native About reading, and executable
identity confirmed installed r3. No build-ref tooltip or copied diagnostics were
captured in that About check; package 0.4.3 is established by build metadata.
The user accepted Support Studio Stages 2/3 together on 2026-10-17, reporting
optimization working; remaining refinement is support-size/auto-support preset
tuning. Earlier r2/package 0.4.2 evidence retains its historical identity. This
remains an unpublished candidate; Phase 0.5 overall is unaccepted, and no public
release or next-stage implementation is authorized.

The bundle uses `io.github.stickninja.dragonfruit`, `DragonFruit (stickninja)`, and `dragonfruit-stickninja`. Its Windows bundle omits official `.voxl` association and COM registration. Updates remain manual through the fork releases page; no upstream updater key or feed is configured. The integration acceptance record is [Phase 0.5](../upstream-0.1.17-acceptance.md), and the release boundary is in the [fork roadmap](../fork-roadmap.md).

## Local build storage

Store installers, review artifacts, and private build diagnostics in the
repository-local `builds/` directory, which stays untracked. Keep each review's
artifacts together; existing folders are `support-studio-bracing/`,
`support-studio-cluster/`, and `support-studio-grid/`. Record only shareable
verification results in the relevant acceptance document; keep personal paths,
device files, and their contents out of public documentation and commits.

`builds/windows-migration-cache/` archives local Windows dependency and build
caches separately from active dependencies. These archives preserve migration
material; they do not establish a working Linux environment. Linux build and
runtime validation remain pending. Historical Windows verification and stage
acceptance records retain their original scope; this workspace cleanup does not
accept Phase 0.5 or authorize the next stage or a release.
