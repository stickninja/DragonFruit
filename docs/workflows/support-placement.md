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
currently awaiting acceptance. Cluster/grid optimization, advanced placement,
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
