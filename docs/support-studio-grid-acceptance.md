# Support Studio Stage 3: Grid Optimization acceptance

Status: **accepted by the user on 2026-10-17 as part of combined Stage 2/3 review of installed 0.1.17 · stickninja r3, package 0.4.3.** The user reported optimization is working; remaining refinement concerns support sizes and auto-support presets. This does not accept Phase 0.5 overall or authorize a public release, version bump, or next-stage implementation. Historical checks and unperformed manual/physical scenarios remain distinguished below.

## Combined Stage 2/3 acceptance — 2026-10-17

The user explicitly accepted the r3 optimization changes on installed
**0.1.17 · stickninja r3**, package **0.4.3**, reporting that optimization is
working. The remaining refinement is support-size and auto-support preset
tuning, rather than an unresolved optimizer defect. This accepts Stage 2 Cluster
Optimization and Stage 3 Grid Optimization together.

Acceptance does not imply that every detailed manual, actual-scene history,
or physical-print check below was independently performed. Earlier pending
statements describe their historical verification points; the evidence and
remaining limits remain recorded. Phase 0.5 overall remains separate and
unaccepted. Stage 4 is ready for separate instruction; this acceptance does not
authorize its implementation, a version bump, or public release.

## Scope and agreed intent

Grid Optimization aligns the roots and lower shafts of explicitly selected grounded trunks to DragonFruit's existing zero-origin XY lattice. Preserve every existing model contact's position, orientation, contact-cone geometry, and profile. Reuse existing grid math, shaft/knot geometry, collision rules, and bracing contracts. Keep the selected model, active plate, and unrelated supports intact. Grid Optimization does not reduce or merge trunks; Cluster Optimization remains the separate reduction operation.

Support Studio's **Optimize** card offers **Cluster** and **Grid**. The existing **Grid** placement tab keeps its placement settings and behavior. Grid optimization controls and preview are temporary and add no persisted setting or scene schema. Preview is isolated; Apply commits a current proposal as one undoable graph replacement. Unsafe or unsupported candidates remain unchanged with a reported reason. Advanced Placement and support influence are outside this stage.

## Acceptance checks

Statuses distinguish completed synthetic automation, development/production browser review, and builds from pending native and broader manual scenarios. A planned manual check is not evidence of completion.

| Area | Required behavior | Status |
| --- | --- | --- |
| Lattice and selection | Selected eligible grounded trunks align root XY and vertical lower legs to the requested spacing using the existing zero-origin grid math. Negative coordinates and half-step ties agree with placement. No whole-model fallback or implicit trunk reduction/merge. Already aligned and empty/no-op selections remain unchanged. | Automated fixtures and development/production browser alignment passed; native review pending |
| Exact contacts | Compare all model contacts before/after, including position, normal/orientation, tip profile, diameter, penetration, socket identity, and contact-cone geometry. No model contact moves or disappears. | Automated exact-cone and codec checks passed; development/production browser contact counts preserved; native review pending |
| Broad geometry | Cover short/tall trunks, offset and already aligned roots, rotated/scaled model context, edge-of-plate roots, blocked preferred nodes, alternate nodes, cramped geometry, curved spans, and malformed/unsupported geometry. Safe cases align; unsafe cases skip without graph damage. | Automated short/tall, tiny shifts, bounds, blocked/alternate nodes, curved/malformed fixtures passed; rotated/scaled model and broader native/manual review pending |
| Dependencies | Preserve existing branches, leaves, knots, shared joints, and their world attachment positions or skip the trunk. Verify valid segment references and normalized attachment positions; protect kickstands, shared roots, and unsupported low attachments. | Automated branch/leaf/manual-brace world geometry and unsafe dependent checks passed; native/manual review pending |
| Node ownership | Respect occupied nodes from selected and unselected trunks, considering root and contact ownership. Do not overlap a second pillar or silently replace an existing owner. | Automated root/contact owners, alternate nodes, and competing selected roots passed; native/manual review pending |
| Bounds and collisions | Full root footprints remain within active plate bounds. Moved roots, lower legs, and diagonals respect model, neighboring model, support, brace, and root collision checks and length-aware angle rules. Bounded search reports failure without unbounded work. | Automated full-root bounds, shaft/root/brace and own/neighboring-mesh checks passed; native/manual review pending |
| Bracing | Preserve manual braces, links outside selection, shared knots, and kickstands. Regenerate only disposable automatic braces internal to affected selected trunks under the current Stage 1 sizing/pattern settings. Verify relative uniform diameters and both attachment endpoints. | Automated regeneration, stationary links, external links, Crosses preservation, and rejected-link cleanup passed; Grid-specific relative-size and native/manual review pending |
| Ownership | Reject mixed-model selections, inactive, locked or changed plates, and reassignment. Keep other models/plates and unselected graph entities intact. | Automated model/plate/lock guards passed; browser/native review pending |
| Preview lifecycle | Preview, repeated preview, Cancel, switching Cluster/Grid, leaving Optimize, and no-op/failure do not mutate committed graph, selection, settings, history, or serialized scene. Ephemeral geometry suppresses editing consistently with Cluster preview. | Controller, DOM, and development/production browser Preview/Cancel/tool-switching checks passed; native review pending |
| Staleness | Selection, graph, Undo/Redo, options, model mesh/transforms, active/model plate, plate bounds, or relevant bracing/grid context changes invalidate a proposal. Apply revalidates the full context and cannot commit stale geometry. | Controller/DOM checks passed, including locks/bounds and normalized settings; development/production browser option staleness passed; native review pending |
| Atomic history | Apply produces one typed support edit. One Undo restores the complete previous graph; one Redo restores the aligned graph with contacts/dependents/braces intact. Repeated cycles are stable; no-op and Cancel create no entry. | Controller/DOM checks and development/production browser Apply/Undo/Redo passed; native cycles pending |
| Save/reopen | Applied geometry survives ordinary binary VOXL save/parse/store reload with exact contacts, valid knots, ownership, and braces. Legacy scenes and Stage 1 settings remain compatible. Preview/options do not serialize. Distinguish codec automation from actual browser/native save/reopen. | Actual binary VOXL serialization/parse/store roundtrip passed; browser/native save/reopen pending |
| UI/localization | Cluster and Grid choices, numeric controls/units, summaries, skip/no-op/failure feedback, and disabled/stale states are usable at compact sizes. Extract and compile all catalog messages; test compact production IDs. Verify the existing Grid placement tab. | DOM/catalog/localization checks and development/production browser 1280 × 800 review passed; native review pending |
| Integration/build | Record core, controller, DOM, support/scene regressions, TypeScript, relevant lint/localization gates, docs accuracy, optimized frontend and any Windows build actually performed. Preserve Stage 2 behavior. | 915 support/VOXL unit tests, DOM, TypeScript, lint/localization/docs gates, and development/production browser checks passed; Windows x64/NSIS build passed; installation/native evidence pending |

## Checks actually performed

On 2026-10-16 an external synthetic browser fixture was prepared with the actual
trunk builder and binary VOXL codec: a centered 22 × 14 × 2 mm slab whose saved
transform places its underside at Z = 25 mm, with eight 1.2 mm grounded trunks.
Root/contact XY coordinates are deliberately offset from a 2 mm lattice.
Parsing confirmed eight trunks, eight roots, and an embedded 12-triangle mesh.
The pure Grid planner smoke run with 2 mm spacing, 2 mm maximum movement, 45°
maximum join angle, and ample plate bounds aligned all eight trunks, retained
eight contacts before/after, and returned no skips. This verifies fixture
preparation and a basic planner case only; it does not establish UI behavior,
Apply/history, save/reopen, broad geometry, native behavior, or physical printing.
The fixture and helper remain outside the repository.

Documentation accuracy passed for 169 documents after the planner and controller
interfaces were present. The documentation whitespace diff check also passed.

### Automated implementation evidence

The final focused core/controller run passed **53/53 tests**: **20 Grid planner**,
**16 Cluster planner**, **11 Cluster preview**, and **6 Grid preview** cases.
The independent review found and repaired three regression risks: releasing
stationary automatic braces during another root's move, accepting nonfinite
hosted knot coordinates, and pruning the intentional Crosses brace pattern.
The final fixtures verify the fixes, plus regenerated-link checks against the
retained forest and removal of unused new knots after rejected links.

Planner fixtures cover exact contact objects/IDs and unmodified input,
branch/leaf/manual-brace world positions, unsafe low attachments, shared roots,
kickstands, root/contact node ownership, competing selected roots, short and
tiny shifts, movement/angle/bounds refusals, full-diameter shaft/root/brace
collisions, own and neighboring meshes, no-op/repeated alignment, malformed
spans, model/plate exclusion, internal automatic-brace regeneration, and
external-brace preservation. The actual binary VOXL roundtrip runs support
export, binary serialization, parse, and store reload; it checks aligned roots,
exact contacts, and dependent graph geometry. These are synthetic application
contract checks, not native save/reopen or physical-print checks.

A synthetic selection of **1,500 separated off-grid roots** aligned in observed
pure-planner runs of approximately **124–136 ms**. The search is limited to nine
nearby nodes per root and 6000 geometry candidates per run. This records one
fixture's behavior and bounded search, not a general performance guarantee.

The final DOM run passed **11/11 tests**: ten optimization cases and the existing
Stage 1 auto-bracing case. Optimization coverage includes both tools, controls,
Preview/Apply/Undo, failures, normalized settings, Cluster/Grid option
preservation, plate locking, and bounds invalidation. The compiled production-ID
catalog regressions passed **12/12 tests** across all six locales for the two
optimization tools. Catalog extraction and compilation ran; new target-locale
messages remain untranslated for Crowdin. The localization literal gate passed
**62 paths / 166 files**. TypeScript and scoped ESLint passed with zero lint
warnings. The primary broad support/VOXL unit suite passed **915/915 tests**;
the routine lint gate passed **43 directories**. The shared preview refactor retains Cluster's dedicated API and its
regression coverage.

### Development browser evidence

The primary development-browser review exercised the actual Grid controls and
viewport with two selected trunks: both roots moved and both model contacts
were preserved. Preview, Cancel, switching tools (including a Cluster preview),
option-change staleness, Apply, Undo, and Redo passed. At **1280 × 800**, all
controls remained visible. The run reported **zero uncaught page errors**.
These are development-browser checks on the synthetic scene; they do not
establish production frontend, native installation/UI, or physical printing.

### Optimized frontend evidence

The optimized frontend build completed. The primary production-browser review
served the exact static assets prepared for embedding in the Windows application.
Grid passed actual viewport Preview, Cancel, tool switching, option-change
staleness, Apply, Undo, and Redo: two selected trunks shifted while retaining
their two model contacts. At **1280 × 800**, all controls remained visible.
The run reported **zero uncaught page errors**. The primary visually inspected
full-size and compact screenshots and found no raw catalog IDs or clipped
controls.

Cluster production regression review also passed Preview, Cancel, option-change
staleness, Apply, Undo, Redo, and the compact layout: seven selected trunks
reduced to four trunks while preserving seven contacts, with **zero uncaught
page errors**. This verifies the existing Stage 2 workflow after the shared
preview refactor; it does not mark Stage 2 accepted.

These images show the actual optimized frontend and synthetic scene. They
establish the recorded browser workflow, not native installation or print
strength.

![Stage 3 committed supports before grid optimization](assets/fork-support-studio/stage-3-grid-before.png)

![Stage 3 proposed grid geometry](assets/fork-support-studio/stage-3-grid-preview.png)

![Stage 3 compact production controls](assets/fork-support-studio/stage-3-grid-compact.png)

### Windows candidate build

Source commit `27acd6a0` produced the optimized frontend and Windows x64
executable/NSIS installer successfully with exit code 0. The release compilation
completed in 4 minutes 48 seconds. PE machine type `0x8664` identifies x64;
ProductName is `DragonFruit (stickninja)`, CompanyName is `stickninja`, and
ProductVersion remains `0.4.1`.

The local combined-review candidate is named
`DragonFruit-stickninja-grid-stage3-x64-setup.exe`, **21,987,643 bytes**, with
SHA-256 `B6F8C10B87EC934B1727F863F5D1CACFF1C4C880C11C072A7F212DD848128B24`.
The copied review artifact's hash matches the built installer. Documentation and
screenshots follow separately; the candidate's application source is the commit
above. This is an unpublished build for combined Stage 2/3 review. Installation,
native UI, remaining detailed manual scenarios, and physical printing have not
been independently verified. No release or version bump was performed.

### Follow-up: idle Preview eligibility

After the candidate above was built, user review reported a blocked Preview
with idle help text and a separate automatic support-generation failure.
Investigation confirmed that the optimization cards did not subscribe to mesh
registration until a preview existed. Opening Optimize before model geometry
registered could therefore leave Preview disabled after the geometry became
available.

Both Cluster and Grid cards now observe mesh registration while idle, using the
existing eligibility getter and retaining the selection/model/plate/lock guards.
Apply is also disabled when current eligibility fails. The focused compiled DOM
suite passed **13/13 tests**. New Cluster/Grid mesh-arrival and removal cases
failed before the fix and passed after it. A Cluster zero-to-one-to-two-trunk
selection case passed before the fix and remains a selection sanity check;
it does not reproduce the mesh-registration defect. TypeScript, scoped ESLint,
and the localization literal gate passed for the follow-up.

Source commit `261181db` includes the idle-eligibility fix. The primary review
of its optimized frontend passed Cluster selection after the card mounted,
Preview, Cancel, option-change staleness, Apply, Undo, Redo, and compact layout:
four selected trunks reduced to three retained trunks with four contacts
preserved. Grid's full browser workflow also passed with two trunks moved and
two contacts preserved. A Windows build of that source completed, but was
superseded by the separate dense-candidate correction below; it is not the final
replacement package.

These checks establish the confirmed idle-eligibility defect and synthetic
browser workflow. The cause of the user's actual blocked Preview has not yet
been verified in native use; this change has not been shown to resolve every
reported symptom.

### Follow-up: dense automatic-support candidates

A separate synthetic regression reproduced a numeric-maximum `RangeError`
with **652,392 minima**. Source commit `0a7334fa` replaces array-spread
maximum calculations for candidate height and area during scoring, and maximum
height in sizing diagnostics, with bounded-argument iteration. The same dense
fixture passed after the correction. The focused candidate-generation suite
passed **17 tests**, and worker/related coverage passed **14 tests**. This
confirms the dense scoring/diagnostics overflow and its correction; it does not
establish completion of a support-generation run on the user's actual model.

Native UI observation confirmed About displays upstream **0.1.17**, fork
**stickninja r1**, with the current preset enabled and a reported **652,392
minima**. The actual native Preview cause and user-model retest remain pending.

The Windows x64/NSIS build from `0a7334fa` completed successfully but is
superseded by the final replacement package below.
The earlier installer/hash above remains historical evidence for `27acd6a0`
and excludes the follow-up fixes.

### Follow-up: duplicate-position minima connectivity

A separate synthetic native scan found different minima counts for equivalent
cube geometry: eight shared vertices and twelve faces produced **one minimum**,
while thirty-six per-face vertices with the same twelve faces produced **ten
minima**. Welding exact duplicate positions in the analysis copy produced
**one minimum** for each representation.

The native correction uses the existing core connectivity groups on a private
analysis copy with exact duplicate positions welded. It preserves the original
source/world coordinates, face order, and original vertex references. Five
native module tests passed in an isolated harness, and the targeted full desktop
Rust tests passed **5/5**. The correction is committed in source `199f9bf2`
(full commit `199f9bf2c8dbf377e77188fde1e2069cc4968e07`).

The user's private 3MF has not been inspected, so the synthetic duplicate-index
case does not establish the cause of that file's reported minima count. Review
of the user-provided screenshot showed enabled-looking Preview,
disabled-looking Apply, and idle help text. The image does not establish actual
control eligibility, cursor state, or the cause of the reported interaction.
Native Preview behavior and a complete run on the user's actual model remain
pending.

### Final follow-up Windows candidate

Source `199f9bf2` built the final Windows x64 executable and NSIS installer
successfully with exit code 0. Rust release compilation took 4 minutes 45 seconds;
this is the compilation stage duration, not total build time. The executable's
PE machine type is `0x8664`, ProductName is `DragonFruit (stickninja)`, and
FileVersion/ProductVersion remain `0.4.1`.

The replacement review candidate is
`DragonFruit-stickninja-support-fixes-199f9bf2-x64-setup.exe`, **21,995,851 bytes**,
SHA-256 `98F113290C897975414652771A3CA3125578423EDC5110F138866F453D6BE35C`.
The built and copied review artifacts have matching hashes. This package includes
the idle mesh-eligibility, dense scoring/diagnostics overflow, and native
minima-connectivity fixes. Installation and launch verification are recorded
below. Native Preview verification and a complete user-model run remain pending.
No release or version bump was performed.

### Installation and launch of the follow-up candidate

The user confirmed the scene was saved and the application closed; the native
window list then confirmed no DragonFruit window remained. The silent NSIS
installer completed with exit code 0. The installed executable identifies as
`DragonFruit (stickninja)`, version `0.4.1`, **35,382,272 bytes**, SHA-256
`9E22966389CA9442565DA4F18ECBE29FD87BCC6978CA4286DBA1A95F6F6D4302`.
Byte comparison with the built executable matched except for the expected
three-byte Tauri bundle marker change from `UNK` to `NSS` made by NSIS packaging.

The installed application reopened in a native window and displayed upstream
**0.1.17**, fork **stickninja r1**. The saved scene opened, and Support Studio's
Optimize controls were visible. Control was left with the user when interaction
was detected. No new scan, support-generation run, or native optimization Preview
was performed during this check. Those behaviors remain pending; this evidence
does not establish shortcut, file-association, official-installation, or
profile-byte preservation checks.

### User retest after installation

The user confirmed automatic support generation works on the installed corrected
candidate and reported that Optimize still does not work. This is user-confirmed
generation behavior; it does not establish all topology, support-quality, or
physical-print acceptance checks.

Native review with ten selected trunks showed Preview enabled, Apply disabled,
and the idle helper. An attempted click was inconclusive because window movement
and cleared selection prevented a reliable interaction result. It is not recorded
as a passing Preview check and does not establish the cause. Native Optimize
behavior remains unresolved and requires further investigation.

### Follow-up: marquee-selected root ownership

Further native review with eight selected trunks displayed a model-selection
error. Investigation confirmed marquee selection also emits root IDs, while the
shared optimization guard looked only through support-type collections that
exclude roots. A valid same-model trunk-and-root selection was therefore
incorrectly rejected.

The correction uses the canonical entity-owner resolver for every selected ID,
accepting same-model roots and support parts while targeting only selected
trunks. The complete selection still participates in preview invalidation;
unknown or differently owned entities retain their guards.

Verification passed **27 controller/resolver tests** and **15 compiled DOM tests**.
Independent review also passed the 27 unit tests and two new DOM regressions,
plus ephemeral checks for both tools using same-model roots and trunks through
Preview, Apply, and a single Undo. Primary scoped lint and documentation checks
passed, and the frontend build passed with type checking. These checks establish
the selection-ownership correction in synthetic fixtures; they do not establish
native behavior. The four new unit and two DOM regressions failed before the
fix with the model-selection error and passed after it.

Actual pointer interaction in the optimized production frontend passed with
Optimize opened before selection. A right-to-left marquee included eight trunks
and visibly selected feet. Cluster reduced eight trunks to five, preserved eight
contacts, and reported three fewer trunks with two legitimate geometry skips.
Grid shifted all eight trunks, preserved eight contacts, and reported zero
unchanged trunks. Preview, Cancel, stale-limit feedback, and Apply passed for
both tools. Undo/Redo actions and screenshot review completed; this is visual
browser evidence, not a byte-for-byte browser history comparison. The primary
reviewed the Cluster preview and Grid applied screenshots. The run exited
successfully with zero uncaught page errors.

The Windows x64 executable and NSIS package built successfully with exit code 0
from source `ee63a6c6`. Rust release compilation took 5 minutes 10 seconds;
this is the compilation-stage duration. The candidate is
`DragonFruit-stickninja-optimize-marquee-ee63a6c6-x64-setup.exe`, **21,996,165 bytes**,
SHA-256 `52B38A63E2DCF7578A29F4B69E7567FF459422A6662033DB5AD1A5E9A42B24AD`.
The built and copied installer hashes match. The built executable identifies as
`DragonFruit (stickninja)`, version `0.4.1`, SHA-256
`243630FB3A5B92C341F8653EBD065876F1683C59BCDF3A2A0F9EF105D1044A8F`.

An initial packaging attempt encountered inherited PowerShell module-path
configuration. Retrying with Windows PowerShell modules in the build process's
environment succeeded; no repository build change was needed. No release or
version bump was performed.

The user saved and closed the scene, and process inspection confirmed no
DragonFruit process remained. Silent installation completed with exit code 0.
The installed executable is **35,382,272 bytes**, version `0.4.1`, SHA-256
`EABA4F34D0C705A938D07908B75C56DE02808CB6682F3FFEDB89EAC0B99766D8`.
Full byte comparison with the built executable differed only in the expected
three-byte Tauri bundle marker change from `UNK` to `NSS`.

A native test used an isolated WebView2 profile and a synthetic scene loaded
through the command-line interface. Actual mouse marquee selected eight trunks
and their feet. Preview reduced eight trunks to four while preserving eight
contacts; Cancel cleared the proposal; Apply reported one undoable change.
This confirms the root-selection guard correction in the native synthetic
fixture. The user's scene has not yet been retested.

A follow-up history-only run against that same applied scene passed with exit
code 0, without repeating Apply. The temporary harness sent actual Control/Shift
key-down and key-up events: Ctrl+Z displayed the Cluster optimization Undo toast,
restored eight straight trunks, and cleared the applied summary. Ctrl+Shift+Z
displayed the Redo toast and restored four trunks with diagonal branches. The
primary visually reviewed the before, Undo, and Redo captures. This establishes
native Cluster Preview/Cancel/Apply/Undo/Redo on the synthetic fixture; history
restoration was visually verified, not compared byte for byte.

The earlier modifier-only key dispatch was an inconclusive harness attempt;
correcting the temporary harness resolved that verification issue without
product changes or another Apply. The user's actual scene retest remains
pending.

### 2026-10-16 correction: normal installation identity

The user's normal application still rejected a five-trunk selection with the
model-selection guard. A fresh native Settings → About tooltip identified that
running window as `codex/support-studio-grid @ 27acd6a0f · Windows/x64`, while
the latest verified installer source is `ee63a6c6`.

The earlier installation and synthetic native checks exercised a separate
Codex MSIX LocalCache installation. Their Preview/Cancel/Apply/Undo/Redo evidence
remains valid for that tested copy only. The normal shortcut launches the
unredirected application installation; shell file inspection was subject to
redirection and misleadingly reported matching hashes. Those checks therefore
do not establish that the user's normal application received the root-selection
fix or that the actual scene passed.

Updating and verifying the normal user installation remains pending. The user
requested a distinguishable revision; the corrected unpublished candidate will
use fork revision **stickninja r2** and package version **0.4.2**. This version
change is now user-authorized; it does not accept a stage or authorize public
release. The r2/0.4.2 build completed as recorded below; normal-install validation was still pending at this point. All earlier
source, installer, hash, and tested-copy evidence above retains its recorded
identity and does not describe the new candidate.

At that point, normal-install confirmation and the user-scene retest were
pending. The later revision confirmation is recorded below.

### r2/0.4.2 candidate build

The user-authorized r2 candidate built successfully with exit code 0 from source
`1b2adb5c0`; the embedded frontend source identity was confirmed. Rust release
compilation took 5 minutes 29 seconds, describing that compilation stage only.
The NSIS output `DragonFruit (stickninja)_0.4.2_x64-setup.exe` and copied review
candidate `DragonFruit-stickninja-r2-0.4.2-1b2adb5c-x64-setup.exe` are
**21,995,002 bytes**, with matching SHA-256
`B17ACC98E6B2FAFD66D69BDDC2DBFC2182E0F808B015325CAA3AE909F20367BC`.
The built executable identifies as `DragonFruit (stickninja)`,
FileVersion/ProductVersion `0.4.2`, SHA-256
`41634F41A9B251F59FE5141DC2967CDD8806C068BC45897FEA821840D2389BC0`.

The user saved and closed the application and authorized native installation.
The native installer detected an older normal installation. During interaction,
user input occurred and an “Unable to uninstall!” error was observed. The
installer later closed, and the user reopened the normal application. Because
the user handled concurrent installer interaction, no installer exit-code success
is claimed for this attempt.

The user then opened About. A fresh native screenshot and UI Automation reading
confirmed **0.1.17 · stickninja r2**, and the running executable was identified
as the normal unredirected installation rather than the separate Codex cache
copy. This verifies the normal application's r2 upgrade identity despite the
earlier uninstall error. The source tooltip was not captured in this round;
built package version `0.4.2` is established by the build evidence above.

On 2026-10-16 the user confirmed “Preview works now” after being asked to select
the same trunks in r2 and try Optimize → Preview for an enabled control and a
produced result. This records user-confirmed Preview operability on the actual scene
in the normal r2 application and resolves the reported blocked control. The user
immediately clarified that Optimize creates “some strange support geometry”.
Geometry quality is under review; this is not a broad optimization pass,
readiness decision, or acceptance. It does not establish actual-scene Cancel,
Apply, Undo, or Redo; their separate
synthetic evidence above remains unchanged. Neither Stage 2 nor Stage 3 has been
explicitly accepted, and no public release is authorized.

### Geometry-quality diagnosis in progress

On 2026-10-17 the user clarified that each screenshot came from running one tool
separately on the original supports. Sequential application is ruled out for
those examples; the exact private-scene graph had not yet been inspected at
that point.

Source review confirmed the original shared graft logic retained a 0.25 mm
first-span stub near the existing top joint, with dependencies able to move the
graft lower. The original planners added connection joints around the preserved
geometry. These details explained redundant small segments and joints, but the
exact private-scene dependency configuration was not established.

The narrow source correction now reuses the original top joint and first segment
when the first span has no hosted knots. Grid retains its required lower leg
and knee. Real or free hosted knots retain the conservative graft path, and
shared-root, kickstand, legacy-dependency, cone, bend, and collision guards remain
in force. The correction does not add global routing, remove free knots, or
redesign long/low joins. Their geometry quality remains unresolved.

Verification passed **77 optimization unit/controller/catalog tests**, including
**44 planner geometry tests**, and **15 ReactCompiler/Lingui DOM tests**. Full
TypeScript and scoped ESLint covering three production and two test files passed
with zero lint warnings. Independent review passed **61 overlapping
planner/controller tests** and found renderer, proxy, and export endpoints
consistent. Coverage includes direct joint/segment reuse, binary save/load,
removal of the old base-joint reference, free/attached-knot preservation,
protected dependencies, cone/bend collisions, deterministic results, and Grid
spacing changes followed by Cluster optimization.

The primary production frontend build completed with exit code 0, including
Next compilation, TypeScript, and prepared embedded frontend assets.
Documentation accuracy passed for **169 documents**, and the whitespace diff
check passed. These results validate the source and production frontend only:
no new native executable or installer was built or installed for this correction.
At that point, the installed application remained r2/package 0.4.2 and
actual-scene review was pending. The later r3 acceptance is recorded above.


On 2026-10-17 local inspection confirmed ordinary multi-span construction joints
and real dependencies in the reported scene; sequential use was not the cause.
The continued source correction advances through a forward, continuous,
collinear, same-size knot-free prefix when it raises a viable graft. The final
retained span may host knots, with a cut below the lowest knot and local
attachment remapping that preserves world positions. Higher routes are tried
first, with lower candidates and the conservative choice retained as fallbacks
when angle or collision checks block them. Explicit consumed-span IDs and the
retained-span index guide collision checks; the suffix, genuine bends/curves,
size changes, contacts/sockets, and dependency guards remain intact. No schema,
setting, or UI change is introduced.

Source verification passed **85 optimization unit/controller/catalog tests**,
including eight new actual-builder/prefix regressions, and **15 compiled
ReactCompiler/Lingui DOM tests**. Full TypeScript, scoped ESLint, and whitespace
checks passed. Independent review passed **67 overlapping planner/controller
tests** plus an in-memory fallback check, with no remaining findings. The primary
DOM run initially hit a concurrent Windows compiler-cache rename error; the
serial rerun passed 15/15. This was a test-harness race and required no app fix.

A bounded local diagnostic ran both default planners against the transformed
embedded mesh from a private scene copy. All contacts and protected attachment
world positions were preserved, the input remained unchanged, and each run
stayed below the 6000-candidate limit. This used all trunks, default options,
and an inferred plate frame; it does not reproduce the user's exact selection
or establish visual acceptance. Private scene details are not published here.

The user authorized unpublished r3/package 0.4.3 for this correction. The native
build and normal installation completed as recorded below. At that point,
actual-scene review was still pending; the later user acceptance and remaining
settings tuning are recorded above.


### r3/0.4.3 native candidate build

Clean source `07bb38ba6073ed978cfe76cf9534536e988d7b2d` completed production
frontend, TypeScript, thumbnail preparation, Windows x64 executable, and NSIS
packaging successfully with exit code 0. The first attempt stopped in runtime
preparation because inherited PowerShell 7 module paths hid the native Windows
PowerShell hash command. Retrying with native Windows PowerShell module paths
succeeded without source changes.

The review candidate is
`DragonFruit-stickninja-r3-0.4.3-07bb38ba-x64-setup.exe`, **21,988,782 bytes**,
SHA-256 `68BAC0AF503B33D59F03E61D06CB3A167846BF4D0D174F37C88CA2DCA3B39453`.
The executable identifies as `DragonFruit (stickninja)`, version `0.4.3`, PE
machine `0x8664`, SHA-256
`54CEB0F39AC6E52CCD1B220E754581CDF09355B91FD5F7844F295DA11572372B`.
The user confirmed the scene was saved and closed and authorized r3
installation. The native Windows installer upgraded the normal existing
installation using its “Do not uninstall” path, with no uninstall error. It
explicitly displayed Installation Complete and successful setup completion;
Finish launched the normal installed application.

The returned native window identified the executable as the normal installation,
and its accessible welcome badge displayed **0.1.17 · stickninja r3 — Beta**.
The startup autosave-recovery prompt was initially left untouched for the user.
After the user handled recovery, a fresh native Settings → About screenshot and
accessibility reading explicitly confirmed **0.1.17 · stickninja r3**, with the
normal installed executable again identified by the returned window. No
build-ref tooltip or copied diagnostics were captured; package version `0.4.3`
remains established by the build metadata above. Actual-scene optimization visual
review was pending at this check; the subsequent combined acceptance is recorded
above. No public release is authorized.

## Remaining verification and scope boundary

Stages 2 and 3 are accepted as recorded above. Detailed checks marked pending
were not individually observed and are not retroactively marked passed.
Physical print strength and hardware performance remain unverified. Phase 0.5
overall is unaccepted, and Stage 4 requires separate instruction. No public
release is authorized. See the [fork roadmap](fork-roadmap.md).
