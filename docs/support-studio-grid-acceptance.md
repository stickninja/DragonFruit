# Support Studio Stage 3: Grid Optimization acceptance

Status: **implemented; automated checks and development browser review passed; production/native/build checks pending; awaiting combined Stage 2/3 review and explicit user acceptance.** On 2026-10-16 the user instructed: “Proceed with Stage 3, I’ll review Stage 2 and 3 together”. This is an explicit exception to the normal sequence, not acceptance of Stage 2. Stage 1 remains accepted. Stage 4 is deferred until explicit acceptance after combined review. [Phase 0.5](upstream-0.1.17-acceptance.md) remains unaccepted; the package remains the unpublished 0.4.1 candidate. No release or version bump is authorized.

## Scope and agreed intent

Grid Optimization aligns the roots and lower shafts of explicitly selected grounded trunks to DragonFruit's existing zero-origin XY lattice. Preserve every existing model contact's position, orientation, contact-cone geometry, and profile. Reuse existing grid math, shaft/knot geometry, collision rules, and bracing contracts. Keep the selected model, active plate, and unrelated supports intact. Grid Optimization does not reduce or merge trunks; Cluster Optimization remains the separate reduction operation.

Support Studio's **Optimize** card offers **Cluster** and **Grid**. The existing **Grid** placement tab keeps its placement settings and behavior. Grid optimization controls and preview are temporary and add no persisted setting or scene schema. Preview is isolated; Apply commits a current proposal as one undoable graph replacement. Unsafe or unsupported candidates remain unchanged with a reported reason. Advanced Placement and support influence are outside this stage.

## Acceptance checks

Statuses distinguish completed synthetic automation from completed development browser review, pending production/native review, and broader manual scenarios. A planned manual check is not evidence of completion.

| Area | Required behavior | Status |
| --- | --- | --- |
| Lattice and selection | Selected eligible grounded trunks align root XY and vertical lower legs to the requested spacing using the existing zero-origin grid math. Negative coordinates and half-step ties agree with placement. No whole-model fallback or implicit trunk reduction/merge. Already aligned and empty/no-op selections remain unchanged. | Automated fixtures and development browser alignment passed; production/native review pending |
| Exact contacts | Compare all model contacts before/after, including position, normal/orientation, tip profile, diameter, penetration, socket identity, and contact-cone geometry. No model contact moves or disappears. | Automated exact-cone and codec checks passed; development browser contact counts preserved; production/native review pending |
| Broad geometry | Cover short/tall trunks, offset and already aligned roots, rotated/scaled model context, edge-of-plate roots, blocked preferred nodes, alternate nodes, cramped geometry, curved spans, and malformed/unsupported geometry. Safe cases align; unsafe cases skip without graph damage. | Automated short/tall, tiny shifts, bounds, blocked/alternate nodes, curved/malformed fixtures passed; rotated/scaled model and broader native/manual review pending |
| Dependencies | Preserve existing branches, leaves, knots, shared joints, and their world attachment positions or skip the trunk. Verify valid segment references and normalized attachment positions; protect kickstands, shared roots, and unsupported low attachments. | Automated branch/leaf/manual-brace world geometry and unsafe dependent checks passed; native/manual review pending |
| Node ownership | Respect occupied nodes from selected and unselected trunks, considering root and contact ownership. Do not overlap a second pillar or silently replace an existing owner. | Automated root/contact owners, alternate nodes, and competing selected roots passed; native/manual review pending |
| Bounds and collisions | Full root footprints remain within active plate bounds. Moved roots, lower legs, and diagonals respect model, neighboring model, support, brace, and root collision checks and length-aware angle rules. Bounded search reports failure without unbounded work. | Automated full-root bounds, shaft/root/brace and own/neighboring-mesh checks passed; native/manual review pending |
| Bracing | Preserve manual braces, links outside selection, shared knots, and kickstands. Regenerate only disposable automatic braces internal to affected selected trunks under the current Stage 1 sizing/pattern settings. Verify relative uniform diameters and both attachment endpoints. | Automated regeneration, stationary links, external links, Crosses preservation, and rejected-link cleanup passed; Grid-specific relative-size and native/manual review pending |
| Ownership | Reject mixed-model selections, inactive, locked or changed plates, and reassignment. Keep other models/plates and unselected graph entities intact. | Automated model/plate/lock guards passed; browser/native review pending |
| Preview lifecycle | Preview, repeated preview, Cancel, switching Cluster/Grid, leaving Optimize, and no-op/failure do not mutate committed graph, selection, settings, history, or serialized scene. Ephemeral geometry suppresses editing consistently with Cluster preview. | Controller, DOM, and development browser Preview/Cancel/tool-switching checks passed; production/native review pending |
| Staleness | Selection, graph, Undo/Redo, options, model mesh/transforms, active/model plate, plate bounds, or relevant bracing/grid context changes invalidate a proposal. Apply revalidates the full context and cannot commit stale geometry. | Controller/DOM checks passed, including locks/bounds and normalized settings; development browser option staleness passed; production/native review pending |
| Atomic history | Apply produces one typed support edit. One Undo restores the complete previous graph; one Redo restores the aligned graph with contacts/dependents/braces intact. Repeated cycles are stable; no-op and Cancel create no entry. | Controller/DOM checks and development browser Apply/Undo/Redo passed; production/native cycles pending |
| Save/reopen | Applied geometry survives ordinary binary VOXL save/parse/store reload with exact contacts, valid knots, ownership, and braces. Legacy scenes and Stage 1 settings remain compatible. Preview/options do not serialize. Distinguish codec automation from actual browser/native save/reopen. | Actual binary VOXL serialization/parse/store roundtrip passed; browser/native save/reopen pending |
| UI/localization | Cluster and Grid choices, numeric controls/units, summaries, skip/no-op/failure feedback, and disabled/stale states are usable at compact sizes. Extract and compile all catalog messages; test compact production IDs. Verify the existing Grid placement tab. | DOM/catalog/localization checks and development browser 1280 × 800 review passed; production/native review pending |
| Integration/build | Record core, controller, DOM, support/scene regressions, TypeScript, relevant lint/localization gates, docs accuracy, optimized frontend and any Windows build actually performed. Preserve Stage 2 behavior. | 915 support/VOXL unit tests, DOM, TypeScript, lint/localization/docs gates, and development browser checks passed; production/native/build evidence pending |

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

Optimized frontend build and production-browser review, native installation/UI,
and Windows package build remain pending in this record.

## Remaining acceptance boundary

Stage 2 and Stage 3 require explicit user acceptance after the combined review. Successful automated tests or a build do not establish native pointer behavior, installation, physical print strength, or hardware performance. No physical-print claim is made. See the [fork roadmap](fork-roadmap.md) and [Stage 2 record](support-studio-cluster-acceptance.md).
