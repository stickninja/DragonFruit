# Phase 0.2 acceptance: material colors and independent variants

**Status:** Implemented; awaiting user acceptance. This phase is not accepted.

The behavior and manual checklist below define the Phase 0.2 target. The **Verification performed** section records checks actually completed; checks still marked pending must not be treated as passed.

## Behavior

- A material profile has an editable color name and color swatch. The color name is trimmed display text; the swatch is a normalized `#RRGGBB` value. Either value can be unset. Existing profiles with neither value remain valid and visually unchanged. Model tinting is optional and is not required for this phase.
- Color variants are separate ordinary material profiles, each with its own identity and complete print settings. Creating a variant starts it with a copy of the current settings and an independent identity; subsequent edits to either profile do not affect the other.
- In the material list, legacy profiles retain their original name; profiles with a color name or swatch show that color alongside the name. The selected profile is the source of print settings for slicing.
- Statistics and slicing use a composite material label built from brand, resin family, material name, and color name (suppressing repeated words); if the name is absent but a valid swatch is present, the hex color is shown. The existing `{material_name}` filename value uses this composite label.
- Material names, colors, variants, and each variant's full settings survive save, app restart/reload, duplication, profile import, and profile export as applicable to the profile workflow. Material bundle suggested filenames include the color suffix.
- Existing profiles remain readable and retain their material and print settings. A legacy profile without color metadata remains visually unchanged and usable; importing and exporting it must not silently discard its existing settings.

## Manual review checklist

1. Create or edit a material profile: set its color name and swatch, save, and confirm its label and swatch are visible in the material selection workflow. Check unset and hex-only/name-only values.
2. Start creating a color variant from a profile. Confirm the draft copies its full print settings, clears color metadata and any official-template lock, and does not change the store or selection if cancelled or closed. Create the variant and confirm it becomes a separate profile; give each profile distinct settings, switch between them, and confirm each shows and uses its own complete settings.
3. Edit the material name and confirm a filename pattern containing `{material_name}` uses that name in the generated filename.
4. Save the profiles, restart or reload the app, and confirm color names, swatches, settings, and selected profile are preserved.
5. Duplicate a material profile and confirm the duplicate retains the expected data; change either copy and confirm the other is independent.
6. Export and re-import profiles containing multiple color variants, including a material bundle; compare all color and per-profile settings before and after the round trip, and confirm the bundle's suggested filename includes its color suffix.
7. Open a representative legacy profile with no color metadata. Confirm it loads, remains editable and sliceable, stays visually unchanged, and retains its pre-existing settings through save and export.

Record platform, build, profile fixture, and observed result for each check before closing this phase.

## Verification performed

The primary agent completed these checks:

- The focused material-color and filename tests passed: 11/11 (two Phase 2 workflow tests and nine Phase 1 filename tests). Focused ESLint for `materialLabel` and the new test passed. For `ProfileSettingsModal`, `profileFormAtoms`, `profileStore`, and `pluginRegistry`, lint output matched the baseline exactly: 191 inherited errors and 43 warnings, with no new error or warning signatures.
- The optimized frontend build, TypeScript check, and isolated Windows release no-bundle native build passed. No installer was built, version was changed, or release published.
- In a local full-app browser run at 1280 × 720 with Saturn 2 selected, a legacy material retained its existing list label. Starting a color variant and cancelling left the material list unchanged. Creating Grey (`#808080`) with exposure 2.2 produced an independent profile; creating Black copied exposure 2.2, and changing Black to 3.3 left Grey at 2.2. Both profiles and their independent exposure values remained after browser reload. The Meta editor was readable at the tested viewport. Browser automation briefly filled Black's color input with `#202020` but did not commit that value to application state, so arbitrary swatch persistence was not verified in the browser.
- Native printer-bundle import/export passed for Grey (`#808080`, exposure 2.2), Black (`#202020`, exposure 3.3), and a legacy colorless profile (exposure 2.8). All three CTB local settings maps matched exactly across the round trip. In the native picker, changing Black with the keyboard to `#242424`, then saving and exporting it, preserved the color, exposure 3.3, motion settings, and wait settings. The material bundle's suggested filename was `phase_2_resin_black-bundle.json`.
- Individual native material import/re-export passed for Black (`#242424`). The re-imported profile had a new ID; JSON comparison found no differences in the remaining material properties, including color, exposure 3.3, AA settings, and full local settings maps, after excluding the expected `id`, `printerProfileId`, and `officialTemplateVersion` differences.

No actual sliced-file export or hardware print was performed for this phase; filename integration is covered by the passing automated tests above. Phase 0.2 is implemented and awaiting user acceptance; it is not yet accepted.
