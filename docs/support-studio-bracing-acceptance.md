# Support Studio Stage 1: bracing acceptance

Status: **accepted by the user on 2026-10-16.** The user explicitly stated, "Stage 1 is accepted. Proceed with Cluster Optimization". Runtime catalogs, optimized frontend UI, and the replacement Windows build were verified; the user reports bracing, undo/redo, and scene save/reopen working. Acceptance does not turn the remaining detailed manual/native and physical-print checks below into completed results. This is a separately authorized tools sequence on the unpublished 0.4.1 integration candidate. [Phase 0.5](upstream-0.1.17-acceptance.md) remains awaiting acceptance. No release or version bump is authorized by this stage.

## Scope

Retain legacy fixed sizing and add parent-relative uniform brace sizing, plus optional automatic bracing while manually placing trunks and branches. Retain existing patterns, Cluster Spacing, Apply/Clear, and manual brace editing. [Stage 2 Cluster Optimization](support-studio-cluster-acceptance.md) is now authorized; later stages remain deferred in the [fork roadmap](fork-roadmap.md).

## Acceptance checks

The status column distinguishes automated evidence, user reports, and pending manual checks.
The actual methods and limitations are recorded below.

| Area | Required behavior | Status |
| --- | --- | --- |
| Fixed sizing | Existing fixed-diameter behavior, including legacy endpoint geometry, remains the default. Existing settings and presets retain that behavior. | Automated checks passed; manual/native review pending |
| Relative sizing | Each brace diameter equals the smaller actual parent shaft segment diameter at its two attachment points multiplied by the entered percentage. Cover unequal parent diameters and attachments on different segments; the new relative brace itself stays uniform. | Automated checks passed; manual/native review pending |
| Settings | Mode, fixed diameter, percentage, and the live-placement option survive the intended settings/preset round trips; missing fields retain compatible defaults. Invalid imported values cannot produce invalid geometry. | Automated and browser save/reload checks passed; user reports scene save/reopen working |
| Apply/Clear | Existing brace patterns and Cluster Spacing retain their behavior. Apply preserves manual braces and supports explicit regeneration for two eligible shafts. Clear All retains its existing behavior: it deletes all braces on the current model, including manual braces, while leaving other models alone. Undo/redo restores a consistent support graph. | Automated checks passed; user reports selected-support Apply updates bracing after adding a support; remaining manual scenarios pending |
| Live placement | The option starts off. When enabled, manually placing an eligible trunk or branch generates braces using current pattern and sizing settings. Existing supports of other models or plates are excluded. Placing with the option off retains existing behavior. | Automated checks passed; user reports bracing placement working; detailed scenario review pending |
| History | One undo removes the placed trunk or branch and its newly generated braces; one redo restores both. Existing or manually created braces remain intact during live placement. | Automated checks passed; user reports undo/redo working |
| Integration | TypeScript, focused automated checks, documentation accuracy, and relevant lint/localization checks pass. Record any GUI checks separately from automated checks. | Automated checks passed; runtime catalog regression corrected; production frontend UI and replacement Windows build passed |
| Regression boundary | Manual brace placement/editing, existing support placement families, plate isolation, and legacy settings remain usable. Later tools are not introduced in this stage. | Broad automated suite passed; manual/native regression review pending |

## Checks actually performed

On 2026-10-16:

- The broad support-system and scene VOXL automated suites passed **843/843 tests** after correcting a regression in automatic placement's two-support behavior. The default builder and automatic-support integration retain their three-support minimum; explicit Apply and local manual placement support two eligible shafts.
- Automated coverage includes relative diameter resolution and invalid-parent fallback; uniform relative geometry and legacy endpoint geometry; settings, preset, and scene serialization; local generation and history; and existing support/VOXL behavior. These checks exercise synthetic data and application contracts, not native pointer placement or physical printing.
- The focused bracing controls DOM test passed (**1 test**), covering Fixed/Relative state, the default 50% value, live bracing off/on, preservation of fixed settings, and the existing pattern/Apply/Clear controls.
- TypeScript's no-emit check passed. The clean-directory lint check passed **42 directories with 0 errors and 0 warnings**. The localization literal check passed **59 paths and 163 files**, after test selectors received the documented ignore comments. Documentation accuracy passed **167 documents**.
- Initial development-server headless Edge QA exercised the actual application with a synthetic cube: import, Support Studio bracing controls, the Fixed default and live option off, switching to Relative with 50%, entering 60%, turning live bracing on, and explicitly saving settings. Reloading and reimporting the model restored the actual Relative 60% and live-on controls as well as the stored settings. Visual review at **1280 × 800** confirmed all bracing controls remained visible without clipping. There were no uncaught page errors; the development session logged an inherited, unrelated TopBar hydration warning. This development run did not establish production catalog resolution; the corrected optimized frontend was checked separately below.
- The initial Windows NSIS build completed successfully and included the Stage 1 changes recorded in commit `a02de123`; the build started before that commit was created. Production frontend compilation, its TypeScript check, static export, the optimized Windows x64 binary, and the NSIS installer all passed. The executable's PE ProductName and FileDescription are `DragonFruit (stickninja)`; ProductVersion and FileVersion are `0.4.1`. The installer SHA-256 is `99BFB0186B826F549765DDDEF96F96A9B6FCA24AB7AC9C21EBD58D00CD64872F`. The user subsequently reported the localization regression below in a running build; the installation method was not established. This package has not been released and is superseded by the catalog correction.

### Production localization correction

The user's running Bracing panel displayed compact translation IDs instead of the
new Fixed/Relative labels, smaller-parent percentage label, live-placement
toggle text, and units. Stage 1 had extracted the nine new messages into all
six `.po` catalogs but omitted the compiled runtime `.js` files required by
the [localization workflow](dev/localization.md). The earlier development UI
and DOM checks allowed source-message fallback, and the successful package
build did not establish that the new production labels resolved.

The correction regenerates all six runtime catalogs with
`npm run i18n:compile`. Comparing parsed catalog content before and after
confirmed exactly nine added messages per locale, with no existing entries
changed or removed. New target-locale translations remain blank in `.po`;
compiled catalogs supply readable English until Crowdin translations arrive.

The new `bracingCompiledCatalogs.test.ts` regression failed for all six locales
against the stale runtime catalogs, then passed **6/6 tests** after compilation.
It verifies all nine Stage 1 messages across English, Spanish, German, French,
Slovak, and Czech using only their compact production IDs, without source-message
fallbacks. TypeScript's no-emit check, focused lint for the new regression,
the localization literal gate (**59 paths, 163 files**), and documentation
accuracy (**167 documents**) also passed after this correction.
These automated checks establish catalog coverage. The focused bracing controls
DOM test also passed again (**1 test**). The correction is code commit
`d56d2f22` and changes runtime catalogs and regression coverage without changing
bracing behavior.

The primary review reproduced the raw IDs in the old production static assets,
then rebuilt the optimized frontend and ran headless Edge against the exact
`src-tauri/frontend-dist` assets prepared for embedding. Fixed/Relative labels,
the smaller-parent label, millimetre/percentage units, the live option's off/on
states, editing 50% to 60%, and the actual saved controls after reload all passed.
The production panel screenshot was visually reviewed at **1440 × 1100**.
Separately, automation at **1280 × 800** confirmed Clear All remained visible;
no new compact production screenshot was visually inspected. There were no
uncaught page errors.
This verifies the corrected production frontend, separately from the earlier
development-server check.

The replacement Windows build completed successfully from clean code fingerprint
`d56d2f22f`: production frontend TypeScript and static export, the optimized
Windows x64 executable, and the NSIS installer all passed. The executable's PE
identity remains `DragonFruit (stickninja)`, version `0.4.1`. The corrected
installer is **21,975,350 bytes**, SHA-256
`23B36F7AA4D560E9335C08D44EC73491867A60A2428296627349C19BF02FF55A`.
This replaces the initial artifact above. Native installation has not been
independently verified. The user subsequently accepted Stage 1; no new release
is authorized.

### User-reported manual checks

The user reported that bracing "works and works well so far" and supplied a
screenshot showing cross braces. They then confirmed "undo and redo work" and
"save scene and reopen work as expected". These reports establish successful
manual use of bracing placement, undo/redo, and scene save/reopen in the user's
tested workflow. They are user-reported results, separate from the agent's
automated and browser checks. They do not establish detailed numeric geometry,
every placement/plate scenario, installation behavior, or physical printing.
The user also reported that adding a support, selecting the surrounding supports,
and applying bracing successfully adjusts the braces for the changed support
geometry. This selected-support Apply workflow is a user-reported success, not
an independently repeated agent check. The user subsequently explicitly accepted
Stage 1 on 2026-10-16 and authorized Cluster Optimization.

## Browser review image

This corrected production panel image shows the actual application UI at
1440 × 1100 with a synthetic model. It records the settings review, not manual
support placement or print strength.

![Stage 1 bracing controls](assets/fork-support-studio/stage-1-bracing.png)

[Open the review image](assets/fork-support-studio/stage-1-bracing.png).

Detailed manual geometry and regression scenarios, independently verified
installation behavior, and physical printing remain unverified. Planned checks
are not completed results. This feature makes no claim about physical print
strength or printer behavior. Stage 1 is accepted and Stage 2 is authorized;
later stages and a release still require their own explicit acceptance.
