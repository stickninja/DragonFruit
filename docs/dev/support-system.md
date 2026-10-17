# Support System

The largest subsystem in the frontend. `src/supports/` owns everything from the geometry of a single contact tip to the interaction that places a whole forest.

## Where things live

| Directory | Holds |
| --------- | ----- |
| `SupportPrimitives/` | The reusable pieces every type is built from — Roots, Shaft, Joint, Knot, ContactCone, ContactDisk. Each with its renderer and, where it pays, an instanced group |
| `SupportTypes/` | One directory per placeable type — Trunk, Branch, Leaf, Twig, Stick, Brace, Kickstand, Stump — each with a renderer and usually a builder |
| `PlacementLogic/` | Where a support is allowed to go: pathfinding, collision, solvers, grid policy |
| `interaction/` | Hover, selection, snapping, and the routing that decides which controller owns a click |
| `rendering/`, `Renderers/` | Shared render assembly and batched/instanced groups |
| `autoSupport/` | Automatic placement: candidate generation, coverage, Poisson spacing, near-plate bands, physics-driven sizing |
| `autoBracing/` | Automatic brace generation, plus the mesh geometry store used for clearance |
| `Grid/`, `Curves/`, `Rafts/` | Grid lattice, curved segments, raft geometry |
| `history/` | The typed history façade for support actions |
| `Settings/` | Persisted support and raft settings, and the anatomy preview |

Four files at the root carry the weight: `supportTypeRegistry.ts` (what every type IS — see below), `types.ts` (every entity interface plus `SupportState`), `state.ts` (the store and serialization), and `SupportRenderer.tsx` (the scene render loop).

## What each piece is

The vocabulary — and the distinctions people get wrong, like knot versus joint or brace versus kickstand — is in [Anatomy of Supports](../reference/support-anatomy/index.md), one page per piece. The domain glossary in `CONTEXT.md` records the terms to avoid and where the code spells them differently.

## The contracts that bite

**Partly registry-driven.** `supportTypeRegistry.ts` is the single source of truth for what a support type *is*: `SUPPORT_TYPES` holds one descriptor per type carrying its id, label, `SupportState` collection, selection category, history action pair, and a set of behaviour flags. Anything that needs "every support type" or "every entity collection" derives it from there rather than listing types by hand.

The registry deliberately describes identity, not behaviour. It holds no renderers, builders or placement logic — adding those would turn a mechanical refactor into a rewrite. Where the store must call back into a type (updating an entity, sizing a knot on a tapered shaft), the registry declares a *slot* that `state.ts` fills at load, which avoids an initialisation cycle: `state.ts` calls `createEmptySupportCollections()` while the module is still evaluating.

Three shapes are acceptable when a piece of code needs type-specific behaviour, and one is not:

- **Derived** — loop over `SUPPORT_TYPES` or a key list. Preferred.
- **Declared** — a property on the descriptor, so the type is named once at its definition.
- **Subtracted** — `.filter(id => id !== 'trunk')`. Rejected: a new type silently joins or skips the set, which is the failure the registry exists to prevent.

**Adoption is partial.** `npm run scan:support-types` reports where per-type
references still sit — run it rather than trusting a number written here.
`state.ts` also keeps `@deprecated` per-type add/update/remove wrappers
(`addTrunk`, `removeBranch`) alive until their callers move.

What the registry has taken over: collection key lists, `initialState`, the modelId and shafted-collection walks, the updater and knot-diameter slots, root ownership, removal cascades and their history payloads, segment endpoint resolution, contact-bridge construction, placement-surface marking, shaft and joint batching, selection-category resolution, the delete gate, and the renderer's per-type detail table. What remains hand-wired: export reconstruction, per-type builders in the auto-placer, and parts of the interaction manager.

See [Adding a New Support Type](support-type-extension.md) for which steps are registry-driven today.

**Two rendering paths must agree.** Unselected straight geometry renders through instanced groups (`InstancedShaftGroup`, `InstancedJointGroup`, `InstancedRootsGroup`, `InstancedContactConeGroup`); selected and edited geometry renders individually. Both paths must produce the same hover and click semantics, or a support behaves differently depending on whether it happens to be selected.

**The shaft batch answers hover through a grid, not through three's walk.** R3F raycasts every instance of every mesh carrying a pointer handler, so a hover on a batch that draws every shaft of every model in one mesh costs O(supports) per pointer move and per click. That batch carries a custom `raycast` (`src/supports/proxyHoverIndex.ts`): the shafts are indexed into cells over the plate and a ray only tests the cells it crosses, with a ray-to-segment distance per candidate. The index is built by `InstancedShaftGroup`, from the exact list that mesh draws — a target's `index` is the instance index the event reports, so an index built anywhere else can be shifted against the drawn list and every hit past the shift resolves to a neighbouring support's model. The split rule (`splitBatchedShafts`) is what must agree: a leaf's contact point is a zero-length shaft, which is not drawn, and 67 of an 18-model plate's shafts per model are exactly that. The other kinds keep three's own raycast, because their groups bucket their instances by geometry parameters into hundreds of small meshes: a whole-kind grid handed to them is asked once per bucket, and a bucket's `instanceId` indexes its own list, not the grid's. A hit means the ray passes within a support's radius plus a grab radius, and the grab radius scales with the **depth of the closest approach**, not with how far the ray missed: a miss is near zero whenever the pointer is anywhere near a support, so sizing the radius by it would leave a hit only when the pointer was exactly on one. The reported distance is along the ray, so callers sort by depth, and each intersection names the mesh that produced it: R3F walks `hit.object` up the parents to find the handlers, so a hit that names no object goes inert. The straight shafts, roots, joints and contact cones each carry a grid, and the same handlers they had before. Hover and clicks resolve a model, which is all they ever needed, but the *hit* is per support: a box per model was tried and rejected, because it covers the gaps between supports (hovering empty space tints a model) and covers the model itself (hovering the model stops highlighting it). Curved shafts keep three's own raycast on their merged tube, which is fine at their count. If you add a pointer handler to an instanced batch without giving it an indexed raycast, you have reintroduced the O(supports) raycast.

**The selection and the hover tint are one colour per instance.** The batches hold every visible model's primitives and are laid out from the support state, not from the selection or the hover. A model's supports are recoloured in place (`instanceColor` on the four groups, one merged tube per colour for curved shafts), which is why selecting every model on the plate costs a colour pass rather than one overlay per model. The tint is a **colour**, computed by `createProxySupportTint` (base, active, and a hovered model's blend of the two), not a translucent pass drawn over the batch: blending on top made a hovered support's orange depend on what was underneath it, so a support that was also selected came out a different orange than its neighbours in the same model. A selected model keeps the active colour, with nothing added for hover. The colour pass is a separate layout effect from the matrices: a tint must not re-derive every instance matrix to change a colour.

**The world layer hides an excluded model instead of dropping it.** The active model's supports are drawn by the layer attached to its group (so they follow a live transform), and the world layer used to leave them out of its batches. It now keeps them and zero-scales their instances (`isHidden` on the four groups), so making a model active costs the instances that changed state rather than a full re-layout of the plate. Curved shafts are the exception: a merged tube cannot hide one shaft, so the world layer takes those from the visible set and merges them again, which is cheap because each shaft's sweep is cached. A layer with a `modelFilterId` (the ghost and preview ones) still filters its geometry, because it draws one model by definition.

**A batch layout is ~0.1 us per instance, and it is paid per re-layout.** The four groups derive a matrix per instance whenever their arrays change (a support edit, or the active model moving between the world layer and its own attached layer). Keep the arrays stable when only a colour or a visibility changes, and hoist scratch objects in any helper the layout calls: minting a `Vector3` per instance per pass cost more than the maths in the cone batch.

**A rendered root sits 0.01 mm above the plate.** `InstancedRootsGroup` lifts its
whole stack by `ROOT_RENDER_LIFT_MM`. A root's disk bottom lands exactly on the
plate, which puts the plate top, the raft's bottom and every root disk on the same
plane: three coplanar surfaces fight for depth, and a raft of roots shows it as a
mottled patch through the raft. A hundredth of a millimetre is invisible at any
zoom the app offers. It is a rendering offset only — the sliced and exported
geometry comes from the support state, not from this batch — so it must not be
"corrected" back into the geometry builders.

**A proxy geometry that will be raycast needs a bounds tree.** `src/utils/bvh.ts` installs three-mesh-bvh's accelerated raycast globally, and a mesh whose geometry has no `boundsTree` falls back to the plain per-triangle test — paid once per visible mesh on every pointer move. The raft proxy geometries build one (`withBoundsTree`). three-mesh-bvh does not accelerate `InstancedMesh.raycast`, so the support batches carry the grid raycast described above instead.

**Knots must survive topology edits.** A knot persists its host shaft id, its normalized position along that shaft (`t`), and a world position derived from the host. Any change to shaft topology has to route through the paths that recompute knot placement — otherwise attachments silently drift or detach.

**Cascades are one history action.** Deleting a trunk rehosts or removes its dependents; that whole cascade is a single entry with before/after state, so undo restores a consistent graph rather than half of one. See [History and Undo/Redo](history-and-undo-redo.md).

## Multi-support settings

`applySettingsToSelectedSupports` in
`src/supports/Settings/applySettingsToSelectedSupports.ts` is the mutation path
for editing settings when one or more supports are selected. It reads the
current support selection, resolves every selected support to its editable
target, and batches all store mutations into one notification. When no
multi-selection exists, it falls back to the primary selected support.

### Profile field limits

`SUPPORT_PROFILE_LIMITS` (`src/supports/Settings/defaults.ts`) holds the sane
range of every General-tab profile field (`tip`, `shaft`, `roots`). The store
applies it through `clampProfileFields` on **every** write — the tab, a preset, an
imported scene and a plugin call all pass through it — so no path can hand a
negative or absurd dimension to the geometry builders. The same table supplies
the inputs' `min`/`max`, which also switches `NumberInput` to a pattern that
cannot start a negative value.

Zero is a legal limit for a height that may mean "no feature" (root disk/cone
height); diameters floor just above zero because a zero-radius disk or cone has
no usable normal. Upper bounds are generous — they catch a stray digit, not model
a printer. A new General-tab field is not protected until it is in that table and
clamped in `clampProfileFields`.

The settings sidebar shows the last selected support's values. Changing a value
applies those settings to the complete selection. The sidebar captures one
before/after support edit snapshot around the editing session, so undo restores
the whole selection in one step. Selection controllers must therefore keep a
primary selected support alongside the selected-ID set; clearing the primary
representative makes the sidebar non-editable even when IDs remain selected.
Shift-click toggles one support without disturbing the rest of the set. Detailed
primitive renderers must defer to the parent support while a multi-selection is
active: a normal click replaces the set with that support, while Shift-click
toggles only that support. Selecting a shaft, joint, knot, or contact cone in
either case would clear the support selection set.

## Placing supports

- By hand: modifier keys choose the family, the first click's target chooses the type — [Support Placement Modifiers](../reference/support-placement-modifiers.md).
- Automatically: `autoSupport/` generates candidates from island analysis and overhang regions, then sizes and places a forest. Gated behind an experiment.

## Support Studio bracing

`src/supports/autoBracing/settings.ts` owns the normalized bracing settings;
`AutoBracingSettingsCard.tsx` presents them. Fixed diameter remains the default.
`resolveAutoBraceDiameter` in `src/supports/autoBracing/braceDiameter.ts` resolves
relative sizing from the smaller local shaft diameter at the two attachment
points. For example, parents measuring 1.2 and 0.8 mm at those points with a 50%
setting produce a uniform 0.4 mm brace:

```ts
resolveAutoBraceDiameter(
  { ...settings, braceSizingMode: 'relative', braceDiameterPercent: 50 },
  1.2,
  0.8,
);
```

Use the actual shaft segment diameters at the attachment points rather than
assuming one nominal diameter for the whole parent. Invalid parent geometry falls back to fixed sizing.
Relative results carry `profile.uniformDiameter` so individual, instanced, and
export geometry use the stored diameter; legacy braces retain their existing
geometry behavior. `resolveBraceEndpointDiameters` and `uniformBraceDiameterOf`
in `src/supports/SupportTypes/Brace/braceDiameters.ts` expose that distinction to
rendering and host-diameter consumers, including knot edits and snapped placement.
See [Data Storage](data-storage.md#support-studio-bracing-settings)
for defaults and serialization.

`buildAutoBracedSnapshot` in `src/supports/autoBracing/autoBrace.ts` retains its
full Apply behavior. Its optional `{ changedSupportIds, allowTwoSupports, gridSettings }`
argument controls placement scope and the two-support minimum. `changedSupportIds` selects local
insertion for live placement: each candidate pair must include a changed
support, stay in its model, and satisfy the existing spacing, grid/cardinal,
pattern, and mesh-clearance rules. Local insertion accepts two eligible supports,
preserves existing braces and knots, suppresses duplicate attachment pairs, and
does not generate or replace kickstands. Explicit Apply enables `allowTwoSupports`,
allowing a just-created pair to be regenerated after a sizing change;
the default builder and automatic-support integration retain their three-support
minimum. Model ownership also keeps links on that model's assigned plate.
An explicit `gridSettings` override makes preview regeneration deterministic;
omitting it preserves the existing current-settings fallback.

`commitManualSupportPlacement` in
`src/supports/autoBracing/liveBracing.ts` takes the support type, changed support
IDs, placement mutation, and legacy history callback. Trunk and branch placement
use it around primitive insertion and host repairs. With live bracing disabled
it uses existing history.
When enabled, one typed support edit snapshot contains the placement and its
generated graph, including roots, knots, and host diameter repairs. If bracing
fails, the contact placement still commits with undo. Keep history registration
at app-root lifetime and preserve manual and unrelated braces during live placement.
Apply preserves manual braces. Clear All retains its existing model-wide deletion
behavior, including manual braces on that model.

See [Stage 1 acceptance](../support-studio-bracing-acceptance.md) for required
checks and the current review status.

## Support Studio Cluster Optimization

`src/supports/optimization/clusterOptimization.ts` owns the pure selected-trunk
planner. Use `buildClusterOptimization` when the user requests fewer grounded
trunks while retaining existing model contacts. It accepts a `SupportState`,
explicit support IDs, `ClusterOptimizationOptions`, and
`ClusterOptimizationContext`, returning `ClusterOptimizationResult` without
writing the live store, history, or persistence:

```ts
const proposal = buildClusterOptimization(
  snapshot,
  selectedTrunkIds,
  { reductionPercent: 50, maxReachMm: 8, maxJoinAngleDeg: 45 },
  { modelId, mesh, plateId, modelPlateId, collisionMeshes, autoBracingSettings, gridSettings },
);
```

`DEFAULT_CLUSTER_OPTIMIZATION_OPTIONS` supplies those defaults; the angle is
measured from vertical; reach limits the full new diagonal length. Existing
length-aware rules can tighten the angle for longer spans. Context identifies the model and its mesh, optionally
the active/model plate IDs, neighboring model meshes for collision queries,
support-collision model IDs, current automatic-bracing settings, and optional
grid settings for deterministic brace regeneration. Hosts come from the explicit selected
trunks of that model and plate. There is no whole-model fallback.

The result exposes the replacement `snapshot`, `changedCount`, selected/target/
remaining trunk counts, before/after contact counts, `skipped` IDs with reasons,
`candidateChecks`, spatially filtered `hostChecks`, and removed/generated automatic-brace counts. Skip reasons
distinguish ownership, unsupported geometry, dependents, unavailable parents,
collision, and the search limit. The requested target is a goal; safety may
leave more trunks. `CLUSTER_MAX_CANDIDATE_CHECKS` bounds geometry queries for
the whole run at 6000, with at most 64 host samples per candidate.

A converted trunk becomes a branch with the same support ID and unchanged
contact-cone object, socket joint ID, and tip profile. The shared graft search
can advance through a forward, continuous, collinear, same-size prefix whose
consumed spans have no hosted knots. It evaluates higher graft candidates first only when they raise the graft,
then falls back through lower candidates to the prior conservative choice if
angle or collision checks block a higher route.
The final retained span may host attachments: cut below its lowest knot and
remap local attachment positions on that span to preserve world positions.
Real and free knots both constrain the search. Genuine bends, curves, size
changes, and the remaining upper suffix are preserved.

A knot-free terminal span reuses its top joint and segment without a tiny
retained stub or duplicate graft joint. Cluster connects that retained geometry
directly from its host knot. Explicit consumed-span IDs and the final retained
span index keep collision checks aligned with the proposed geometry: omit only
exactly removed spans and truncate the retained span at the graft. Other spans
remain collision obstacles. Existing branch geometry and length-aware angle
rules still apply. The conservative straight connection does not invoke global
pathfinding; blocked connections are skipped.
`segmentDistanceSq` in `src/supports/PlacementLogic/segmentDistance.ts` is the
shared leaf helper for support-span crossing checks, also used by automatic
placement. Curved first/host segments, incompatible root planes,
shared roots, unsupported legacy attachments, and unsafe dependents are skipped
instead of invoking a destructive trunk-removal cascade.

When bracing settings are supplied, only generated braces whose two endpoint
shafts belong to selected trunks are eligible for regeneration. Their unused
brace-only knots may be removed; shared knots, manual braces, links outside the
selection, and existing kickstands remain protected. Regeneration connects only
selected surviving rooted trunks, and local generation does not add kickstands.
Such dependencies can
prevent a conversion. The result reports regeneration separately from trunk
reduction.

The UI owns the ephemeral preview and must validate selection, live support
collections, options, model geometry/transforms, and plate context before
committing. A stale preview cannot be applied. A nonempty current proposal is
one typed support edit snapshot with complete before/after state; a preview or
no-op must not create history. Keep history handlers at app-root lifetime.
Options and preview are session-only; applied graphs use existing serialization.

`src/supports/optimization/clusterPreview.ts` exposes the Cluster controller;
`src/supports/optimization/optimizationPreview.ts` owns the shared lifecycle.
`ClusterPreviewContext` carries the active model, active/model plate IDs, active
plate model IDs, current automatic-bracing settings, and required `gridSettings`.
A minimal sequence is:

```ts
const error = previewClusterOptimization(context, options);
const preview = getClusterPreview();
// After the user reviews the proposal, with the same current context/options:
const applied = applyClusterOptimization(context, options);
```

`clusterSelectionError` validates eligibility; `previewClusterOptimization`
returns a selection/model/plate/mesh error or prepares a proposal. A planning
exception returns `failed`, with a recoverable localized message and no graph or
history mutation.
See the shared selection contract under [Grid Optimization](#support-studio-grid-optimization).
`subscribeClusterPreview` observes idle/ready/stale/applied state.
`getClusterRenderSnapshot` exposes a current proposal only to ephemeral scene
rendering; ordinary serialization continues to read the committed store.
`cancelClusterPreview` restores idle state, while `invalidateClusterPreview`
marks a proposal stale. Apply rechecks collections, selection, mesh entries,
options, model/plate context, and bracing/grid settings; a successful apply clears
selection and pushes `SUPPORT_EDIT_REPLACE` with both complete snapshots.
The applied summary clears after later graph, selection, or history changes;
ordinary hover preserves it.

`subscribeToAutoBraceMeshes` in
`src/supports/autoBracing/meshGeometryStore.ts` lets the controller invalidate
when current or neighboring geometry/transform registration changes. Both
optimization cards also subscribe before any preview exists, using their
selection-error getter as the external-store snapshot. Mesh arrival or removal
must update idle Preview eligibility immediately, even if Optimize opened before
the model finished registering geometry. Selection, model, plate, lock, and mesh
guards remain authoritative; Apply is disabled whenever eligibility fails. The
Support Renderer displays the proposal through unselected batches and suppresses
pointer editing and joint/knot/curve gizmos during preview.
`getOwnedPrimitives(typeId, collection, snapshot)` in `src/supports/state.ts`
accepts an optional explicit snapshot so kickstand-owned roots/knots are filtered
against the displayed graph; omitting it retains the committed-store behavior.
`PanelFacts.usesScenePreview` in `src/supports/Settings/sidebarPanels.ts` marks
Optimize as using the scene rather than requiring an anatomy-preview renderer.

See [Data Storage](data-storage.md#support-studio-cluster-optimization), the
[user workflow](../workflows/support-placement.md#support-studio-cluster-optimization),
and [Stage 2 acceptance](../support-studio-cluster-acceptance.md).

## Support Studio Grid Optimization

`src/supports/optimization/gridOptimization.ts` owns the pure selected-trunk
planner. Use `buildGridOptimization` to align existing roots and lower trunk
legs to the lattice without changing model contacts or reducing trunk count.
It takes the committed support snapshot, explicit selected trunk IDs,
`GridOptimizationOptions`, and `GridOptimizationContext`. It returns
`GridOptimizationResult` without writing stores, settings, history, or files:

```ts
const proposal = buildGridOptimization(
  snapshot,
  selectedTrunkIds,
  { spacingMm: 2, maxMoveMm: 2, maxJoinAngleDeg: 45 },
  {
    modelId, mesh, plateId, modelPlateId,
    collisionMeshes, autoBracingSettings, gridSettings,
    plateBounds: { minX, maxX, minY, maxY },
  },
);
```

`DEFAULT_GRID_OPTIMIZATION_OPTIONS` supplies these defaults. Angle is measured
from vertical. Plate bounds use world XY coordinates and must contain the full
root radius. The planner reuses the zero-origin lattice and tie rounding from
`src/supports/PlacementLogic/Grid/gridMath.ts`; it does not change Grid placement
settings or move the lattice with the model. Spacing is clamped to 0.5–30 mm, maximum movement to 0–30 mm, and join angle
to 5–45°. A bounded nearest-node search considers a 3 × 3 neighborhood within
the requested maximum movement. `GRID_MAX_CANDIDATE_CHECKS` caps a run at 6000
geometry candidates. Occupied
nodes, including unselected root/contact owners, remain protected. There is no
whole-model fallback, trunk merging, or occupied-owner replacement.

The planner moves only eligible selected roots in XY, adding a vertical node
leg and knee before the diagonal to the retained upper shaft. It shares the
forward collinear-prefix graft search described above. With no hosted knots at
the terminal span, the diagonal reuses that span and original top joint; with
attachments, the graft stays below its lowest knot and remaps local attachment
positions without moving them in world space. Consumed spans are tracked
explicitly for collision checks, and the untouched upper suffix remains intact.

Contact cones, sockets, genuine bends/curves, size changes, branches, leaves,
braces, and free knots remain protected. Shared roots, kickstand hosts, legacy
dependencies, invalid geometry, collisions, or insufficient height can force a
skip. Existing angle rules remain constraints; a partial result is valid. The
search does not add global routing or free-knot cleanup.

The result carries a replacement snapshot, changed/selected/aligned trunk counts,
before/after contact counts, skipped IDs and reasons, candidate-check count,
and removed/generated automatic-brace counts. Shared optimization geometry lives
in `src/supports/optimization/optimizationGeometry.ts`; Cluster Optimization
retains its separate reduction planner. Disposable automatic braces internal to
selected shafts can be regenerated when geometry changes; manual braces,
external links, shared knots, and kickstands remain protected. Each source
attempt releases only eligible disposable links touching that source; a failed
attempt restores its links and knots immediately. Links between stationary
parents remain collision obstacles throughout planning. Regeneration uses the
current Stage 1 pattern and sizing settings, then checks each new link against
the complete retained forest and current/neighboring meshes. Rejected links and
unused new knots are removed. Intentional Crosses intersections between generated
links for the same parent pair remain allowed. Nonfinite hosted knot positions
or attachment values make the source unsafe rather than entering new geometry.

The Optimize UI owns the temporary Cluster/Grid choice and Grid options. Preview
must render an ephemeral snapshot while ordinary serialization continues to read
the committed graph. Cancel, mode switch, leaving Optimize, or invalidation
cannot create support history. Apply must recheck selection, live collections,
model geometry/transforms, plate IDs and bounds, options, and relevant
bracing/grid settings, then commit one complete before/after typed support edit.
No-op and failed plans do not create history. Keep history registration at
app-root lifetime and prevent pointer edits to the proposed geometry.

`src/supports/optimization/gridPreview.ts` exposes the Grid controller.
`GridPreviewContext` extends `OptimizationPreviewContext` with required current
plate bounds, or null when unavailable. The shared context includes the current
plate lock state; locked plates reject planning and Apply. A single eligible grounded trunk is
sufficient; missing bounds produce a plate error. Use the dedicated entry points:

```ts
const error = previewGridOptimization(context, options);
const preview = getGridPreview();
// Apply only after reviewing a current nonempty proposal:
const applied = applyGridOptimization(context, options);
```

`gridSelectionError` validates selection/context, `subscribeGridPreview` observes
idle/ready/stale/applied state, `cancelGridPreview` returns to idle, and
`invalidateGridPreview` marks a proposal stale. Planning exceptions return a
recoverable `failed` error without graph/history changes. `getGridRenderSnapshot`
exposes only the current Grid proposal. Switching modes cancels the previous
controller, so only one tool can supply scene geometry.

Shared optimization selection validation resolves every selected entity through
`getModelIdForSupportEntityId` in `src/supports/state.ts`, including
roots caught by marquee selection and owned segment, joint, knot, and brace-span
IDs. Same-model selected roots
and other support parts are allowed alongside the required trunk count. Only
selected trunks become planner targets; selected parts do not become independent
optimization targets or inflate contact/skipped-trunk counts. Unknown entities, different-model owners, insufficient
trunks, and invalid model/plate/lock/mesh context still reject the operation.
Freshness compares the complete selection, including parts, so changing a root
or another selected primitive invalidates a prepared proposal.

The shared `createOptimizationPreview` factory takes a minimum trunk count,
localized history descriptor, optional context validator, and a pure planner
callback. It handles snapshot/selection/mesh subscriptions, option/context
freshness, atomic typed history, and applied-summary clearing. Add a specialized
controller beside Grid/Cluster when another pure support optimization needs the
same lifecycle; keep its options and result domain-specific. Scene rendering
uses `subscribeOptimizationPreview`, `getOptimizationPreviewRevision`, and
`getOptimizationRenderSnapshot` so it never combines two proposals. Serialization
must continue to use the committed support store.

See [Data Storage](data-storage.md#support-studio-grid-optimization), the
[user workflow](../workflows/support-placement.md#support-studio-grid-optimization),
and [Stage 3 acceptance](../support-studio-grid-acceptance.md).

## The placement guide line

Hovering a model in Support mode marks the band where the tip will land: the
intersection of the horizontal plane at the hovered point's height with the
model. Dragging a tip drives the same plane from the drag's hit point, which is
what tips get levelled against when several of them have to meet the model at one
height.

The plane lives in `supportPlacementGuideStore` (`src/components/scene/SceneCanvas/`).
It has two writers, `handleSupportHover` in `SceneCanvas` for model hover and
`useContactDiskDragSession` for a tip drag, and they do not share a render pass:
while `isContactDiskHudDraggingActive()` the hover path leaves the plane alone, so
a drag cannot fight the hover's ray for the same pointer.

Only the store's "is the plane set" flag is subscribed to (by `SceneCanvas`, to
mount the overlay); the Z is read imperatively every frame by `StlMesh`, which
writes the `uPlaneZ` uniform. The split is deliberate. The Z follows the pointer,
so carrying it in render state means either a scene re-render per pointer move or
a deadband on the value — and a deadband steps the line by `z / tan(tilt)` of
contour travel on screen, which is pixels on a shallow face and nothing on a
steep one.

The stripe itself is measured along the surface: distance to the plane's contour
divided by the surface's tilt against the plane. A face lying in the plane has no
contour and gets a faint wash instead of a stripe as wide as the face. The stripe
width is half the contact diameter of the tip being placed.

## Related pages

- [Grid and Branching](grid-and-branching.md) — grid node ownership and attachment
- [Support Pathfinding V3](support-pathfinding-v3.md) — the routing solver
- [Raft Geometry](raft-geometry.md) — the base derived from support roots
