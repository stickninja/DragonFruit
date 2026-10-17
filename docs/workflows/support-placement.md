# Support Placement Workflow

DragonFruit support authoring is modifier-key aware and target-driven.

## Core placement logic

Support type is determined by:

1. Modifier keys currently held.
2. The first valid clicked target (model or support shaft).

## Recommended user workflow

1. Place foundational trunks for major overhangs.
2. Add branches to reduce extra roots and material.
3. Use braces/kickstands where lateral stability is needed.
4. Validate support angles and warnings before finalizing.

## Hotkey families (summary)

- **No modifier**: default trunk/root placement.
- **Alt**: branch/brace family (first-click dependent).
- **Ctrl**: kickstand family.
- **Ctrl+Alt**: leaf family (highest precedence).

For the full matrix, see [Hotkeys](../reference/hotkeys.md).

## Automatic supports

Open **Auto Supports**, select a run preset, and choose **Generate Supports** for
the active model. It scans for islands first when no scan is available, then
places supports against the current model geometry. Resolve any unapplied holes
or hollowing when prompted. The auto-support settings must be **Enabled**;
the current manual Generate button also follows that setting.

Dense scans retain their complete candidate list during priority scoring;
a high minima count does not require reducing the scan just to avoid a candidate
count limit. Generation can still take longer for a large scan. Review the
resulting contacts and support geometry before finalizing the scene. One Undo
reverses a committed generation run.

## Support Studio bracing

In Support Studio's bracing controls, choose **Fixed** to use the diameter in
millimetres, or **Relative** to use a percentage of the smaller parent shaft
segment diameter at the two brace attachment points. New relative braces keep one uniform
diameter along their length. The percentage
defaults to 50%; fixed sizing remains the default for existing settings.

Keep the existing initial and repeating patterns, Cluster Spacing, and
Apply/Clear workflow. Enable **Auto-brace while placing** to add eligible local
braces as you manually place trunks or branches. It starts off and uses the current
bracing pattern and sizing settings. Generated links stay within the placed
support's model and plate, preserve existing braces, and are undone or redone
together with that placement. Manual braces remain editable through the
existing brace tools. Apply preserves manual braces and can regenerate bracing
for two eligible shafts. Clear All deletes all braces on the current model,
including manual braces, as before.

This is [Stage 1 of the fork's Support Studio sequence](../support-studio-bracing-acceptance.md),
accepted by the user on 2026-10-16.

## Support Studio Cluster Optimization

Select at least two trunks belonging to the active model on the active plate,
then open **Optimize** in Support Studio and choose **Cluster**. Cluster Optimization uses this explicit
support selection; it does not fall back to the whole model. Adjust **Trunk
reduction** to request a reduction from 0–75% (default 50%). Advanced controls
limit reach (default 8 mm) and branch angle from vertical (default 45°).

Choose **Preview** to inspect the proposed replacement graph and its selected
trunk counts, preserved contacts, and skipped candidates. Preview does not edit
the saved support graph. **Cancel** returns to the committed geometry. Changes
to the selection, graph, options, model geometry or transform, or plate context
invalidate the proposal; preview again before applying it.

Choose **Apply** to commit a current proposal. Eligible trunks become branches
on retained hosts while their model contacts retain their geometry and position.
Unsafe candidates remain unchanged, so the actual reduction can be less than
requested. Review the result before finalizing; one Undo restores the complete
previous support graph and one Redo restores the optimization. Save the scene
to keep the resulting ordinary support geometry. The optimization options and
preview are temporary; leaving Optimize resets its options to the defaults.

This is [Stage 2](../support-studio-cluster-acceptance.md), awaiting user
acceptance together with Stage 3 under the explicitly authorized combined review.

## Support Studio Grid Optimization

Select grounded trunks on the active model and plate, open **Optimize**, then
choose **Grid**. Set **Grid spacing** (default 2 mm); expand **Advanced limits**
for **Max shift** (default 2 mm) and **Max shaft angle** from vertical
(default 45°). This aligns selected roots and
lower trunk legs to the existing XY lattice while keeping their model contacts
in place. It does not merge trunks or reduce their count. The separate **Grid**
placement tab continues to control placement.

Choose **Preview** to inspect the proposed aligned geometry, contact counts, and
skipped candidates. Unsafe candidates stay unchanged; alignment may be partial.
Choose **Cancel** to return to committed geometry, or **Apply** to commit a current
proposal. Changes to selection, geometry, options, model/plate context, or relevant
settings require another preview. One Undo restores the complete prior graph;
one Redo restores the optimization. Save the scene to retain applied geometry.
The options and preview are temporary and reset when leaving Optimize.

This is [Stage 3](../support-studio-grid-acceptance.md), authorized for combined
Stage 2/3 review on 2026-10-16. Neither stage is accepted yet. Advanced Placement
and support influence remain deferred.

## Interaction precedence

During editing, higher-priority tools suppress lower-priority interactions:

1. Explicit gizmos (joint/knot/bezier)
2. Placement tools
3. Support hover/selection
4. Canvas/model fallback

## Tips for stable results

- Prefer cleaner trunk anchors before dense branching.
- In crowded scenes, verify the intended snapped shaft before clicking.
- Re-run a quick visual inspection after major joint edits.

## Related workflows

- [Model Preparation](./model-preparation.md)
- [Island Analysis Workflow](./island-analysis-workflow.md)
- [Raft and Export](./raft-and-export.md)

![Support placement placeholder](../assets/placeholders/support-placement-flow.png)

> Screenshot placeholder: branch placement sequence with snapped shaft target and preview.
