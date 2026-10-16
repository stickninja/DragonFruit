# Data Storage

This page is the developer-facing source of truth for client-side persistence used by DragonFruit.

## Storage mediums used

- `localStorage`: primary persistent settings and feature state
- `sessionStorage`: transient/session fallback for selected slicing/profile settings
- IndexedDB: recent-file payload cache (`dragonfruit-recent-files`)

## Key conventions

- `app-*`: application UI/settings
- `dragonfruit-*` / `dragonfruit.*`: product/feature scoped data
- `lumenslicer:*`: legacy namespace retained for compatibility
- Unprefixed literals still exist (`autoLift`, `liftDistance`) and should be treated as legacy technical debt

## Support system keys

| Key                           | Medium       | Purpose                                                                  |
| ----------------------------- | ------------ | ------------------------------------------------------------------------ |
| `support-settings`            | localStorage | Core support-generation settings (tip/shaft/root/grid/auto-bracing/etc.) |
| `support-presets-v1`          | localStorage | Preset definitions + active preset metadata                              |
| `support-active-preset-id-v1` | localStorage | Legacy active preset key (redundant with `support-presets-v1`)           |
| `auto-support-presets-v1`     | localStorage | Auto-support policy presets (the `light`/`medium`/`heavy` built-ins and the user's own) |
| `auto-support-active-preset-id-v1` | localStorage | Active auto-support preset id; selecting one writes the block into `support-settings` |

`support-presets-v1` carries a `supportDefaultsVersion` field beside its payload:
the batch of code defaults the preset blob was written at. It is a wire field,
not a setting — see [Code defaults that move](#code-defaults-that-move).

### Support Studio bracing settings

The existing `autoBracing` block in `support-settings` adds:

| Field | Default | Load/write contract |
| --- | --- | --- |
| `braceSizingMode` | `fixed` | `fixed` or `relative`; missing or invalid modes use `fixed`. |
| `braceDiameterPercent` | `50` | Whole percentage from 1–100; finite values are clamped and rounded; nonfinite or missing values use 50. |
| `autoBraceWhilePlacing` | `false` | Opt-in live bracing; missing or invalid values use false. |

`braceDiameterMm` retains its existing 0.5–2 mm fixed-size constraint. The
relative result is the smaller local attachment diameter multiplied by the
percentage; the fixed-size lower bound does not clamp that result. Full support
settings, presets, and scene settings carry the new fields without a new storage
key. The compact preset hex codec remains v1 and carries General geometry only;
it does not become a bracing-settings exchange format.

New relative braces store `profile.uniformDiameter: true` beside their resolved
`profile.diameter`. This retains the uniform result through geometry assembly
and scene serialization. Older braces without the marker retain their existing
geometry behavior. See [Support System](support-system.md) for generation and
history boundaries.

### Support Studio Cluster Optimization

Cluster Optimization's reduction, reach, and angle controls live only while
the Optimize card is mounted; leaving that tab resets them to their defaults.
They add no localStorage key, support-settings field, preset schema, or scene
settings block. A preview is ephemeral and must not enter serialization or
history. Applying a proposal changes the existing trunk, branch, root, shaft,
joint, contact-cone, and knot collections through one support edit snapshot;
the resulting ordinary support graph uses the existing scene save/load format.
Undo/Redo records the complete before/after graph rather than an optimization
recipe. See [Support System](support-system.md) and the
[Stage 2 acceptance record](../support-studio-cluster-acceptance.md).

### Support Studio Grid Optimization

Grid Optimization's spacing, maximum movement, and maximum join angle belong to
its mounted Optimize card, alongside the temporary Cluster/Grid choice. Switching
Cluster/Grid preserves both cards' options for that mounting; leaving Optimize
resets them. They
add no localStorage or sessionStorage key, support-settings field, preset schema,
or VOXL settings block. The existing Grid placement settings retain their own
persistence and meaning; choosing Grid Optimization does not rewrite them.

The proposed graph and its summary are ephemeral. Apply records complete
before/after support snapshots through the existing support-edit history; the
resulting roots, shafts, joints, knots, contacts, and braces use the ordinary
scene format. Save/load stores geometry rather than an optimization recipe.
See [Support System](support-system.md#support-studio-grid-optimization), the
[user workflow](../workflows/support-placement.md#support-studio-grid-optimization),
and [Stage 3 acceptance](../support-studio-grid-acceptance.md).

### Support presets (`support-presets-v1`)

`src/supports/Settings/presets.ts` owns the store: `byId`, `allIds` and
`activePresetId`. Two facts about it are load-bearing, because both are user
arrangement that has to survive a reload:

- **`allIds` is the rail's order.** The list of unpinned presets renders in that
  order, so `movePresetBefore` is the reorder entry point and the loader restores
  the stored array rather than rebuilding it from `byId` (JSON key order is
  creation order, which silently discarded a reorder). Pinned order comes from
  the slot number, not from `allIds`.
- **A slot holds one preset.** `pinnedSlot` is 1-6, or `null` for unpinned.
  `null` is stored explicitly, not omitted: an absent key is a record from before
  slots existed, where the factory preset's own slot still applies, and treating
  the two the same brought an unpinned factory preset back on the next load. The
  loader also drops the second claimant of a slot it finds.

The rail's drag is pointer events (`onPointerDown` + `setPointerCapture` +
`elementFromPoint` hit testing), not HTML5 drag and drop. Tauri leaves
`dragDropEnabled` on because the window takes OS file drops, and on Windows that
makes the webview reject page-level drags outright: the cursor becomes the
no-drop one and no `dragstart` is delivered. See `PresetSelector.tsx`.

The same drag is the rail's delete gesture: released outside the Support Studio
panel (the element carrying `data-support-studio-panel`) it asks to delete the
dragged preset, or the whole selection when the dragged row is part of one. The
pointer turns into a trash can there, from the `body.preset-drag-delete` rule in
`src/app/globals.css`.

## Profiles and plugin keys

| Key                                              | Medium                        | Purpose                                            |
| ------------------------------------------------ | ----------------------------- | -------------------------------------------------- |
| `dragonfruit-profiles-v1`                        | localStorage                  | Primary profile envelope (printers/materials)      |
| `dragonfruit-profiles-v1-backup`                 | localStorage                  | Backup copy of profile envelope                    |
| `dragonfruit-profiles`                           | localStorage                  | Deprecated legacy profile key (fallback read path) |
| `dragonfruit.material.activeByPrinterProfile.v1` | localStorage + sessionStorage | Active material selection per printer profile      |
| `dragonfruit-plugins-v1`                         | localStorage                  | Installed plugin registry + trust/install metadata |

Material color metadata is stored as optional fields on ordinary material
profiles in the `dragonfruit-profiles-v1` envelope: `colorName` is trimmed
display text, and `colorHex` is a normalized `#RRGGBB` swatch value. Profiles
without either field remain valid and retain their existing appearance.
Color variants are separate material profiles with independent IDs and full
settings; variant creation copies the current settings into a new profile.
There is no separate variant storage key or inherited settings layer. Profile
import/export and the legacy profile fallback must preserve existing data and
remain compatible with profiles that lack these optional fields.

CTB materials may also carry an optional `ctbTimingV1` object in the same
profile envelope. It has an `enabled` flag, independent `defaults.bottom` and
`defaults.normal` values for raw light-off delay and waits before cure, after
cure, and after lift (all seconds), an ordered `overrides` array, and a
`startupDummy` flag. Each override has an ID, inclusive one-based model-layer
`startLayer`/`endLayer`, and a partial `values` object; omitted fields inherit
the current bottom or normal default, and later matching overrides win per
field. An optional trimmed `name` labels a range in the editor without affecting
layer resolution. Invalid timing fields are sanitized on load. A missing or disabled
`ctbTimingV1` leaves the legacy `.ctb` `localSettingsByOutput` behavior in
place. Material and printer bundle imports, profile duplication, and color
variants copy the object independently. There is no new localStorage key.

Phase 0.4 adds an optional partial `motion` object to each range. It contains
`liftDistanceMm`, `liftDistance2Mm`, `liftSpeedMmMin`, `liftSpeed2MmMin`,
`retractDistance2Mm`, `retractSpeedMmMin`, and `retractSpeed2MmMin`. Omitted
fields inherit independently from bottom/normal motion. Invalid entered
motion values remain invalid after draft/profile sanitization so export can
reject them with an actionable error; they are not silently clamped to a valid
value. The startup dummy is not in the one-based model-layer range.
Range motion uses the enabled CTB V4/V5 timing support gate, including encrypted
variants, in Simple and Two Stage only. All Fields retains its motion override
validation. Motion does not require firmware identification or confirmation.

The same `ctbTimingV1.overrides` entries may also carry an optional
`pwmPercent` number from 0 to 100. Omitted PWM leaves any earlier matching PWM
in place, or inherits the bottom or normal CTB default when none is set.
Precedence is independent of timing and motion; later matching PWM values win.
An explicit range value of 0 is retained and exports encoded byte 0.
This differs from the legacy bottom/normal default value of 0, which still
falls back to full power; new bottom/normal entries use 1–100%. The enabled
per-layer timing plan rounds percentage to the nearest 0–255 byte; legacy
native defaults outside that plan retain their existing encoding. The startup
dummy remains fixed at byte 1. Simple CTB profiles retain separate bottom and
normal PWM defaults, as Two Stage and All Fields already do. Range PWM uses the
existing enabled timing gate for plain or encrypted CTB V4/V5 in Simple, Two
Stage, and All Fields; it does not depend on firmware metadata. No new storage
key is used.

Phase 0.4 material quantity stays in that same material profile. The optional
`resinQuantity` object stores a positive bottle `value` and its entered `unit`
(`mL`, `g`, or `kg`); `uncuredDensityGPerMl` is optional and must be positive and
finite. Weight entries require density before bottle volume or print cost can
be calculated. Print mass is shown only when density is known. An incomplete
or invalid quantity retains its selected unit with a zero value
so calculations remain unavailable until the user enters a valid amount. The
existing `bottleCapacityMl` field remains in place for older profiles; when
`resinQuantity` is absent, it remains the volume and cost denominator without
assuming density. An invalid entered weight cannot fall back to that legacy
capacity. Color variants, duplication, and bundle import copy each quantity
and density independently. No new storage key or migration is needed.

Older printer profiles may include optional `ctbMotionCapability` with a
firmware string and `confirmed` boolean. This metadata remains in the profile
envelope for backward-compatible load, save, duplication, and bundle import,
but is inert: it does not determine range motion eligibility or artifact
freshness. No replacement capability field or migration is required.
`MaterialProfile.antiAliasingSettings.supportTipShrinkPercent` lives inside the existing `dragonfruit-profiles-v1` material envelope, not a new key. `src/features/profiles/profileStore.ts` defaults missing values to `10` and clamps whole percentages to `0`–`90`; `src/components/settings/profileFormAtoms.tsx` exposes the full-width Support Adjustments card in Material → Anti-Aliasing even with Custom Settings and Override Auto off. To set 25% for an editable material:

```ts
updateMaterialProfile(customMaterial.id, {
  antiAliasingSettings: {
    ...customMaterial.antiAliasingSettings,
    supportTipShrinkPercent: 25,
  },
});
```

`src/features/slicing/components/SlicingPanel.tsx` merges material and session AA settings. `src/features/slicing/sliceExportOrchestrator.ts` applies shrink only for effective 3DAA (`Vertical2` or `3DAA`, AA level not `Off`) while `src/features/slicing/rasterLayerZipExport.ts` assembles transient support triangles. It narrows contact-cone faces and twig disk footprints, including when AA on supports is disabled; it does not change support state, viewport geometry, projected cross sections, or STL/3MF/VOXL mesh exports. A session AA override can temporarily supply a different percentage without modifying the material.

Support Adjustments remain available under Auto AA presets (including Balanced and Smooth): `src/features/slicing/components/SlicingPanel.tsx` uses the material/session `aaOnSupports` setting even without Override Auto. Tip Compensation Offset Mode is shown as a disabled Automatic selector while Override Auto is off; `src/features/slicing/resolveEffectiveAaSettings.ts` then computes the Auto offset regardless of a stored Disabled or Manual choice. Turning Override Auto back on restores that saved choice, with Compensation Distance (mm) editable only in Manual mode. No existing profile data is migrated, and the other custom AA controls remain gated.

## Slicing and printing keys

| Key                                                 | Medium                        | Purpose                                                                |
| --------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| `dragonfruit.slicing.aaLevel`                       | localStorage + sessionStorage | AA level selection                                                     |
| `dragonfruit.slicing.minimumAaAlphaPercent`         | localStorage + sessionStorage | Minimum AA alpha threshold                                             |
| `dragonfruit.slicing.minimumAaAlphaOverrideEnabled` | localStorage + sessionStorage | Enable AA alpha override                                               |
| `dragonfruit.slicing.remoteOfflineLayerHeightMm`    | localStorage + sessionStorage | Offline/remote slicing layer height override                           |
| `dragonfruit.slicing.intentByPrinterProfile.v1`     | localStorage + sessionStorage | Preferred action intent by profile (`file`/`upload`/`print`/`preview`) |
| `dragonfruit:slice-filename-format:v1`               | localStorage                  | Plain string template for sliced output filenames                     |
| `dragonfruit.slicing.thumbnailRenderOptions`        | localStorage                  | Export-thumbnail rendering options                                     |
| `app-slicing-performance-settings`                  | localStorage                  | Slicing performance settings                                           |

The filename format key stores a plain string. When absent, the default is
`{printer_name}_{timestamp}_{material_name}_{layer_height}mm`. Supported
placeholders are `printer_name`, `timestamp`, `material_name`, `layer_height`
(millimeters), `layer_height_um` (micrometers), `plate_index`, and `plate_name`.
The settings editor writes the same v1 key. When several plates are exported,
the generator keeps names unique by appending a plate suffix if the saved
template does not already include a plate placeholder. Existing installations have
no earlier filename-format key to migrate; they receive the default until a
custom template is saved. The format is shared across printer profiles.

## Scene and import keys

| Key                                      | Medium       | Purpose                                                 |
| ---------------------------------------- | ------------ | ------------------------------------------------------- |
| `app-recent-opened-files`                | localStorage | Recent files index (metadata only)                      |
| `mesh-appearance-settings`               | localStorage | Shader, mesh color, and tint-strength preferences       |
| `import-defaults-v1`                     | localStorage | Default import behavior (raft mode, wall/root defaults) |
| `dragonfruit-scene-autosave:settings-v1` | localStorage | Scene autosave enable, debounce, cooldown, cap and recovery prompt settings |

Autosave timing is stored in milliseconds: `debounceMs` defaults to `45_000` (45 seconds), `cooldownMs` to `180_000` (180 seconds; allowed `15_000`–`900_000`), and the maximum interval `capMs` to `300_000` (5 minutes). The settings UI displays debounce and cooldown in seconds and cap in minutes. After a save attempt, automatic requests wait until the cooldown expires; explicit flushes do not. Existing saved values remain in effect; a missing cooldown gets the new default, and `capMs` is normalized to at least the debounce and cooldown durations.

## UI/theme/layout keys

| Key                                    | Medium       | Purpose                                                   |
| -------------------------------------- | ------------ | --------------------------------------------------------- |
| `app-theme-preference`                 | localStorage | Theme mode preference                                     |
| `app-theme-colors`                     | localStorage | Active theme color overrides (incl. mesh selection/hover) |
| `app-theme-preset`                     | localStorage | Selected theme preset                                     |
| `app-theme-custom-profiles`            | localStorage | User custom theme profiles                                |
| `lumenslicer:floating-panel-layout:v5` | localStorage | Floating panel coordinates/sizing (moved panels only)   |
| `app-floating-layout-persistence`      | localStorage | Enable/disable floating layout persistence                |
| `app-models-panel-visible`             | localStorage | Model list visibility in the left-column layout (the bar always shows the list) |
| `app-tool-layout`                      | localStorage | Tool entries as a left column or a bar under the app bar (the bar is the default) |

## Camera and view keys

| Key                                  | Medium       | Purpose                             |
| ------------------------------------ | ------------ | ----------------------------------- |
| `app-3d-view-settings`               | localStorage | Build volume/view configuration     |
| `workspace-camera-settings`          | localStorage | Workspace camera state              |
| `camera-projection-settings`         | localStorage | Perspective/orthographic preference |
| `camera-feel-settings`               | localStorage | Camera interaction feel settings    |
| `camera-trackpad-settings`           | localStorage | Trackpad navigation preferences     |
| `lumenslicer:spacemouse:settings:v1` | localStorage | SpaceMouse settings                 |

## Controls and transform keys

| Key                                 | Medium       | Purpose                  |
| ----------------------------------- | ------------ | ------------------------ |
| `app-hotkeys-config`                | localStorage | User hotkey overrides    |
| `autoLift`                          | localStorage | Auto-lift enable flag    |
| `liftDistance`                      | localStorage | Auto-lift distance in mm |

## Diagnostics and debug keys

| Key                                         | Medium       | Purpose                                                   |
| ------------------------------------------- | ------------ | --------------------------------------------------------- |
| `dragonfruit.renderer-crash-diagnostics.v1` | localStorage | Renderer crash diagnostics history                        |
| `df:cross-section-cap-debug:v4`             | localStorage | Cross-section cap debug state                             |
| `dragonfruit.lysImportWarningDismissed`     | localStorage | LYS warning dismissal flag (plugin-defined fallback path) |

## Backup and sync keys

### GitHub backup settings

| Key                                     | Medium       | Purpose                                   |
| --------------------------------------- | ------------ | ----------------------------------------- |
| `dragonfruit-backups:auto-sync-enabled` | localStorage | Enable GitHub auto-sync                   |
| `dragonfruit-backups:auto-sync-minutes` | localStorage | GitHub auto-sync interval                 |
| `dragonfruit-backups:client-id`         | localStorage | Client identity for snapshot coordination |
| `dragonfruit-backups:last-sync-at`      | localStorage | Last successful sync timestamp            |

### Local (filesystem) backup settings

| Key                                           | Medium       | Purpose                         |
| --------------------------------------------- | ------------ | ------------------------------- |
| `dragonfruit-local-backups:auto-sync-enabled` | localStorage | Enable local auto-sync          |
| `dragonfruit-local-backups:auto-sync-minutes` | localStorage | Local auto-sync interval        |
| `dragonfruit-local-backups:client-id`         | localStorage | Local backup client identity    |
| `dragonfruit-local-backups:last-sync-at`      | localStorage | Last local sync timestamp       |
| `dragonfruit-local-backups:directory`         | localStorage | Selected local backup directory |

!!! note
      Backup auth/session state uses secure cookies and server-side endpoints in addition to client-side setting keys.

## IndexedDB contract

- **Database**: `dragonfruit-recent-files`
- **Version**: `1`
- **Store**: `files` (key path: `id`)
- **Use**: caches recent file payload binaries, while `app-recent-opened-files` stores lightweight metadata/index entries.

## Migration and compatibility notes

- `dragonfruit-profiles` is deprecated; `dragonfruit-profiles-v1` is canonical.
- `support-active-preset-id-v1` is legacy/redundant; active preset is also tracked in `support-presets-v1`.
- `lumenslicer:*` keys remain for compatibility and should not be removed without explicit migration handling.

### Code defaults that move

The `autoSupport` block is persisted whole, so every key an install ever wrote
carries a value, and loading is `{ ...codeDefaults, ...stored }`. A stored value
therefore wins forever: change a default in code and an install that has ever
saved keeps the old one. Two installs then disagree about a "default" while both
are doing what the code told them to, which is indistinguishable from a stale
profile.

`src/supports/Settings/defaultMigrations.ts` fixes that for **the auto-support
block of a shipped profile, and nothing else**, applying one entry per shipped
auto-support default change against the batch the blob was written at.

- **The rule.** A stored key equal to `from` is a value this app shipped, so it
  moves to `to`. Any other value is a design decision and is left alone. It is
  the same rule the preset loader already applied by hand for a whole block
  (`migrateLegacyPresetAutoSupport` in `src/supports/Settings/presets.ts`),
  generalized to single keys so the next auto-support default change needs no new
  one-off. Inside a factory preset, a key the preset **states itself** (its own
  density: detail 16, anchor 5) is a design decision and is never moved, even when
  its value happens to equal an old default; the keys it inherits follow the
  table. `designedAutoSupportKeysOf` in `src/supports/Settings/presets.ts`
  derives that split by comparing each preset's definition against the code
  defaults, so it stays true when a preset changes.
- **What it never reaches.** The live `support-settings` block is the user's own
  configuration, and the same inference is wrong there: a user who deliberately
  picks a value that happens to equal a retired default is not "untouched".
  Rewriting it on load silently discards the choice — the replacement lands
  before the save button is reachable, so **the Support Studio cannot keep such a
  setting at all**, and the studio looks like it resets itself to defaults on
  every restart. The same holds for the studio's own sections (`autoBracing`,
  tip, shaft, roots, grid): a default moving there is a change its owner has to
  land deliberately. Presets the user made, or saved their settings into, are
  theirs for the same reason. `support-settings` therefore carries no
  `supportDefaultsVersion`; the field is only stripped on load, because an
  install that ran the over-reaching build left one behind and `mergeWithDefaults`
  spreads what it loads.
- **The one assumption.** Deliberately setting a key back to the old default is
  indistinguishable from never having touched it, and reads as untouched. That is
  the price of a whole-block format; if it ever matters for a key, that key needs
  its own record rather than a `from`/`to` entry.
- **Adding an entry.** Bump the batch (`version`), add `{ key, from, to }`, and
  list every older default the key may hold: an install can be pinned at any of
  them, so a key that moved twice needs an entry per step. `key` is checked
  against `AutoSupportSettings`, so a renamed key fails the build instead of
  silently migrating nothing. An entry for a non-`autoSupport` section is not
  expressible — that is the point of the scope.
- **What keeps the table honest.**
  `src/supports/__tests__/supportDefaultsMigration.test.ts` fails when an entry's
  `to` no longer equals the value the code ships, when `from` and `to` are equal,
  or when a batch is out of range. It also pins both load paths: a factory
  preset's inherited auto-support keys follow the table while its stated keys and
  its bracing do not, a user preset is untouched, and a saved studio block loads
  exactly as written.
- **Not a migration.** Removing a key needs none: `normalize*Settings` drops
  unknown keys, and their values are gone either way. Renaming a key is a
  migration in the key's own shape, not a default move: `sizingPreset` went from a
  numeric tier to a preset id and is handled by `migrateLegacySizingPreset`.

## Engineering expectations

When adding or modifying persisted state:

1. Prefer namespaced keys (`app-*`, `dragonfruit-*`).
2. Document schema and defaults in this file in the same PR.
3. Provide backward compatibility/migration behavior for renamed keys.
4. Keep secrets out of storage keys (use env/server-side secrets/cookies).
