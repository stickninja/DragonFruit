# Support Studio Stage 2: Cluster Optimization acceptance

Status: **active; explicitly authorized by the user on 2026-10-16 after accepting Stage 1.** Implementation and verification are in progress. This record does not mark planned checks as passed. The package remains the unpublished 0.4.1 candidate; [Phase 0.5](upstream-0.1.17-acceptance.md) remains awaiting acceptance. No release or version bump is authorized.

## Scope

Reduce eligible selected grounded trunks by attaching their existing model contacts as branches to retained trunks, using DragonFruit's existing branch, knot, and collision contracts. Preserve every model contact's position and contact geometry. Keep the change within the selected model and its assigned plate, and keep unrelated support graphs intact. Safety takes precedence over reaching a target reduction: unsupported or blocked conversions must remain unchanged and be reported.

This stage does not implement Grid Optimization, Advanced Placement, or support influence. Existing Stage 1 bracing settings and placement behavior remain available. See the [fork roadmap](fork-roadmap.md) for the acceptance order.

## Acceptance checks

The evidence section records completed automated and browser checks. Detailed
native/manual scenarios and production/build checks remain pending where stated.
Automated synthetic fixtures, browser checks, user reports, native checks, and
physical printing must be distinguished.

| Area | Required behavior | Status |
| --- | --- | --- |
| Selected-trunk reduction | An eligible selected cluster produces fewer grounded trunks and corresponding branches on retained hosts. A selection with fewer than two eligible trunks, or no valid conversion, gives an understandable result without modifying the graph. Unselected trunks cannot be silently converted or used outside the intended selection. | Automated checks passed; development browser preview verified; native/manual review pending |
| Contact preservation | Compare all before/after model contacts, including position, orientation, tip profile, diameter, penetration, and contact-cone geometry. Converted contacts and retained contacts match; count reduction never drops or moves a model contact. | Automated checks passed; native/manual review pending |
| Existing graph contracts | New branches attach through valid knots on retained host shafts, with valid segment references, normalized attachment position, consistent host diameter, and normal branch geometry. Apply, editing, and export leave no dangling references or detached attachments. | Automated checks passed; native/manual review pending |
| Collision and routing | Use existing segment, branch, and model-clearance contracts for a conservative straight diagonal graft. Valid nearby candidates can reduce; blocked connections, unsuitable contact geometry, and invalid or missing geometry fail safely. A refusal preserves the original trunk and contact. Full pathfinding around obstacles is outside this implementation. | Automated checks passed; native/manual review pending |
| Ownership | Mixed-model selections, inactive or changed plates, and model reassignment cannot connect different models or plates. Supports belonging to other models/plates are unchanged. | Automated checks passed; native/manual review pending |
| Dependents and braces | Existing branches, leaves, knots, kickstands, and manual/automatic braces attached to candidate trunks are preserved through a proven safe conversion or cause that candidate to be skipped. Verify both endpoints and host links; no manual brace may disappear as an incidental cascade. | Automated checks passed; native/manual review pending |
| Preview and cancellation | Preview reports proposed reduction and skipped candidates without changing supports, selection, history, settings, or serialized scene data. Refreshing, dismissing, or repeating preview is safe. A no-op cannot create a history entry. | Automated checks and development browser preview scenarios passed; native/manual review pending |
| Stale proposal | Editing supports, selection, settings, model transforms, mesh, or plate context after preview invalidates the proposal or requires a fresh preview. Apply must not commit a proposal against a different graph or context. | Automated checks and development browser preview scenarios passed; native/manual review pending |
| Atomic history | Apply commits the complete graph change as one typed support edit. One Undo restores the exact prior graph and contacts; one Redo restores the optimized graph. Repeat cycles preserve valid dependencies and unrelated supports. | Automated and development browser Apply/Undo/Redo checks passed; native/manual review pending |
| Save/reopen | After Apply, save and reopen a scene and compare the optimized supports, contacts, knots, ownership, and braces. Legacy scenes and Stage 1 settings remain compatible. Preview itself is not persisted. | Automated binary VOXL roundtrip passed; browser/native save-reopen pending |
| Production UI and localization | Controls, feedback, disabled/no-op/stale states, counts, and units are readable in the optimized frontend. Extract and compile new messages for all catalogs; verify compact production IDs resolve without source-message fallbacks. Check panel visibility at a compact window size. | Compiled catalog tests passed; development compact panel reviewed; optimized frontend review pending |
| Integration and build | Record focused core/DOM tests, regression checks for support/scene serialization, TypeScript, relevant lint/localization gates, documentation accuracy, optimized frontend build, and any Windows build actually performed. | Automated/type/lint/docs gates passed; optimized frontend and Windows builds pending |

## Checks actually performed

On 2026-10-16, a synthetic VOXL fixture was generated with the actual trunk builder and binary scene codec: an elevated 22 × 14 × 2 mm slab, eight ordinary 1.2 mm trunks contacting its underside at Z = 25 mm, and a 4 mm contact grid. Codec parsing confirmed eight trunks, eight roots, and the embedded 12-triangle slab mesh. The pure planner run with 50% reduction, 8 mm reach, and 45° from vertical returned four converted trunks, four remaining trunks, eight contacts before and after, and no skips. This is a fixture preparation smoke check, not a browser/native placement, Apply/history, save/reopen, or detailed geometry acceptance check. The fixture and its helper remain outside the repository.

### Automated integration evidence

On 2026-10-16 the primary review ran the broad support-system and VOXL suites:
**880/880 tests passed**. The actual binary scene roundtrip uses support export,
VOXL serialization, parse, and store reload, checking exact cone profiles and
normals, graft segments, manual braces, and leaf contact geometry. Dependent
knot world positions are checked within 0.000001 mm. Focused controller coverage
includes preview isolation, staleness (including grid context), post-apply status
clearing on graph/selection/history changes, hover preserving status, and safe
recovery from a planning exception. These are synthetic application-contract
checks, not native pointer or physical-print tests.

The primary DOM run passed **4/4 tests**: three Cluster Optimization cases and
the existing Stage 1 bracing case. The Cluster cases cover controls, summary
clearing after Undo, and readable planning-failure feedback with Apply disabled.
The compact-production-ID catalog regressions passed **12/12 tests** across all
six locales for Stage 1 and Cluster Optimization. Catalog extraction and
compilation were performed; new target-locale translations remain for Crowdin.

TypeScript and focused lint passed. The routine lint gate passed **43
directories**; the localization literal gate passed **60 paths / 164 files**.
Documentation accuracy passed **168 documents** and the whitespace diff check
passed. A synthetic selection of **1500 distant trunks** performed zero host
checks and zero geometry queries, taking approximately **33–42 ms** in the
observed local runs. This establishes that distant candidates use the spatial
filter, not a general timing guarantee.

### Development browser evidence

The final primary development-browser review passed actual viewport Preview,
Cancel, option-change staleness, Apply confirmation, Undo/Redo, and compact
**1280 × 800** controls. Visual inspection of applied, Undo, and Redo states
confirmed restoration. The latest four-trunk selection reduced to two trunks
with four contacts preserved; another run reduced four to three, a valid partial
reduction. The own-commit confirmation problem found during review was repaired
and the final run reported no uncaught page errors. These are browser checks,
not native installation or physical printing. The UI agent's latest focused run
passed **10 controller tests and 4 DOM tests**, with TypeScript and focused lint
also passing. Optimized frontend and Windows builds remain pending.

Stage 1 evidence remains in its [acceptance record](support-studio-bracing-acceptance.md)
and does not establish Stage 2 behavior.

## Remaining acceptance boundary

Stage 2 requires recorded verification followed by explicit user acceptance before Stage 3 begins. A build alone does not establish graph correctness, native pointer behavior, installation behavior, or physical print strength. No physical-print claim is made by this optimization.
